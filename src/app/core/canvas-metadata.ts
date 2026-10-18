/** The canvas state as metadata: for re-extraction requests and for export/upload. */
import { CanvasState, FieldStatus } from '../shared/models/canvas.models';
import { SchemaService } from './schema.service';
import { ShapeExpanderService } from './shape-expander.service';

export function collectMetadata(
  state: CanvasState,
  shapeExpander: ShapeExpanderService
): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Collect values from all fields
  const allFields = [...state.coreFields, ...state.specialFields];
  
  for (const field of allFields) {
    // For parent fields with subfields, reconstruct the complex object
    if (field.isParent && field.subFields && field.subFields.length > 0) {
      const reconstructed = shapeExpander.reconstructObjectFromSubFields(field, allFields);
      if (reconstructed !== undefined && reconstructed !== null) {
        metadata[field.fieldId] = reconstructed;
      }
      continue;
    }
    
    // Skip subfields (they're handled via parent reconstruction)
    if (field.parentFieldId) continue;
    
    if (field.value !== undefined && field.value !== null && field.value !== '') {
      if (Array.isArray(field.value) && field.value.length === 0) {
        continue;
      }
      metadata[field.fieldId] = field.value;
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
  language: string
): Record<string, any> {
  const allFields = [...state.coreFields, ...state.specialFields];
  
  // Reconstruct complex objects from subfields
  // Also strip internal meta-keys (_origins, _source_text) to prevent duplication
  const exportMetadata: Record<string, any> = {};
  for (const [key, value] of Object.entries(state.metadata)) {
    if (!key.startsWith('_')) {
      exportMetadata[key] = value;
    }
  }
  for (const field of allFields) {
    if (field.isParent && field.subFields) {
      exportMetadata[field.fieldId] = shapeExpander.reconstructObjectFromSubFields(field, allFields);
    }
  }
  
  // Build origins map: track which fields were set by AI vs user
  const origins: Record<string, 'ai' | 'user'> = {};
  for (const field of allFields) {
    if (field.status === FieldStatus.FILLED) {
      origins[field.fieldId] = field.isAiGenerated ? 'ai' : 'user';
    }
    // Also track subfield origins
    if (field.isParent && field.subFields) {
      for (const sf of field.subFields) {
        if (sf.status === FieldStatus.FILLED) {
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
