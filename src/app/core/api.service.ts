import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { NEVER, Observable, firstValueFrom, fromEvent, of, takeUntil, timeout } from 'rxjs';
import { LoggerService } from './logger.service';
import { getInitialApiUrl, normalizeApiUrl } from './api-url';

/**
 * How long the widget waits for an answer (audit 14.11., W-50). No call had a
 * limit: behind a proxy that keeps the connection open, a schema never came,
 * an extraction never ended and a hanging /upload held its button for good.
 * Above the agent's own limits (upload 100 s, generation 300 s), so its
 * answer - a result or its own timeout message - comes first.
 */
export const REQUEST_TIMEOUT_MS = { schema: 30_000, upload: 130_000, generate: 330_000 };

export interface SchemaField {
  id: string;
  group?: string;
  group_label?: { de: string; en: string };
  label: { de: string; en: string };
  description?: { de: string; en: string };
  system: {
    path: string;
    datatype: string;
    multiple: boolean;
    required: boolean;
    ai_fillable?: boolean;
    vocabulary?: any;
    validation?: any;
  };
}

export interface GenerateRequest {
  input_source?: 'text' | 'url' | 'node_id' | 'node_url';
  text?: string;
  source_url?: string;
  extraction_method?: 'simple' | 'browser';
  node_id?: string;
  context?: string;
  version?: string;
  schema_file?: string;
  existing_metadata?: Record<string, any>;
  language?: string;
  max_workers?: number;
  include_core?: boolean;
  enable_geocoding?: boolean;
  normalize?: boolean;
  regenerate_fields?: string[];
  regenerate_empty?: boolean;
  llm_provider?: string;
  llm_model?: string;
  preview_url?: string;
  screenshot_method?: 'pageshot' | 'playwright';
}

/** How the agent ran a /generate request. Agents before 2.1 send only the first block. */
export interface GenerateProcessing {
  success: boolean;
  fields_extracted: number;
  fields_total: number;
  processing_time_ms: number;
  llm_provider: string;
  llm_model: string;
  errors: string[];
  warnings: string[];
  /** success | partial (some fields failed) | failed (answered as an HTTP error, not 200) */
  status?: 'success' | 'partial' | 'failed';
  fields_failed?: number;
  /** Where the B-API key came from: forwarded (caller's key via the B-API proxy) or static */
  auth_source?: string | null;
  /** method 'keywords' = the LLM gave no usable answer, the type is only a guess */
  content_type_detection?: {
    method: 'llm' | 'keywords' | 'preselected';
    confidence?: 'high' | 'low';
    schema_file?: string;
    reason?: string;
  };
  error?: { code: string; message: string; upstream_status?: number };
}

// Raw API response has fields at root level
export interface GenerateResponseRaw {
  contextName: string;
  schemaVersion: string;
  metadataset: string;
  metadataset_uri?: string;
  language: string;
  exportedAt: string;
  processing: GenerateProcessing;
  [key: string]: any; // Metadata fields at root level
}

// Normalized response with metadata nested
export interface GenerateResponse {
  contextName: string;
  schemaVersion: string;
  metadataset: string;
  metadataset_uri?: string;
  language: string;
  exportedAt: string;
  metadata: Record<string, any>;
  _origins?: Record<string, 'ai' | 'user'>;
  _source_text?: string;
  preview_image_url?: string;
  processing: GenerateProcessing;
}

export interface ScreenshotResponse {
  success: boolean;
  method: string;
  url: string;
  format: string;
  mimetype: string;
  width: number;
  height: number;
  size_bytes: number;
  capture_time_ms: number;
  image_base64?: string;
}

/**
 * Without `repository`: the agent writes to the repository it is configured
 * for and ignores the field; the widget always sent 'staging' (W-N).
 */
export interface UploadRequest {
  metadata: Record<string, any>;
  check_duplicates?: boolean;
  start_workflow?: boolean;
  write_extended_data?: boolean;
  extended_text?: string;
}

export interface UploadNodeInfo {
  nodeId: string;
  title?: string;
  description?: string;
  wwwurl?: string;
  repositoryUrl?: string;
}

export interface UploadResponse {
  success: boolean;
  duplicate?: boolean;
  repository?: string;
  node?: UploadNodeInfo;
  error?: string;
  step?: string;
}

/** Emits once `signal` aborts (at once if it has); never without a signal. */
function aborted(signal?: AbortSignal): Observable<unknown> {
  if (!signal) return NEVER;
  return signal.aborted ? of(true) : fromEvent(signal, 'abort');
}

/**
 * API Service - Communication with Metadata Agent API
 * Handles all backend interactions for schema loading and metadata operations
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl: string = '';

  constructor(
    private http: HttpClient,
    private logger: LoggerService
  ) {
    this.apiUrl = getInitialApiUrl();
  }

  setApiUrl(url: string): void {
    this.apiUrl = normalizeApiUrl(url);
    this.logger.info(`API URL set to: ${this.apiUrl}`);
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  // ===== Schema Endpoints =====

  /**
   * Get a specific schema file
   */
  async getSchema(context: string, version: string, schemaFile: string): Promise<{ fields: SchemaField[] }> {
    // Escaped: context and version come from host attributes (S-2).
    const url = `${this.apiUrl}/info/schema/${[context, version, schemaFile].map(encodeURIComponent).join('/')}`;
    this.logger.debug(`Fetching schema: ${url}`);
    
    try {
      const response = await firstValueFrom(
        this.http.get<{ fields: SchemaField[] }>(url, { headers: this.getHeaders() })
          .pipe(timeout(REQUEST_TIMEOUT_MS.schema))
      );
      return response;
    } catch (error) {
      this.logger.error(`Failed to fetch schema ${schemaFile}`, error);
      throw error;
    }
  }

  // ===== Metadata Endpoints =====

  /**
   * Generate metadata from text or URL. Aborting `signal` cancels the request
   * and rejects: the agent works on a /generate call for up to 300 s, also when
   * nobody waits for the answer any more (W-PERF-01).
   */
  async generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse> {
    const url = `${this.apiUrl}/generate`;
    this.logger.debug('Generating metadata', request);
    
    try {
      const body = await firstValueFrom(
        this.http.post<GenerateResponseRaw>(url, request, { headers: this.getHeaders() })
          .pipe(timeout(REQUEST_TIMEOUT_MS.generate), takeUntil(aborted(signal)))
      );
      // An empty 200 from a proxy must not throw here: the canvas reports a
      // response without `processing` as unusable, in the editor's language.
      const rawResponse = (body && typeof body === 'object' ? body : {}) as GenerateResponseRaw;

      // Extract metadata fields from root level (API returns them flat)
      const metadata: Record<string, any> = {};
      const systemKeys = ['contextName', 'schemaVersion', 'metadataset', 'metadataset_uri', 'language', 'exportedAt', 'processing', 'preview_image_url', '_origins', '_source_text'];

      for (const [key, value] of Object.entries(rawResponse)) {
        if (!systemKeys.includes(key)) {
          metadata[key] = value;
        }
      }
      
      const response: GenerateResponse = {
        contextName: rawResponse.contextName,
        schemaVersion: rawResponse.schemaVersion,
        metadataset: rawResponse.metadataset,
        metadataset_uri: rawResponse.metadataset_uri,
        language: rawResponse.language,
        exportedAt: rawResponse.exportedAt,
        processing: rawResponse.processing,
        metadata: metadata,
        _origins: (rawResponse as any)._origins || undefined,
        _source_text: (rawResponse as any)._source_text || undefined,
        preview_image_url: (rawResponse as any).preview_image_url || undefined
      };
      
      this.logger.info(`Metadata generated: ${response.processing?.fields_extracted}/${response.processing?.fields_total} fields`);
      return response;
    } catch (error) {
      // An aborted request is no failure of the agent.
      if (!signal?.aborted) this.logger.error('Failed to generate metadata', error);
      throw error;
    }
  }

  // ===== Repository Upload =====

  /**
   * Upload metadata to WLO repository via FastAPI backend.
   * Credentials are handled server-side — no guest user needed in frontend.
   */
  async upload(request: UploadRequest): Promise<UploadResponse> {
    const url = `${this.apiUrl}/upload`;
    this.logger.debug('Uploading metadata to repository');

    try {
      const response = await firstValueFrom(
        this.http.post<UploadResponse>(url, request, { headers: this.getHeaders() })
          .pipe(timeout(REQUEST_TIMEOUT_MS.upload))
      );
      if (response.success) {
        this.logger.info(`Upload successful: ${response.node?.nodeId}`);
      } else {
        this.logger.warn(`Upload failed: ${response.error}`);
      }
      return response;
    } catch (error) {
      this.logger.error('Failed to upload metadata', error);
      throw error;
    }
  }

  // ===== Screenshot =====

  /**
   * Capture a screenshot of a URL and return as base64 data URL
   */
  async captureScreenshot(url: string, method: 'pageshot' | 'playwright' = 'playwright'): Promise<string | null> {
    const endpoint = `${this.apiUrl}/screenshot`;
    this.logger.debug(`📸 Capturing screenshot: ${url} (${method})`);
    
    try {
      const response = await firstValueFrom(
        this.http.post<ScreenshotResponse>(endpoint, {
          url,
          method,
          width: 1920,
          height: 1080,
          format: 'png'
        }, { headers: this.getHeaders() })
      );
      
      if (response.success && response.image_base64) {
        const dataUrl = `data:${response.mimetype};base64,${response.image_base64}`;
        this.logger.info(`📸 Screenshot captured: ${response.size_bytes} bytes (${response.capture_time_ms}ms)`);
        return dataUrl;
      }
      this.logger.warn('Screenshot response without image data');
      return null;
    } catch (error) {
      this.logger.error('Screenshot capture failed', error);
      return null;
    }
  }
}
