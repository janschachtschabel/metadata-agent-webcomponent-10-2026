/**
 * Canvas Models - Complete Type Definitions
 * Migrated from metadata-agent-canvas-oeh
 */

// ===== i18n String =====
export interface I18nString {
  de: string;
  en: string;
  [key: string]: string;
}

// ===== Field Types =====
export type FieldDataType = 'string' | 'text' | 'array' | 'date' | 'datetime' | 'number' | 'boolean' | 'url' | 'uri' | 'geo';

export enum FieldStatus {
  EMPTY = 'empty',
  EXTRACTING = 'extracting',
  FILLED = 'filled',
  ERROR = 'error'
}

// ===== Validation & Normalization =====
export interface ValidationRules {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  enum?: string[];
}

export interface NormalizationRules {
  trim?: boolean;
  deduplicate?: boolean;
  map_labels_to_uris?: boolean;
  lowercase?: boolean;
  case?: 'uppercase' | 'lowercase';
}

// ===== Vocabulary =====
export interface VocabularyConcept {
  label: string;
  label_de?: string;
  label_en?: string;
  uri?: string;
  altLabels?: string[];
  schema_file?: string;
  icon?: string;
  description?: string;
  broader?: string;
}

export interface VocabularyInfo {
  type: 'open' | 'closed' | 'mixed';
  source?: string;
  hierarchical?: boolean;
  concepts: VocabularyConcept[];
}

// ===== Field Definition (Schema) =====
export interface FieldDefinition {
  id: string;
  group?: string;
  group_label?: I18nString;
  label: I18nString;
  description?: I18nString;
  prompt?: I18nString;
  examples?: any[];
  promptInstructions?: Record<string, any>;
  system: {
    path: string;
    uri?: string;
    datatype: FieldDataType;
    multiple: boolean;
    required: boolean;
    ask_user?: boolean;
    ai_fillable?: boolean;
    repo_field?: boolean;
    vocabulary?: VocabularyInfo;
    validation?: ValidationRules;
    normalization?: NormalizationRules;
    items?: {
      shape?: any;
      variants?: any;
    };
  };
}

// ===== Field State (Runtime) =====
export interface CanvasFieldState {
  fieldId: string;
  uri: string;
  label: string;
  description: string;
  prompt?: string;
  group: string;
  groupLabel: string;
  groupIcon?: string;
  groupOrder: number;
  schemaName: string;
  /** The schema the field is defined in ('core.json' or the type's file). */
  schemaFile?: string;
  aiFillable: boolean;
  repoField: boolean;
  status: FieldStatus;
  value: any;
  confidence: number;
  isRequired: boolean;
  datatype: string;
  /**
   * What the list holds, from the schema's `items.datatype`.
   *
   * Without this, `datatype: 'array'` says nothing about the elements, and both
   * the validator and the canvas fall back to treating them as strings. That is
   * how `schema:contactPoint: ["Virtuelles Haus"]` reached the repository and
   * pinned the Elasticsearch path to `text`.
   */
  itemDatatype?: string;
  /**
   * Which sub-field a bare string belongs in — `name` for person-like variants,
   * `contactType` for ContactPoint. Mirrors FieldNormalizer._object_key in the
   * backend; the two must agree or the same value gets two shapes.
   */
  objectKey?: string;
  multiple: boolean;
  vocabulary?: VocabularyInfo;
  validation?: ValidationRules;
  normalization?: NormalizationRules;
  extractionError?: string;
  shape?: any;
  examples?: any[];
  promptInstructions?: Record<string, any>;
  
  // AI suggestion tracking
  isAiGenerated?: boolean;
  
  // Nested/Sub-field support
  isParent?: boolean;
  parentFieldId?: string;
  parentFieldLabel?: string;
  subFields?: CanvasFieldState[];
  path?: string;
  arrayIndex?: number;
}

// ===== Field Group =====
export interface FieldGroup {
  id: string;
  label: string;
  icon?: string;
  schemaName: string;
  fields: CanvasFieldState[];
  collapsed?: boolean;
  /** True if this is a core group (title, description, keywords, etc.) */
  isCore?: boolean;
}

// ===== Content Type =====
export interface ContentType {
  label: string;
  schemaFile: string;
  uri?: string;
  icon?: string;
  description?: string;
}

// ===== Canvas State =====
export interface CanvasState {
  userText: string;
  detectedContentType: string | null;
  contentTypeConfidence: number;
  contentTypeReason: string;
  selectedContentType: string | null;
  contentTypeLabel?: string;
  contentTypeIcon?: string;
  coreFields: CanvasFieldState[];
  specialFields: CanvasFieldState[];
  fieldGroups: FieldGroup[];
  isExtracting: boolean;
  extractionProgress: number;
  extractionError: string | null;
  /** A usable but incomplete or uncertain result (failed fields, guessed content type). */
  extractionWarning: string | null;
  totalFields: number;
  filledFields: number;
  metadata: Record<string, any>;
  previewImageUrl?: string;
  screenshotEnabled: boolean;
  screenshotMethod: 'pageshot' | 'playwright';
}

// ===== Extraction Types =====
export interface FieldExtractionTask {
  field: CanvasFieldState;
  userText: string;
  priority: number;
  retryAttempt?: number;
  promptModifier?: string;
}

export interface ExtractionResult {
  fieldId: string;
  value: any;
  confidence: number;
  error?: string;
}

// ===== Layout Config =====
// Note: Layout system has been moved to shared/layouts/
// Import from '../layouts' for full LayoutConfig interface and presets.
// This re-export is for backward compatibility.
export type { LayoutConfig } from '../layouts';
export { DEFAULT_LAYOUT } from '../layouts';

// ===== Canvas Config =====
import type { LayoutConfig as LayoutConfigType } from '../layouts';

export interface CanvasConfig {
  contextName: string;
  layout: LayoutConfigType;
  viewerMode: boolean;
  readonly: boolean;
  backgroundColor: string;
}

// ===== Initial State Factory =====
export function createInitialState(): CanvasState {
  return {
    userText: '',
    detectedContentType: null,
    contentTypeConfidence: 0,
    contentTypeReason: '',
    selectedContentType: null,
    coreFields: [],
    specialFields: [],
    fieldGroups: [],
    isExtracting: false,
    extractionProgress: 0,
    extractionError: null,
    extractionWarning: null,
    totalFields: 0,
    filledFields: 0,
    metadata: {},
    screenshotEnabled: true,
    screenshotMethod: 'playwright'
  };
}
