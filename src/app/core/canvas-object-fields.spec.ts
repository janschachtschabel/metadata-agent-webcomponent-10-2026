/**
 * Object fields in the form and in the record (audit 14.11.):
 *
 * - W-30: an object field without variants and without a shape was expanded
 *   into the keys of its own schema definition.
 * - W-32: editing a subfield left status and origin of its object field as
 *   they were, so the next AI run replaced the editor's object.
 * - W-42: an object field absent from the record was a plain input, and
 *   entries of an object list could be neither added nor removed.
 * - W-41: every entry came back with `address: {}` and `geo: {}`.
 *
 * Real CanvasService, SchemaService and ShapeExpanderService.
 */
import { FieldStatus } from '../shared/models/canvas.models';
import { ServiceHarness, answered, buildService, coreSchema } from '../testing/service-harness';

/** `schema:provider` exactly as in the agent's src/schemata/default/v2.0.0/course.json. */
const PROVIDER_OF_COURSE = {
  id: 'schema:provider',
  group: 'provider',
  label: { de: 'Anbieter', en: 'Provider' },
  description: { de: 'Organisation, die den Kurs anbietet', en: 'Organization offering the course' },
  prompt: {
    de: "Anbieter, z.B. 'VHS Hamburg', 'IHK Berlin', 'Goethe-Institut'.",
    en: "Provider, e.g. 'VHS Hamburg', 'IHK Berlin', 'Goethe-Institut'.",
  },
  system: {
    path: 'schema:provider',
    uri: 'schema:provider',
    datatype: 'object',
    multiple: false,
    required: false,
    ask_user: true,
    ai_fillable: true,
    index: { keyword: true },
    normalization: { trim: true },
    repo_field: false,
  },
};

const text = (id: string, label: string) => ({ id, label: { de: label }, system: { datatype: 'string' } });
const LOCATION = {
  id: 'schema:location',
  label: { de: 'Ort' },
  system: {
    datatype: 'array',
    multiple: true,
    items: {
      datatype: 'object',
      discriminator: '@type',
      variants: [
        {
          '@type': 'Place',
          fields: [
            text('name', 'Name'),
            { id: 'address', label: { de: 'Adresse' }, system: { datatype: 'object' }, fields: [text('addressLocality', 'Ort')] },
            { id: 'geo', label: { de: 'Koordinaten' }, system: { datatype: 'object' }, fields: [text('latitude', 'Breite')] },
          ],
        },
        { '@type': 'VirtualLocation', fields: [text('url', 'Adresse')] },
      ],
    },
  },
};
const ORGANIZER = {
  id: 'schema:organizer',
  label: { de: 'Veranstalter' },
  system: {
    datatype: 'array', multiple: true,
    items: { datatype: 'object', variants: [{ '@type': 'Organization', fields: [text('name', 'Name')] }] },
  },
};
const SCHEMAS = {
  'core.json': coreSchema({ 'http://w3id.org/course': 'course.json', 'http://w3id.org/event': 'event.json' }),
  'course.json': { fields: [PROVIDER_OF_COURSE], groups: [] },
  'event.json': { fields: [LOCATION, ORGANIZER], groups: [] },
};

describe('CanvasService: object fields', () => {
  let h: ServiceHarness;

  beforeEach(() => {
    h = buildService(SCHEMAS);
  });

  const paths = (id: string) => h.field(id).subFields!.map(sf => `${sf.arrayIndex || 0}:${sf.path}`);

  describe('an object the schema describes no further (W-30)', () => {
    const VHS = { name: 'VHS Musterstadt', url: 'https://vhs.example' };

    it('gets exactly one subfield, for the key a bare name belongs in', async () => {
      await h.service.importJsonData({ metadataset: 'course.json', metadata: { 'schema:provider': VHS } });

      const provider = h.field('schema:provider');
      expect(provider.subFields!.map(sf => sf.fieldId)).toEqual(['schema:provider.name']);
      expect(provider.subFields![0].value).toBe('VHS Musterstadt');
      expect(provider.subFields![0].label).toBe('Name');
    });

    it('exports what was imported', async () => {
      await h.service.importJsonData({ metadataset: 'course.json', metadata: { 'schema:provider': VHS } });

      expect(h.exported()['schema:provider']).toEqual(VHS);
      expect(h.uploaded()['schema:provider']).toEqual(VHS);
    });

    it('keeps every other key of the object when the name is edited', async () => {
      await h.service.importJsonData({ metadataset: 'course.json', metadata: { 'schema:provider': VHS } });

      h.service.updateFieldValue('schema:provider.name', 'Volkshochschule Musterstadt');

      expect(h.exported()['schema:provider']).toEqual({ name: 'Volkshochschule Musterstadt', url: 'https://vhs.example' });
    });

    it('offers the one input on an empty form and takes a typed name as an object', async () => {
      await h.service.importJsonData({ metadataset: 'course.json', metadata: { 'cclom:title': 'Kurs' } });
      expect(h.field('schema:provider').subFields!.map(sf => sf.path)).toEqual(['name']);
      expect(h.exported()['schema:provider']).toBeUndefined();

      h.service.updateFieldValue('schema:provider.name', 'IHK Berlin');

      expect(h.exported()['schema:provider']).toEqual({ name: 'IHK Berlin' });
    });

    it('lifts a bare name into the object', async () => {
      await h.service.importJsonData({ metadataset: 'course.json', metadata: { 'schema:provider': 'Goethe-Institut' } });

      expect(h.exported()['schema:provider']).toEqual({ name: 'Goethe-Institut' });
    });
  });

  describe('an object field absent from the record (W-42)', () => {
    it('is built with the form of its first variant', async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert' } });

      const location = h.field('schema:location');
      expect(location.isParent).toBeTrue();
      expect(paths('schema:location')).toEqual(['0:name', '0:address', '0:address.addressLocality', '0:geo', '0:geo.latitude']);
      expect(location.status).toBe(FieldStatus.EMPTY);
    });

    it('is not in the record while nobody filled it', async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert' } });

      expect(Object.keys(h.exported())).toEqual(['cclom:title']);
      expect(h.service.getMetadataForExport()['_origins']).toEqual({ 'cclom:title': 'ai' });
    });

    it('takes a value set on the field itself into its form and into the record', async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert' } });

      h.service.updateFieldValue('schema:organizer', [{ name: 'VHS' }]);

      expect(h.field('schema:organizer').subFields!.map(sf => sf.value)).toEqual(['VHS']);
      expect(h.exported()['schema:organizer']).toEqual([{ '@type': 'Organization', name: 'VHS' }]);
      expect(h.service.getMetadataForExport()['_origins']['schema:organizer']).toBe('user');
    });

    it('offers the object form after a type choice and before an extraction as well', async () => {
      await h.service.importJsonData({ 'cclom:title': 'Konzert' });

      await h.service.selectContentType('event.json');

      expect(h.field('schema:organizer').subFields!.map(sf => sf.path)).toEqual(['name']);
    });
  });

  describe('editing a subfield (W-32)', () => {
    beforeEach(async () => {
      h.api.generate.and.resolveTo(answered('event.json',
        { 'cclom:title': 'Konzert', 'schema:location': [{ '@type': 'Place', name: 'KI-Ort' }] },
        { _origins: { 'cclom:title': 'ai', 'schema:location': 'ai' }, _source_text: 'Quelle' }));
      await h.service.startExtraction('Quelle');
    });

    it('makes the object the editor\'s', () => {
      h.service.updateFieldValue('schema:location.name', 'Rathaus');

      const location = h.field('schema:location');
      expect(location.isAiGenerated).toBeFalse();
      expect(location.status).toBe(FieldStatus.FILLED);
      expect(h.service.getMetadataForExport()['_origins']['schema:location']).toBe('user');
    });

    it('fills an object field that was empty', () => {
      expect(h.field('schema:organizer').status).toBe(FieldStatus.EMPTY);

      h.service.updateFieldValue('schema:organizer.name', 'VHS');

      expect(h.field('schema:organizer').status).toBe(FieldStatus.FILLED);
      expect(h.service.getCurrentState().filledFields).toBe(3);
      expect(h.exported()['schema:organizer']).toEqual([{ '@type': 'Organization', name: 'VHS' }]);
    });

    it('tells the next run that the object is the editor\'s', async () => {
      h.service.updateFieldValue('schema:location.name', 'Rathaus');
      h.service.updateFieldValue('schema:organizer.name', 'VHS');

      await h.service.startExtraction('Bitte den Titel kürzen');

      const existing = h.api.generate.calls.mostRecent().args[0].existing_metadata;
      expect(existing._origins['schema:location']).toBe('user');
      expect(existing._origins['schema:organizer']).toBe('user');
      expect(existing._origins['cclom:title']).toBe('ai');
      expect(existing['schema:location']).toEqual([{ '@type': 'Place', name: 'Rathaus' }]);
      expect(existing['schema:organizer']).toEqual([{ '@type': 'Organization', name: 'VHS' }]);
    });

    it('empties the object field when its last subfield is emptied', () => {
      h.service.updateFieldValue('schema:location.name', null);

      expect(h.field('schema:location').status).toBe(FieldStatus.EMPTY);
      expect(h.exported()['schema:location']).withContext('emptied by the editor').toBeNull();
    });

    it('restores the origin of each subfield from an export', async () => {
      h.service.updateFieldValue('schema:location.address.addressLocality', 'Weimar');
      const exported = JSON.parse(JSON.stringify(h.service.getMetadataForExport()));
      expect(exported._origins['schema:location.address.addressLocality']).toBe('user');
      expect(exported._origins['schema:location.name']).toBe('ai');

      await h.service.importJsonData(exported);

      const origin = Object.fromEntries(h.field('schema:location').subFields!.map(sf => [sf.path, sf.isAiGenerated]));
      expect(origin['name']).withContext('from the AI').toBeTrue();
      expect(origin['address.addressLocality']).withContext('typed by the editor').toBeFalse();
      expect(h.field('schema:location').isAiGenerated).toBeFalse();
      expect(h.service.getMetadataForExport()['_origins']).toEqual(exported._origins);
    });
  });

  describe('empty containers (W-41)', () => {
    it('are not added to an entry: no address and no geo without a value in them', async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert' } });

      h.service.updateFieldValue('schema:location.name', 'Rathaus');

      expect(h.exported()['schema:location']).toEqual([{ '@type': 'Place', name: 'Rathaus' }]);
    });

    it('appear with the first value in them and go with the last', async () => {
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'schema:location': [{ '@type': 'Place', name: 'Rathaus' }] } });

      h.service.updateFieldValue('schema:location.address.addressLocality', 'Weimar');
      expect(h.exported()['schema:location']).toEqual([{ '@type': 'Place', name: 'Rathaus', address: { addressLocality: 'Weimar' } }]);

      h.service.updateFieldValue('schema:location.address.addressLocality', null);
      expect(h.exported()['schema:location']).toEqual([{ '@type': 'Place', name: 'Rathaus' }]);
    });

    it('keep what the form does not show: the type and foreign keys of a nested object (W-LOG-03)', async () => {
      const hall = {
        '@type': 'Place', name: 'Halle', sameAs: 'https://example.org/halle',
        address: { '@type': 'PostalAddress', addressLocality: 'Weimar', postalCode: '99423' },
      };
      await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'schema:location': [hall] } });

      h.service.updateFieldValue('schema:location.name', 'Große Halle');

      expect(h.exported()['schema:location']).toEqual([{ ...hall, name: 'Große Halle' }]);
    });

    it('do not count as a value: [{}] leaves the field empty', async () => {
      await h.service.importJsonData({
        metadataset: 'event.json',
        metadata: { 'cclom:title': 'Konzert', 'schema:location': [{}], 'schema:organizer': [{ '@type': 'Organization' }] },
      });

      expect(h.field('schema:location').status).toBe(FieldStatus.EMPTY);
      expect(h.field('schema:organizer').status).toBe(FieldStatus.EMPTY);
      expect(h.service.getCurrentState().filledFields).toBe(1);
      expect(Object.keys(h.exported())).toEqual(['cclom:title']);
    });
  });

  describe('entries of an object list (W-42)', () => {
    const TWO = [{ '@type': 'Place', name: 'Foyer' }, { '@type': 'VirtualLocation', url: 'https://meet.example.org' }];

    beforeEach(async () => {
      await h.service.importJsonData({
        metadataset: 'event.json',
        metadata: { 'schema:location': TWO },
        _origins: { 'schema:location': 'ai' },
      });
    });

    it('addObjectEntry appends an empty entry form and leaves the record alone', () => {
      h.service.addObjectEntry('schema:location');

      expect(paths('schema:location').filter(path => path.startsWith('2:'))).toEqual(
        ['2:name', '2:address', '2:address.addressLocality', '2:geo', '2:geo.latitude']);
      expect(h.exported()['schema:location']).toEqual(TWO);
      expect(h.field('schema:location').isAiGenerated).withContext('no edit yet').toBeTrue();
    });

    it('a filled new entry joins the record, and the object is the editor\'s', () => {
      h.service.addObjectEntry('schema:location');

      h.service.updateFieldValue('schema:location[2].name', 'Garten');

      expect(h.exported()['schema:location']).toEqual([...TWO, { '@type': 'Place', name: 'Garten' }]);
      expect(h.field('schema:location').isAiGenerated).toBeFalse();
    });

    it('removeObjectEntry removes the entry and moves the later ones up', () => {
      h.service.removeObjectEntry('schema:location', 0);

      expect(paths('schema:location')).toEqual(['0:url']);
      expect(h.field('schema:location').subFields![0].fieldId).toBe('schema:location.url');
      expect(h.exported()['schema:location']).toEqual([TWO[1]]);
      expect(h.field('schema:location').isAiGenerated).toBeFalse();
      expect(h.service.getMetadataForExport()['_origins']['schema:location']).toBe('user');
    });

    it('keeps the origin of the subfields that moved up', () => {
      h.service.updateFieldValue('schema:location[1].url', 'https://meet.example.org/neu');

      h.service.removeObjectEntry('schema:location', 0);

      expect(h.field('schema:location').subFields![0].isAiGenerated).toBeFalse();
      expect(h.exported()['schema:location']).toEqual([{ '@type': 'VirtualLocation', url: 'https://meet.example.org/neu' }]);
    });

    it('removing the last entry leaves the empty form, and the record says null', () => {
      h.service.removeObjectEntry('schema:location', 1);
      h.service.removeObjectEntry('schema:location', 0);

      expect(h.field('schema:location').status).toBe(FieldStatus.EMPTY);
      expect(paths('schema:location')[0]).toBe('0:name');
      expect(h.exported()['schema:location']).toBeNull();
    });

    it('removing an entry form nobody filled is no edit', () => {
      h.service.addObjectEntry('schema:location');

      h.service.removeObjectEntry('schema:location', 2);

      expect(paths('schema:location').some(path => path.startsWith('2:'))).toBeFalse();
      expect(h.exported()['schema:location']).toEqual(TWO);
      expect(h.field('schema:location').isAiGenerated).toBeTrue();
    });

    it('ignores an index the field does not have, a field without entries and a single object', async () => {
      const before = h.service.getCurrentState();

      h.service.removeObjectEntry('schema:location', 7);
      h.service.addObjectEntry('cclom:title');
      h.service.removeObjectEntry('ccm:unbekannt', 0);

      expect(h.service.getCurrentState()).toBe(before);
    });

    it('keeps a removed entry out of the answer of a run that was out', async () => {
      let answer!: (value: unknown) => void;
      h.api.generate.and.returnValue(new Promise(resolve => (answer = resolve)));
      const run = h.service.startExtraction('Bitte ergänzen');
      await new Promise(resolve => setTimeout(resolve)); // the request is out

      h.service.removeObjectEntry('schema:location', 0);
      answer(answered('event.json', { 'schema:location': TWO }, { _origins: { 'schema:location': 'ai' } }));
      await run;

      expect(h.exported()['schema:location']).toEqual([TWO[1]]);
    });
  });
});
