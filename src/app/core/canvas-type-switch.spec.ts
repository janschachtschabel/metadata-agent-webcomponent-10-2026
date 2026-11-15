/**
 * Audit 14.11. (W-31): the record is what the form shows. The record was read
 * from the metadata map, the form from the fields. After a type switch
 * without a new run the map kept the values of field ids both types have
 * (44 ids in the 2.0.0 schemas, licence keys among them) while the new type's
 * fields were empty: event, JSON and upload carried values nobody saw.
 *
 * Decision: the fields are the record. On a type choice the values of ids both
 * types have travel into the new fields with their origin; values of ids the
 * new type lacks leave the record (and wait in the per-type cache).
 */
import { isValueFilled } from './canvas-fields';
import { ServiceHarness, answered, buildService, coreSchema } from '../testing/service-harness';

const text = (id: string, label: string) => ({ id, label: { de: label }, system: { datatype: 'string', multiple: false } });
const PROVIDER = {
  id: 'schema:provider',
  label: { de: 'Anbieter' },
  system: {
    datatype: 'array', multiple: true,
    items: { datatype: 'object', variants: [{ '@type': 'Organization', fields: [text('name', 'Name'), text('url', 'Adresse')] }] },
  },
};
const SCHEMAS = {
  'core.json': coreSchema({ 'http://w3id.org/course': 'course.json', 'http://w3id.org/program': 'program.json' }),
  'course.json': {
    fields: [text('schema:startDate', 'Beginn'), text('ccm:license', 'Lizenz'), text('schema:courseCode', 'Kursnummer'), PROVIDER],
    groups: [],
  },
  'program.json': {
    fields: [text('schema:startDate', 'Beginn'), text('ccm:license', 'Lizenz'), text('schema:programType', 'Art'), PROVIDER],
    groups: [],
  },
};
const COURSE = {
  metadataset: 'course.json',
  metadata: {
    'cclom:title': 'Kurs',
    'schema:startDate': '2026-01-01',
    'ccm:license': 'CC_BY',
    'schema:courseCode': 'ABC',
    'schema:provider': [{ '@type': 'Organization', name: 'VHS', url: 'https://vhs.example' }],
  },
  _origins: { 'cclom:title': 'ai', 'schema:startDate': 'ai', 'ccm:license': 'user', 'schema:courseCode': 'ai', 'schema:provider': 'ai' },
};

describe('CanvasService: the record is what the form shows after a type switch (W-31)', () => {
  let h: ServiceHarness;

  beforeEach(() => {
    h = buildService(SCHEMAS);
  });

  /** For every field of the form the record holds its value, and nothing but fields is in it. */
  function expectRecordToBeTheForm(): void {
    for (const record of [h.exported(), h.uploaded()]) {
      for (const field of h.fields()) {
        if (isValueFilled(field.value)) {
          expect(record[field.fieldId]).withContext(field.fieldId).toEqual(field.value);
        } else {
          expect(record[field.fieldId] ?? null).withContext(`${field.fieldId} is empty in the form`).toBeNull();
        }
      }
      const fieldIds = h.fields().map(f => f.fieldId);
      expect(Object.keys(record).filter(key => !fieldIds.includes(key))).withContext('keys without a field').toEqual([]);
    }
  }

  it('holds for every field id what the form shows', async () => {
    await h.service.importJsonData(COURSE);
    expectRecordToBeTheForm();

    await h.service.selectContentType('program.json');

    expect(h.service.getCurrentState().selectedContentType).toBe('program.json');
    expect(h.api.generate).withContext('no source text: no new run').not.toHaveBeenCalled();
    expectRecordToBeTheForm();
  });

  it('keeps the value of a field id both types have, in the form and in the record', async () => {
    await h.service.importJsonData(COURSE);

    await h.service.selectContentType('program.json');

    expect(h.field('schema:startDate').value).toBe('2026-01-01');
    expect(h.exported()['schema:startDate']).toBe('2026-01-01');
    expect(h.uploaded()['schema:startDate']).toBe('2026-01-01');
    expect(h.field('schema:provider').subFields!.map(sf => sf.value)).toEqual(['VHS', 'https://vhs.example']);
    expect(h.exported()['schema:provider']).toEqual(COURSE.metadata['schema:provider']);
  });

  it('keeps the origin of a carried value', async () => {
    await h.service.importJsonData(COURSE);

    await h.service.selectContentType('program.json');

    const origins = h.service.getMetadataForExport()['_origins'];
    expect(origins['schema:startDate']).toBe('ai');
    expect(origins['ccm:license']).withContext('typed by the editor').toBe('user');
    expect(h.field('ccm:license').isAiGenerated).toBeFalse();
  });

  it('drops the value of a field id the new type does not have', async () => {
    await h.service.importJsonData(COURSE);

    await h.service.selectContentType('program.json');

    expect(h.exported()['schema:courseCode']).toBeUndefined();
    expect(h.uploaded()['schema:courseCode']).toBeUndefined();
  });

  it('carries what the editor typed into a shared field, not what the import said', async () => {
    await h.service.importJsonData(COURSE);
    h.service.updateFieldValue('schema:startDate', '2026-02-02');
    h.service.updateFieldValue('schema:provider.name', 'Volkshochschule');

    await h.service.selectContentType('program.json');

    expect(h.exported()['schema:startDate']).toBe('2026-02-02');
    expect(h.exported()['schema:provider'][0].name).toBe('Volkshochschule');
    expect(h.service.getMetadataForExport()['_origins']['schema:provider.name']).toBe('user');
    expectRecordToBeTheForm();
  });

  it('a shared field the editor emptied stays empty and is reported as null', async () => {
    await h.service.importJsonData(COURSE);
    h.service.updateFieldValue('schema:startDate', null);

    await h.service.selectContentType('program.json');

    expect(h.field('schema:startDate').value).toBeNull();
    expect(h.exported()['schema:startDate']).toBeNull();
  });

  it('back on the first type: its own values from the cache, the shared ones as the form had them last', async () => {
    await h.service.importJsonData(COURSE);
    await h.service.selectContentType('program.json');
    h.service.updateFieldValue('schema:startDate', '2026-03-03');
    h.service.updateFieldValue('schema:programType', 'Weiterbildung');

    await h.service.selectContentType('course.json');

    expect(h.exported()['schema:courseCode']).withContext('cached for the type').toBe('ABC');
    expect(h.exported()['schema:startDate']).withContext('edited meanwhile').toBe('2026-03-03');
    expect(h.exported()['schema:programType']).toBeUndefined();
    expectRecordToBeTheForm();
  });

  // The same gap the other way round: a re-extraction whose answer does not
  // repeat a key left the value in the form and dropped it from the record.
  it('keeps a value the form still shows when the answer of a re-extraction lacks its key', async () => {
    await h.service.importJsonData({ ...COURSE, _source_text: 'Quelle' });
    h.api.generate.and.resolveTo(answered('course.json', { 'cclom:title': 'Neuer Titel' }, { _source_text: 'Quelle' }));

    await h.service.startExtraction('Titel kürzen');

    expect(h.field('schema:courseCode').value).toBe('ABC');
    expect(h.exported()['schema:courseCode']).toBe('ABC');
    expect(h.exported()['cclom:title']).toBe('Neuer Titel');
    expectRecordToBeTheForm();
  });
});
