/**
 * Audit 13.11. (W-LOG-01): a typed value reached the state 200 ms after the
 * field was left, while submit, upload and download read the state at the
 * click. Change the title and click "Hochladen" at once: the upload carried
 * the old title.
 */
import { CanvasHarness, mountCanvas, typeAndLeave } from '../../testing/canvas-harness';

describe('CanvasComponent: type, then act at once (W-LOG-01)', () => {
  let h: CanvasHarness;

  async function mount(layout: string): Promise<void> {
    h = await mountCanvas({ layout, showUploadButton: true, showSaveButton: true });
    await h.set('metadataInput', { metadata: { 'cclom:title': 'Alter Titel' } });
  }

  function button(icon: string, text = ''): HTMLButtonElement {
    const found = Array.from(h.root.querySelectorAll('button'))
      .find(b => b.querySelector('mat-icon')?.textContent?.trim() === icon && b.textContent!.includes(text));
    if (!found) throw new Error(`no button "${icon}"`);
    return found as HTMLButtonElement;
  }

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('submit carries the title typed just before the click', async () => {
    await mount('plugin');
    const submitted: Record<string, any>[] = [];
    h.component.metadataSubmit.subscribe(value => submitted.push(value));

    typeAndLeave(h.control('Titel'), 'Neuer Titel');
    button('cloud_upload', 'CONTROLS.SUBMIT').click();

    expect(submitted.length).toBe(1);
    expect(submitted[0]['metadata']['cclom:title']).toBe('Neuer Titel');
  });

  it('the upload carries the title typed just before the click', async () => {
    await mount('plugin');

    typeAndLeave(h.control('Titel'), 'Neuer Titel');
    button('cloud_upload', 'CONTROLS.UPLOAD').click();
    await h.settle();

    expect(h.api.upload).toHaveBeenCalledTimes(1);
    expect(h.api.upload.calls.mostRecent().args[0].metadata.metadata['cclom:title']).toBe('Neuer Titel');
  });

  it('the JSON download carries the title typed just before the click', async () => {
    await mount('default');
    let blob!: Blob;
    spyOn(URL, 'createObjectURL').and.callFake((data: Blob | MediaSource) => { blob = data as Blob; return 'blob:test'; });
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click'); // no real download in the test browser

    typeAndLeave(h.control('Titel'), 'Neuer Titel');
    button('save').click();

    expect(JSON.parse(await blob.text())['metadata']['cclom:title']).toBe('Neuer Titel');
  });
});
