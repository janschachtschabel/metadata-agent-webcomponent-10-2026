/**
 * Audit 13.11. (W-LOG-03): schema:location of event.json has the variants
 * Place and VirtualLocation. An online location was exported without its
 * `@type`; saved and opened again, it came up as the first variant - a Place
 * form without the URL.
 *
 * Real CanvasService and SchemaService; only the HTTP answers are faked.
 */
import { CanvasService } from './canvas.service';
import { SchemaService } from './schema.service';
import { ShapeExpanderService } from './shape-expander.service';

const CORE = {
  fields: [
    { id: 'cclom:title', label: { de: 'Titel' }, system: { datatype: 'string', multiple: false } },
    {
      id: 'ccm:oeh_extendedType',
      label: { de: 'Inhaltstyp' },
      system: {
        datatype: 'uri',
        ask_user: false,
        vocabulary: { type: 'closed', concepts: [{ uri: 'http://w3id.org/event', label: { de: 'Veranstaltung' }, schema_file: 'event.json' }] },
      },
    },
  ],
  groups: [],
};
const EVENT = {
  fields: [{
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
              { id: 'name', label: { de: 'Name' }, system: { datatype: 'string' } },
              {
                id: 'address', label: { de: 'Adresse' }, system: { datatype: 'object' },
                fields: [{ id: 'addressLocality', label: { de: 'Ort' }, system: { datatype: 'string' } }],
              },
            ],
          },
          { '@type': 'VirtualLocation', fields: [{ id: 'url', label: { de: 'Adresse' }, system: { datatype: 'string' } }] },
        ],
      },
    },
  }],
  groups: [],
};

describe('CanvasService: an object field through export and import (W-LOG-03)', () => {
  let service: CanvasService;
  let generate: jasmine.Spy;
  const i18n = { currentLang: 'de', instant: (key: string) => key };
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} };

  beforeEach(() => {
    generate = jasmine.createSpy('generate').and.resolveTo({ processing: { success: true, status: 'success' }, metadata: {} });
    const api = {
      getSchema: (_c: string, _v: string, file: string) => Promise.resolve(file === 'core.json' ? CORE : EVENT),
      generate,
    };
    const schema = new SchemaService(quiet as any, i18n as any, api as any);
    service = new CanvasService(schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema), { run: (fn: () => unknown) => fn() } as any);
  });

  const ONLINE = { '@type': 'VirtualLocation', url: 'https://meet.example.org/raum', name: 'Videoraum' };

  function subfieldPaths(): (string | undefined)[] {
    const location = service.getCurrentState().specialFields.find(f => f.fieldId === 'schema:location')!;
    return location.subFields!.map(f => f.path);
  }
  function record(title = 'Online-Vortrag'): Record<string, unknown> {
    return { metadataset: 'event.json', metadata: { 'cclom:title': title, 'schema:location': [ONLINE] } };
  }

  it('exports the object with its type and the keys the form does not show', async () => {
    await service.importJsonData(record());

    expect(service.getMetadataForExport()['metadata']['schema:location']).toEqual([ONLINE]);
    expect(service.getMetadataForRepository()['metadata']['schema:location']).toEqual([ONLINE]);
  });

  it('import, export, import: the same variant again', async () => {
    await service.importJsonData(record());
    expect(subfieldPaths()).toEqual(['url']);

    const exported = service.getMetadataForExport();
    await service.importJsonData(exported);

    expect(subfieldPaths()).withContext('VirtualLocation, not the first variant').toEqual(['url']);
    expect(service.getMetadataForExport()['metadata']['schema:location']).toEqual([ONLINE]);
  });

  it('keeps the variant after the editor changed a subfield', async () => {
    await service.importJsonData(record());

    service.updateFieldValue('schema:location.url', 'https://meet.example.org/neu');
    await service.importJsonData(service.getMetadataForExport());

    expect(subfieldPaths()).toEqual(['url']);
    expect(service.getMetadataForExport()['metadata']['schema:location'])
      .toEqual([{ ...ONLINE, url: 'https://meet.example.org/neu' }]);
  });

  it('sends the type along as existing metadata of the next extraction', async () => {
    await service.importJsonData(record());

    await service.startExtraction('Bitte den Titel kürzen');

    expect(generate.calls.mostRecent().args[0].existing_metadata['schema:location']).toEqual([ONLINE]);
  });

  // The form keeps counting the entries as they came in; the value is the
  // list without the emptied ones. Reading the base of an entry from the
  // value by position would hand the second entry's keys to the first.
  it('keeps the entries apart after the editor emptied the first of two', async () => {
    // The imported entries carry `address: {}` as records written before the
    // audit of 14.11. do; an empty container is not exported any more (W-41).
    const hall = { '@type': 'Place', name: 'Halle', sameAs: 'https://example.org/halle' };
    await service.importJsonData({
      metadataset: 'event.json',
      metadata: { 'schema:location': [{ '@type': 'Place', name: 'Foyer', address: {} }, { ...hall, address: {} }] },
    });

    service.updateFieldValue('schema:location.name', null);
    expect(service.getMetadataForExport()['metadata']['schema:location']).toEqual([hall]);

    service.updateFieldValue('schema:location[1].name', 'Große Halle');
    expect(service.getMetadataForExport()['metadata']['schema:location']).toEqual([{ ...hall, name: 'Große Halle' }]);
  });

  it('removes the value of a subfield the editor emptied', async () => {
    await service.importJsonData(record());

    service.updateFieldValue('schema:location.url', null);

    expect(service.getMetadataForExport()['metadata']['schema:location']).toEqual([{ '@type': 'VirtualLocation', name: 'Videoraum' }]);
  });
});
