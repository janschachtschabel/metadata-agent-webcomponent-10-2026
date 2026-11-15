/**
 * The object form must appear even when there is nothing in the field yet.
 *
 * `expandFieldWithShape` used to return `[]` for anything that was not already
 * an object. With no subfields, `CanvasService.applyValueToField` left
 * `isParent` false, and `field.component.html` renders a plain text input in
 * that case (`*ngIf="!field.isParent"`). So an editor opening a person record
 * saw a one-line text box for `schema:contactPoint`, typed "Virtuelles Haus",
 * and that string went to the repository — where it fixed the Elasticsearch
 * path to `text` and locked every correctly structured record out of the index.
 *
 * The other half is the way back: offering an empty form for every object field
 * must not write `[{}]` into `ccm:oeh_extendedData` for every untouched field.
 */

import { ShapeExpanderService } from './shape-expander.service';
import { CanvasFieldState, FieldStatus } from '../shared/models/canvas.models';

const SCHEMA_STUB: any = {
  getActiveLanguage: () => 'de',
  localizeString: (value: any) => (typeof value === 'string' ? value : value?.de || ''),
  localizeVocabulary: () => [],
};

const CONTACT_POINT_DEF = {
  id: 'schema:contactPoint',
  system: {
    path: 'schema:contactPoint',
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

function field(overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId: 'schema:contactPoint',
    label: 'Kontaktstelle(n)',
    group: 'contact',
    groupLabel: 'Kontakt',
    groupOrder: 1,
    schemaName: 'person',
    aiFillable: true,
    repoField: false,
    status: FieldStatus.EMPTY,
    value: null,
    confidence: 0,
    isRequired: false,
    datatype: 'array',
    itemDatatype: 'object',
    objectKey: 'contactType',
    multiple: true,
    ...overrides,
  } as CanvasFieldState;
}

describe('ShapeExpanderService', () => {
  let service: ShapeExpanderService;

  beforeEach(() => {
    service = new ShapeExpanderService(SCHEMA_STUB);
  });

  it('builds the object form for an empty field instead of leaving a text input', () => {
    const subFields = service.expandFieldWithShape(field(), null, CONTACT_POINT_DEF);
    expect(subFields.length).toBeGreaterThan(0);
    expect(subFields.map(f => f.path)).toContain('contactType');
  });

  it('builds the object form for an empty list, which is what /generate returns', () => {
    const subFields = service.expandFieldWithShape(field({ value: [] }), [], CONTACT_POINT_DEF);
    expect(subFields.length).toBeGreaterThan(0);
  });

  it('lifts the string that broke staging into the form', () => {
    const subFields = service.expandFieldWithShape(
      field(), ['Virtuelles Haus'], CONTACT_POINT_DEF,
    );
    const contactType = subFields.find(f => f.path === 'contactType');
    expect(contactType).toBeDefined();
    expect(contactType!.value).toBe('Virtuelles Haus');
  });

  it('keeps a correctly structured value', () => {
    const subFields = service.expandFieldWithShape(
      field(), [{ contactType: 'Besucherservice', email: 'a@b.de' }], CONTACT_POINT_DEF,
    );
    expect(subFields.find(f => f.path === 'contactType')!.value).toBe('Besucherservice');
    expect(subFields.find(f => f.path === 'email')!.value).toBe('a@b.de');
  });

  it('does not export an untouched form', () => {
    const parent = field({ isParent: true, subFields: service.expandFieldWithShape(field(), null, CONTACT_POINT_DEF) });
    expect(service.reconstructObjectFromSubFields(parent, [parent])).toEqual([]);
  });

  it('exports the form once something is filled in', () => {
    const subFields = service.expandFieldWithShape(field(), null, CONTACT_POINT_DEF);
    subFields.find(f => f.path === 'contactType')!.value = 'Sekretariat';
    const parent = field({ isParent: true, subFields });
    // With the type of the form it was typed into (W-LOG-03); it used to be left out.
    expect(service.reconstructObjectFromSubFields(parent, [parent])).toEqual([
      { '@type': 'ContactPoint', contactType: 'Sekretariat' },
    ]);
  });

  it('stays out of the way for fields the schema does not call objects', () => {
    const plain = { id: 'cclom:general_keyword', system: { datatype: 'array', items: { datatype: 'string' } } };
    const subFields = service.expandFieldWithShape(
      field({ fieldId: 'cclom:general_keyword', itemDatatype: 'string', objectKey: undefined }),
      ['Technik'], plain,
    );
    expect(subFields).toEqual([]);
  });

  // Final audit 18.10. (U-2): a subfield of an older shape definition carried
  // the English "Sub-field of …" as description, shown as its placeholder.
  it('gives subfields of an older shape no English placeholder text', () => {
    const subFields = service.expandFieldWithShape(
      field({ fieldId: 'schema:organizer', label: 'Veranstalter', shape: { name: 'string', url: 'string' } }),
      [{ name: 'Theater' }], { id: 'schema:organizer', system: {} },
    );

    expect(subFields.length).toBe(2);
    expect(subFields.map(f => f.description)).toEqual(['', '']);
  });

  /**
   * Audit 13.11. (W-LOG-03): the object was rebuilt from the subfields of the
   * chosen variant alone. Its discriminator and every key the form has no
   * subfield for were gone after export, upload and in existing_metadata - and
   * without `@type` the next import showed the first variant.
   */
  describe('rebuilding an object from its form (W-LOG-03)', () => {
    const LOCATION_DEF = {
      id: 'schema:location',
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
                  fields: [
                    { id: 'streetAddress', label: { de: 'Straße' }, system: { datatype: 'string' } },
                    { id: 'addressLocality', label: { de: 'Ort' }, system: { datatype: 'string' } },
                  ],
                },
              ],
            },
            { '@type': 'VirtualLocation', fields: [{ id: 'url', label: { de: 'Adresse' }, system: { datatype: 'string' } }] },
            { '@type': 'PostalAddress', fields: [] },
          ],
        },
      },
    };
    const ORGANIZER_DEF = {
      id: 'schema:organizer',
      system: {
        datatype: 'array',
        multiple: true,
        items: {
          datatype: 'object',
          discriminator: '@type',
          variants: [{ '@type': 'Default', fields: [{ id: 'name', label: { de: 'Name' }, system: { datatype: 'string' } }] }],
        },
      },
    };

    function location(value: unknown): CanvasFieldState {
      return field({ fieldId: 'schema:location', label: 'Ort', objectKey: 'name', value });
    }
    /** The field as the canvas holds it after `value` arrived. */
    function expanded(parent: CanvasFieldState, definition: unknown): CanvasFieldState {
      return { ...parent, isParent: true, subFields: service.expandFieldWithShape(parent, parent.value, definition) };
    }
    function rebuilt(parent: CanvasFieldState): unknown {
      return service.reconstructObjectFromSubFields(parent, [parent]);
    }
    function deepFreeze<T>(value: T): T {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    }

    it('keeps the discriminator and the keys the form has no subfield for', () => {
      const origin = [{ '@type': 'ContactPoint', contactType: 'Kasse', email: 'kasse@example.org', hoursAvailable: 'Mo-Fr' }];

      expect(rebuilt(expanded(field({ value: origin }), CONTACT_POINT_DEF))).toEqual(origin);
    });

    it('shows and returns each entry as its own variant', () => {
      const origin = [
        { '@type': 'VirtualLocation', url: 'https://meet.example.org/raum' },
        { '@type': 'Place', name: 'Stadthalle' },
      ];
      const parent = expanded(location(origin), LOCATION_DEF);

      expect(parent.subFields!.filter(f => !f.arrayIndex).map(f => f.path)).toEqual(['url']);
      expect(rebuilt(parent)).toEqual([
        { '@type': 'VirtualLocation', url: 'https://meet.example.org/raum' },
        // Without `address: {}`: an empty container is not exported (audit 14.11., W-41).
        { '@type': 'Place', name: 'Stadthalle' },
      ]);
    });

    it('takes an object without a type as the variant whose subfields it has', () => {
      const parent = expanded(location([{ url: 'https://meet.example.org/raum' }]), LOCATION_DEF);

      expect(parent.subFields!.map(f => f.path)).toEqual(['url']);
      expect(rebuilt(parent)).toEqual([{ '@type': 'VirtualLocation', url: 'https://meet.example.org/raum' }]);
    });

    it('keeps an entry of a variant that has no subfields', () => {
      const origin = [{ '@type': 'PostalAddress', streetAddress: 'Markt 1' }, { '@type': 'Place', name: 'Stadthalle' }];

      expect(rebuilt(expanded(location(origin), LOCATION_DEF))).toEqual(origin);
    });

    it('does not invent a type for a variant that only says "Default"', () => {
      const parent = expanded(field({ fieldId: 'schema:organizer', objectKey: 'name', value: ['Theater'] }), ORGANIZER_DEF);

      expect(rebuilt(parent)).toEqual([{ name: 'Theater' }]);
    });

    it('drops what the editor emptied, also inside a nested object', () => {
      const origin = [{ '@type': 'Place', name: 'Stadthalle', address: { streetAddress: 'Markt 1', addressLocality: 'Weimar', addressCountry: 'DE' } }];
      const parent = expanded(location(origin), LOCATION_DEF);
      parent.subFields!.find(f => f.path === 'name')!.value = null;
      parent.subFields!.find(f => f.path === 'address.streetAddress')!.value = null;

      expect(rebuilt(parent)).toEqual([
        { '@type': 'Place', address: { addressLocality: 'Weimar', addressCountry: 'DE' } },
      ]);
    });

    it('still does not export an untouched form: the type alone is no content', () => {
      expect(rebuilt(expanded(location(null), LOCATION_DEF))).toEqual([]);
      expect(rebuilt(expanded(location([{ '@type': 'Place', address: {} }]), LOCATION_DEF))).toEqual([]);
    });

    // W-SEC-01: the nested objects were the host page's own, filled in place.
    it('leaves the object the host page handed in untouched', () => {
      const origin = deepFreeze([{ '@type': 'Place', name: 'Stadthalle', address: { streetAddress: 'Markt 1' } }]);
      const parent = expanded(location(origin), LOCATION_DEF);
      parent.subFields!.find(f => f.path === 'address.streetAddress')!.value = 'Markt 2';
      parent.subFields!.find(f => f.path === 'address.addressLocality')!.value = 'Weimar';

      expect(rebuilt(parent)).toEqual([
        { '@type': 'Place', name: 'Stadthalle', address: { streetAddress: 'Markt 2', addressLocality: 'Weimar' } },
      ]);
      expect(origin[0].address).toEqual({ streetAddress: 'Markt 1' });
    });
  });
});
