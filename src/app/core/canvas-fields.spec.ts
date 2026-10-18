import { CanvasFieldState, FieldStatus } from '../shared/models/canvas.models';
import { getCountableFields, groupFields, isValueFilled } from './canvas-fields';

function field(partial: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'x',
    schemaName: 'Core',
    group: 'g',
    groupLabel: 'G',
    groupOrder: 1,
    status: FieldStatus.EMPTY,
    value: null,
    ...partial,
  } as CanvasFieldState;
}

describe('canvas-fields', () => {
  it('counts a value as filled only when it carries content', () => {
    expect(isValueFilled(null)).toBeFalse();
    expect(isValueFilled(undefined)).toBeFalse();
    expect(isValueFilled('   ')).toBeFalse();
    expect(isValueFilled([])).toBeFalse();
    expect(isValueFilled({})).toBeFalse();
    expect(isValueFilled('Konzert')).toBeTrue();
    expect(isValueFilled(['a'])).toBeTrue();
    expect(isValueFilled({ name: 'x' })).toBeTrue();
    expect(isValueFilled(0)).toBeTrue();
    expect(isValueFilled(false)).toBeTrue();
  });

  it('leaves the content type selector out of the countable fields', () => {
    const fields = [field({ fieldId: 'cclom:title' }), field({ fieldId: 'ccm:oeh_extendedType' })];

    expect(getCountableFields(fields).map(f => f.fieldId)).toEqual(['cclom:title']);
  });

  it('carries the collapsed state of a group over to the rebuilt group (U-09)', () => {
    const fields = [
      field({ fieldId: 'a', group: 'basics' }),
      field({ fieldId: 'b', group: 'more' }),
    ];
    const previous = groupFields(fields);
    previous[0].collapsed = true;

    const rebuilt = groupFields(fields, previous);

    expect(rebuilt.map(g => !!g.collapsed)).toEqual([true, false]);
  });

  it('groups core fields first, then the others by group order', () => {
    const fields = [
      field({ fieldId: 'late', schemaName: 'Event', group: 'when', groupLabel: 'Wann', groupOrder: 5 }),
      field({ fieldId: 'early', schemaName: 'Event', group: 'where', groupLabel: 'Wo', groupOrder: 2 }),
      field({ fieldId: 'title', schemaName: 'Core', group: 'basic', groupLabel: 'Basis', groupOrder: 9 }),
      field({ fieldId: 'late2', schemaName: 'Event', group: 'when', groupLabel: 'Wann', groupOrder: 5 }),
    ];

    const groups = groupFields(fields);

    expect(groups.map(g => g.id)).toEqual(['Core-basic', 'Event-where', 'Event-when']);
    expect(groups[0].isCore).toBeTrue();
    expect(groups[2].fields.map(f => f.fieldId)).toEqual(['late', 'late2']);
  });
});
