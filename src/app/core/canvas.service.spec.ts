/**
 * The canvas must decide from the schema, not from the value it happens to get.
 *
 * `applyValueToField` used to ask "is this value already an object?" before it
 * built the object form. For a string the answer was no, so no subfields were
 * created, `isParent` stayed false, and `field.component.html` rendered a plain
 * text input (`*ngIf="!field.isParent"`). An editor then typed a name into a
 * field the schema declares as an object, `getMetadataForExport` exported the
 * string verbatim, and it reached the repository — where it fixed the
 * Elasticsearch path for `schema:contactPoint` to `text` and locked every
 * correctly structured record out of the index.
 *
 * The service is built by hand here rather than through TestBed: only six
 * collaborators are involved and none of them needs Angular's injector, so the
 * stubs stay readable and the spec stays fast.
 */

import { CanvasService } from './canvas.service';
import { ShapeExpanderService } from './shape-expander.service';
import { GenerateProcessing, GenerateResponse } from './api.service';
import { CanvasFieldState, FieldStatus } from '../shared/models/canvas.models';

const CONTACT_POINT = {
  id: 'schema:contactPoint',
  label: { de: 'Kontaktstelle(n)' },
  system: {
    path: 'schema:contactPoint',
    datatype: 'array',
    multiple: true,
    items: {
      datatype: 'object',
      discriminator: '@type',
      variants: [{
        '@type': 'ContactPoint',
        fields: [
          { id: 'contactType', label: { de: 'Kontakttyp' }, system: { datatype: 'string' } },
          { id: 'email', label: { de: 'E-Mail' }, system: { datatype: 'string' } },
        ],
      }],
    },
  },
};

const KEYWORDS = {
  id: 'cclom:general_keyword',
  label: { de: 'Schlagworte' },
  system: { path: 'cclom:general_keyword', datatype: 'array', multiple: true, items: { datatype: 'string' } },
};

function schemaStub(): any {
  const byId: Record<string, any> = {
    'schema:contactPoint': CONTACT_POINT,
    'cclom:general_keyword': KEYWORDS,
  };
  return {
    getFieldById: (id: string) => byId[id],
    getActiveLanguage: () => 'de',
    localizeString: (v: any) => (typeof v === 'string' ? v : v?.de || ''),
    localizeVocabulary: () => [],
  };
}

function field(fieldId: string, overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId,
    label: fieldId,
    group: 'g',
    groupLabel: 'G',
    groupOrder: 1,
    schemaName: 'person',
    aiFillable: true,
    repoField: false,
    status: FieldStatus.EMPTY,
    value: null,
    confidence: 0,
    isRequired: false,
    datatype: 'array',
    multiple: true,
    ...overrides,
  } as CanvasFieldState;
}

describe('CanvasService.applyValueToField', () => {
  let service: CanvasService;
  let apply: (f: CanvasFieldState, value: any, isAi?: boolean) => CanvasFieldState;

  beforeEach(() => {
    const schema = schemaStub();
    service = new CanvasService(
      schema,
      {} as any,
      {} as any,
      { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
      new ShapeExpanderService(schema),
      {} as any,
    );
    apply = (f, value, isAi = true) => (service as any).applyValueToField(f, value, isAi);
  });

  it('builds the object form for a bare string — the value that broke staging', () => {
    const result = apply(field('schema:contactPoint'), ['Virtuelles Haus']);

    expect(result.isParent).withContext('otherwise a plain text input is rendered').toBe(true);
    expect(result.subFields).toBeDefined();
    const contactType = result.subFields!.find(f => f.path === 'contactType');
    expect(contactType).toBeDefined();
    expect(contactType!.value).toBe('Virtuelles Haus');
  });

  it('builds the object form even when the field is still empty', () => {
    const result = apply(field('schema:contactPoint'), []);
    expect(result.isParent).toBe(true);
  });

  it('keeps a correctly structured value', () => {
    const result = apply(field('schema:contactPoint'), [
      { contactType: 'Besucherservice', email: 'spectrum@technikmuseum.berlin' },
    ]);
    expect(result.isParent).toBe(true);
    expect(result.subFields!.find(f => f.path === 'email')!.value)
      .toBe('spectrum@technikmuseum.berlin');
  });

  it('leaves a plain string list alone', () => {
    const result = apply(field('cclom:general_keyword'), ['Technik', 'Museum']);
    expect(result.isParent).toBeFalsy();
    expect(result.value).toEqual(['Technik', 'Museum']);
  });
});

/**
 * A failed or incomplete generation has to reach the editor as such. The agent
 * used to answer "0 of 50 fields" as a success and quietly fall back to
 * learning material; it now reports failed/partial and how the content type
 * was decided, and the canvas must pass that on instead of a generic message.
 */
describe('CanvasService generation feedback', () => {
  let service: CanvasService;
  let generate: jasmine.Spy;

  /** The key plus its parameters, so assertions see both. */
  const i18n = {
    currentLang: 'de',
    instant: (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key),
  };

  function generated(processing: Partial<GenerateProcessing>): GenerateResponse {
    return {
      contextName: 'default',
      schemaVersion: 'latest',
      metadataset: 'event.json',
      language: 'de',
      exportedAt: '2026-10-14T00:00:00Z',
      metadata: {},
      processing: {
        success: true,
        fields_extracted: 20,
        fields_total: 20,
        processing_time_ms: 1,
        llm_provider: 'b-api-openai',
        llm_model: 'test-model',
        errors: [],
        warnings: [],
        status: 'success',
        content_type_detection: { method: 'llm', confidence: 'high', schema_file: 'event.json' },
        ...processing,
      },
    };
  }

  /** What HttpClient rejects with when the agent answers 502 plus an error code. */
  function agentFailure(code: string, message: string) {
    return {
      status: 502,
      message: 'Http failure response for /generate: 502 Bad Gateway',
      error: { detail: `KI-Metadatengenerierung fehlgeschlagen: ${message}`, error: { code, message } },
    };
  }

  beforeEach(() => {
    const schema = {
      ...schemaStub(),
      getContextName: () => 'default',
      getContentTypeConcepts: () => [{ label: 'Veranstaltung', schema_file: 'event.json' }],
    };
    generate = jasmine.createSpy('generate');
    service = new CanvasService(
      schema,
      { generate } as any,
      i18n as any,
      { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} } as any,
      new ShapeExpanderService(schema),
      { run: (fn: () => unknown) => fn() } as any,
    );
    // Building fields needs the real schema files and is not what these specs test.
    spyOn(service as any, 'initializeCoreFields').and.resolveTo();
    spyOn(service as any, 'applyGeneratedMetadata').and.resolveTo();
  });

  it('shows the cause the agent reports, not a generic message', async () => {
    generate.and.rejectWith(agentFailure('LLM_AUTH_FORBIDDEN', 'Der KI-Dienst hat den Zugriff verweigert (403).'));

    await service.startExtraction('Ein Text');

    const state = service.getCurrentState();
    expect(state.extractionError).toBe('EXTRACTION_RESULT.FAILED: Der KI-Dienst hat den Zugriff verweigert (403).');
    expect(state.extractionWarning).toBeNull();
    expect(state.isExtracting).toBeFalse();
  });

  it('falls back to the detail text when there is no error code', async () => {
    generate.and.rejectWith({ message: 'Http failure response', error: { detail: 'Textextraktion: Zeitüberschreitung' } });

    await service.startUrlExtraction('https://example.org');

    expect(service.getCurrentState().extractionError).toBe('EXTRACTION_RESULT.FAILED: Textextraktion: Zeitüberschreitung');
  });

  it('falls back to the transport message when the agent was not reached', async () => {
    generate.and.rejectWith({ message: 'Http failure response for /generate: 0 Unknown Error', error: {} });

    await service.startNodeIdExtraction('node-1');

    expect(service.getCurrentState().extractionError)
      .toBe('EXTRACTION_RESULT.FAILED: Http failure response for /generate: 0 Unknown Error');
  });

  it('warns when only part of the fields could be generated', async () => {
    generate.and.resolveTo(generated({
      status: 'partial',
      fields_extracted: 12,
      fields_failed: 8,
      error: { code: 'LLM_UPSTREAM_ERROR', message: 'Der KI-Dienst antwortet mit Fehler 500.' },
    }));

    await service.startExtraction('Ein Text');

    const state = service.getCurrentState();
    expect(state.extractionError).toBeNull();
    expect(state.extractionWarning).toBe(
      'EXTRACTION_RESULT.PARTIAL {"extracted":12,"total":20,"failed":8} Der KI-Dienst antwortet mit Fehler 500.'
    );
  });

  it('says so when the content type is only a keyword guess', async () => {
    generate.and.resolveTo(generated({
      content_type_detection: { method: 'keywords', confidence: 'low', schema_file: 'event.json' },
    }));

    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionWarning)
      .toBe('EXTRACTION_RESULT.CONTENT_TYPE_UNCERTAIN {"type":"Veranstaltung"}');
  });

  it('names the request id, so the failure can be found in the agent log', async () => {
    const failure = agentFailure('LLM_AUTH_FORBIDDEN', 'Der KI-Dienst hat den Zugriff verweigert (403).');
    (failure.error.error as any).request_id = '3f9c2a7d1b4e5f60';
    generate.and.rejectWith(failure);

    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionError).toBe(
      'EXTRACTION_RESULT.FAILED: Der KI-Dienst hat den Zugriff verweigert (403). ' +
      '(EXTRACTION_RESULT.REQUEST_ID {"id":"3f9c2a7d1b4e5f60"})'
    );
  });

  it('shows no id that would lead nowhere in the agent log', async () => {
    // Only failures with an error code get a log line under their id; the
    // header alone is on every response.
    generate.and.rejectWith({
      status: 400,
      message: 'Http failure response',
      error: { detail: 'node_id is required' },
      headers: { get: () => '3f9c2a7d1b4e5f60' },
    });

    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionError)
      .toBe('EXTRACTION_RESULT.FAILED: node_id is required');
  });

  it('treats a 200 without a result as a failure and applies nothing', async () => {
    generate.and.resolveTo({ contextName: 'default', metadata: {} } as any);

    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionError)
      .toBe('EXTRACTION_RESULT.FAILED: EXTRACTION_RESULT.INCOMPLETE_RESPONSE');
    expect((service as any).applyGeneratedMetadata).not.toHaveBeenCalled();
  });

  it('treats a 200 that reports no success as a failure and applies nothing', async () => {
    generate.and.resolveTo(generated({
      success: false,
      status: undefined,
      fields_extracted: 0,
      errors: ['LLM API error 403: Forbidden'],
    }));

    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionError)
      .toBe('EXTRACTION_RESULT.FAILED: LLM API error 403: Forbidden');
    expect((service as any).applyGeneratedMetadata).not.toHaveBeenCalled();
  });

  it('clears an earlier warning after a clean run', async () => {
    generate.and.resolveTo(generated({ status: 'partial', fields_extracted: 12, fields_failed: 8 }));
    await service.startExtraction('Ein Text');
    expect(service.getCurrentState().extractionWarning).not.toBeNull();

    generate.and.resolveTo(generated({}));
    await service.startExtraction('Ein Text');

    expect(service.getCurrentState().extractionWarning).toBeNull();
  });

  /**
   * Nothing orders the requests: a reset, a second extraction or a content-type
   * switch can start while one is still running. Whichever answered last used
   * to win, so the previous page's metadata could land in a fresh form.
   */
  describe('overlapping requests', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    }

    it('a slower earlier request does not overwrite a newer one', async () => {
      const first = deferred<GenerateResponse>();
      const second = deferred<GenerateResponse>();
      generate.and.callFake((req: { text: string }) => (req.text === 'Seite A' ? first.promise : second.promise));
      const older = generated({ fields_extracted: 1 });
      const newer = generated({ fields_extracted: 2 });

      const a = service.startExtraction('Seite A');
      const b = service.startExtraction('Seite B');
      second.resolve(newer);
      await b;
      first.resolve(older);
      await a;

      const applied = (service as any).applyGeneratedMetadata.calls.allArgs().map((args: any[]) => args[0]);
      expect(applied).toEqual([newer]);
    });

    it('keeps the spinner until the newest request has answered', async () => {
      const first = deferred<GenerateResponse>();
      const second = deferred<GenerateResponse>();
      generate.and.callFake((req: { text: string }) => (req.text === 'Seite A' ? first.promise : second.promise));

      const a = service.startExtraction('Seite A');
      const b = service.startExtraction('Seite B');
      first.resolve(generated({}));
      await a;
      expect(service.getCurrentState().isExtracting).toBe(true);

      second.resolve(generated({}));
      await b;
      expect(service.getCurrentState().isExtracting).toBe(false);
    });

    it('drops what a request answers after a reset', async () => {
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = service.startExtraction('Seite A');
      service.reset();
      pending.reject(agentFailure('LLM_RATE_LIMITED', 'zu viele Anfragen'));
      await run;

      expect((service as any).applyGeneratedMetadata).not.toHaveBeenCalled();
      expect(service.getCurrentState().extractionError).toBeNull();
      expect(service.getCurrentState().isExtracting).toBe(false);
    });
  });

  it('drops a screenshot that arrives after a reset', async () => {
    let deliver!: (url: string) => void;
    (service as any).api.captureScreenshot = () => new Promise<string>(res => { deliver = res; });

    (service as any).captureScreenshotAsync('https://example.org/alt', 'playwright');
    service.reset();
    deliver('data:image/png;base64,alt');
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getCurrentState().previewImageUrl).toBeFalsy();
  });

  describe('a content-type schema that cannot be loaded', () => {
    beforeEach(() => {
      (service as any).schema.getFields = jasmine.createSpy('getFields').and.rejectWith(new Error('502'));
      (service as any).schema.resolveSchemaFileOrUri = (v: string) => v;
    });

    it('is shown as an error instead of escaping as an unhandled rejection', async () => {
      await expectAsync(service.selectContentType('event.json')).toBeResolved();

      expect(service.getCurrentState().extractionError)
        .toBe('EXTRACTION_RESULT.SCHEMA_UNAVAILABLE {"type":"Veranstaltung"}');
    });

    it('does not keep the fields of the previous type under the new one', async () => {
      // Otherwise the export writes the old type's fields under the new metadataset.
      (service as any).updateState({
        selectedContentType: 'learning_material.json',
        specialFields: [field('ccm:oeh_lrt_aggregated')],
      });

      await service.selectContentType('event.json');

      expect(service.getCurrentState().specialFields).toEqual([]);
    });
  });

  describe('switching the content type', () => {
    let calls: string[];

    beforeEach(() => {
      calls = [];
      (service as any).initializeCoreFields.and.callFake(async () => { calls.push('initializeCoreFields'); });
      spyOn(service as any, 'loadSpecialSchema').and.callFake(async () => { calls.push('loadSpecialSchema'); });
      (service as any).updateState({ userText: 'Ein Text' });
    });

    it('keeps the filled form when the new generation answers 200 without a result', async () => {
      generate.and.callFake(async () => {
        calls.push('generate');
        return generated({ success: false, status: 'failed', fields_extracted: 0 });
      });

      await (service as any).regenerateWithContentType('event.json');

      expect(calls).toEqual(['loadSpecialSchema', 'generate']);
      expect(service.getCurrentState().extractionError).toContain('EXTRACTION_RESULT.FAILED');
    });

    it('keeps the filled form when the new generation fails', async () => {
      generate.and.callFake(async () => {
        calls.push('generate');
        throw agentFailure('LLM_UPSTREAM_ERROR', 'Der KI-Dienst antwortet mit Fehler 502.');
      });

      await (service as any).regenerateWithContentType('event.json');

      expect(calls).withContext('core fields are only reset once replacements exist')
        .toEqual(['loadSpecialSchema', 'generate']);
      const state = service.getCurrentState();
      expect(state.extractionError).toBe('EXTRACTION_RESULT.FAILED: Der KI-Dienst antwortet mit Fehler 502.');
      expect(state.isExtracting).toBeFalse();
    });

    it('resets the form after the new values arrived', async () => {
      generate.and.callFake(async () => {
        calls.push('generate');
        return generated({});
      });

      await (service as any).regenerateWithContentType('event.json');

      expect(calls).toEqual(['loadSpecialSchema', 'generate', 'initializeCoreFields', 'loadSpecialSchema']);
      expect(service.getCurrentState().extractionError).toBeNull();
    });
  });
});

describe('CanvasService.setPreviewImage', () => {
  it('puts the preview image of the host page into the shared state', () => {
    const schema = schemaStub();
    const service = new CanvasService(
      schema,
      {} as any,
      {} as any,
      { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
      new ShapeExpanderService(schema),
      {} as any,
    );

    service.setPreviewImage('https://example.org/vorschau.png');

    expect(service.getCurrentState().previewImageUrl).toBe('https://example.org/vorschau.png');
  });
});
