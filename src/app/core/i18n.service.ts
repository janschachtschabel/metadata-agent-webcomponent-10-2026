import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { WidgetDebug } from './debug';

const STORAGE_KEY = 'metadata-agent-canvas.language';
/** Name used up to 3.0.0; host pages may use it for their own setting (S-2). */
const LEGACY_STORAGE_KEY = 'app_language';
const SUPPORTED_LANGUAGES = ['de', 'en'];
const DEFAULT_LANGUAGE = 'de';

/**
 * localStorage throws (SecurityError) where storage is blocked - sandboxed or
 * third-party iframes, strict privacy settings. The language is then simply
 * not remembered; the widget must still start.
 */
function readStoredLanguage(): string | null {
  try {
    // The old name only until the widget stored under its own; never removed,
    // it may be the host page's.
    return localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not remembered across visits - nothing else depends on it
  }
}

/**
 * i18n Service - Language Management
 * Wraps ngx-translate with persistence and helper methods
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private currentLanguage$ = new BehaviorSubject<string>(DEFAULT_LANGUAGE);
  
  get currentLang(): string {
    return this.currentLanguage$.value;
  }

  get language$() {
    return this.currentLanguage$.asObservable();
  }

  constructor(
    private translate: TranslateService
  ) {
    this.initLanguage();
  }

  private initLanguage(): void {
    // Set supported languages
    this.translate.addLangs(SUPPORTED_LANGUAGES);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);

    // Try to restore from localStorage
    const savedLang = readStoredLanguage();
    if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang)) {
      this.setLanguage(savedLang);
      return;
    }

    // Try browser language
    const browserLang = this.translate.getBrowserLang();
    if (browserLang && SUPPORTED_LANGUAGES.includes(browserLang)) {
      this.setLanguage(browserLang);
      return;
    }

    // Fallback to default
    this.setLanguage(DEFAULT_LANGUAGE);
  }

  setLanguage(lang: string): void {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      lang = DEFAULT_LANGUAGE;
    }
    
    this.translate.use(lang);
    this.currentLanguage$.next(lang);
    storeLanguage(lang);
  }

  /**
   * Get instant translation (synchronous)
   */
  instant(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  /**
   * Get available languages
   */
  getLanguages(): string[] {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Force reload translations (e.g. after api-url becomes available).
   * Clears ngx-translate cache so DynamicTranslateLoader re-fetches from the API.
   *
   * Uses resetLang() + use() instead of reloadLang() because reloadLang()
   * is unreliable in some ngx-translate versions and may silently keep
   * the cached (possibly empty) translations.
   */
  reloadTranslations(): void {
    const lang = this.translate.getCurrentLang() || this.translate.getFallbackLang() || DEFAULT_LANGUAGE;
    if (WidgetDebug.enabled) console.debug(`[i18n] reloadTranslations: resetting "${lang}" cache and re-fetching...`);
    // Reset ALL cached languages so none keep stale data
    for (const l of SUPPORTED_LANGUAGES) {
      this.translate.resetLang(l);
    }
    // Re-fetch and activate current language (triggers DynamicTranslateLoader.getTranslation)
    this.translate.use(lang).subscribe({
      next: () => { if (WidgetDebug.enabled) console.debug(`[i18n] reloadTranslations: "${lang}" re-loaded successfully`); },
      error: (err) => { if (WidgetDebug.enabled) console.warn(`[i18n] reloadTranslations: "${lang}" failed`, err); },
    });
  }

  /**
   * Toggle between languages
   */
  toggleLanguage(): void {
    const current = this.currentLang;
    const next = current === 'de' ? 'en' : 'de';
    this.setLanguage(next);
  }

}
