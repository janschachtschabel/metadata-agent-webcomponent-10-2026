/** Field-list helpers of the canvas: what counts, what is filled, how fields group. */
import { CanvasFieldState, FieldGroup } from '../shared/models/canvas.models';

export function isValueFilled(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Whether a field would hold the same value: both empty, or equal as JSON. */
export function sameValue(a: any, b: any): boolean {
  if (!isValueFilled(a) && !isValueFilled(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Get countable fields: all top-level fields that represent user-visible metadata.
 * Each parent with subfields counts as 1 field (not expanded).
 * Excludes internal fields like ccm:oeh_extendedType (content type selector).
 */
export function getCountableFields(fields: CanvasFieldState[]): CanvasFieldState[] {
  return fields.filter(f => f.fieldId !== 'ccm:oeh_extendedType');
}

/**
 * Build the groups of `fields`. `previous` are the groups currently shown: the
 * layouts' group headers set `collapsed` on them, and every value change or
 * extraction rebuilds the groups — without carrying it over, all groups
 * reopened (audit U-09). Matched by group id.
 */
export function groupFields(fields: CanvasFieldState[], previous: FieldGroup[] = []): FieldGroup[] {
  const groupsMap = new Map<string, FieldGroup>();
  const collapsed = new Set(previous.filter(g => g.collapsed).map(g => g.id));

  for (const field of fields) {
    const key = `${field.schemaName}-${field.group}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        id: key,
        label: field.groupLabel,
        icon: field.groupIcon || '',
        schemaName: field.schemaName,
        fields: [],
        isCore: field.schemaName === 'Core',
        ...(collapsed.has(key) ? { collapsed: true } : {})
      });
    }
    groupsMap.get(key)!.fields.push(field);
  }

  return Array.from(groupsMap.values())
    .sort((a, b) => {
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      const orderA = a.fields[0]?.groupOrder ?? 999;
      const orderB = b.fields[0]?.groupOrder ?? 999;
      return orderA - orderB;
    });
}
