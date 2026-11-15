/**
 * What importJsonData takes for a record (audit 14.11.):
 *
 * - W-34: anything that is no record (a list, a text, a `metadata` that is no
 *   object) was imported key by key over the form; in a flat record the
 *   envelope keys came back as fields.
 * - W-39: the README integration puts `contentType` into the record; the
 *   widget did not read it there and exported it as a field.
 * - W-44: `contextName` and `schemaVersion` of the record were replaced by
 *   the widget's without a word.
 * - W-45: a core schema that failed to load during an import stayed silent.
 */
import { InvalidRecordError } from './canvas-metadata';
import { ServiceHarness, buildService, coreSchema } from '../testing/service-harness';

const EVENT_URI = 'http://w3id.org/openeduhub/vocabs/contentTypes/event';
const SCHEMAS: Record<string, unknown> = {
  'core.json': { ...coreSchema({ [EVENT_URI]: 'event.json', 'http://w3id.org/person': 'person.json' }), version: '2.0.0' },
  'event.json': { fields: [{ id: 'ccm:price', label: { de: 'Preis' }, system: { datatype: 'string' } }], groups: [] },
  'person.json': { fields: [{ id: 'schema:jobTitle', label: { de: 'Beruf' }, system: { datatype: 'string' } }], groups: [] },
};
const BEFORE = { metadataset: 'event.json', metadata: { 'cclom:title': 'Vorher', 'ccm:price': '5' } };

describe('CanvasService.importJsonData', () => {
  let h: ServiceHarness;

  beforeEach(() => {
    h = buildService(SCHEMAS);
  });

  describe('refuses what is no record (W-34)', () => {
    const NOT_A_RECORD: unknown[] = [['a', 'b'], 'abc', 42, null, true, { metadata: 'text' }, { metadata: ['x'] }, { metadata: 7 }];

    for (const data of NOT_A_RECORD) {
      it(`${JSON.stringify(data)}: an error, and the form stays as it was`, async () => {
        await h.service.importJsonData(BEFORE);
        const state = h.service.getCurrentState();

        await expectAsync(h.service.importJsonData(data)).toBeRejectedWithError(InvalidRecordError);

        expect(h.service.getCurrentState()).withContext('no state change at all').toBe(state);
        expect(h.exported()).toEqual({ 'cclom:title': 'Vorher', 'ccm:price': '5' });
      });
    }

    it('does not cut a running extraction short for it', async () => {
      h.api.generate.and.returnValue(new Promise(() => undefined));
      void h.service.startExtraction('Quelle');
      await new Promise(resolve => setTimeout(resolve));

      await expectAsync(h.service.importJsonData(['a'])).toBeRejected();

      expect(h.service.getCurrentState().isExtracting).toBeTrue();
    });
  });

  describe('a flat record (W-34)', () => {
    const FLAT = {
      contextName: 'default', schemaVersion: '2.0.0', metadataset: 'event.json', metadataset_uri: EVENT_URI,
      language: 'de', exportedAt: '2026-01-01T00:00:00Z',
      'cclom:title': 'Konzert', 'ccm:price': '5', 'ccm:unbekannt': 'x',
      processing: { success: true, llm_model: 'm', processing_time_ms: 5 },
      _origins: { 'cclom:title': 'user' }, _source_text: 'Quelle',
      preview_image_url: 'data:image/png;base64,AAAA',
    };

    it('has its envelope keys read as the envelope, never as fields', async () => {
      await h.service.importJsonData(FLAT);

      expect(h.exported()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5', 'ccm:unbekannt': 'x' });
      expect(h.uploaded()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5' });
    });

    it('gives the envelope its values', async () => {
      await h.service.importJsonData(FLAT);

      const record = h.service.getMetadataForExport();
      expect(record['metadataset']).toBe('event.json');
      expect(record['_source_text']).toBe('Quelle');
      expect(record['preview_image_url']).toBe('data:image/png;base64,AAAA');
      expect(record['_origins']['cclom:title']).toBe('user');
    });

    it('is the same record as its nested form', async () => {
      await h.service.importJsonData(FLAT);
      const flat = { ...h.service.getMetadataForExport(), exportedAt: null };

      await h.service.importJsonData(flat);

      expect({ ...h.service.getMetadataForExport(), exportedAt: null }).toEqual(flat);
    });
  });

  describe('contentType inside the record (W-39)', () => {
    it('names the type of a node without stored data, as schema file or URI', async () => {
      for (const contentType of ['event.json', EVENT_URI]) {
        await h.service.importJsonData({ contentType }, null);

        expect(h.service.getCurrentState().selectedContentType).withContext(contentType).toBe('event.json');
        expect(h.fields().map(f => f.fieldId)).toEqual(['cclom:title', 'ccm:price']);
        expect(h.exported()).withContext('no field of the record').toEqual({});
      }
    });

    it('names the type of flat stored fields and never becomes one of them', async () => {
      await h.service.importJsonData({ 'cclom:title': 'Konzert', 'ccm:price': '5', contentType: EVENT_URI }, null);

      expect(h.service.getMetadataForExport()['metadataset']).toBe('event.json');
      expect(h.exported()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5' });
      expect(h.uploaded()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5' });
    });

    it('yields to the metadataset of the record', async () => {
      await h.service.importJsonData({ metadataset: 'person.json', metadata: { 'cclom:title': 'A' }, contentType: EVENT_URI }, null);

      expect(h.service.getCurrentState().selectedContentType).toBe('person.json');
    });

    it('is the record\'s own type: it comes before the type the host set on the element', async () => {
      await h.service.importJsonData({ 'cclom:title': 'A', contentType: EVENT_URI }, 'person.json');

      expect(h.service.getCurrentState().selectedContentType).toBe('event.json');
    });

    it('leaves the element\'s type in charge when it is empty', async () => {
      await h.service.importJsonData({ 'cclom:title': 'A', contentType: undefined }, 'person.json');

      expect(h.service.getCurrentState().selectedContentType).toBe('person.json');
      expect(h.exported()).toEqual({ 'cclom:title': 'A' });
    });
  });

  describe('a record of another schema (W-44)', () => {
    const record = (envelope: Record<string, unknown>) => ({ metadataset: 'event.json', metadata: { 'cclom:title': 'T' }, ...envelope });

    it('says so when the record names another schema version', async () => {
      await h.service.importJsonData(record({ contextName: 'default', schemaVersion: 'v1.8.1' }));

      expect(h.service.getCurrentState().extractionWarning).toContain('default 1.8.1');
      expect(h.service.getCurrentState().extractionWarning).toContain('default 2.0.0');
    });

    it('says so when the record names another context', async () => {
      await h.service.importJsonData(record({ contextName: 'mds_oeh', schemaVersion: 'v2.0.0' }));

      expect(h.service.getCurrentState().extractionWarning).toContain('mds_oeh 2.0.0');
    });

    it('still exports the record under the schema the form is built from, and in the widget\'s language', async () => {
      await h.service.importJsonData(record({ contextName: 'mds_oeh', schemaVersion: 'v1.8.1', language: 'en' }));

      const exported = h.service.getMetadataForExport();
      expect([exported['contextName'], exported['schemaVersion'], exported['language']]).toEqual(['default', 'v2.0.0', 'de']);
    });

    for (const envelope of [{}, { contextName: 'default', schemaVersion: 'v2.0.0' }, { schemaVersion: '2.0.0' }, { schemaVersion: 'vlatest' }, { language: 'en' }]) {
      it(`says nothing for ${JSON.stringify(envelope)}`, async () => {
        await h.service.importJsonData(record(envelope));

        expect(h.service.getCurrentState().extractionWarning).toBeNull();
      });
    }

    it('takes the notice of the record before away with the next import', async () => {
      await h.service.importJsonData(record({ schemaVersion: 'v1.8.1' }));

      await h.service.importJsonData(record({}));

      expect(h.service.getCurrentState().extractionWarning).toBeNull();
    });
  });

  describe('a schema that cannot be loaded (W-45)', () => {
    function failing(file: string): void {
      h.api.getSchema.and.callFake((_c: string, _v: string, asked: string) =>
        asked === file ? Promise.reject({ status: 503 }) : Promise.resolve(SCHEMAS[asked]));
    }

    it('shows that the core schema failed, and the form is not for the upload', async () => {
      failing('core.json');

      await h.service.importJsonData(BEFORE);

      expect(h.service.getCurrentState().extractionError).toContain('The fields could not be loaded');
      expect(h.service.getCurrentState().coreFields).toEqual([]);
      expect(h.service.hasSchemaError()).toBeTrue();
    });

    it('does not keep the core fields of the form before with their values', async () => {
      await h.service.importJsonData(BEFORE);
      await h.schema.setContext('default', '1.8.1'); // another widget on the page: the schemas are asked again
      failing('core.json');

      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'ccm:price': '9' } });

      expect(h.fields().map(f => f.fieldId)).toEqual(['ccm:price']);
      expect(h.exported()['cclom:title']).withContext('the title of the record before').toBeUndefined();
    });

    it('marks a form whose type schema failed', async () => {
      failing('event.json');

      await h.service.importJsonData(BEFORE);

      expect(h.service.getCurrentState().extractionError).toBe('EXTRACTION_RESULT.SCHEMA_UNAVAILABLE');
      expect(h.service.hasSchemaError()).toBeTrue();
    });

    it('is over once the schema is there: the next import, another type, a reset', async () => {
      failing('event.json');
      await h.service.importJsonData(BEFORE);

      await h.service.selectContentType('person.json');
      expect(h.service.hasSchemaError()).withContext('another type').toBeFalse();

      await h.service.selectContentType('event.json');
      expect(h.service.hasSchemaError()).withContext('the failed type again').toBeTrue();

      h.api.getSchema.and.callFake((_c: string, _v: string, asked: string) => Promise.resolve(SCHEMAS[asked]));
      await h.service.importJsonData(BEFORE);
      expect(h.service.hasSchemaError()).withContext('loaded now').toBeFalse();
      expect(h.service.getCurrentState().extractionError).toBeNull();
    });

    it('is over with a reset: an empty form lacks nothing', async () => {
      failing('core.json');
      await h.service.importJsonData({ 'cclom:title': 'X' });

      h.service.reset();

      expect(h.service.hasSchemaError()).toBeFalse();
    });
  });
});
