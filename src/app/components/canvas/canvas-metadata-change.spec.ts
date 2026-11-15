/**
 * Audit 13.11. (W-LOG-06): `metadataChange` fired on every change of the
 * state - with an empty record at the start, for every step of an import and
 * for changes that leave the record as it is. edu-sharing writes each event's
 * detail into its form field: the empty record at the start replaced the
 * stored one.
 *
 * Now: one event when the record differs from the one reported last (the
 * export time aside), none before the form holds anything, and one for every
 * finished import.
 */
import { CanvasHarness, CORE_SCHEMA, EVENT_SCHEMA, mountCanvas, typeAndLeave } from '../../testing/canvas-harness';

describe('CanvasComponent metadataChange (W-LOG-06)', () => {
  let h: CanvasHarness;
  let events: Record<string, any>[];

  const RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert', 'schema:startDate': '2026-05-03' } };

  // The 50 ms the events are held back for pass on jasmine's clock, not on
  // the wall clock (audit 14.11., U-16): a slow machine cannot turn "no event
  // yet" into "no event".
  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  /** What is pending finishes (and holds its event back); then longer than the 50 ms it is held back for. */
  async function pause(): Promise<void> {
    await h.settle();
    jasmine.clock().tick(120);
    await h.settle();
  }

  async function mount(inputs: Record<string, unknown> = {}, schemas?: Record<string, unknown>): Promise<void> {
    h = await mountCanvas(inputs, schemas);
    events = [];
    h.component.metadataChange.subscribe(value => events.push(value));
  }

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('reports nothing at the start', async () => {
    await mount();

    await pause();

    expect(events).toEqual([]);
  });

  it('reports nothing for a type the host sets on the empty form', async () => {
    await mount();

    await h.set('contentType', 'event.json');
    await pause();

    expect(h.canvas.getCurrentState().selectedContentType).toBe('event.json');
    expect(events).toEqual([]);
  });

  it('reports a finished import once, with the imported record', async () => {
    await mount();

    await h.set('metadataInput', RECORD);
    await pause();

    expect(events.length).toBe(1);
    expect(events[0]['metadataset']).toBe('event.json');
    expect(events[0]['metadata']['cclom:title']).toBe('Konzert');
    expect(events[0]['metadata']['schema:startDate']).toBe('2026-05-03');
  });

  it('reports no half-built record while an import waits for its schema', async () => {
    let answerEvent!: (schema: unknown) => void;
    const slow = new Promise(resolve => (answerEvent = resolve));
    await mount({}, { 'core.json': CORE_SCHEMA, 'event.json': slow });

    await h.set('metadataInput', RECORD);
    await pause();
    expect(events).withContext('core fields are there, the type\'s are not').toEqual([]);

    answerEvent(EVENT_SCHEMA);
    await pause();
    expect(events.length).toBe(1);
    expect(events[0]['metadata']['schema:startDate']).toBe('2026-05-03');
  });

  it('reports the import of an empty record, too', async () => {
    await mount();

    await h.set('metadataInput', { metadataset: 'event.json', metadata: {} });
    await pause();

    expect(events.length).toBe(1);
  });

  it('reports the same record again when the host imports it again', async () => {
    await mount();
    await h.set('metadataInput', RECORD);
    await pause();

    await h.set('metadataInput', { ...RECORD });
    await pause();

    expect(events.length).toBe(2);
  });

  it('reports every change of a field once', async () => {
    await mount();
    await h.set('metadataInput', RECORD);
    await pause();
    events.length = 0;

    typeAndLeave(h.control('Titel'), 'Sommerkonzert');
    await pause();
    expect(events.map(e => e['metadata']['cclom:title'])).toEqual(['Sommerkonzert']);

    typeAndLeave(h.control('Titel'), '');
    await pause();
    expect(events.map(e => e['metadata']['cclom:title'])).toEqual(['Sommerkonzert', null]);
  });

  it('reports nothing when the state changes and the record does not', async () => {
    await mount();
    await h.set('metadataInput', RECORD);
    await pause();
    events.length = 0;

    h.canvas.setError('Nur ein Hinweis');
    await pause();
    h.canvas.clearError();
    h.canvas.setScreenshotEnabled(false);
    await pause();

    expect(events).toEqual([]);
  });

  it('reports the empty record after a reset', async () => {
    await mount();
    await h.set('metadataInput', RECORD);
    await pause();
    events.length = 0;

    await h.set('forceReset', true);
    await pause();

    expect(events.length).toBe(1);
    expect(events[0]['metadata']).toEqual({});
  });

  it('reports the result of an extraction once, not its steps', async () => {
    await mount();
    let answer!: (response: unknown) => void;
    h.api.generate.and.returnValue(new Promise(resolve => (answer = resolve)));

    void h.canvas.startExtraction('Ein Konzert im Mai');
    await pause();
    expect(events).toEqual([]);

    answer({ metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert' }, processing: { success: true, status: 'success' } });
    await pause();
    expect(events.length).toBe(1);
    expect(events[0]['metadata']['cclom:title']).toBe('Konzert');
  });
});
