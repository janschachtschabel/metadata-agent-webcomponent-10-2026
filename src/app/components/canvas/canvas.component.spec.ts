import { SimpleChange } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { CanvasComponent } from './canvas.component';

/**
 * Review 18.10.: the language stream is a BehaviorSubject. Subscribed before
 * the schema context was set, it relabelled an empty form and loaded the core
 * schema in parallel - in the default context, racing the configured one.
 */
describe('CanvasComponent startup', () => {
  it('starts in the configured context and relabels only on a language switch', async () => {
    const calls: string[] = [];
    const language$ = new BehaviorSubject('de');
    const canvas = {
      bindToInstance: () => undefined,
      state$: new Subject(),
      relocalizeFields: jasmine.createSpy('relocalizeFields').and.resolveTo(),
    };
    const schema = {
      setContext: async (name: string) => { calls.push(`setContext ${name}`); },
      loadCoreSchema: async () => { calls.push('loadCoreSchema'); },
      getContentTypes: async () => { calls.push('getContentTypes'); return []; },
    };
    const component = new CanvasComponent(
      canvas as any,
      schema as any,
      {} as any,
      {} as any,
      { language$, currentLang: 'de', instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
      { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
    );
    component.contextName = 'mds_oeh';
    // Built without a view: no layout host to render into (rendering is
    // covered by canvas-layout-bindings.spec.ts).
    spyOn<any>(component, 'renderLayout');

    await component.ngOnInit();

    expect(calls).toEqual(['setContext mds_oeh', 'loadCoreSchema', 'getContentTypes']);
    expect(canvas.relocalizeFields).not.toHaveBeenCalled();

    language$.next('en');
    await Promise.resolve();

    expect(canvas.relocalizeFields).toHaveBeenCalledTimes(1);
    expect(calls.slice(3)).toEqual(['getContentTypes']);
    component.ngOnDestroy();
  });
});

/**
 * What the canvas asks and tells the editor (audit U-05, T-02). The questions
 * used to be confirm() - blocking, so nothing could change while one was open.
 * Inline questions do not block: whatever runs after the answer must use the
 * state at that moment, and an unanswered question must not hang forever.
 */
describe('CanvasComponent notices', () => {
  let component: CanvasComponent;
  let metadata: Record<string, unknown>;
  let canvas: any;
  let api: { upload: jasmine.Spy };

  beforeEach(() => {
    metadata = { 'cclom:title': 'Erster Stand' };
    canvas = {
      bindToInstance: () => undefined,
      getMetadataForRepository: () => metadata,
      getCurrentState: () => ({ userText: 'Quelltext' }),
      reset: jasmine.createSpy('reset'),
    };
    api = { upload: jasmine.createSpy('upload') };
    component = new CanvasComponent(
      canvas,
      {} as any,
      api as any,
      {} as any,
      { instant: (key: string) => key } as any,
      { markForCheck: () => undefined } as any,
      { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
    );
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }

  it('resets only after the editor confirmed', async () => {
    const declined = component.reset();
    expect(component.notice?.question).toBeTrue();
    component.onNoticeClosed(false);
    await declined;
    expect(canvas.reset).not.toHaveBeenCalled();

    const confirmed = component.reset();
    component.onNoticeClosed(true);
    await confirmed;
    expect(canvas.reset).toHaveBeenCalled();
  });

  it('marks the reset question as destructive', () => {
    void component.reset();

    expect(component.notice?.destructive).toBeTrue();
  });

  it('retries a duplicate upload with the metadata as they are after the answer', async () => {
    api.upload.and.returnValues(
      Promise.resolve({ success: false, duplicate: true, node: { title: 'Alt' } }),
      Promise.resolve({ success: true, node: { nodeId: 'n1' } }),
    );

    const upload = component.uploadToRepository();
    await settle();
    expect(component.notice?.question).toBeTrue();
    metadata = { 'cclom:title': 'Während der Frage geändert' };
    component.onNoticeClosed(true);
    await upload;

    const retry = api.upload.calls.mostRecent().args[0];
    expect(retry.check_duplicates).toBeFalse();
    expect(retry.metadata).toEqual({ 'cclom:title': 'Während der Frage geändert' });
  });

  it('reports a failed upload as an error', async () => {
    api.upload.and.resolveTo({ success: false, error: 'HTTP 502' });

    await component.uploadToRepository();

    expect(component.notice?.kind).toBe('error');
  });

  it('a new message answers an open question with "no"', async () => {
    const reset = component.reset();
    (component as any).say('ALERTS.INPUT_REQUIRED');
    await reset;

    expect(canvas.reset).not.toHaveBeenCalled();
    expect(component.notice?.question).toBeFalsy();
  });

  it('an open question is answered "no" when the widget goes away', async () => {
    let finished = false;
    const reset = component.reset().then(() => (finished = true));

    component.ngOnDestroy();
    await Promise.race([reset, settle()]);

    expect(finished).withContext('the await in reset() must not hang').toBeTrue();
    expect(canvas.reset).not.toHaveBeenCalled();
  });
});

/**
 * The upload, the text box and the element's role among elements that share
 * one instance (audits U-02, U-07, U-10, U-11, U-16).
 */
describe('CanvasComponent actions', () => {
  let canvas: any;
  let api: { upload: jasmine.Spy };
  let i18n: { instant: (key: string) => string; currentLang: string };

  function create(): CanvasComponent {
    return new CanvasComponent(
      canvas,
      {} as any,
      api as any,
      {} as any,
      i18n as any,
      { markForCheck: () => undefined } as any,
      { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
    );
  }

  beforeEach(() => {
    canvas = {
      bindToInstance: () => undefined,
      getMetadataForRepository: () => ({ 'cclom:title': 'Titel' }),
      getMetadataForExport: () => ({ 'cclom:title': 'Titel' }),
      getCurrentState: () => ({ userText: 'Quelltext' }),
      startExtraction: jasmine.createSpy('startExtraction'),
    };
    api = { upload: jasmine.createSpy('upload') };
    i18n = { instant: (key: string) => key, currentLang: 'de' };
  });

  async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }

  it('sends one upload, however often the button is clicked (U-02)', async () => {
    let answer!: (value: unknown) => void;
    api.upload.and.returnValue(new Promise(resolve => (answer = resolve)));
    const component = create();

    const first = component.uploadToRepository();
    const second = component.uploadToRepository();
    expect(component.uploading).withContext('the layouts disable the button with this').toBeTrue();
    answer({ success: true, node: { nodeId: 'n1' } });
    await Promise.all([first, second]);

    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(component.uploading).toBeFalse();
  });

  it('sends no upload while an extraction runs (L-10)', async () => {
    canvas.getCurrentState = () => ({ userText: 'Quelltext', isExtracting: true });
    const component = create();

    await component.uploadToRepository();

    expect(api.upload).not.toHaveBeenCalled();
  });

  it('allows a new upload after a failed one (U-02)', async () => {
    api.upload.and.rejectWith(new Error('offline'));
    const component = create();

    await component.uploadToRepository();
    await component.uploadToRepository();

    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(component.uploading).toBeFalse();
  });

  it('reports the result of the upload repeated after the duplicate question (U-11)', async () => {
    api.upload.and.returnValues(
      Promise.resolve({ success: false, duplicate: true, node: { title: 'Alt' } }),
      Promise.resolve({ success: false, error: 'HTTP 502' }),
    );
    const component = create();

    const upload = component.uploadToRepository();
    await settle();
    component.onNoticeClosed(true);
    await upload;

    expect(component.notice?.kind).toBe('error');
    expect(component.notice?.text).toBe('ALERTS.UPLOAD_ERROR');
  });

  it('confirms the upload repeated after the duplicate question (U-11)', async () => {
    api.upload.and.returnValues(
      Promise.resolve({ success: false, duplicate: true, node: { title: 'Alt' } }),
      Promise.resolve({ success: true, node: { nodeId: 'n2' } }),
    );
    const component = create();

    const upload = component.uploadToRepository();
    await settle();
    component.onNoticeClosed(true);
    await upload;

    expect(component.notice?.text).toBe('ALERTS.UPLOAD_SUCCESS');
  });

  it('tells the editor when a JSON file cannot be read (U-11)', () => {
    const component = create();

    component.onJsonLoadError();

    expect(component.notice?.kind).toBe('error');
    expect(component.notice?.text).toBe('ALERTS.JSON_LOAD_ERROR');
  });

  it('keeps the typed text when the extraction fails (U-10)', async () => {
    canvas.startExtraction.and.resolveTo(false);
    const component = create();
    component.userText = 'Eine lange Beschreibung';

    component.startExtraction();
    await settle();

    expect(canvas.startExtraction).toHaveBeenCalledWith('Eine lange Beschreibung');
    expect(component.userText).toBe('Eine lange Beschreibung');
  });

  it('empties the text box once the extraction succeeded (U-10)', async () => {
    canvas.startExtraction.and.resolveTo(true);
    const component = create();
    component.userText = 'Eine lange Beschreibung';

    component.startExtraction();
    await settle();

    expect(component.userText).toBe('');
  });

  it('becomes the element that emits events when the primary one goes away (U-07)', () => {
    const first = create();
    const second = create();
    first.instanceId = 'u07-shared';
    second.instanceId = 'u07-shared';
    const submitted = spyOn(second.metadataSubmit, 'emit');

    second.submit();
    expect(submitted).withContext('the first element still emits').not.toHaveBeenCalled();

    first.ngOnDestroy();
    second.submit();
    expect(submitted).toHaveBeenCalled();
    second.ngOnDestroy();
  });

  it('marks its root with the current language (U-16)', () => {
    i18n.currentLang = 'en';
    const component = create();

    expect(component.hostLang).toBe('en');
  });

  // Release review 18.10. (pre-existing): failures in the agent's error shape
  // `{detail, error: {code, message, request_id}}`, translated and with the
  // request id, like a failed extraction.
  describe('failures it reports', () => {
    beforeEach(() => {
      i18n.instant = ((key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key)) as any;
    });

    function httpError(status: number, body: Record<string, unknown>) {
      return { status, message: `Http failure response: ${status}`, error: body };
    }

    it('a rejected request (422) shows its cause and request id, not "[object Object]"', async () => {
      api.upload.and.rejectWith(httpError(422, {
        detail: [{ loc: ['body', 'metadata'], msg: 'field required', type: 'missing' }],
        error: { code: 'VALIDATION_ERROR', message: 'Der Request entspricht nicht dem Schema.', request_id: 'req-422' },
      }));
      const component = create();
      const reported = spyOn(component.uploadResult, 'emit');

      await component.uploadToRepository();

      expect(component.notice?.kind).toBe('error');
      expect(component.notice?.text).not.toContain('[object Object]');
      expect(component.notice?.text).toContain('Der Request entspricht nicht dem Schema.');
      expect(component.notice?.text).toContain('req-422');
      expect(reported.calls.mostRecent().args[0]?.error).not.toContain('[object Object]');
    });

    it('a timed-out upload says that the node was discarded', async () => {
      api.upload.and.rejectWith(httpError(504, {
        detail: 'Schreiben ins Repository nach 60 s abgebrochen (METADATA_AGENT_UPLOAD_TIMEOUT): …',
        error: { code: 'UPLOAD_TIMEOUT', message: 'Zeitlimit überschritten', request_id: 'req-504' },
        discarded_node: 'node-9',
      }));
      const component = create();

      await component.uploadToRepository();

      expect(component.notice?.text).toContain('ALERTS.UPLOAD_TIMEOUT');
      expect(component.notice?.text).toContain('ALERTS.UPLOAD_TIMEOUT_DISCARDED');
      expect(component.notice?.text).toContain('req-504');
    });

    it('a timed-out upload names the node that still exists', async () => {
      api.upload.and.rejectWith(httpError(504, {
        detail: 'Schreiben ins Repository nach 60 s abgebrochen (METADATA_AGENT_UPLOAD_TIMEOUT): …',
        error: { code: 'UPLOAD_TIMEOUT', message: 'Zeitlimit überschritten', request_id: 'req-504' },
        node: { nodeId: 'node-7', repositoryUrl: 'https://repo.example/components/render/node-7' },
      }));
      const component = create();

      await component.uploadToRepository();

      expect(component.notice?.text).toContain('ALERTS.UPLOAD_TIMEOUT_NODE_KEPT');
      expect(component.notice?.text).toContain('node-7');
    });

    it('a failed upload without a cause says so in the current language', async () => {
      api.upload.and.resolveTo({ success: false });
      i18n.instant = ((key: string, params?: object) => key === 'ALERTS.UNKNOWN_ERROR'
        ? 'Unbekannter Fehler'
        : (params ? `${key} ${JSON.stringify(params)}` : key)) as any;
      const component = create();

      await component.uploadToRepository();

      expect(component.notice?.text).toContain('Unbekannter Fehler');
      expect(component.notice?.text).not.toContain('Unknown error');
    });

    it('a schema that cannot be loaded at start is reported translated', async () => {
      canvas.state$ = new Subject();
      canvas.setError = jasmine.createSpy('setError');
      const component = new CanvasComponent(
        canvas,
        { setContext: () => Promise.reject(httpError(502, { detail: 'Bad Gateway', error: { message: 'Upstream nicht erreichbar', request_id: 'req-502' } })) } as any,
        api as any,
        {} as any,
        { ...i18n, language$: new Subject() } as any,
        { markForCheck: () => undefined } as any,
        { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
      );
      spyOn<any>(component, 'renderLayout');
      spyOn(console, 'error');

      await component.ngOnInit();

      const message = canvas.setError.calls.mostRecent().args[0] as string;
      expect(message).toContain('ALERTS.SCHEMA_INIT_FAILED');
      expect(message).toContain('Upstream nicht erreichbar');
      expect(message).not.toContain('Schema initialization failed');
      component.ngOnDestroy();
    });

    // Follow-up review 18.10.: the texts come from the agent - exactly when it
    // cannot be reached they are missing, and the raw key dropped the cause.
    describe('without translations (agent unreachable)', () => {
      beforeEach(() => {
        i18n.instant = ((key: string) => key) as any;
      });

      it('a schema that cannot be loaded at start is reported in English with its cause', async () => {
        canvas.state$ = new Subject();
        canvas.setError = jasmine.createSpy('setError');
        const component = new CanvasComponent(
          canvas,
          { setContext: () => Promise.reject(new Error('Http failure response: 0 Unknown Error')) } as any,
          api as any,
          {} as any,
          { ...i18n, language$: new Subject() } as any,
          { markForCheck: () => undefined } as any,
          { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
        );
        spyOn<any>(component, 'renderLayout');
        spyOn(console, 'error');

        await component.ngOnInit();

        expect(canvas.setError).toHaveBeenCalledWith('Schema initialization failed: Http failure response: 0 Unknown Error');
        component.ngOnDestroy();
      });

      it('metadata from the host that cannot be loaded are reported in English with the cause', async () => {
        canvas.importJsonData = jasmine.createSpy('importJsonData').and.rejectWith(new Error('Schema 502'));
        const component = create();
        spyOn(console, 'error');

        component.ngOnChanges({ metadataInput: new SimpleChange(null, { 'cclom:title': 'X' }, true) });
        await settle();

        expect(component.notice?.text).toBe('Metadata could not be loaded: Schema 502');
      });
    });

    it('metadata from the host that cannot be loaded are reported, not an unhandled rejection', async () => {
      canvas.importJsonData = jasmine.createSpy('importJsonData').and.rejectWith(new Error('Schema 502'));
      const component = create();
      spyOn(console, 'error');

      component.ngOnChanges({ metadataInput: new SimpleChange(null, { 'cclom:title': 'X' }, true) });
      await settle();

      expect(component.notice?.kind).toBe('error');
      expect(component.notice?.text).toContain('ALERTS.METADATA_LOAD_ERROR');
    });

    // Follow-up review 18.10.: only an image set in the same change survived.
    describe('the host\'s preview image and a metadata-input import without one', () => {
      let previewImageUrl: string | undefined;
      let finishImport: () => void;

      beforeEach(() => {
        previewImageUrl = undefined;
        canvas.setPreviewImage = jasmine.createSpy('setPreviewImage').and.callFake((url: string) => (previewImageUrl = url));
        canvas.getCurrentState = () => ({ previewImageUrl });
        canvas.importJsonData = jasmine.createSpy('importJsonData').and.callFake(() =>
          new Promise<void>(resolve => (finishImport = () => { previewImageUrl = undefined; resolve(); })));
      });

      it('keeps an image set in the same change (setters run before ngOnChanges)', async () => {
        const component = create();
        component.previewImage = 'data:image/png;base64,HOST';

        component.ngOnChanges({
          previewImage: new SimpleChange(undefined, 'data:image/png;base64,HOST', true),
          metadataInput: new SimpleChange(null, { 'cclom:title': 'X' }, true),
        });
        finishImport();
        await settle();

        expect(previewImageUrl).toBe('data:image/png;base64,HOST');
      });

      it('keeps an image the host set earlier', async () => {
        const component = create();
        component.previewImage = 'data:image/png;base64,HOST';

        component.ngOnChanges({ metadataInput: new SimpleChange(null, { 'cclom:title': 'X' }, false) });
        finishImport();
        await settle();

        expect(previewImageUrl).toBe('data:image/png;base64,HOST');
      });

      it('keeps an image the host set while the import was loading', async () => {
        const component = create();

        component.ngOnChanges({ metadataInput: new SimpleChange(null, { 'cclom:title': 'X' }, true) });
        component.previewImage = 'data:image/png;base64,HOST';
        finishImport();
        await settle();

        expect(previewImageUrl).toBe('data:image/png;base64,HOST');
      });
    });

  });

  it('sends no metadata change after it was destroyed (U-16)', () => {
    jasmine.clock().install(); // the 50 ms debounce without waiting for it (T-3)
    try {
      const component = create();
      const emitted = spyOn(component.metadataChange, 'emit');
      (component as any).scheduleMetadataChange();

      component.ngOnDestroy();
      jasmine.clock().tick(100);

      expect(emitted).not.toHaveBeenCalled();
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
