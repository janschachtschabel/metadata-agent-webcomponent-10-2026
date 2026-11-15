/**
 * When the host hears of a change (audit 14.11.):
 *
 * - W-36: a typed value is taken when the field is left, and the event came
 *   50 ms after that - a host that saves on its own button, or closes its
 *   dialog, read the record too early. An event still waiting for those 50 ms
 *   was dropped when an import started.
 * - W-49: every state change serialised the whole record for the comparison,
 *   the screenshot (base64) included.
 */
import { CanvasHarness, generated, mountCanvas, typeAndLeave } from '../../testing/canvas-harness';

const RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert', 'schema:startDate': '2026-05-03' } };

describe('CanvasComponent: when a change is reported', () => {
  let h: CanvasHarness;
  let events: Record<string, any>[];

  beforeEach(async () => {
    // The 50 ms pass on jasmine's clock, not on the wall clock (audit 14.11., U-16).
    jasmine.clock().install();
    h = await mountCanvas({ layout: 'clean' });
    events = [];
    h.component.metadataChange.subscribe(record => events.push(record));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.removeItem('metadata-agent-canvas.language');
  });

  /** What is pending finishes (and holds its event back); then longer than the 50 ms it is held back for. */
  async function pause(): Promise<void> {
    await h.settle();
    jasmine.clock().tick(120);
    await h.settle();
  }

  const titles = () => events.map(record => record['metadata']['cclom:title']);

  describe('an edit (W-36)', () => {
    beforeEach(async () => {
      await h.set('metadataInput', RECORD);
      await pause();
      events.length = 0;
    });

    it('is reported before the blur handler returns', () => {
      typeAndLeave(h.control('Titel'), 'Neuer Titel');

      expect(titles()).toEqual(['Neuer Titel']);
    });

    it('is reported once: nothing follows after the 50 ms', async () => {
      typeAndLeave(h.control('Titel'), 'Neuer Titel');
      await pause();

      expect(titles()).toEqual(['Neuer Titel']);
    });

    it('an emptied field is reported at once as well', () => {
      typeAndLeave(h.control('Titel'), '');

      expect(titles()).toEqual([null]);
    });

    it('leaving a field unchanged reports nothing', async () => {
      typeAndLeave(h.control('Titel'), 'Konzert');
      await pause();

      expect(events).toEqual([]);
    });

    it('the record a host reads in its handler is the one of the event', () => {
      let read: unknown;
      h.component.metadataChange.subscribe(() => (read = h.canvas.getMetadataForExport()['metadata']['cclom:title']));

      typeAndLeave(h.control('Titel'), 'Neuer Titel');

      expect(read).toBe('Neuer Titel');
    });
  });

  it('other state changes still wait 50 ms and are reported together', async () => {
    await h.set('metadataInput', RECORD);
    await pause();
    events.length = 0;

    h.canvas.setPreviewImage('https://example.org/a.png');
    h.canvas.setPreviewImage('https://example.org/b.png');
    expect(events).withContext('held back').toEqual([]);
    await pause();

    expect(events.map(record => record['preview_image_url'])).toEqual(['https://example.org/b.png']);
  });

  // The extraction has just ended; its result waits for the 50 ms. The host
  // (the Prüftisch moving on) hands in the next record within that time.
  it('reports what was waiting before an import starts (W-36)', async () => {
    h.api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Ergebnis der Erschließung' }));
    let handedIn = false;
    h.canvas.state$.subscribe(state => {
      const ended = !state.isExtracting && state.coreFields.some(field => field.value === 'Ergebnis der Erschließung');
      if (ended && !handedIn) {
        handedIn = true;
        h.fixture.componentRef.setInput('metadataInput', RECORD);
      }
    });

    await h.canvas.startExtraction('Ein Text');
    await pause();

    expect(titles()).toEqual(['Ergebnis der Erschließung', 'Konzert']);
  });

  describe('the comparison with the record reported last (W-49)', () => {
    const SCREENSHOT = `data:image/png;base64,${'A'.repeat(200_000)}`;

    beforeEach(async () => {
      await h.set('metadataInput', RECORD);
      await pause();
      events.length = 0;
    });

    it('does not keep the screenshot', async () => {
      h.canvas.setPreviewImage(SCREENSHOT);
      await pause();

      expect(events.length).toBe(1);
      expect(events[0]['preview_image_url']).withContext('the event carries the image').toBe(SCREENSHOT);
      expect(h.canvas.reportedRecord!.length).toBeLessThan(2000);
    });

    it('still reports another image and the removal of the image', async () => {
      h.canvas.setPreviewImage(SCREENSHOT);
      await pause();
      h.canvas.setPreviewImage(`data:image/png;base64,${'B'.repeat(150_000)}`);
      await pause();
      h.canvas.setPreviewImage('');
      await pause();

      expect(events.map(record => (record['preview_image_url'] || '').length)).toEqual([SCREENSHOT.length, 150_022, 0]);
    });

    it('reports nothing when the same image is set again', async () => {
      h.canvas.setPreviewImage(SCREENSHOT);
      await pause();
      h.canvas.setPreviewImage(`${SCREENSHOT}`);
      await pause();

      expect(events.length).toBe(1);
    });
  });
});
