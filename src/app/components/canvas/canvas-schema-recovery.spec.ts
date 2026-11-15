/**
 * Schemas that do not load, and what the widget does then (audit 14.11.):
 *
 * - W-37 (K-22): a first load that failed was final for the type menu and for
 *   `contentType` - until the page was reloaded.
 * - W-45: after a type schema failed, "Upload" sent the core fields alone.
 * - W-50: an upload that never answered held its button for good.
 * - W-N: an extraction the host had just asked for (auto-extract,
 *   plugin-extract) still started after the element was destroyed.
 */
import { DynamicTranslateLoader } from '../../core/dynamic-translate-loader';
import { CanvasHarness, DEFAULT_SCHEMAS, EVENT_URI, generated, mountCanvas } from '../../testing/canvas-harness';

const RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert', 'schema:startDate': '2026-05-03' } };

describe('CanvasComponent: schemas that do not load', () => {
  let h: CanvasHarness;
  let translationsFrom: string;

  beforeEach(() => {
    translationsFrom = DynamicTranslateLoader.apiUrl;
    spyOn(console, 'error'); // the failures are logged
  });

  afterEach(() => {
    DynamicTranslateLoader.apiUrl = translationsFrom;
    localStorage.removeItem('metadata-agent-canvas.language');
  });

  /** The agent answers from now on. */
  function agentIsBack(): void {
    h.api.getSchema.and.callFake((_context: string, _version: string, file: string) =>
      DEFAULT_SCHEMAS[file] ? Promise.resolve(DEFAULT_SCHEMAS[file]) : Promise.reject(new Error(`no schema ${file}`)));
  }

  describe('a failed first load is not final (W-37)', () => {
    beforeEach(async () => {
      h = await mountCanvas({ layout: 'default', contentType: EVENT_URI }, {});
      expect(h.component.contentTypes).toEqual([]);
      expect(h.canvas.getCurrentState().extractionError).toContain('Schema initialization failed');
      agentIsBack();
    });

    it('a later apiUrl loads the content types, applies the waiting type and takes the error away', async () => {
      await h.set('apiUrl', 'https://agent.example');

      expect(h.component.contentTypes.map(type => type.schemaFile)).toEqual(['event.json', 'person.json']);
      expect(h.canvas.getCurrentState().selectedContentType).withContext('content-type of the host').toBe('event.json');
      expect(h.canvas.getCurrentState().extractionError).toBeNull();
    });

    it('an import does the same', async () => {
      await h.set('metadataInput', { 'cclom:title': 'Konzert' });

      expect(h.component.contentTypes.length).toBe(2);
      expect(h.canvas.getCurrentState().selectedContentType).toBe('event.json');
      expect(h.canvas.getCurrentState().extractionError).toBeNull();
      expect(h.control('Titel').value).toBe('Konzert');
    });

    it('an extraction does the same', async () => {
      h.api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }));
      h.component.userText = 'Ein Konzert';

      h.component.startExtraction();
      await new Promise(resolve => setTimeout(resolve, 50));
      await h.settle();

      expect(h.component.contentTypes.length).toBe(2);
      expect(h.canvas.getCurrentState().extractionError).toBeNull();
      expect(h.control('Titel').value).toBe('Konzert');
    });

    it('keeps an error that is not its own', async () => {
      h.canvas.setError('Etwas anderes ist schiefgegangen');

      await h.set('apiUrl', 'https://agent.example');

      expect(h.canvas.getCurrentState().extractionError).toBe('Etwas anderes ist schiefgegangen');
    });

    it('stays failed, with its message, while the agent stays away', async () => {
      h.api.getSchema.and.rejectWith({ status: 503 });

      await h.set('apiUrl', 'https://agent.example');

      expect(h.component.contentTypes).toEqual([]);
      expect(h.canvas.getCurrentState().extractionError).toContain('Schema initialization failed');
    });
  });

  it('does not ask for the schemas again once they are there', async () => {
    h = await mountCanvas({ layout: 'default' });
    const asked = h.api.getSchema.calls.count();

    await h.set('apiUrl', 'https://agent.example');

    expect(h.api.getSchema.calls.count()).toBe(asked);
  });

  describe('a form that lacks the fields of its type (W-45)', () => {
    let results: { success: boolean; error?: string }[];

    beforeEach(async () => {
      h = await mountCanvas({ layout: 'default' }, { 'core.json': DEFAULT_SCHEMAS['core.json'], 'person.json': DEFAULT_SCHEMAS['person.json'] });
      results = [];
      h.component.uploadResult.subscribe(result => results.push(result));
      await h.set('metadataInput', RECORD);
    });

    it('is not uploaded: a message instead, and the host is told', async () => {
      await h.component.uploadToRepository();

      expect(h.api.upload).not.toHaveBeenCalled();
      expect(h.component.notice?.kind).toBe('error');
      expect(h.component.notice?.text).toContain('Not uploaded');
      expect(results).toEqual([{ success: false, error: h.component.notice!.text }]);
      expect(h.component.uploading).toBeFalse();
    });

    it('is uploaded once the type has its fields', async () => {
      agentIsBack();
      await h.set('metadataInput', { ...RECORD });

      await h.component.uploadToRepository();

      expect(h.api.upload).toHaveBeenCalledTimes(1);
      expect(h.api.upload.calls.mostRecent().args[0].metadata.metadata).toEqual(RECORD.metadata);
    });
  });

  it('sends no repository with the upload: the agent writes where it is configured to (W-N)', async () => {
    h = await mountCanvas({ layout: 'default' });
    await h.set('metadataInput', RECORD);

    await h.component.uploadToRepository();

    expect(Object.keys(h.api.upload.calls.mostRecent().args[0]).sort())
      .toEqual(['check_duplicates', 'extended_text', 'metadata', 'start_workflow', 'write_extended_data']);
  });

  describe('an upload that does not answer (W-50)', () => {
    beforeEach(async () => {
      h = await mountCanvas({ layout: 'default' });
      await h.set('metadataInput', RECORD);
      h.api.upload.and.returnValue(new Promise(() => undefined));
      void h.component.uploadToRepository();
      await h.settle();
      expect(h.component.uploading).toBeTrue();
    });

    it('no longer holds the button after a reset', async () => {
      await h.set('forceReset', true);

      expect(h.component.uploading).toBeFalse();
    });

    it('a late answer from before a reset does not free the button of the upload after it', async () => {
      await h.set('forceReset', true);
      let answer!: (value: unknown) => void;
      h.api.upload.and.returnValue(new Promise(resolve => (answer = resolve)));
      void h.component.uploadToRepository(); // answers late
      await h.settle();
      await h.set('forceReset', 1);
      h.api.upload.and.returnValue(new Promise(() => undefined));
      void h.component.uploadToRepository(); // still out
      await h.settle();

      answer({ success: true, node: { nodeId: 'n1' } });
      await h.settle();

      expect(h.component.uploading).withContext('the upload after the reset is still out').toBeTrue();
    });
  });

  describe('destroyed right after the host asked for an extraction (W-N)', () => {
    beforeEach(async () => {
      h = await mountCanvas({ layout: 'default', text: 'Ein Konzert' });
      h.api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }));
    });

    it('auto-extract: no extraction starts', async () => {
      h.fixture.componentRef.setInput('autoExtract', true);
      h.fixture.destroy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(h.api.generate).not.toHaveBeenCalled();
    });

    it('plugin-extract: no extraction starts', async () => {
      h.root.dispatchEvent(new CustomEvent('plugin-extract', { detail: { text: 'Ein Konzert', inputMode: 'text' } }));
      h.fixture.destroy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(h.api.generate).not.toHaveBeenCalled();
    });

    it('auto-extract on a living element still starts one', async () => {
      await h.set('autoExtract', true);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(h.api.generate).toHaveBeenCalledTimes(1);
    });
  });
});
