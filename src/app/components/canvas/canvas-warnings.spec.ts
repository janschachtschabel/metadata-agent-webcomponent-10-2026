/**
 * What the agent warns about after an extraction (`processing.warnings`) -
 * a text cut to 150,000 characters, places left without coordinates - was not
 * shown anywhere. It now appears in the warning banner every layout has, and
 * is read out with the end of the extraction.
 */
import { CanvasHarness, generated, mountCanvas } from '../../testing/canvas-harness';

const LAYOUTS = ['default', 'plugin', 'dialog', 'detail', 'clean', 'prueftisch', 'prueftisch-org'];
const WARNING = 'Orte bleiben ohne Koordinaten: Stadthalle Weimar';

describe('CanvasComponent: warnings of the agent', () => {
  let h: CanvasHarness;

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function extracted(layout: string, warnings: string[]): Promise<void> {
    h = await mountCanvas({ layout });
    h.api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }, { warnings }));
    await h.canvas.startExtraction('Ein Konzert in der Stadthalle Weimar');
    await h.settle();
  }

  for (const layout of LAYOUTS) {
    it(`${layout} layout shows them as a warning, not as an error`, async () => {
      await extracted(layout, [WARNING]);

      expect(h.root.querySelector('.extraction-warning')?.textContent).toContain(WARNING);
      expect(h.root.querySelector('.extraction-error')).toBeNull();
    });
  }

  it('reads them out with the end of the extraction', async () => {
    await extracted('default', [WARNING]);

    // The canvas's own live region, a direct child of the element.
    expect(h.root.querySelector(':scope > [role="status"][aria-live="polite"]')?.textContent).toContain(WARNING);
  });

  it('shows no banner without warnings', async () => {
    await extracted('default', []);

    expect(h.root.querySelector('.extraction-warning')).toBeNull();
  });
});
