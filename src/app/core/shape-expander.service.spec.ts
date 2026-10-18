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
    expect(service.reconstructObjectFromSubFields(parent, [parent])).toEqual([
      { contactType: 'Sekretariat' },
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
});
