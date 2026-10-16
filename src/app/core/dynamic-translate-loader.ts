import { HttpClient } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { WidgetDebug } from './debug';
import { getInitialApiUrl, normalizeApiUrl } from './api-url';
import { WIDGET_VERSION } from '../version';

/**
 * The agent's translation endpoint, versioned. The agent lets browsers cache
 * the file for an hour; the version makes a new bundle fetch its own texts
 * instead of meeting the previous ones and showing new keys raw.
 */
function agentI18nPath(lang: string): string {
  return `/widget/i18n/${lang}.json?v=${WIDGET_VERSION}`;
}

/**
 * Custom TranslateLoader that loads i18n files from the API.
 *
 * The first request uses runtime configuration, the origin the widget bundle
 * was served from, or a same-origin URL (see getInitialApiUrl). If an api-url
 * input arrives after bootstrap, CanvasComponent reloads translations from the
 * explicitly configured endpoint.
 *
 * In local-dev mode (ng serve) the local ./assets/i18n/ files are tried first.
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

  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Observable<any> {
    const apiUrl = DynamicTranslateLoader.apiUrl;

    // Local fallback: try ./assets/i18n/ (works on localhost and in
    // Chrome extension sidebar where build-extension.ps1 copies i18n files)
    const localFallback = () => {
      const localUrl = `./assets/i18n/${lang}.json`;
      if (WidgetDebug.enabled) console.debug(`[i18n] Fallback → ${localUrl}`);
      return this.http.get(localUrl).pipe(catchError((err) => {
        if (WidgetDebug.enabled) console.warn(`[i18n] ✗ Fallback failed: ${localUrl}`, err.status);
        return of({});
      }));
    };

    const logSuccess = (url: string) => (data: any) => {
      if (WidgetDebug.enabled) console.debug(`[i18n] ✓ Loaded ${lang} from ${url} (${Object.keys(data || {}).length} keys)`);
      return data;
    };

    // apiUrl already known → fetch from API, fallback to local assets
    if (apiUrl) {
      const url = `${apiUrl}${agentI18nPath(lang)}`;
      if (WidgetDebug.enabled) console.debug(`[i18n] Loading ${lang} from apiUrl: ${url}`);
      return this.http.get(url).pipe(
        switchMap(data => of(logSuccess(url)(data))),
        catchError((err) => {
          if (WidgetDebug.enabled) console.warn(`[i18n] ✗ Failed: ${url} (${err.status})`, err.message);
          return localFallback();
        })
      );
    }

    // Extension page: try local assets immediately
    const isExtension = typeof window !== 'undefined'
      && (window.location.protocol === 'chrome-extension:'
        || window.location.protocol === 'moz-extension:');

    if (isExtension) {
      const url = `./assets/i18n/${lang}.json`;
      if (WidgetDebug.enabled) console.debug(`[i18n] Extension mode → ${url}`);
      return this.http.get(url).pipe(
        switchMap(data => of(logSuccess(url)(data))),
        catchError(() => of({}))
      );
    }

    // Local dev (ng serve) without runtime configuration: try local assets first.
    const isLocal = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1');

    if (isLocal) {
      // Try local ./assets/i18n/ first (works with ng serve),
      // then fall back to origin-based /widget/i18n/ (canonical API endpoint)
      const localUrl = `./assets/i18n/${lang}.json`;
      if (WidgetDebug.enabled) console.debug(`[i18n] Local mode → ${localUrl}`);
      return this.http.get(localUrl).pipe(
        switchMap(data => of(logSuccess(localUrl)(data))),
        catchError(() => {
          const origin = window.location.origin;
          const widgetUrl = `${origin}${agentI18nPath(lang)}`;
          if (WidgetDebug.enabled) console.debug(`[i18n] Local fallback → ${widgetUrl}`);
          return this.http.get(widgetUrl).pipe(
            switchMap(data => of(logSuccess(widgetUrl)(data))),
            catchError((err) => {
              if (WidgetDebug.enabled) console.warn(`[i18n] ✗ Failed: ${widgetUrl} (${err.status})`);
              return of({});
            })
          );
        })
      );
    }

    // Generic embedded mode: use the host origin until api-url overrides it.
    const sameOriginUrl = agentI18nPath(lang);
    if (WidgetDebug.enabled) console.debug(`[i18n] Same-origin mode → ${sameOriginUrl}`);
    return this.http.get(sameOriginUrl).pipe(
      switchMap(data => of(logSuccess(sameOriginUrl)(data))),
      catchError(() => localFallback())
    );
  }
}
