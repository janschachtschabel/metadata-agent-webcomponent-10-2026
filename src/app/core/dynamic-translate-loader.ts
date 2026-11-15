import { HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { WidgetDebug } from './debug';
import { getInitialApiUrl, normalizeApiUrl } from './api-url';
import { WIDGET_VERSION } from '../version';
import de from '../../assets/i18n/de.json';
import en from '../../assets/i18n/en.json';

export type Texts = TranslationObject;

/**
 * The widget's texts, part of the bundle (audit 14.11., U-04). They were
 * loaded from the agent only: when that failed - a wrong address, a proxy, a
 * timeout - the whole interface showed raw keys ("INPUT.START_EXTRACTION")
 * and stayed that way until the page was loaded again.
 */
const BUILT_IN: Record<string, Texts> = { de, en };

function builtIn(lang: string): Texts {
  return BUILT_IN[lang] ?? BUILT_IN['de'];
}

function isRecord(value: unknown): value is Texts {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** `served` over `base`, section by section: a text the agent does not serve keeps the built-in one. */
function merged(base: Texts, served: Texts): Texts {
  const result: Texts = { ...base };
  for (const [key, value] of Object.entries(served)) {
    const own = result[key];
    result[key] = isRecord(own) && isRecord(value) ? merged(own, value) : value;
  }
  return result;
}

/**
 * The agent's translation endpoint, versioned. The agent lets browsers cache
 * the file for an hour; the version makes a new bundle fetch its own texts
 * instead of meeting the previous ones and showing new keys raw.
 */
function agentI18nPath(lang: string): string {
  return `/widget/i18n/${lang}.json?v=${WIDGET_VERSION}`;
}

/** An extension page has no agent at its own origin; without an address there is nothing to ask. */
function isExtensionPage(): boolean {
  return typeof window !== 'undefined'
    && (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'moz-extension:');
}

/**
 * TranslateLoader of the widget: the built-in texts at once (getTranslation),
 * the agent's texts merged over them when they arrive (loadServed, served$).
 *
 * The agent is asked at the address from runtime configuration, the origin
 * the bundle was served from, or the same origin (see getInitialApiUrl), and
 * again at the `api-url` the host sets later. Nothing else is requested - in
 * particular not `./assets/i18n/` of the host page, which is the host's path
 * and not ours.
 *
 * Usage (called from CanvasComponent.apiUrl setter):
 *   DynamicTranslateLoader.setApiUrl('https://my-api.example.com');
 */
export class DynamicTranslateLoader implements TranslateLoader {
  static apiUrl: string = getInitialApiUrl();

  /** Call this instead of setting apiUrl directly. */
  static setApiUrl(url: string): void {
    DynamicTranslateLoader.apiUrl = normalizeApiUrl(url);
  }

  /**
   * The agent's texts over the built-in ones, as they arrive. ngx-translate
   * takes one answer per language from a loader, and that one must not wait
   * for the network: I18nService hands these on (setTranslation).
   */
  readonly served$ = new Subject<{ lang: string; texts: Texts }>();

  /** The texts of a language as far as they are known: built-in, or with the agent's. */
  private readonly texts = new Map<string, Texts>();
  /** Per language, the address its served texts came from. */
  private readonly servedFrom = new Map<string, string>();
  private readonly pending = new Set<string>();

  constructor(private http: HttpClient) {}

  /** The texts as far as they are known. Asks nobody: I18nService calls loadServed whenever a language is used. */
  getTranslation(lang: string): Observable<Texts> {
    return of(this.texts.get(lang) ?? builtIn(lang));
  }

  /**
   * Asks the agent for the texts of `lang`, unless they came from its current
   * address already. A failure leaves the built-in texts in place and is not
   * final: the next use of the language asks again.
   */
  loadServed(lang: string): void {
    const apiUrl = DynamicTranslateLoader.apiUrl;
    const request = `${lang} ${apiUrl}`;
    if (this.servedFrom.get(lang) === apiUrl || this.pending.has(request)) return;
    if (!apiUrl && isExtensionPage()) return;

    const url = `${apiUrl}${agentI18nPath(lang)}`;
    if (WidgetDebug.enabled) console.debug(`[i18n] Loading ${lang} from ${url}`);
    this.pending.add(request);
    this.http.get(url).subscribe({
      next: served => {
        this.pending.delete(request);
        // A 200 from something that is not the agent (a login page as JSON, a list).
        if (!isRecord(served)) return;
        const texts = merged(builtIn(lang), served);
        this.servedFrom.set(lang, apiUrl);
        this.texts.set(lang, texts);
        this.served$.next({ lang, texts });
      },
      error: err => {
        this.pending.delete(request);
        if (WidgetDebug.enabled) console.warn(`[i18n] ✗ Failed: ${url} (${err?.status}); the built-in texts stay`);
      },
    });
  }
}
