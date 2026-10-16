/**
 * The rules that keep a bare string out of an object field.
 *
 * These pin down the exact values that broke the staging index in August 2026:
 * `schema:contactPoint: ["Virtuelles Haus"]` on a person record and
 * `schema:organizer: ["TEEKAYART"]` on an event, both typed by hand
 * (`_origins: user`). Elasticsearch maps `ccm:oeh_extendedData` dynamically, so
 * the first record that fills a path decides its type for the whole index — one
 * such string fixed the path to `text` and locked every correctly structured
 * record out.
 *
 * They mirror `tests/test_object_fields_normalized.py` in the backend. If the
 * two ever disagree on the object key, the same value gets one shape from the
 * widget and another from `/generate`, which is the same failure again.
 *
 * NOTE: the project has no test runner configured — `package.json` declares
 * `ng test`, but `angular.json` has no `test` target and neither karma nor
 * jasmine is a dependency. This file is written for the runner the project
 * should have; until then the logic is verified by executing the compiled
 * helpers directly.
 */

import { declaresObjects, objectKeyFor, toObjectShape, variantsOf } from './object-shape';

const CONTACT_POINT = {
  datatype: 'array',
  multiple: true,
  items: {
    datatype: 'object',
    discriminator: '@type',
    variants: [{
      '@type': 'ContactPoint',
      fields: [
        { id: 'contactType' }, { id: 'email' }, { id: 'telephone' }, { id: 'availableLanguage' },
      ],
    }],
  },
};

const ORGANIZER = {
  datatype: 'array',
  multiple: true,
  items: {
    datatype: 'object',
    variants: [{ '@type': 'Default', fields: [{ id: 'name' }, { id: 'url' }] }],
  },
};

/** The spelling used before the schemas were unified; still served by older APIs. */
const LEGACY_CONTACT_POINT = {
  datatype: 'object',
  multiple: true,
  discriminator: '@type',
  variants: [{ '@type': 'ContactPoint', fields: [{ id: 'contactType' }, { id: 'email' }] }],
};

describe('declaresObjects', () => {
  it('recognises the unified style', () => {
    expect(declaresObjects(CONTACT_POINT)).toBe(true);
  });

  it('recognises the legacy style, which older schema releases still use', () => {
    expect(declaresObjects(LEGACY_CONTACT_POINT)).toBe(true);
  });

  it('does not claim a plain string list holds objects', () => {
    expect(declaresObjects({ datatype: 'array', items: { datatype: 'string' } })).toBe(false);
    expect(declaresObjects({ datatype: 'string', multiple: true })).toBe(false);
    expect(declaresObjects(undefined)).toBe(false);
  });
});

describe('objectKeyFor', () => {
  it('prefers name when the variant declares one', () => {
    expect(objectKeyFor(ORGANIZER)).toBe('name');
  });

  it('falls back to the first sub-field — contactType for ContactPoint', () => {
    expect(objectKeyFor(CONTACT_POINT)).toBe('contactType');
  });

  it('finds the variants in the legacy position too', () => {
    expect(variantsOf(LEGACY_CONTACT_POINT).length).toBe(1);
    expect(objectKeyFor(LEGACY_CONTACT_POINT)).toBe('contactType');
  });
});

describe('toObjectShape', () => {
  it('lifts the value that actually broke staging', () => {
    expect(toObjectShape('Virtuelles Haus', 'contactType')).toEqual({ contactType: 'Virtuelles Haus' });
    expect(toObjectShape('TEEKAYART', 'name')).toEqual({ name: 'TEEKAYART' });
  });

  it('leaves a correct object alone', () => {
    const correct = { contactType: 'Besucherservice', email: 'spectrum@technikmuseum.berlin' };
    expect(toObjectShape(correct, 'contactType')).toBe(correct);
  });

  it('keeps JSON that was typed into a text input', () => {
    expect(toObjectShape('{"name": "Getippt"}', 'name')).toEqual({ name: 'Getippt' });
  });

  it('treats a brace that is not JSON as a plain name', () => {
    expect(toObjectShape('{kein json', 'name')).toEqual({ name: '{kein json' });
  });

  it('returns null for anything carrying no information', () => {
    expect(toObjectShape('', 'name')).toBeNull();
    expect(toObjectShape('   ', 'name')).toBeNull();
    expect(toObjectShape(null, 'name')).toBeNull();
    expect(toObjectShape(undefined, 'name')).toBeNull();
  });

  it('does not invent a field name for a number', () => {
    expect(toObjectShape(42, 'name')).toBeNull();
  });
});
