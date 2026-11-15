/**
 * Audit 14.11. (W-34, W-39), from the host's side: what is no record is
 * refused with the message the widget already has for it - on both ways in,
 * `metadata-input` and the JSON file - and the form stays as it was. It used
 * to be imported key by key ("0", "1", …) over the form.
 */
import { CanvasHarness, EVENT_URI, mountCanvas } from '../../testing/canvas-harness';

const RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert', 'schema:startDate': '2026-05-03' } };

describe('CanvasComponent: an import that is no record', () => {
  let h: CanvasHarness;
  let events: Record<string, any>[];

  beforeEach(async () => {
    h = await mountCanvas({ layout: 'clean' });
    await h.set('metadataInput', RECORD);
    await new Promise(resolve => setTimeout(resolve, 120));
    events = [];
    h.component.metadataChange.subscribe(record => events.push(record));
    spyOn(console, 'error');
  });

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function expectFormUntouched(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 120));
    await h.settle();
    expect(h.control('Titel').value).toBe('Konzert');
    expect(h.canvas.getMetadataForExport()['metadata']).toEqual(RECORD.metadata);
    expect(h.canvas.getCurrentState().selectedContentType).toBe('event.json');
    expect(events).withContext('nothing to report').toEqual([]);
  }

  for (const input of [{ metadata: 'text' }, { metadata: ['a', 'b'] }, { metadata: 42 }, ['a', 'b'], '["a","b"]', '{"metadata":"text"}']) {
    it(`metadata-input ${JSON.stringify(input)} is refused with the message for an invalid metadata-input`, async () => {
      await h.set('metadataInput', input);

      expect(h.component.notice?.kind).toBe('error');
      expect(h.component.notice?.text).toBe('metadata-input is not a JSON object.');
      await expectFormUntouched();
    });
  }

  for (const content of [['a', 'b'], 'abc', 42, null, { metadata: 'text' }, { metadata: [] }]) {
    it(`a JSON file holding ${JSON.stringify(content)} is refused with the message for an unreadable file`, async () => {
      await h.component.onJsonLoaded(content);

      expect(h.component.notice?.kind).toBe('error');
      expect(h.component.notice?.text).toBe('ALERTS.JSON_LOAD_ERROR');
      await expectFormUntouched();
    });
  }

  it('a record is still imported from a JSON file, flat or nested', async () => {
    await h.component.onJsonLoaded({ 'cclom:title': 'Aus der Datei', contextName: 'default', exportedAt: '2026-01-01T00:00:00Z' });
    await h.settle();

    expect(h.component.notice).toBeNull();
    expect(h.control('Titel').value).toBe('Aus der Datei');
    expect(h.canvas.getMetadataForExport()['metadata']).toEqual({ 'cclom:title': 'Aus der Datei' });
  });

  // The README integration: { ...JSON.parse(extendedData || '{}'), contentType }.
  it('metadata-input with the type inside the record builds the form of that type (W-39)', async () => {
    await h.set('metadataInput', { 'cclom:title': 'Lesung', contentType: EVENT_URI });
    await new Promise(resolve => setTimeout(resolve, 120));

    expect(h.canvas.getCurrentState().selectedContentType).toBe('event.json');
    expect(h.control('Beginn')).toBeTruthy();
    expect(events.length).toBe(1);
    expect(events[0]['metadataset']).toBe('event.json');
    expect(events[0]['metadata']).withContext('contentType is no field').toEqual({ 'cclom:title': 'Lesung' });
  });
});
