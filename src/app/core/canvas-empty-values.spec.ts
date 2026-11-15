/**
 * Audit 14.11. (W-41, K-20): one rule for empty values in the record.
 *
 * The record copied what the agent's answer or an import held for a key: 48
 * keys for a form with one value ('' 28 times, [] 16 times, null), and `[{}]`
 * counted as a filled field. The request for the next run left empty values
 * out by a rule of its own.
 *
 * The rule: a field without a value is not in the record. A field the editor
 * emptied is there as null (W-LOG-02). "Without a value" is decided by
 * isValueFilled everywhere - form status, events, JSON, upload and
 * existing_metadata.
 */
import { isValueFilled } from './canvas-fields';
import { FieldStatus } from '../shared/models/canvas.models';
import { ServiceHarness, answered, buildService, coreSchema } from '../testing/service-harness';

const field = (id: string, system: Record<string, unknown>) => ({ id, label: { de: id }, system });
const SCHEMAS = {
  'core.json': coreSchema({ 'http://w3id.org/event': 'event.json' }, [
    field('cclom:general_description', { datatype: 'string' }),
    field('cclom:general_keyword', { datatype: 'array', multiple: true, items: { datatype: 'string' } }),
  ]),
  'event.json': {
    fields: [
      field('ccm:price', { datatype: 'string' }),
      field('schema:maximumAttendeeCapacity', { datatype: 'integer' }),
      field('schema:isAccessibleForFree', { datatype: 'boolean' }),
      field('schema:geo', { datatype: 'object', ask_user: false }),
      field('schema:organizer', {
        datatype: 'array', multiple: true,
        items: { datatype: 'object', variants: [{ '@type': 'Organization', fields: [field('name', { datatype: 'string' })] }] },
      }),
    ],
    groups: [],
  },
};
/** The answer of the agent for a page with nothing but a title: a default for every field. */
const DEFAULTS = {
  'cclom:title': 'Konzert',
  'cclom:general_description': '',
  'cclom:general_keyword': [],
  'ccm:oeh_extendedType': '',
  'ccm:price': '',
  'schema:maximumAttendeeCapacity': null,
  'schema:isAccessibleForFree': null,
  'schema:geo': {},
  'schema:organizer': [{}],
};

describe('isValueFilled: the one rule for "empty" (W-41)', () => {
  for (const empty of [null, undefined, '', '   ', [], {}, [{}], [[]], [''], { address: {} }, { '@type': 'Place' }, [{ '@type': 'Place', geo: {} }]]) {
    it(`${JSON.stringify(empty)} is no value`, () => {
      expect(isValueFilled(empty)).toBeFalse();
    });
  }

  for (const filled of ['a', 0, false, [0], [false], { name: 'a' }, [{ address: { addressLocality: 'Weimar' } }], { '@type': 'Place', name: 'x' }]) {
    it(`${JSON.stringify(filled)} is a value`, () => {
      expect(isValueFilled(filled)).toBeTrue();
    });
  }
});

describe('CanvasService: empty values in the record (W-41)', () => {
  let h: ServiceHarness;

  beforeEach(() => {
    h = buildService(SCHEMAS);
    h.api.generate.and.resolveTo(answered('event.json', DEFAULTS, { _origins: { 'cclom:title': 'ai' }, _source_text: 'Ein Konzert' }));
  });

  it('leaves the empty defaults of the agent out of the record', async () => {
    await h.service.startExtraction('Ein Konzert');

    expect(h.exported()).toEqual({ 'cclom:title': 'Konzert' });
    expect(h.uploaded()).toEqual({ 'cclom:title': 'Konzert' });
  });

  it('counts only the title as filled', async () => {
    await h.service.startExtraction('Ein Konzert');

    expect(h.service.getCurrentState().filledFields).toBe(1);
    expect(h.field('schema:organizer').status).toBe(FieldStatus.EMPTY);
    expect(h.service.getMetadataForExport()['_origins']).toEqual({ 'cclom:title': 'ai' });
  });

  it('leaves the empty keys of an import out as well, with or without a field for them', async () => {
    await h.service.importJsonData({ metadataset: 'event.json', metadata: { ...DEFAULTS, 'ccm:unbekannt': '', 'ccm:fremd': 'x' } });

    expect(h.exported()).toEqual({ 'cclom:title': 'Konzert', 'ccm:fremd': 'x' });
  });

  it('reports a field the editor emptied as null - in the event record and in the upload', async () => {
    await h.service.startExtraction('Ein Konzert');

    h.service.updateFieldValue('cclom:title', null);

    expect(h.exported()).toEqual({ 'cclom:title': null });
    expect(h.uploaded()).toEqual({ 'cclom:title': null });
  });

  for (const emptied of ['', '   ', []]) {
    it(`reports null whatever the emptied field holds (${JSON.stringify(emptied)})`, async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'ccm:price': '5', 'cclom:general_keyword': ['a'] } });

      h.service.updateFieldValue('ccm:price', emptied);
      h.service.updateFieldValue('cclom:general_keyword', []);

      expect(h.exported()).toEqual({ 'ccm:price': null, 'cclom:general_keyword': null });
    });
  }

  it('keeps 0 and false: they are values', async () => {
    await h.service.importJsonData({
      metadataset: 'event.json',
      metadata: { 'schema:maximumAttendeeCapacity': 0, 'schema:isAccessibleForFree': false },
    });

    expect(h.exported()).toEqual({ 'schema:maximumAttendeeCapacity': 0, 'schema:isAccessibleForFree': false });
    expect(h.service.getCurrentState().filledFields).toBe(2);
  });

  it('keeps a filled schema field that has no form field, and drops it when it is empty', async () => {
    const geo = { '@type': 'GeoCoordinates', latitude: 50.98, longitude: 11.32 };
    await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'A', 'schema:geo': geo } });
    expect(h.uploaded()['schema:geo']).toEqual(geo);

    await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'A', 'schema:geo': { '@type': 'GeoCoordinates' } } });
    expect(Object.keys(h.uploaded())).toEqual(['cclom:title']);
  });

  it('sends the next run the filled fields only, by the same rule', async () => {
    await h.service.startExtraction('Ein Konzert');
    h.service.updateFieldValue('ccm:price', '   ');

    await h.service.startExtraction('Bitte den Titel kürzen');

    const existing = h.api.generate.calls.mostRecent().args[0].existing_metadata;
    expect(Object.keys(existing).sort()).toEqual(['_origins', '_source_text', 'cclom:title']);
    expect(existing._origins).toEqual({ 'cclom:title': 'ai' });
  });

  it('an export read back gives the same record again', async () => {
    await h.service.startExtraction('Ein Konzert');
    h.service.updateFieldValue('schema:organizer.name', 'VHS');
    h.service.updateFieldValue('schema:maximumAttendeeCapacity', 0);
    const first = JSON.parse(JSON.stringify(h.service.getMetadataForExport()));

    await h.service.importJsonData(first);

    expect({ ...h.service.getMetadataForExport(), exportedAt: null }).toEqual({ ...first, exportedAt: null });
  });
});
