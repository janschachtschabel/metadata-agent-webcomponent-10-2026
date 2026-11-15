import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { I18nService } from './i18n.service';
import { ApiService } from './api.service';
import { translated } from './canvas-feedback';
import { WidgetDebug } from './debug';
import {
  FieldDefinition,
  ContentType,
  VocabularyConcept
} from '../shared/models/canvas.models';
import { environment } from '../../environments/environment';

interface ContextInfo {
  key: string;       // Context key for export/import (e.g. "default")
  name: string;      // Display name (e.g. "WLO/OEH Standard")
  version: string;
  basePath: string;
}

interface CoreSchema {
  fields: FieldDefinition[];
  groups: any[];
  /** The version the agent answered with; says what 'latest' is. */
  version?: string;
}

/**
 * Schema Service - Unified Schema Loading & Localization
 * Now loads schemas from the Metadata Agent API instead of local files
 */
@Injectable({ providedIn: 'root' })
export class SchemaService {
  private currentContext: ContextInfo | null = null;
  private coreSchema: CoreSchema | null = null;
  private contentTypeSchemas = new Map<string, FieldDefinition[]>();
  private contentTypeGroups = new Map<string, any[]>();

  constructor(
    private config: ConfigService,
    private i18n: I18nService,
    private api: ApiService
  ) {}

  // ===== Context Management =====

  /**
   * The context being set, while it is. A core schema requested meanwhile
   * (metadata-input arrives before ngOnInit, a language switch at startup)
   * waits for it: falling back to 'default' could overwrite the configured
   * context-name that was set at the same moment.
   */
  private pendingContext: Promise<void> | null = null;

  /** The core schema request that is out, per context; asked once, not per caller. */
  private coreLoad: { context: ContextInfo; promise: Promise<CoreSchema> } | null = null;

  async setContext(name: string, version?: string): Promise<void> {
    const pending = this.applyContext(name, version);
    this.pendingContext = pending;
    try {
      await pending;
    } finally {
      if (this.pendingContext === pending) this.pendingContext = null;
    }
  }

  private async applyContext(name: string, version?: string): Promise<void> {
    // Use provided values or defaults from environment
    const contextName = name || (environment as any).defaultContext || 'default';
    const contextVersion = version || (environment as any).defaultVersion || 'latest';
    // Every widget on the page sets its context in ngOnInit; the same one again
    // keeps the schemas the other widgets still build and export from.
    if (this.currentContext?.key === contextName && this.currentContext?.version === contextVersion) return;

    this.currentContext = {
      key: contextName,
      name: contextName,
      version: contextVersion,
      basePath: contextName
    };

    // Clear cached schemas
    this.coreSchema = null;
    this.coreLoad = null;
    this.contentTypeSchemas.clear();
    this.contentTypeGroups.clear();
    this.contentTypeLoads.clear();

    // Not into the host page's console at every start (W-ARCH-01).
    if (WidgetDebug.enabled) this.config.info(`Context set: ${contextName} v${contextVersion}`);
  }

  getContextName(): string {
    return this.currentContext?.key || 'default';
  }

  /** The version the host configured, as the agent's endpoints take it ('latest' or a number). */
  getVersion(): string {
    return this.currentContext?.version || 'latest';
  }

  /**
   * The version for the exported record: the one the agent built the form
   * from, once its core schema is here - 'vlatest' named no version (W-LOG-04).
   */
  getSchemaVersion(): string {
    const version = this.coreSchema?.version || this.currentContext?.version;
    return version ? `v${version}` : 'vlatest';
  }

  // ===== Schema Loading (via API) =====

  async loadCoreSchema(): Promise<CoreSchema> {
    if (this.coreSchema) return this.coreSchema;

    if (this.pendingContext) {
      await this.pendingContext;
    }
    if (!this.currentContext) {
      await this.setContext('default');
    }

    const context = this.currentContext!;
    if (this.coreLoad?.context !== context) {
      const promise = this.api.getSchema(context.key, context.version, 'core.json').then(response => {
        const core: CoreSchema = {
          fields: this.fieldsOf(response),
          groups: (response as any).groups || [],
          version: (response as any).version,
        };
        // Cached only for the context it belongs to; a switch meanwhile asks again.
        if (this.currentContext === context) this.coreSchema = core;
        this.config.debug(`Core schema loaded from API: ${core.fields.length} fields`);
        return core;
      });
      this.coreLoad = { context, promise };
      // A failure is not kept: the next call asks again.
      promise.catch(() => {
        if (this.coreLoad?.promise === promise) this.coreLoad = null;
      });
    }

    try {
      return await this.coreLoad!.promise;
    } catch (error) {
      this.config.error('Failed to load core schema from API', error);
      throw error;
    }
  }

  async loadContentTypeSchema(schemaFile: string): Promise<FieldDefinition[]> {
    if (this.contentTypeSchemas.has(schemaFile)) {
      return this.contentTypeSchemas.get(schemaFile)!;
    }
    // One request per schema while it is out (L-11), like the core schema.
    let load = this.contentTypeLoads.get(schemaFile);
    if (!load) {
      load = this.requestContentTypeSchema(schemaFile);
      this.contentTypeLoads.set(schemaFile, load);
      const settled = () => {
        if (this.contentTypeLoads.get(schemaFile) === load) this.contentTypeLoads.delete(schemaFile);
      };
      load.then(settled, settled);
    }
    return load;
  }

  /** Content-type schema requests that are out, by file; a context switch forgets them. */
  private contentTypeLoads = new Map<string, Promise<FieldDefinition[]>>();

  private async requestContentTypeSchema(schemaFile: string): Promise<FieldDefinition[]> {
    const current = this.currentContext;
    try {
      const context = current?.key || 'default';
      const version = current?.version || 'latest';
      
      const response = await this.api.getSchema(context, version, schemaFile);
      const fields = this.fieldsOf(response);
      // Cached only for the context it was asked in (L-11): after a switch it
      // would be served as the new context's schema.
      if (this.currentContext === current) {
        this.contentTypeSchemas.set(schemaFile, fields);
        // Also cache groups from the same response to avoid a duplicate HTTP call from getGroups()
        if ((response as any).groups) {
          this.contentTypeGroups.set(schemaFile, (response as any).groups);
        }
      }
      this.config.debug(`Content type schema loaded from API: ${schemaFile}`);
      return fields;
    } catch (error) {
      // Rethrown like loadCoreSchema: an empty list would build the type with
      // no fields of its own and tell nobody. Nothing is cached, so the next
      // attempt asks again.
      this.config.error(`Failed to load schema from API: ${schemaFile}`, error);
      throw error;
    }
  }

  /**
   * The fields of a schema answer. A 200 that is no schema (another service
   * behind the address, a proxy's JSON page) used to end in "Cannot read
   * properties of undefined"; it fails with a text the editor can act on
   * (audit 14.11., W-N).
   */
  private fieldsOf(response: unknown): FieldDefinition[] {
    const fields = (response as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) {
      throw new Error(translated(this.i18n, 'ALERTS.ANSWER_UNREADABLE', undefined,
        'The answer is not a result of the metadata agent. Please check the address of the agent (api-url).'));
    }
    return fields as FieldDefinition[];
  }

  // ===== Content Types =====

  async getContentTypes(): Promise<ContentType[]> {
    const core = await this.loadCoreSchema();
    const field = core.fields.find(f => f.id === 'ccm:oeh_extendedType');
    
    if (!field?.system?.vocabulary?.concepts) {
      return [];
    }

    const lang = this.i18n.currentLang;
    
    return field.system.vocabulary.concepts.map(concept => ({
      label: this.localizeString(concept.label, lang),
      schemaFile: concept.schema_file || '',
      uri: concept.uri || undefined,
      icon: concept.icon || 'category'
    }));
  }

  /**
   * Resolve a vocab URI or schema filename to a schema filename.
   * Accepts both 'event.json' and 'http://w3id.org/openeduhub/vocabs/contentTypes/event'.
   */
  resolveSchemaFileOrUri(schemaFileOrUri: string): string {
    if (!schemaFileOrUri.startsWith('http://') && !schemaFileOrUri.startsWith('https://')) {
      return schemaFileOrUri;
    }
    // Resolve URI to schema_file
    if (!this.coreSchema) return schemaFileOrUri;
    const field = this.coreSchema.fields.find(f => f.id === 'ccm:oeh_extendedType');
    const concept = field?.system?.vocabulary?.concepts?.find(c => c.uri === schemaFileOrUri);
    return concept?.schema_file || schemaFileOrUri;
  }

  // ===== Localization =====

  localizeVocabulary(vocabulary: any, lang?: string): VocabularyConcept[] {
    if (!vocabulary?.concepts) return [];
    
    const language = lang || this.i18n.currentLang;
    
    return vocabulary.concepts.map((concept: any) => ({
      ...concept,
      label: this.localizeString(concept.label, language),
      description: concept.description 
        ? this.localizeString(concept.description, language)
        : undefined
    }));
  }

  private localizeArray(arr: any, lang: string): string[] {
    if (!arr) return [];
    if (!Array.isArray(arr)) return [];
    return arr.map(item => this.localizeString(item, lang));
  }

  // ===== Field Helpers =====

  /**
   * The definition of a field: from the core schema, then from `schemaFile`
   * (the field's own type - two types may define one id differently, L-11),
   * then from any loaded type.
   */
  getFieldById(fieldId: string, schemaFile?: string): FieldDefinition | undefined {
    // First check core schema
    const coreField = this.coreSchema?.fields.find(f => f.id === fieldId);
    if (coreField) return coreField;

    const own = schemaFile ? this.contentTypeSchemas.get(schemaFile)?.find(f => f.id === fieldId) : undefined;
    if (own) return own;
    
    // Then check all loaded content type schemas
    for (const fields of this.contentTypeSchemas.values()) {
      const field = fields.find(f => f.id === fieldId);
      if (field) return field;
    }
    
    return undefined;
  }

  // ===== Extended Methods for CanvasService =====

  async getFields(schemaFile: string): Promise<any[] | null> {
    if (schemaFile === 'core.json') {
      const core = await this.loadCoreSchema();
      return core?.fields || null;
    }
    return this.loadContentTypeSchema(schemaFile);
  }

  async getGroups(schemaFile: string): Promise<any[]> {
    // Use cached core schema groups if available
    if (schemaFile === 'core.json' && this.coreSchema) {
      return this.coreSchema.groups;
    }
    // Use cached content-type groups if available
    if (this.contentTypeGroups.has(schemaFile)) {
      return this.contentTypeGroups.get(schemaFile)!;
    }
    const current = this.currentContext;
    try {
      const context = current?.key || 'default';
      const version = current?.version || 'latest';
      const response = await this.api.getSchema(context, version, schemaFile);
      const groups = (response as any).groups || [];
      // Cached only for the context it was asked in, like the fields (L-11):
      // after a switch meanwhile these are the other context's groups (W-N).
      if (this.currentContext === current) this.contentTypeGroups.set(schemaFile, groups);
      return groups;
    } catch {
      return [];
    }
  }

  getActiveLanguage(): 'de' | 'en' {
    return (this.i18n.currentLang === 'en' ? 'en' : 'de') as 'de' | 'en';
  }

  localizeString(value: any, lang?: string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const language = lang || this.i18n.currentLang;
    return value[language] || value['de'] || value['en'] || Object.values(value)[0] || '';
  }

  getFallbackGroupLabel(lang?: string): string {
    const language = lang || this.i18n.currentLang;
    return language === 'en' ? 'Other' : 'Sonstige';
  }

  getContentTypeConcepts(): any[] {
    if (!this.coreSchema) return [];
    const field = this.coreSchema.fields.find(f => f.id === 'ccm:oeh_extendedType');
    if (!field?.system?.vocabulary?.concepts) return [];
    
    const lang = this.i18n.currentLang;
    return field.system.vocabulary.concepts.map(concept => ({
      ...concept,
      label: this.localizeString(concept.label, lang),
      description: concept.description ? this.localizeString(concept.description, lang) : ''
    }));
  }

  // Labels, description, examples, vocabulary and prompt of a field in `lang`
  localizeFieldFull(field: any, lang?: string): any {
    const language = lang || this.i18n.currentLang;
    
    return {
      label: this.localizeString(field.label, language),
      description: this.localizeString(field.description, language),
      examples: this.localizeArray(field.examples, language),
      vocabulary: field.system?.vocabulary ? this.localizeVocabularyFull(field.system.vocabulary, language) : undefined,
      prompt: this.localizeString(field.prompt, language)
    };
  }

  private localizeVocabularyFull(vocabulary: any, lang: string): any {
    if (!vocabulary?.concepts) return undefined;
    
    return {
      type: vocabulary.type || 'open',
      hierarchical: vocabulary.hierarchical || false,
      concepts: vocabulary.concepts.map((concept: any) => ({
        ...concept,
        label: this.localizeString(concept.label, lang),
        description: concept.description ? this.localizeString(concept.description, lang) : undefined,
        altLabels: concept.altLabels || [],
        broader: concept.broader || undefined
      }))
    };
  }
}
