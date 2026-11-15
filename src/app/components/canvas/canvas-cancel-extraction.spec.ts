/**
 * Audit 14.11. (K-23, U-03): "Abbrechen" in the progress line stops the run -
 * from the button in the layout to the aborted request.
 */
import { CanvasHarness, mountCanvas } from '../../testing/canvas-harness';

for (const layout of ['default', 'clean', 'prueftisch']) {
  describe(`CanvasComponent (${layout}): cancelling a running extraction`, () => {
    let h: CanvasHarness;
    let signal: AbortSignal | undefined;

    beforeEach(async () => {
      h = await mountCanvas({ layout });
      // Like HttpClient: out until it is aborted, then it fails.
      h.api.generate.and.callFake((_request: unknown, abort: AbortSignal) => {
        signal = abort;
        return new Promise((_resolve, reject) =>
          abort.addEventListener('abort', () => reject(new Error('request aborted'))));
      });
      await h.set('metadataInput', { metadata: { 'cclom:title': 'Alter Titel' } });
      h.component.userText = 'Ein Text über Bruchrechnung';
      h.component.startExtraction();
      await h.settle();
    });

    afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

    it('shows the progress line while the request is out', () => {
      expect(signal?.aborted).toBeFalse();
      expect(h.root.querySelector('[role="progressbar"]')).not.toBeNull();
    });

    it('aborts the request, shows no error and keeps the form', async () => {
      (h.root.querySelector('app-extraction-feedback .btn-cancel') as HTMLButtonElement).click();
      await h.settle();

      expect(signal?.aborted).toBeTrue();
      expect(h.root.querySelector('app-extraction-feedback [role="progressbar"]')).toBeNull();
      expect(h.root.querySelector('.extraction-error')).toBeNull();
      expect(h.control('Titel').value).toBe('Alter Titel');
    });

    // W-33 for a cancelled run: its text is no source of the form.
    it('uploads the form without the text of the cancelled run', async () => {
      (h.root.querySelector('app-extraction-feedback .btn-cancel') as HTMLButtonElement).click();
      await h.settle();

      await h.component.uploadToRepository();

      const request = h.api.upload.calls.mostRecent().args[0];
      expect(request.extended_text).toBeUndefined();
      expect(request.metadata['_source_text']).toBeUndefined();
      expect(request.metadata.metadata['cclom:title']).toBe('Alter Titel');
    });
  });
}
