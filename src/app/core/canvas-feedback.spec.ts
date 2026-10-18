import { assertUsable, describeFailure, generationWarning } from './canvas-feedback';

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
});
