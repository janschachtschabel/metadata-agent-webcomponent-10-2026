/**
 * Typed values a field has not handed to the form yet: while its autocomplete
 * panel is open, a field waits before it takes the text (FieldComponent.onBlur).
 * Whatever reads the form at once - submit, upload, download - takes them in
 * first (audit 13.11., W-LOG-01).
 *
 * Page-wide on purpose: elements with the same instance-id share one form, and
 * an entry lives for 200 ms at most.
 */
const pending = new Set<() => void>();

/** Registers a field's commit; the returned function withdraws it. */
export function holdInput(commit: () => void): () => void {
  pending.add(commit);
  return () => pending.delete(commit);
}

export function commitPendingInputs(): void {
  for (const commit of [...pending]) commit();
}
