/**
 * Audit 14.11. (W-33): a failed extraction stayed behind as the "source" of
 * the form. Its text went along with the next attempt as `_source_text`, which
 * made that attempt a correction round - and a correction round builds no
 * core fields. After a first run that failed at core.json the second one
 * "succeeded" with a form, an export and an upload without title.
 */
import { ServiceHarness, answered, buildService, coreSchema } from '../testing/service-harness';

const SCHEMAS: Record<string, unknown> = {
  'core.json': coreSchema({ 'http://w3id.org/event': 'event.json', 'http://w3id.org/course': 'course.json' }),
  'event.json': { fields: [{ id: 'ccm:price', label: { de: 'Preis' }, system: { datatype: 'string' } }], groups: [] },
  'course.json': { fields: [{ id: 'schema:courseCode', label: { de: 'Kursnummer' }, system: { datatype: 'string' } }], groups: [] },
};
const CONCERT = answered('event.json', { 'cclom:title': 'Konzert', 'ccm:price': '5' },
  { _origins: { 'cclom:title': 'ai', 'ccm:price': 'ai' }, _source_text: 'Ein Konzert' });

describe('CanvasService: trying again after a failed extraction (W-33)', () => {
  let h: ServiceHarness;

  beforeEach(() => {
    h = buildService(SCHEMAS);
    h.api.generate.and.resolveTo(CONCERT);
  });

  it('the retry after a failed core schema is a first run with all its fields', async () => {
    const core = SCHEMAS['core.json'];
    let coreDown = true;
    h.api.getSchema.and.callFake((_c: string, _v: string, file: string) =>
      coreDown && file === 'core.json' ? Promise.reject(new Error('down')) : Promise.resolve(file === 'core.json' ? core : SCHEMAS[file]));

    expect(await h.service.startExtraction('Ein Konzert')).toBeFalse();
    expect(h.service.getCurrentState().extractionError).toBeTruthy();
    expect(h.service.getCurrentState().userText).withContext('no source left behind').toBe('');

    coreDown = false;
    expect(await h.service.startExtraction('Ein Konzert')).toBeTrue();

    const request = h.api.generate.calls.mostRecent().args[0];
    expect(request.existing_metadata).withContext('a first run, no correction round').toBeUndefined();
    expect(request.text).toBe('Ein Konzert');
    expect(h.field('cclom:title').value).toBe('Konzert');
    expect(h.exported()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5' });
    expect(h.uploaded()).toEqual({ 'cclom:title': 'Konzert', 'ccm:price': '5' });
  });

  it('the retry after a failed request sends no source text of the failed one', async () => {
    h.api.generate.and.returnValues(Promise.reject({ status: 503 }), Promise.resolve(CONCERT));

    await h.service.startExtraction('Ein Konzert');
    await h.service.startExtraction('Ein Konzert');

    expect(h.api.generate.calls.mostRecent().args[0].existing_metadata).toBeUndefined();
    expect(h.field('cclom:title').value).toBe('Konzert');
  });

  it('a failed correction round leaves the source text of the form as it was', async () => {
    await h.service.startExtraction('Ein Konzert');
    h.api.generate.and.rejectWith({ status: 503 });

    await h.service.startExtraction('Bitte den Titel kürzen');

    expect(h.service.getCurrentState().userText).toBe('Ein Konzert');
    expect(h.field('cclom:title').value).withContext('the form stays').toBe('Konzert');
  });

  it('a type choice after a failed correction round runs the source again, not the instruction', async () => {
    await h.service.startExtraction('Ein Konzert');
    h.api.generate.and.rejectWith({ status: 503 });
    await h.service.startExtraction('Bitte den Titel kürzen');
    h.api.generate.and.resolveTo(CONCERT);
    h.api.generate.calls.reset();

    await h.service.selectContentType('course.json');

    expect(h.api.generate.calls.mostRecent().args[0].text).toBe('Ein Konzert');
    expect(h.api.generate.calls.mostRecent().args[0].schema_file).toBe('course.json');
  });

  // "Abbrechen" (K-23) ends a run like a failure does, only without a message:
  // the text of the cancelled run is no source of the form either.
  describe('after the editor cancelled the run', () => {
    /** Like HttpClient: out until it is aborted, then it fails. */
    const untilAborted = (_request: unknown, abort: AbortSignal) =>
      new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('request aborted'))));

    it('a cancelled first run leaves no source text behind', async () => {
      h.api.generate.and.callFake(untilAborted);
      const cancelled = h.service.startExtraction('Ein Konzert');
      await Promise.resolve();
      expect(h.service.getCurrentState().isExtracting).toBeTrue();

      h.service.cancelExtraction();

      expect(h.service.getCurrentState().userText).withContext('at once, not when the request has failed').toBe('');
      expect(await cancelled).toBeFalse();
      expect(h.service.getCurrentState().userText).toBe('');
      expect(h.service.getCurrentState().extractionError).toBeNull();
      expect(h.service.getMetadataForRepository()['_source_text']).toBeUndefined();
    });

    it('a cancelled correction round leaves the source text of the form as it was', async () => {
      await h.service.startExtraction('Ein Konzert');
      h.api.generate.and.callFake(untilAborted);
      const cancelled = h.service.startExtraction('Bitte den Titel kürzen');
      await Promise.resolve();

      h.service.cancelExtraction();
      await cancelled;

      expect(h.service.getCurrentState().userText).toBe('Ein Konzert');
      expect(h.field('cclom:title').value).withContext('the form stays').toBe('Konzert');
    });

    it('a type choice after a cancelled URL run does not run that URL again', async () => {
      await h.service.startExtraction('Ein Konzert');
      h.api.generate.and.callFake(untilAborted);
      const cancelled = h.service.startUrlExtraction('https://example.org/anderes');
      await Promise.resolve();
      h.service.cancelExtraction();
      await cancelled;
      h.api.generate.and.resolveTo(CONCERT);
      h.api.generate.calls.reset();

      await h.service.selectContentType('course.json');

      const request = h.api.generate.calls.mostRecent().args[0];
      expect(request.source_url).toBeUndefined();
      expect(request.text).toBe('Ein Konzert');
      expect(request.schema_file).toBe('course.json');
    });

    it('a type choice after a cancelled correction round runs the source again, not the instruction', async () => {
      await h.service.startExtraction('Ein Konzert');
      h.api.generate.and.callFake(untilAborted);
      const cancelled = h.service.startExtraction('Bitte den Titel kürzen');
      await Promise.resolve();
      h.service.cancelExtraction();
      await cancelled;
      h.api.generate.and.resolveTo(CONCERT);
      h.api.generate.calls.reset();

      await h.service.selectContentType('course.json');

      expect(h.api.generate.calls.mostRecent().args[0].text).toBe('Ein Konzert');
    });
  });

  // The core schema failed while a record with a type was imported: the form
  // has the type's fields only. The next run builds the missing core fields
  // and keeps the values that are there.
  it('builds missing core fields for a run on a form that has values', async () => {
    const core = SCHEMAS['core.json'];
    let coreDown = true;
    h.api.getSchema.and.callFake((_c: string, _v: string, file: string) =>
      coreDown && file === 'core.json' ? Promise.reject(new Error('down')) : Promise.resolve(file === 'core.json' ? core : SCHEMAS[file]));
    await h.service.importJsonData({ metadataset: 'event.json', metadata: { 'ccm:price': '7' }, _origins: { 'ccm:price': 'user' } });
    expect(h.fields().map(f => f.fieldId)).toEqual(['ccm:price']);

    coreDown = false;
    await h.service.startExtraction('Ein Konzert');

    expect(h.api.generate.calls.mostRecent().args[0].existing_metadata['ccm:price']).toBe('7');
    expect(h.fields().map(f => f.fieldId)).toEqual(['cclom:title', 'ccm:price']);
    expect(h.field('cclom:title').value).toBe('Konzert');
  });
});
