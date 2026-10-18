/**
 * What export and upload send (final audit 18.10., W-L1): they read the
 * metadata map of the state, which did not follow the form. After a type
 * switch the other type's keys stayed, a subfield edit added a dotted key
 * ("schema:contactPoint.email"), and keys an import brought that no field
 * knows were carried along - all of it ended up in ccm:oeh_extendedData.
 * The import's own keys stay in the export (events, JSON) as in 2.1.1; only
 * the upload (getMetadataForRepository) leaves them out (review 18.10.).
 *
 * Real CanvasService and SchemaService; only the HTTP answers are faked.
 */
import { CanvasService } from './canvas.service';
import { SchemaService } from './schema.service';
import { ShapeExpanderService } from './shape-expander.service';
import { GenerateResponse } from './api.service';

const CORE = {
  fields: [
    { id: 'cclom:title', label: { de: 'Titel' }, system: { datatype: 'string', multiple: false } },
    { id: 'cclom:general_keyword', label: { de: 'Schlagworte' }, system: { datatype: 'array', multiple: true, items: { datatype: 'string' } } },
    {
      id: 'ccm:oeh_extendedType',
      label: { de: 'Inhaltstyp' },
      system: {
        datatype: 'uri',
        ask_user: false,
        vocabulary: {
          type: 'closed',
          concepts: [
            { uri: 'http://w3id.org/a', label: { de: 'A' }, schema_file: 'a.json' },
            { uri: 'http://w3id.org/b', label: { de: 'B' }, schema_file: 'b.json' },
          ],
        },
      },
    },
  ],
  groups: [],
};
const CONTACT_POINT = {
  id: 'schema:contactPoint',
  label: { de: 'Kontaktstelle' },
  system: {
    datatype: 'array',
    multiple: true,
    items: {
      datatype: 'object',
      discriminator: '@type',
      variants: [{
        '@type': 'ContactPoint',
        fields: [
          { id: 'contactType', label: { de: 'Kontakttyp' }, system: { datatype: 'string' } },
          { id: 'email', label: { de: 'E-Mail' }, system: { datatype: 'string' } },
        ],
      }],
    },
  },
};
const SCHEMAS: Record<string, unknown> = {
  'core.json': CORE,
  'a.json': {
    fields: [
      { id: 'ccm:a', label: { de: 'Feld A' }, system: { datatype: 'string' } },
      CONTACT_POINT,
      { id: 'schema:geo', label: { de: 'Koordinaten' }, system: { datatype: 'object', ask_user: false } },
    ],
    groups: [],
  },
  'b.json': { fields: [{ id: 'ccm:b', label: { de: 'Feld B' }, system: { datatype: 'string' } }], groups: [] },
};

function answer(metadataset: string, metadata: Record<string, unknown>): GenerateResponse {
  return {
    contextName: 'default',
    schemaVersion: 'latest',
    metadataset,
    language: 'de',
    exportedAt: '2026-10-18T00:00:00Z',
    metadata: { ...metadata, _origins: {}, _source_text: 'Quelltext' },
    processing: {
      success: true, fields_extracted: 1, fields_total: 1, processing_time_ms: 1,
      llm_provider: 'x', llm_model: 'y', errors: [], warnings: [], status: 'success',
    },
  } as unknown as GenerateResponse;
}

const PAGE_AS_A = {
  'cclom:title': 'Konzert',
  'cclom:general_keyword': ['Musik'],
  'ccm:oeh_extendedType': 'http://w3id.org/a',
  'ccm:a': 'Wert A',
  'schema:contactPoint': [{ '@type': 'ContactPoint', contactType: 'Kasse', email: 'kasse@example.org' }],
};
const GEO = { '@type': 'GeoCoordinates', latitude: 50.98, longitude: 11.32 };
const PAGE_AS_B = {
  'cclom:title': 'Konzert',
  'ccm:oeh_extendedType': 'http://w3id.org/b',
  'ccm:b': 'Wert B',
};

describe('CanvasService export follows the form (W-L1)', () => {
  let service: CanvasService;
  let schema: SchemaService;
  let generate: jasmine.Spy;
  const i18n = { currentLang: 'de', instant: (key: string) => key };
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} };
  let api: { getSchema: unknown; generate: jasmine.Spy };

  beforeEach(() => {
    generate = jasmine.createSpy('generate').and.callFake((request: { schema_file?: string }) =>
      Promise.resolve(request.schema_file === 'b.json' ? answer('b.json', PAGE_AS_B) : answer('a.json', PAGE_AS_A)));
    api = {
      getSchema: (_c: string, _v: string, file: string) => Promise.resolve(SCHEMAS[file]),
      generate,
    };
    schema = new SchemaService({} as any, quiet as any, i18n as any, api as any);
    service = new CanvasService(schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema), { run: (fn: () => unknown) => fn() } as any);
  });

  function exported(): Record<string, unknown> {
    return service.getMetadataForExport()['metadata'];
  }
  function uploaded(): Record<string, unknown> {
    return service.getMetadataForRepository()['metadata'];
  }

  it('exports a generated form as before (characterization)', async () => {
    await service.startExtraction('Quelltext');

    // As measured before the fix: the object is rebuilt from its subfields
    // (the discriminator is not one of them).
    expect(exported()).toEqual({
      ...PAGE_AS_A,
      'schema:contactPoint': [{ contactType: 'Kasse', email: 'kasse@example.org' }],
    });
    expect(service.getMetadataForExport()['metadataset']).toBe('a.json');
  });

  it('exports a subfield edit inside its object, not as a dotted key', async () => {
    await service.startExtraction('Quelltext');

    service.updateFieldValue('schema:contactPoint.email', 'neu@example.org');

    const metadata = exported();
    expect(Object.keys(metadata).filter(key => key.includes('.'))).toEqual([]);
    expect((metadata['schema:contactPoint'] as any[])[0].email).toBe('neu@example.org');
  });

  it('A, B (re-run), back to A (cached): no keys of B and no dotted keys', async () => {
    await service.startExtraction('Quelltext');
    service.updateFieldValue('schema:contactPoint.email', 'neu@example.org');
    await service.selectContentType('b.json');
    expect(generate).toHaveBeenCalledTimes(2);

    await service.selectContentType('a.json');

    const metadata = exported();
    expect(generate).withContext('A comes from the cache').toHaveBeenCalledTimes(2);
    expect(metadata['ccm:b']).withContext('field of B').toBeUndefined();
    expect(Object.keys(metadata).filter(key => key.includes('.'))).toEqual([]);
    expect(metadata['ccm:a']).toBe('Wert A');
    expect((metadata['schema:contactPoint'] as any[])[0].email).toBe('neu@example.org');
  });

  it('a switch without a re-run does not export the previous type\'s fields', async () => {
    await service.importJsonData({ metadataset: 'a.json', metadata: PAGE_AS_A });

    await service.selectContentType('b.json');

    expect(exported()['ccm:a']).toBeUndefined();
    expect(exported()['schema:contactPoint']).toBeUndefined();
    expect(exported()['cclom:title']).toBe('Konzert');
  });

  // Review 18.10.: the schema fields without a form field (ask_user false)
  // were looked up in the schema cache all widgets share. A second widget on
  // the page that set another context emptied it, and the first one's export
  // lost them (geocoded coordinates, the type URI).
  it('keeps the schema fields without a form field when another widget empties the shared schemas', async () => {
    const other = new CanvasService(schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema), { run: (fn: () => unknown) => fn() } as any);
    await service.importJsonData({ metadataset: 'a.json', metadata: { ...PAGE_AS_A, 'schema:geo': GEO } });

    await schema.setContext('mds_oeh', 'latest'); // the second widget's ngOnInit
    await other.loadMetadata({ 'cclom:title': 'Anderes' });

    expect(exported()['schema:geo']).toEqual(GEO);
    expect(exported()['ccm:oeh_extendedType']).toBe('http://w3id.org/a');
    expect(service.getMetadataForRepository()['metadata']['schema:geo']).toEqual(GEO);
  });

  // 2.1.1 returned the keys of an imported record that no field knows; the
  // events and the JSON export keep them (review 18.10.), the upload does not.
  it('keeps keys of an import that no field knows in the export, not in the upload', async () => {
    await service.importJsonData({ metadataset: 'a.json', metadata: { ...PAGE_AS_A, 'ccm:unbekannt': 'x' } });

    expect(exported()['ccm:unbekannt']).toBe('x');
    expect(uploaded()['ccm:unbekannt']).toBeUndefined();
    expect(uploaded()['ccm:oeh_extendedType']).withContext('a schema field without a form field').toBe('http://w3id.org/a');
  });

  it('keeps them after a type switch, without the previous type\'s fields', async () => {
    await service.importJsonData({ metadataset: 'a.json', metadata: { ...PAGE_AS_A, 'ccm:unbekannt': 'x' } });

    await service.selectContentType('b.json');

    expect(exported()['ccm:unbekannt']).toBe('x');
    expect(exported()['ccm:a']).withContext('field of the previous type').toBeUndefined();
  });

  it('an import without a type: its type values are exported, not uploaded', async () => {
    await service.importJsonData({ 'cclom:title': 'Konzert', 'ccm:a': 'Wert A' });

    expect(exported()['ccm:a']).toBe('Wert A');
    expect(uploaded()['ccm:a']).toBeUndefined();
    expect(uploaded()['cclom:title']).toBe('Konzert');
  });

  it('forgets the import\'s keys with the next import', async () => {
    await service.importJsonData({ metadataset: 'a.json', metadata: { ...PAGE_AS_A, 'ccm:unbekannt': 'x' } });

    await service.importJsonData({ metadataset: 'a.json', metadata: { 'cclom:title': 'Nächste Seite' } });

    expect(exported()['ccm:unbekannt']).toBeUndefined();
  });
});
