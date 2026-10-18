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

  it('has no serious accessibility violations', async () => {
    const fixture = await render(false);

    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
});
