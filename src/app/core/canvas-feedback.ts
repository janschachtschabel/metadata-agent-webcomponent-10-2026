/** What the canvas tells the editor about agent calls: failure text, usability check, warnings. */
import { GenerateResponse } from './api.service';
import { I18nService } from './i18n.service';
import type { SchemaService } from './schema.service';

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
  return withRequestId(causeOf(error, i18n), error?.error, i18n);
}

function causeOf(error: any, i18n: I18nService): string {
  // The body of a 200 that could not be parsed is the parser's complaint.
  const body = isHttpFailure(error) && error.status < 300 ? null : error?.error;
  return (
    wordedByAgent(body) ||
    unanswered(error, i18n) ||
    // Never the message of an HTTP failure: Angular's names the address of
    // the request (audit 14.11., W-40).
    (isHttpFailure(error) ? '' : error?.message) ||
    translated(i18n, 'ALERTS.UNKNOWN_ERROR', undefined, 'Unknown error')
  );
}

/** The agent's own words for a failure; '' for a proxy's page or a 422 that lists fields. */
function wordedByAgent(body: any): string {
  const message = body?.error?.message;
  if (typeof message === 'string' && message) return message;
  return typeof body?.detail === 'string' ? body.detail : '';
}

/** A failed request, as HttpClient reports it (a status; 200 for a body that is no JSON). */
function isHttpFailure(error: any): boolean {
  return typeof error?.status === 'number';
}

/**
 * A failure the agent did not word: no connection, a proxy's page for a 4xx
 * or 5xx, the edu-sharing page instead of JSON, no answer in time. Angular's
 * own message for these names the full address of the request - through
 * edu-sharing the internal proxy path - and nothing the editor can act on
 * (W-LOG-10; every status since the audit of 14.11., W-40).
 * With English fallbacks - the translations come from the agent, too.
 */
function unanswered(error: any, i18n: I18nService): string {
  // The widget's own limit (ApiService, W-50): rxjs reports it by name.
  if (error?.name === 'TimeoutError') {
    return translated(i18n, 'ALERTS.REQUEST_TIMEOUT', undefined,
      'The metadata agent did not answer in time. Please try again.');
  }
  if (!isHttpFailure(error)) return '';
  const status: number = error.status;
  if (status === 0) {
    return translated(i18n, 'ALERTS.NETWORK_UNREACHABLE', undefined,
      'The metadata agent cannot be reached. Please check the network connection and try again.');
  }
  if (status >= 200 && status < 300) {
    return translated(i18n, 'ALERTS.ANSWER_UNREADABLE', undefined,
      'The answer is not a result of the metadata agent. Please check the address of the agent (api-url).');
  }
  if (status === 401 || status === 403) {
    return translated(i18n, 'ALERTS.ACCESS_DENIED', { status },
      `The request was refused (HTTP ${status}): not signed in, or not permitted to use the metadata agent.`);
  }
  if (status === 404) {
    return translated(i18n, 'ALERTS.AGENT_NOT_FOUND', { status },
      `The metadata agent was not found at its address (HTTP ${status}). Please check the address of the agent (api-url).`);
  }
  if (status === 413) {
    return translated(i18n, 'ALERTS.REQUEST_TOO_LARGE', { status },
      `The input is too large for the metadata agent (HTTP ${status}). Please shorten the text.`);
  }
  if (status === 422) {
    return translated(i18n, 'ALERTS.REQUEST_INVALID', { status },
      `The metadata agent refused the request as invalid (HTTP ${status}).`);
  }
  if (status === 429) {
    return translated(i18n, 'ALERTS.TOO_MANY_REQUESTS', { status },
      `Too many requests at the moment (HTTP ${status}). Please wait a moment and try again.`);
  }
  if (status === 504 || status === 408) {
    return translated(i18n, 'ALERTS.SERVICE_TIMEOUT', { status },
      `The request took too long and was cut off on its way to the metadata agent (HTTP ${status}). Please try again.`);
  }
  if (status >= 500) {
    return translated(i18n, 'ALERTS.SERVICE_UNAVAILABLE', { status },
      `The metadata agent does not answer at the moment (HTTP ${status}). Please try again later.`);
  }
  return translated(i18n, 'ALERTS.REQUEST_FAILED', { status },
    `The request to the metadata agent failed (HTTP ${status}).`);
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
 * A failed upload. The editor needs to know whether a node that was being
 * written is gone or still in the repository: after a timeout (UPLOAD_TIMEOUT)
 * and after a failed write (422/502) that names one (`discarded_node`, `node`).
 */
export function uploadFailure(error: any, i18n: I18nService): string {
  const body = error?.error;
  const cause = body?.error?.code === 'UPLOAD_TIMEOUT'
    ? i18n.instant('ALERTS.UPLOAD_TIMEOUT')
    : error?.name === 'TimeoutError'
      // The widget stopped waiting (W-50); what the agent did meanwhile is unknown.
      ? translated(i18n, 'ALERTS.UPLOAD_NO_ANSWER', undefined,
        'The upload did not answer in time. Whether the node was created is unknown – please check the repository before uploading again.')
      : causeOf(error, i18n);
  const notes = [cause];
  if (body?.discarded_node) {
    notes.push(i18n.instant('ALERTS.UPLOAD_TIMEOUT_DISCARDED'));
  } else if (body?.node?.nodeId) {
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
 * Say so when a result is usable but incomplete or uncertain: failed fields,
 * a content type that only the keyword fallback picked, or a warning of the
 * agent (`processing.warnings`). Never silent - a guessed type used to look
 * exactly like a detected one.
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
  // What the agent itself warns about (text cut short, places without
  // coordinates), in its words; as sentences, since the notes are joined.
  for (const warning of processing?.warnings ?? []) {
    const text = typeof warning === 'string' ? warning.trim() : '';
    if (text) notes.push(/[.!?…]$/.test(text) ? text : `${text}.`);
  }
  return notes.length ? notes.join(' ') : null;
}
