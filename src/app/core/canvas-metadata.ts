/** The canvas state as metadata: for re-extraction requests and for export/upload. */
import { CanvasFieldState, CanvasState, FieldStatus } from '../shared/models/canvas.models';
import { isValueFilled } from './canvas-fields';
import { SchemaService } from './schema.service';
import { ShapeExpanderService } from './shape-expander.service';

/** The metadata without the internal keys (_origins, _source_text, ...). */
export function withoutInternalKeys(metadata: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !key.startsWith('_')));
}

/** The keys around the fields of a record, as the agent answers and the widget exports it. */
const ENVELOPE_KEYS = [
  'contextName', 'schemaVersion', 'metadataset', 'metadataset_uri', 'language',
  'exportedAt', 'processing', 'preview_image_url', '_origins', '_source_text',
];
/** Keys with which a host names the type of a record; no fields either. */
const TYPE_KEYS = ['schemaFile', 'contentType'];

/** What was handed in for an import is not a record (audit 14.11., W-34). */
export class InvalidRecordError extends Error {}

/** A record to import, taken apart: its fields and what stands around them. */
export interface ImportedRecord {
  /** The fields; of a nested record as they are, with the internal keys older exports put there. */
  metadata: Record<string, any>;
  /** The record's own type: schema file or type URI. */
  schemaFile?: string;
  origins?: Record<string, 'ai' | 'user'>;
  sourceText?: string;
  previewImageUrl?: string;
  contextName?: string;
  schemaVersion?: string;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Reads a record in one of its two forms: nested (`{ metadataset, metadata: {…} }`,
 * the widget's export) or flat (`{ metadataset, 'cclom:title': … }`, as the
 * agent answers and stores it). Throws InvalidRecordError for anything else -
 * a list, a text or a `metadata` that is no object used to be imported key by
 * key ("0", "1", …) over the form (W-34).
 *
 * In the flat form the envelope keys are the envelope, never fields: they came
 * back as fields of the record, `processing` and the screenshot included.
 * `contentType` names the type where `metadataset` is absent - the README
 * integration puts it into the record - and is no field either (W-39).
 */
export function readRecord(data: unknown): ImportedRecord {
  if (!isPlainObject(data)) throw new InvalidRecordError('The import is not a record.');
  const nested = data['metadata'];
  if (nested !== undefined && nested !== null && !isPlainObject(nested)) {
    throw new InvalidRecordError('The metadata of the import are not an object.');
  }
  const outside = new Set([...ENVELOPE_KEYS, ...TYPE_KEYS, 'metadata']);
  const metadata: Record<string, any> = nested
    ?? Object.fromEntries(Object.entries(data).filter(([key]) => !outside.has(key)));
  // Internal keys at the top level (current format) or inside metadata (older exports).
  const origins = data['_origins'] || metadata['_origins'];
  return {
    metadata,
    schemaFile: text(data['metadataset']) || text(data['metadataset_uri']) || text(data['schemaFile']) || text(data['contentType']),
    origins: isPlainObject(origins) ? origins : undefined,
    sourceText: text(data['_source_text']) || text(metadata['_source_text']),
    previewImageUrl: text(data['preview_image_url']) || text(metadata['preview_image_url']),
    contextName: text(data['contextName']),
    schemaVersion: text(data['schemaVersion']),
  };
}

/**
 * The value of a top-level field as the record holds it: an object field is
 * put together from its subfields, every other field is its value.
 */
function recordValue(field: CanvasFieldState, allFields: CanvasFieldState[], shapeExpander: ShapeExpanderService): any {
  return field.isParent && field.subFields?.length
    ? shapeExpander.reconstructObjectFromSubFields(field, allFields)
    : field.value;
}

export function collectMetadata(
  state: CanvasState,
  shapeExpander: ShapeExpanderService
): Record<string, any> {
  const metadata: Record<string, any> = {};

  // The filled fields - by the rule for "empty" the record follows as well
  // (isValueFilled; audit 14.11., W-41). Subfields come with their parent.
  const allFields = [...state.coreFields, ...state.specialFields];

  for (const field of allFields) {
    if (field.parentFieldId) continue;
    const value = recordValue(field, allFields, shapeExpander);
    if (isValueFilled(value)) {
      metadata[field.fieldId] = value;
    }
  }

  // Include _origins so the API can preserve user/ai tracking during re-extraction
  const origins: Record<string, 'ai' | 'user'> = {};
  for (const field of allFields) {
    if (field.status === FieldStatus.FILLED) {
      origins[field.fieldId] = field.isAiGenerated ? 'ai' : 'user';
    }
  }
  if (Object.keys(origins).length > 0) {
    metadata['_origins'] = origins;
  }

  // Include the original source text so the API can combine it with a new
  // correction instruction during re-extraction (source text "fortschreiben")
  const sourceText = state.userText;
  if (sourceText) {
    metadata['_source_text'] = sourceText;
  }

  return metadata;
}

export function exportMetadata(
  state: CanvasState,
  shapeExpander: ShapeExpanderService,
  schema: SchemaService,
  language: string,
  recordKeys: Set<string>
): Record<string, any> {
  const allFields = [...state.coreFields, ...state.specialFields];

  const formFields = allFields.filter(field => !field.parentFieldId);
  const shown = new Set(formFields.map(field => field.fieldId));

  // The fields are the record (audit 14.11., W-31). The metadata map followed
  // the form only loosely: after a type switch it kept the values of field ids
  // both types have while the new fields were empty, and after a re-extraction
  // it lacked what the answer did not repeat. It is read only for
  // `recordKeys` that no field shows: schema fields without a form field
  // (ask_user false) and keys of an import no field knows (W-L1) - never for
  // the internal keys (_origins, _source_text).
  //
  // One rule for empty values (W-41): a field without a value is not in the
  // record - neither as '', [] or {} nor as the agent's empty defaults. Only a
  // field the editor emptied is there, as null, so the host learns that the
  // value is gone (W-LOG-02).
  const exportMetadata: Record<string, any> = {};
  for (const [key, value] of Object.entries(state.metadata)) {
    if (!key.startsWith('_') && recordKeys.has(key) && !shown.has(key) && isValueFilled(value)) {
      exportMetadata[key] = value;
    }
  }
  for (const field of formFields) {
    const value = recordValue(field, allFields, shapeExpander);
    if (isValueFilled(value)) {
      exportMetadata[field.fieldId] = value;
    } else if (field.isAiGenerated === false) {
      exportMetadata[field.fieldId] = null;
    }
  }


  // Build origins map: track which fields were set by AI vs user
  const origins: Record<string, 'ai' | 'user'> = {};
  for (const field of allFields) {
    if (field.status === FieldStatus.FILLED) {
      origins[field.fieldId] = field.isAiGenerated ? 'ai' : 'user';
    }
    // Also track subfield origins - of the inputs, not of the containers
    // between them (`address`), which nobody fills as such (W-32).
    if (field.isParent && field.subFields) {
      for (const sf of field.subFields) {
        if (sf.status === FieldStatus.FILLED && !sf.isParent) {
          origins[sf.fieldId] = sf.isAiGenerated ? 'ai' : 'user';
        }
      }
    }
  }
  
  // Resolve metadataset_uri from selected content type
  const metadataset = state.selectedContentType || 'core.json';
  const concept = schema.getContentTypeConcepts().find(c => c.schema_file === metadataset);
  
  const result: Record<string, any> = {
    contextName: schema.getContextName(),
    schemaVersion: schema.getSchemaVersion(),
    metadataset,
    metadataset_uri: concept?.uri || null,
    language: language,
    exportedAt: new Date().toISOString(),
    metadata: exportMetadata,
    _origins: origins
  };

  // Include raw source text for extended data upload
  if (state.userText) {
    result['_source_text'] = state.userText;
  }

  // Include preview image URL if available (screenshot base64 or URL)
  if (state.previewImageUrl) {
    result['preview_image_url'] = state.previewImageUrl;
  }

  return result;
}
