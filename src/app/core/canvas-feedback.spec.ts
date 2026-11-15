import { assertUsable, describeFailure, generationWarning, uploadFailure } from './canvas-feedback';

const i18n = {
  instant: (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key),
} as any;
const schema = {
  getContentTypeConcepts: () => [{ label: 'Veranstaltung', schema_file: 'event.json' }],
} as any;

describe('canvas-feedback', () => {
  describe('describeFailure', () => {
    it("uses the agent's error message and names the request id", () => {
      const error = { error: { detail: 'lang', error: { message: 'Key abgelehnt', request_id: 'abc123' } } };

      expect(describeFailure(error, i18n)).toBe(
        'EXTRACTION_RESULT.FAILED: Key abgelehnt (EXTRACTION_RESULT.REQUEST_ID {"id":"abc123"})'
      );
    });

    it('falls back to detail, then to the error message, without a request id', () => {
      expect(describeFailure({ error: { detail: 'Zu groß' } }, i18n)).toBe('EXTRACTION_RESULT.FAILED: Zu groß');
      expect(describeFailure({ message: 'offline' }, i18n)).toBe('EXTRACTION_RESULT.FAILED: offline');
    });

    // Release review 18.10.: translated, not an English literal - but the
    // texts come from the agent, so without them it stays readable English.
    it('names an unknown cause in the current language, in English without translations', () => {
      const german = { instant: (key: string) => (key === 'ALERTS.UNKNOWN_ERROR' ? 'Unbekannter Fehler' : key) } as any;

      expect(describeFailure(undefined, german)).toBe('EXTRACTION_RESULT.FAILED: Unbekannter Fehler');
      expect(describeFailure(undefined, i18n)).toBe('EXTRACTION_RESULT.FAILED: Unknown error');
    });
  });

  // Audit 13.11. (W-LOG-10): without a JSON body the editor read Angular's
  // "Http failure response for https://…/generate: 0 Unknown Error".
  describe('a failure without an answer from the agent', () => {
    const URL = 'https://agent.example/api/generate';
    const http = (status: number, body: unknown, statusText: string) =>
      ({ status, error: body, message: `Http failure response for ${URL}: ${status} ${statusText}` });

    it('says that the agent cannot be reached (status 0)', () => {
      const german = { instant: (key: string) => (key === 'ALERTS.NETWORK_UNREACHABLE' ? 'Der Metadaten-Agent ist nicht erreichbar.' : key) } as any;

      expect(describeFailure(http(0, new ProgressEvent('error'), 'Unknown Error'), german))
        .toBe('EXTRACTION_RESULT.FAILED: Der Metadaten-Agent ist nicht erreichbar.');
    });

    it('says that the service does not answer (5xx with the HTML page of a proxy)', () => {
      expect(describeFailure(http(502, '<html><h1>502 Bad Gateway</h1></html>', 'Bad Gateway'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: ALERTS.SERVICE_UNAVAILABLE {"status":502}');
      expect(describeFailure(http(503, null, 'Service Unavailable'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: ALERTS.SERVICE_UNAVAILABLE {"status":503}');
    });

    it('says that a proxy gave up waiting (504)', () => {
      expect(describeFailure(http(504, '<html>Gateway Time-out</html>', 'Gateway Timeout'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: ALERTS.SERVICE_TIMEOUT {"status":504}');
    });

    it('still prefers what the agent itself says, with its request id', () => {
      const body = { detail: 'lang', error: { code: 'LLM_TIMEOUT', message: 'Das Sprachmodell antwortet nicht', request_id: '0123456789abcdef0123456789abcdef' } };

      expect(describeFailure(http(504, body, 'Gateway Timeout'), i18n)).toBe(
        'EXTRACTION_RESULT.FAILED: Das Sprachmodell antwortet nicht (EXTRACTION_RESULT.REQUEST_ID {"id":"0123456789abcdef0123456789abcdef"})'
      );
    });

    // The texts come from the agent: exactly now they may be missing.
    it('stays readable without translations and never shows the address', () => {
      const untranslated = { instant: (key: string) => key } as any;

      for (const error of [http(0, null, 'Unknown Error'), http(502, null, 'Bad Gateway'), http(504, null, 'Gateway Timeout')]) {
        const text = uploadFailure(error, untranslated);
        expect(text).not.toContain('agent.example');
        expect(text).not.toContain('ALERTS.');
        expect(text.length).toBeGreaterThan(20);
      }
    });
  });

  // Audit 14.11. (W-40, K-24): the texts of 13.11. covered status 0, 408, 504
  // and 5xx. Every other failure without the agent's own words still showed
  // Angular's message - through edu-sharing that is the internal proxy path.
  describe('a failure of any status never shows the address of the request', () => {
    const URL = 'https://repo.example/edu-sharing/rest/bapi/api/v1/proxy/metadata-agent-canvas/generate';
    const http = (status: number, body: unknown, statusText: string) => ({
      name: 'HttpErrorResponse', status, url: URL, error: body,
      message: status === 200 ? `Http failure during parsing for ${URL}` : `Http failure response for ${URL}: ${status} ${statusText}`,
    });
    const untranslated = { instant: (key: string) => key } as any;
    /** Translations that are there for every key, marked as such. */
    const t = (key: string, params?: object): string => `<${key}${params ? ` ${JSON.stringify(params)}` : ''}>`;
    const translatedI18n = { instant: t } as any;

    const CASES: [string, object, string][] = [
      ['401 without a body', http(401, null, 'Unauthorized'), t('ALERTS.ACCESS_DENIED', { status: 401 })],
      ['403 with JSON that has no detail', http(403, { message: 'denied' }, 'Forbidden'), t('ALERTS.ACCESS_DENIED', { status: 403 })],
      ['404 with a proxy\'s page', http(404, '<html>404</html>', 'Not Found'), t('ALERTS.AGENT_NOT_FOUND', { status: 404 })],
      ['413 with text', http(413, 'Request Entity Too Large', 'Payload Too Large'), t('ALERTS.REQUEST_TOO_LARGE', { status: 413 })],
      ['422 with a list as detail', http(422, { detail: [{ loc: ['body', 'text'], msg: 'field required' }] }, 'Unprocessable Entity'),
        t('ALERTS.REQUEST_INVALID', { status: 422 })],
      ['429 with a page', http(429, '<html>Too Many Requests</html>', 'Too Many Requests'), t('ALERTS.TOO_MANY_REQUESTS', { status: 429 })],
      // HttpClient reports a 200 whose body is no JSON with the parser's error inside.
      ['200 with the page of the host instead of JSON',
        http(200, { error: new SyntaxError('Unexpected token \'<\', "<!doctype "... is not valid JSON'), text: '<!doctype html>' }, 'OK'),
        t('ALERTS.ANSWER_UNREADABLE')],
      ['a status without a text of its own (409)', http(409, '<html>', 'Conflict'), t('ALERTS.REQUEST_FAILED', { status: 409 })],
      ['a redirect the browser did not follow (302)', http(302, null, 'Found'), t('ALERTS.REQUEST_FAILED', { status: 302 })],
    ];

    for (const [name, error, expected] of CASES) {
      it(`${name}: a text of the widget`, () => {
        expect(describeFailure(error, translatedI18n)).toBe(`${t('EXTRACTION_RESULT.FAILED')}: ${expected}`);
        expect(uploadFailure(error, translatedI18n)).toBe(expected);
      });

      it(`${name}: readable in English without translations, without the address`, () => {
        for (const text of [describeFailure(error, untranslated), uploadFailure(error, untranslated)]) {
          expect(text).not.toContain('repo.example');
          expect(text).not.toContain('Http failure');
          expect(text).not.toContain('ALERTS.');
          expect(text).not.toContain('Unexpected token');
          expect(text.length).toBeGreaterThan(40);
        }
      });
    }

    it('still prefers what the agent says for these statuses', () => {
      expect(describeFailure(http(404, { detail: 'Schema nicht gefunden' }, 'Not Found'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: Schema nicht gefunden');
      expect(describeFailure(http(422, { detail: [{ msg: 'x' }], error: { message: 'Text fehlt', request_id: 'r9' } }, 'Unprocessable'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: Text fehlt (EXTRACTION_RESULT.REQUEST_ID {"id":"r9"})');
      expect(describeFailure(http(429, { error: { message: 'Kontingent erschöpft' } }, 'Too Many Requests'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: Kontingent erschöpft');
    });

    it('still passes on an error that is no HTTP failure', () => {
      expect(describeFailure(new Error('Die Antwort enthielt kein Ergebnis'), i18n))
        .toBe('EXTRACTION_RESULT.FAILED: Die Antwort enthielt kein Ergebnis');
    });
  });

  // Audit 14.11. (W-50): the widget's own limit; rxjs reports it as TimeoutError.
  describe('a request the widget stopped waiting for', () => {
    const timedOut = Object.assign(new Error('Timeout has occurred'), { name: 'TimeoutError' });
    const translatedI18n = { instant: (key: string) => `<${key}>` } as any;

    it('says that the agent did not answer in time', () => {
      expect(describeFailure(timedOut, translatedI18n)).toBe('<EXTRACTION_RESULT.FAILED>: <ALERTS.REQUEST_TIMEOUT>');
    });

    it('says for an upload that nobody knows whether the node exists', () => {
      expect(uploadFailure(timedOut, translatedI18n)).toBe('<ALERTS.UPLOAD_NO_ANSWER>');
      expect(uploadFailure(timedOut, { instant: (key: string) => key } as any)).toContain('Whether the node was created is unknown');
    });
  });

  describe('assertUsable', () => {
    it('refuses an answer without processing', () => {
      expect(() => assertUsable({} as any, i18n)).toThrowError('EXTRACTION_RESULT.INCOMPLETE_RESPONSE');
    });

    it('refuses a failed run with its own message', () => {
      const response = { processing: { status: 'failed', error: { message: 'Kein Feld' } } } as any;

      expect(() => assertUsable(response, i18n)).toThrowError('Kein Feld');
    });

    it('accepts a successful or partial run', () => {
      expect(() => assertUsable({ processing: { status: 'success', success: true } } as any, i18n)).not.toThrow();
      expect(() => assertUsable({ processing: { status: 'partial', success: true } } as any, i18n)).not.toThrow();
    });
  });

  describe('generationWarning', () => {
    it('is null for a complete, detected result', () => {
      const response = { processing: { status: 'success' }, metadataset: 'event.json' } as any;

      expect(generationWarning(response, i18n, schema)).toBeNull();
    });

    it('names partial results and a guessed content type together', () => {
      const response = {
        metadataset: 'event.json',
        processing: {
          status: 'partial',
          fields_extracted: 7,
          fields_total: 10,
          fields_failed: 3,
          content_type_detection: { method: 'keywords' },
        },
      } as any;

      expect(generationWarning(response, i18n, schema)).toBe(
        'EXTRACTION_RESULT.PARTIAL {"extracted":7,"total":10,"failed":3} ' +
          'EXTRACTION_RESULT.CONTENT_TYPE_UNCERTAIN {"type":"Veranstaltung"}'
      );
    });
  });

  // Known open point until 13.11.: what the agent itself warns about in
  // processing.warnings ("Text auf 150.000 Zeichen gekürzt", "Orte bleiben
  // ohne Koordinaten: …") never reached the editor.
  describe('generationWarning with the warnings of the agent', () => {
    const answer = (processing: object) => ({ metadataset: 'event.json', processing: { status: 'success', ...processing } } as any);

    it('passes them on as sentences', () => {
      const response = answer({ warnings: ['Text auf 150.000 Zeichen gekürzt', 'Orte bleiben ohne Koordinaten: Stadthalle.'] });

      expect(generationWarning(response, i18n, schema))
        .toBe('Text auf 150.000 Zeichen gekürzt. Orte bleiben ohne Koordinaten: Stadthalle.');
    });

    it('puts them after its own notes', () => {
      const response = answer({
        status: 'partial', fields_extracted: 7, fields_total: 10, fields_failed: 3,
        warnings: ['Text auf 150.000 Zeichen gekürzt'],
      });

      expect(generationWarning(response, i18n, schema)).toBe(
        'EXTRACTION_RESULT.PARTIAL {"extracted":7,"total":10,"failed":3} Text auf 150.000 Zeichen gekürzt.'
      );
    });

    it('is null for an empty list, a missing one (agents before 2.1) and empty entries', () => {
      expect(generationWarning(answer({ warnings: [] }), i18n, schema)).toBeNull();
      expect(generationWarning(answer({}), i18n, schema)).toBeNull();
      expect(generationWarning(answer({ warnings: ['  ', null] }), i18n, schema)).toBeNull();
    });
  });

  // Strand A, 18.10.: /upload answers a failed write with 422/502 ErrorResponse
  // that may name a node, like the timeout already did.
  describe('uploadFailure', () => {
    const body = (extra: object) => ({
      status: 502,
      error: { detail: 'Repository antwortet nicht', error: { code: 'UPSTREAM_ERROR', message: 'Repository antwortet nicht', request_id: 'r1' }, ...extra },
    });

    it('names a node that still exists after a 502', () => {
      expect(uploadFailure(body({ node: { nodeId: 'n7', url: 'https://repo/n7' } }), i18n)).toBe(
        'Repository antwortet nicht ALERTS.UPLOAD_TIMEOUT_NODE_KEPT {"nodeId":"n7"} (EXTRACTION_RESULT.REQUEST_ID {"id":"r1"})'
      );
    });

    it('says that a node created on the way was removed again', () => {
      expect(uploadFailure(body({ discarded_node: 'n8' }), i18n)).toBe(
        'Repository antwortet nicht ALERTS.UPLOAD_TIMEOUT_DISCARDED (EXTRACTION_RESULT.REQUEST_ID {"id":"r1"})'
      );
    });

    it('is the plain cause without a node', () => {
      expect(uploadFailure(body({}), i18n)).toBe('Repository antwortet nicht (EXTRACTION_RESULT.REQUEST_ID {"id":"r1"})');
    });
  });
});
