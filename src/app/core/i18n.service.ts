import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { WidgetDebug } from './debug';
import { DynamicTranslateLoader } from './dynamic-translate-loader';

const STORAGE_KEY = 'metadata-agent-canvas.language';
const SUPPORTED_LANGUAGES = ['de', 'en'];
const DEFAULT_LANGUAGE = 'de';

/**
 * A language tag as one of the widget's languages: 'de-AT' and 'DE' are 'de'.
 * null for anything else - a language the widget does not speak, no value.
 */
function supported(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const lang = tag.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : null;
}

/**
 * localStorage throws (SecurityError) where storage is blocked - sandboxed or
 * third-party iframes, strict privacy settings. The language is then simply
 * not remembered; the widget must still start.
 *
 * Only the widget's own key: the name used up to 3.0.0, `app_language`, was
 * read as well until the audit of 14.11. (U-05) - a name any host page may
 * use for a setting of its own, which then set the widget's language.
 */
function readStoredLanguage(): string | null {
  try {
    return supported(localStorage.getItem(STORAGE_KEY));
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
 * Wraps ngx-translate with persistence and helper methods.
 *
 * Which language (audit 14.11., U-05), first that applies:
 * 1. what the host page set on the element (`language`),
 * 2. what the editor chose with the language switch (remembered),
 * 3. the `lang` of the page around the element,
 * 4. the browser's language,
 * 5. German.
 * One language for all widgets of a page: they share this service.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private currentLanguage$ = new BehaviorSubject<string>(DEFAULT_LANGUAGE);
  private hostLanguage: string | null = null;
  private pageLanguage: string | null = null;
  /** The widget's loader, where it is the one in use (not in specs with their own). */
  private readonly loader: DynamicTranslateLoader | null;

  get currentLang(): string {
    return this.currentLanguage$.value;
  }

  get language$() {
    return this.currentLanguage$.asObservable();
  }

  constructor(
    private translate: TranslateService
  ) {
    const loader = this.translate.currentLoader;
    this.loader = loader instanceof DynamicTranslateLoader ? loader : null;
    // The agent's texts, merged over the built-in ones, once they are there (U-04).
    this.loader?.served$.subscribe(({ lang, texts }) => this.translate.setTranslation(lang, texts));
    this.initLanguage();
  }

  private initLanguage(): void {
    // Set supported languages
    this.translate.addLangs(SUPPORTED_LANGUAGES);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);
    this.apply(this.preferredLanguage());
  }

  private preferredLanguage(): string {
    return this.hostLanguage
      ?? readStoredLanguage()
      ?? this.pageLanguage
      ?? supported(this.translate.getBrowserLang())
      ?? DEFAULT_LANGUAGE;
  }

  private apply(lang: string): void {
    this.translate.use(lang);
    // Texts of the agent that could not be loaded before are asked for again.
    this.loader?.loadServed(lang);
    if (lang !== this.currentLang) this.currentLanguage$.next(lang);
  }

  /**
   * The editor's choice (language switch): applied and remembered. It also
   * replaces what the host set until the host sets `language` again.
   */
  setLanguage(lang: string): void {
    const chosen = supported(lang) ?? DEFAULT_LANGUAGE;
    this.hostLanguage = null;
    storeLanguage(chosen);
    this.apply(chosen);
  }

  /**
   * The host page's `language` on the element: it wins over the remembered
   * choice and is not remembered itself. null (attribute removed, a language
   * the widget does not speak) hands the choice back.
   */
  setHostLanguage(lang: unknown): void {
    this.hostLanguage = supported(lang);
    this.apply(this.preferredLanguage());
  }

  /**
   * The `lang` of the page around the element, read when the element is
   * attached. It counts where neither the host nor the editor chose.
   */
  setPageLanguage(lang: unknown): void {
    this.pageLanguage = supported(lang);
    this.apply(this.preferredLanguage());
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
   * The agent's address changed (`api-url`): ask it for its texts. The texts
   * shown stay until the answer is there - the cache used to be emptied first,
   * and the interface showed raw keys for as long as the request took.
   */
  reloadTranslations(): void {
    if (WidgetDebug.enabled) console.debug(`[i18n] reloadTranslations: asking the agent for "${this.currentLang}"`);
    this.loader?.loadServed(this.currentLang);
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
