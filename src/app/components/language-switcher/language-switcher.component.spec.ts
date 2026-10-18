import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { LanguageSwitcherComponent } from './language-switcher.component';
import { I18nService } from '../../core/i18n.service';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * Audit U-16: the button was named "DE" or "EN" and nothing else; a screen
 * reader did not learn that it switches the language. The tooltip is no name.
 */
describe('LanguageSwitcherComponent', () => {
  // I18nService remembers the choice; it must not leak into other specs.
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function render(lang: 'de' | 'en') {
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent, TranslateModule.forRoot(), NoopAnimationsModule],
    }).compileComponents();
    TestBed.inject(TranslateService).setTranslation(lang, {
      LANGUAGE: { SWITCH_TO_ENGLISH: 'Switch to English', SWITCH_TO_GERMAN: 'Zu Deutsch wechseln' },
    });
    TestBed.inject(I18nService).setLanguage(lang);
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('is named after what it does, starting with its visible label', async () => {
    const fixture = await render('de');
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    // WCAG 2.5.3: the accessible name contains the visible text "DE".
    expect(button.getAttribute('aria-label')).toBe('DE – Switch to English');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });

  it('names the switch back to German in English', async () => {
    const fixture = await render('en');
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('EN – Zu Deutsch wechseln');
  });
});
