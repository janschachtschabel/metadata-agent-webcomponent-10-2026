/**
 * Object Shape Helpers
 *
 * One place that answers "does the SCHEMA say this field holds objects, and
 * where does a bare string go inside one?".
 *
 * Both questions used to be answered from the VALUE instead of the schema:
 * `CanvasService.applyValueToField` only built an object form when the value it
 * received already was an object, and `FieldValidationService.validateObject`
 * ended in `// Not valid JSON - might be a simple value, accept as-is`. So a
 * field the schema declares as an object rendered as a plain text input, the
 * editor typed a name into it, and the string went to the repository untouched.
 *
 * Elasticsearch maps `ccm:oeh_extendedData` dynamically: the first record that
 * fills a path fixes its type for the whole index. One such string turned
 * `schema:contactPoint` into `text`, after which every correctly structured
 * record was rejected with `mapper_parsing_exception` and never indexed —
 * which in turn stalled the collection sync.
 *
 * These mirror `_is_object_field` and `_object_key` in the backend's
 * FieldNormalizer. The two must stay in step: if they disagree, the same value
 * gets one shape from the widget and another from `/generate`.
 */

/** Does the schema declare this field as holding objects? */
export function declaresObjects(system: any): boolean {
  if (!system) return false;
  const items = system.items || {};
  return (
    system.datatype === 'object' ||
    items.datatype === 'object' ||
    !!items.variants ||
    !!system.variants ||
    !!items.shape
  );
}

/** The variants of an object field, wherever the schema version puts them. */
export function variantsOf(system: any): any[] {
  if (!system) return [];
  return system.items?.variants || system.variants || [];
}

/**
 * The sub-field a bare string belongs in.
 *
 * `name` when a variant declares one — the schema.org convention. Otherwise the
 * first declared sub-field, which for `ContactPoint` is `contactType`, matching
 * how the organization records in the repository already use it.
 */
export function objectKeyFor(system: any): string {
  for (const variant of variantsOf(system)) {
    const names = (variant?.fields || [])
      .map((f: any) => f?.id)
      .filter((id: any) => !!id);
    if (names.includes('name')) return 'name';
    if (names.length) return names[0];
  }
  return 'name';
}

/**
 * Lift a value into the object shape the schema asks for.
 *
 * Repairs instead of discarding: a name typed into the wrong shape is still the
 * right name. Returns null for anything that carries no information, so callers
 * can drop it rather than write an empty object.
 */
export function toObjectShape(value: any, objectKey: string): any | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    // A JSON object typed into a text input should stay what it is.
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        // not JSON after all — fall through and treat it as a plain name
      }
    }
    return { [objectKey]: text };
  }
  // Numbers and booleans carry no field name; leave them for the validator to
  // report rather than inventing a shape for them.
  return null;
}
