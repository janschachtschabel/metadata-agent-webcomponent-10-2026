/** What the canvas tells the editor about agent calls: failure text, usability check, warnings. */
import { GenerateResponse } from './api.service';
import { I18nService } from './i18n.service';
import { SchemaService } from './schema.service';

/**
 * The cause of a failed generation call, as the agent words it.
 *
 * The agent answers failures with `detail` (readable) and `error.message`
 * (the same cause without the "…fehlgeschlagen:" prefix), so the prefix
 * here does not repeat itself.
 */
export function describeFailure(error: any, i18n: I18nService): string {
  return `${i18n.instant('EXTRACTION_RESULT.FAILED')}: ${failureCause(error, i18n)}`;
}

/**
 * The cause of a failed call to the agent, with the request id it was logged
 * under. A 422 has a list as `detail`; it is never shown as such
 * ("[object Object]"), `error.message` names the problem.
 */
export function failureCause(error: any, i18n: I18nService): string {
  const body = error?.error;
  const cause =
    body?.error?.message ||
    (typeof body?.detail === 'string' ? body.detail : '') ||
    error?.message ||
    translated(i18n, 'ALERTS.UNKNOWN_ERROR', undefined, 'Unknown error');
  return withRequestId(cause, body, i18n);
}

/**
 * A translation, or `fallback` while there is none: the texts come from the
 * agent, so they are missing exactly when it cannot be reached - and a raw key
 * would drop the cause the editor needs.
 */
export function translated(
  i18n: I18nService,
  key: string,
  params: Record<string, unknown> | undefined,
  fallback: string
): string {
  const text = i18n.instant(key, params);
  return text && text !== key ? text : fallback;
}

/**
 * A failed upload. After a timeout (UPLOAD_TIMEOUT) the editor needs to know
 * whether the node that was being written is gone or still in the repository.
 */
export function uploadFailure(error: any, i18n: I18nService): string {
  const body = error?.error;
  if (body?.error?.code !== 'UPLOAD_TIMEOUT') return failureCause(error, i18n);
  const notes = [i18n.instant('ALERTS.UPLOAD_TIMEOUT')];
  if (body.discarded_node) {
    notes.push(i18n.instant('ALERTS.UPLOAD_TIMEOUT_DISCARDED'));
  } else if (body.node?.nodeId) {
    notes.push(i18n.instant('ALERTS.UPLOAD_TIMEOUT_NODE_KEPT', { nodeId: body.node.nodeId }));
  }
  return withRequestId(notes.join(' '), body, i18n);
}

// The agent logs the technical cause under this id - only for failures with
// an error code, so the X-Request-ID header is deliberately not used.
function withRequestId(text: string, body: any, i18n: I18nService): string {
  const requestId = body?.error?.request_id;
  return requestId ? `${text} (${i18n.instant('EXTRACTION_RESULT.REQUEST_ID', { id: requestId })})` : text;
}

/**
 * A 200 is no proof of a result: a proxy in between or an older agent can
 * answer without one. Such an answer fails like an HTTP error instead of
 * being applied over the form.
 */
export function assertUsable(response: GenerateResponse, i18n: I18nService): void {
  const processing = response?.processing;
  if (!processing) {
    throw new Error(i18n.instant('EXTRACTION_RESULT.INCOMPLETE_RESPONSE'));
  }
  if (processing.status === 'failed' || processing.success === false) {
    throw new Error(
      processing.error?.message ||
        processing.errors?.[0] ||
        i18n.instant('EXTRACTION_RESULT.INCOMPLETE_RESPONSE')
    );
  }
}

/**
 * Say so when a result is usable but incomplete or uncertain: failed fields
 * or a content type that only the keyword fallback picked. Never silent -
 * a guessed type used to look exactly like a detected one.
 */
export function generationWarning(
  response: GenerateResponse,
  i18n: I18nService,
  schema: SchemaService
): string | null {
  const processing = response.processing;
  const notes: string[] = [];
  if (processing?.status === 'partial') {
    notes.push(
      i18n.instant('EXTRACTION_RESULT.PARTIAL', {
        extracted: processing.fields_extracted,
        total: processing.fields_total,
        failed: processing.fields_failed ?? 0,
      }) + (processing.error?.message ? ` ${processing.error.message}` : '')
    );
  }
  if (processing?.content_type_detection?.method === 'keywords') {
    const concept = schema
      .getContentTypeConcepts()
      .find(c => c.schema_file === response.metadataset);
    notes.push(
      i18n.instant('EXTRACTION_RESULT.CONTENT_TYPE_UNCERTAIN', {
        type: concept?.label || response.metadataset,
      })
    );
  }
  return notes.length ? notes.join(' ') : null;
}
