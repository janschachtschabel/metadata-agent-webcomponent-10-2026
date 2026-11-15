import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PreviewThumbnailComponent } from './preview-thumbnail.component';
import { seriousA11yViolations } from '../../../testing/a11y';

/**
 * Audits U-13 and U-15: the preview opened by mouse only, its alt text was
 * English in a German form, and the image was requested from any host with the
 * full page address as referrer.
 */
describe('PreviewThumbnailComponent', () => {
  async function render(compact = true) {
    await TestBed.configureTestingModule({
      imports: [PreviewThumbnailComponent, TranslateModule.forRoot()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', { PREVIEW: { TITLE: 'Vorschaubild', ALT: 'Vorschaubild der Ressource' } });
    translate.use('de');
    const fixture = TestBed.createComponent(PreviewThumbnailComponent);
    fixture.componentRef.setInput('imageUrl', 'https://example.org/bild.png');
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('opens from a button that says whether it is open', async () => {
    const fixture = await render();
    const toggle = fixture.nativeElement.querySelector('button.preview-header') as HTMLButtonElement;

    expect(toggle).withContext('a real button, reachable by Tab and Enter').not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('describes the image in the current language and sends no referrer', async () => {
    const fixture = await render(false);
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;

    expect(img.alt).toBe('Vorschaubild der Ressource');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  // Audit 13.11. (W-SEC-01): preview_image_url of an imported record was
  // requested from whatever host it named.
  describe('the address of the image', () => {
    async function shown(url: unknown): Promise<HTMLImageElement | null> {
      const fixture = await render(false);
      fixture.componentRef.setInput('imageUrl', url);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('img');
    }

    // Also the host page's own origin: edu-sharing may hand in its preview as
    // a relative address, a development host runs without TLS.
    for (const url of ['data:image/png;base64,iVBORw0KGgo=', 'https://example.org/bild.png', 'HTTPS://example.org/bild.png',
      '/intern/bild.png', 'vorschau/bild.png', `${location.origin}/bild.png`]) {
      it(`loads ${url.slice(0, 24)}…`, async () => {
        expect((await shown(url))?.getAttribute('src')).toBe(url);
      });
    }

    for (const url of ['http://example.org/bild.png', '//example.org/bild.png', 'http://[kaputt/bild.png',
      'data:text/html;base64,PGI+', 'javascript:alert(1)', 'ftp://example.org/bild.png', '', null, 42]) {
      it(`does not load ${JSON.stringify(url)} and shows no preview for it`, async () => {
        const fixture = await render(false);
        fixture.componentRef.setInput('imageUrl', url);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('img')).toBeNull();
        expect(fixture.nativeElement.querySelector('.preview-thumbnail')).toBeNull();
      });
    }
  });

  it('has no serious accessibility violations', async () => {
    const fixture = await render(false);

    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
});
