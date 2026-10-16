import { baseUrlFromScriptSrc, normalizeApiUrl, resolveApiUrl } from './api-url';

describe('API URL configuration', () => {
  it('uses same-origin paths when no URL is configured', () => {
    expect(resolveApiUrl(undefined, '')).toBe('');
  });

  it('prefers the runtime URL over the build-time fallback', () => {
    expect(resolveApiUrl('/api/proxy/metadata-agent-canvas/', '/fallback'))
      .toBe('/api/proxy/metadata-agent-canvas');
  });

  it('normalizes whitespace and trailing slashes', () => {
    expect(normalizeApiUrl('  https://metadata.example.org/base///  '))
      .toBe('https://metadata.example.org/base');
  });

  it('ignores non-string configuration values', () => {
    expect(resolveApiUrl({ url: '/invalid' }, '')).toBe('');
  });

  it('prefers the runtime URL over the script origin', () => {
    expect(resolveApiUrl('/configured', '', 'https://agent.example.org'))
      .toBe('/configured');
  });

  it('prefers the script origin over the build-time fallback', () => {
    expect(resolveApiUrl(undefined, '/fallback', 'https://agent.example.org/'))
      .toBe('https://agent.example.org');
  });

  it('keeps the build-time fallback when the script origin is unknown', () => {
    expect(resolveApiUrl(undefined, '/fallback', '')).toBe('/fallback');
  });
});

describe('baseUrlFromScriptSrc', () => {
  it('derives the backend base from the served bundle URL', () => {
    expect(baseUrlFromScriptSrc('https://agent.example.org/widget/dist/main.js'))
      .toBe('https://agent.example.org');
  });

  it('keeps a proxy prefix in front of /widget/dist/', () => {
    expect(baseUrlFromScriptSrc(
      'https://redaktion.example.org/edu-sharing/rest/bapi/api/v1/proxy/metadata-agent-canvas/widget/dist/main.js?v=2'
    )).toBe('https://redaktion.example.org/edu-sharing/rest/bapi/api/v1/proxy/metadata-agent-canvas');
  });

  it('accepts the other entry bundles and hashed file names', () => {
    expect(baseUrlFromScriptSrc('https://agent.example.org/widget/dist/runtime.2c840adc0daf3acb.js'))
      .toBe('https://agent.example.org');
    expect(baseUrlFromScriptSrc('https://agent.example.org/widget/dist/polyfills.js'))
      .toBe('https://agent.example.org');
  });

  it('ignores scripts that are not widget bundles', () => {
    expect(baseUrlFromScriptSrc('https://cdn.example.org/lib/main.js')).toBe('');
    expect(baseUrlFromScriptSrc('https://agent.example.org/widget/dist/other.js')).toBe('');
    expect(baseUrlFromScriptSrc('')).toBe('');
    expect(baseUrlFromScriptSrc(undefined)).toBe('');
  });

  it('only looks at the path, not at a query string or fragment', () => {
    expect(baseUrlFromScriptSrc('https://cdn.example.org/x.js?u=/widget/dist/main.js')).toBe('');
    expect(baseUrlFromScriptSrc('https://cdn.example.org/x.js#/widget/dist/main.js')).toBe('');
  });

  it('drops credentials from the derived base', () => {
    expect(baseUrlFromScriptSrc('https://user:secret@agent.example.org:8443/widget/dist/main.js'))
      .toBe('https://agent.example.org:8443');
  });
});
