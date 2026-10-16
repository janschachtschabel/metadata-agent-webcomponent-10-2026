import { environment } from '../../environments/environment';

export function normalizeApiUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

export function resolveApiUrl(runtimeUrl: unknown, buildTimeUrl: unknown, scriptBaseUrl: unknown = ''): string {
  return normalizeApiUrl(runtimeUrl) || normalizeApiUrl(scriptBaseUrl) || normalizeApiUrl(buildTimeUrl);
}

/**
 * The backend serves the bundles as `<base>/widget/dist/{runtime,polyfills,main}.js`.
 * Everything in front of `/widget/dist/` is the Metadata Agent base, including
 * a proxy prefix such as `/edu-sharing/rest/bapi/api/v1/proxy/metadata-agent-canvas`.
 */
const WIDGET_PATH_RE = /^(.*?)\/widget\/dist\/(?:main|runtime|polyfills)(?:\.[a-f0-9]+)?\.js$/;

export function baseUrlFromScriptSrc(src: unknown): string {
  if (typeof src !== 'string' || !src) return '';
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return '';
  }
  // Only the path counts: a query string can carry '/widget/dist/main.js' too.
  const match = WIDGET_PATH_RE.exec(url.pathname);
  return match ? normalizeApiUrl(url.origin + match[1]) : '';
}

/**
 * Embedded in a foreign page (e.g. edu-sharing), same-origin points at the host
 * application, not at the Metadata Agent — the URL the bundle was served from does.
 * document.currentScript is only set while a classic script executes, so this
 * runs once while the bundle is evaluated; the script tags are the fallback.
 */
function detectScriptBaseUrl(): string {
  if (typeof document === 'undefined') return '';

  const current = document.currentScript as HTMLScriptElement | null;
  const fromCurrent = baseUrlFromScriptSrc(current?.src);
  if (fromCurrent) return fromCurrent;

  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))) {
    const base = baseUrlFromScriptSrc(script.src);
    if (base) return base;
  }
  return '';
}

const SCRIPT_BASE_URL = detectScriptBaseUrl();

/**
 * Priority: window.__ENV.agentUrl > origin of the widget bundle >
 * environment.apiUrl > '' (same-origin). The component's api-url input
 * overrides all of these later via ApiService.setApiUrl().
 */
export function getInitialApiUrl(): string {
  const runtimeUrl = typeof window !== 'undefined'
    ? (window as any).__ENV?.agentUrl
    : undefined;

  return resolveApiUrl(runtimeUrl, environment.apiUrl, SCRIPT_BASE_URL);
}
