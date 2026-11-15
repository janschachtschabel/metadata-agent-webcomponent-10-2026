/**
 * Several elements on one instance - one form, shown twice (audit 14.11.):
 *
 * - W-35: the "one event per import" bookkeeping lived in the element that
 *   started the import. The primary element reports for the instance; it
 *   knew nothing of an import another element had started and reported its
 *   half-built form. And "Save" in an element that is not the primary one
 *   reached nobody.
 * - W-48: an element promoted to primary did not know what its predecessor
 *   had reported, so emptying the last value of the form was not reported.
 * - W-36: an edit is reported in the same task, whichever element it is
 *   typed into.
 */
import { CanvasHarness, DEFAULT_SCHEMAS, mountCanvas, mountSibling, typeAndLeave } from '../../testing/canvas-harness';

const EVENT_RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Konzert', 'schema:startDate': '2026-05-03' } };
const PERSON_RECORD = { metadataset: 'person.json', metadata: { 'cclom:title': 'Ada', 'schema:jobTitle': 'Mathematikerin' } };

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('CanvasComponent: two elements on one instance', () => {
  let first: CanvasHarness;
  let second: CanvasHarness;
  let fromFirst: Record<string, any>[];
  let fromSecond: Record<string, any>[];

  beforeEach(async () => {
    first = await mountCanvas({ layout: 'clean' });
    second = await mountSibling(first, { layout: 'clean' });
    fromFirst = [];
    fromSecond = [];
    first.component.metadataChange.subscribe(record => fromFirst.push(record));
    second.component.metadataChange.subscribe(record => fromSecond.push(record));
  });

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  /** Longer than the 50 ms other state changes are held back for. */
  async function pause(): Promise<void> {
    await wait(120);
    await first.settle();
    await second.settle();
  }

  const titles = (records: Record<string, any>[]) => records.map(record => record['metadata']['cclom:title']);

  describe('an import started in the element that is not the primary one (W-35)', () => {
    it('is reported once, by the primary element, when it is through', async () => {
      await second.set('metadataInput', EVENT_RECORD);
      await pause();

      expect(titles(fromFirst)).toEqual(['Konzert']);
      expect(fromSecond).toEqual([]);
    });

    it('is not reported half-built while its schema is still loading', async () => {
      await first.set('metadataInput', EVENT_RECORD);
      await pause();
      // The type schema of the next record takes longer than the 50 ms.
      first.api.getSchema.and.callFake((_context: string, _version: string, file: string) =>
        file === 'person.json'
          ? wait(150).then(() => DEFAULT_SCHEMAS[file])
          : Promise.resolve(DEFAULT_SCHEMAS[file]));

      second.fixture.componentRef.setInput('metadataInput', PERSON_RECORD);
      await wait(100);
      expect(first.canvas.importRunning).withContext('still loading').toBeTrue();
      expect(titles(fromFirst)).withContext('no step of the import').toEqual(['Konzert']);

      await wait(150);
      await pause();

      expect(titles(fromFirst)).toEqual(['Konzert', 'Ada']);
      expect(fromFirst[1]['metadataset']).toBe('person.json');
      expect(fromFirst[1]['metadata']['schema:jobTitle']).toBe('Mathematikerin');
      expect(fromSecond).toEqual([]);
    });

    it('is reported also when its record is the one reported last', async () => {
      await first.set('metadataInput', EVENT_RECORD);
      await pause();

      await second.set('metadataInput', { ...EVENT_RECORD });
      await pause();

      expect(titles(fromFirst)).toEqual(['Konzert', 'Konzert']);
    });
  });

  it('"Save" reaches the host from the element it was pressed in (W-35)', async () => {
    await first.set('metadataInput', EVENT_RECORD);
    const savedFirst: Record<string, any>[] = [];
    const savedSecond: Record<string, any>[] = [];
    first.component.metadataSubmit.subscribe(record => savedFirst.push(record));
    second.component.metadataSubmit.subscribe(record => savedSecond.push(record));

    second.component.submit();

    expect(titles(savedSecond)).toEqual(['Konzert']);
    expect(savedFirst).toEqual([]);
  });

  it('an edit in either element is reported by the primary one before the blur returns (W-36)', async () => {
    await first.set('metadataInput', EVENT_RECORD);
    await pause();
    fromFirst.length = 0;

    typeAndLeave(second.control('Titel'), 'Im zweiten Element getippt');

    expect(titles(fromFirst)).toEqual(['Im zweiten Element getippt']);
    expect(fromSecond).toEqual([]);
  });

  describe('when the primary element goes away', () => {
    beforeEach(async () => {
      await first.set('metadataInput', { metadata: { 'cclom:title': 'Konzert' } });
      await pause();
      first.fixture.destroy();
    });

    it('the next one reports from then on (U-07)', async () => {
      typeAndLeave(second.control('Titel'), 'Neuer Titel');

      expect(titles(fromSecond)).toEqual(['Neuer Titel']);
    });

    // Nothing is filled any more and this element never reported: only what
    // the instance reported last says that there is something to tell.
    it('the next one reports that the last value was emptied (W-48)', async () => {
      typeAndLeave(second.control('Titel'), '');

      expect(titles(fromSecond)).toEqual([null]);
    });

    it('the next one does not repeat what was reported already', async () => {
      second.canvas.clearError(); // any state change that leaves the record alone
      await wait(120);
      await second.settle();

      expect(fromSecond).toEqual([]);
    });
  });
});
