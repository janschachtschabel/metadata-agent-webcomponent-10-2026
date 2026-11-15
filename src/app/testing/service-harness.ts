/**
 * The real CanvasService, SchemaService and ShapeExpanderService without
 * Angular - only the HTTP answers are faked. For specs of the data flow
 * (import, edit, type switch, export) that need no rendering (audit 14.11.).
 */
import { CanvasService } from '../core/canvas.service';
import { SchemaService } from '../core/schema.service';
import { ShapeExpanderService } from '../core/shape-expander.service';
import { CanvasFieldState } from '../shared/models/canvas.models';

/** A core schema with a title and the content types `types` (schema file by URI). */
export function coreSchema(types: Record<string, string>, fields: unknown[] = []): { fields: unknown[]; groups: unknown[] } {
  return {
    fields: [
      { id: 'cclom:title', label: { de: 'Titel' }, system: { datatype: 'string', multiple: false } },
      ...fields,
      {
        id: 'ccm:oeh_extendedType',
        label: { de: 'Inhaltstyp' },
        system: {
          datatype: 'uri',
          ask_user: false,
          vocabulary: {
            type: 'closed',
            concepts: Object.entries(types).map(([uri, schema_file]) => ({ uri, label: { de: schema_file }, schema_file })),
          },
        },
      },
    ],
    groups: [],
  };
}

/** A /generate answer as ApiService hands it on. */
export function answered(metadataset: string, metadata: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return {
    contextName: 'default',
    schemaVersion: '2.0.0',
    metadataset,
    metadata: { ...metadata },
    processing: {
      success: true, fields_extracted: 1, fields_total: 1, processing_time_ms: 1,
      llm_provider: 'x', llm_model: 'y', errors: [], warnings: [], status: 'success',
    },
    ...extra,
  };
}

export interface ServiceHarness {
  service: CanvasService;
  schema: SchemaService;
  api: { getSchema: jasmine.Spy; generate: jasmine.Spy };
  /** The top-level field with this id; fails when the form has none. */
  field(id: string): CanvasFieldState;
  /** All top-level fields of the form. */
  fields(): CanvasFieldState[];
  /** `metadata` of the record for events and the JSON export. */
  exported(): Record<string, any>;
  /** `metadata` of the record for the upload. */
  uploaded(): Record<string, any>;
}

export function buildService(schemas: Record<string, unknown>): ServiceHarness {
  const i18n = { currentLang: 'de', instant: (key: string) => key };
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} };
  const api = {
    getSchema: jasmine.createSpy('getSchema').and.callFake((_context: string, _version: string, file: string) =>
      schemas[file] ? Promise.resolve(schemas[file]) : Promise.reject(new Error(`no schema ${file}`))),
    generate: jasmine.createSpy('generate'),
    captureScreenshot: () => Promise.resolve(null),
  };
  const schema = new SchemaService(quiet as any, i18n as any, api as any);
  const service = new CanvasService(
    schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema),
    { run: (fn: () => unknown) => fn() } as any,
  );
  const fields = (): CanvasFieldState[] => {
    const state = service.getCurrentState();
    return [...state.coreFields, ...state.specialFields];
  };
  return {
    service,
    schema,
    api,
    fields,
    field: (id: string) => {
      const found = fields().find(f => f.fieldId === id);
      if (!found) throw new Error(`the form has no field ${id}`);
      return found;
    },
    exported: () => service.getMetadataForExport()['metadata'],
    uploaded: () => service.getMetadataForRepository()['metadata'],
  };
}
