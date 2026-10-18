let counter = 0;

/**
 * An id unique in the document, for aria-controls and friends. Two widget
 * instances on one page must not share ids, so they cannot come from the data.
 */
export function uniqueId(prefix: string): string {
  return `${prefix}-${++counter}`;
}
