import { Subject, firstValueFrom, of, throwError } from 'rxjs';
import { DynamicTranslateLoader } from './dynamic-translate-loader';
import { WIDGET_VERSION } from '../version';
import de from '../../assets/i18n/de.json';
import en from '../../assets/i18n/en.json';

function leaves(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leaves(value as Record<string, unknown>, path) : [path];
  });
}

/**
 * Audit 14.11. (U-04): the texts came from the agent only. When that request
 * failed, the loader answered `{}` and the whole interface showed raw keys,
 * until the page was loaded again; on the way it also asked the host page for
 * `./assets/i18n/`. The texts are part of the bundle now.
 */
describe('DynamicTranslateLoader with built-in texts', () => {
  let http: { get: jasmine.Spy };
  let before: string;

  beforeEach(() => {
    before = DynamicTranslateLoader.apiUrl;
    DynamicTranslateLoader.apiUrl = '';
    http = { get: jasmine.createSpy('get').and.returnValue(throwError(() => ({ status: 0 }))) };
  });
  afterEach(() => (DynamicTranslateLoader.apiUrl = before));

  it('returns every key when the agent cannot be reached', async () => {
    const loader = new DynamicTranslateLoader(http as any);
    loader.loadServed('de');
    loader.loadServed('en');
    expect(http.get).toHaveBeenCalledTimes(2);

    const german: Record<string, any> = await firstValueFrom(loader.getTranslation('de'));
    const english: Record<string, any> = await firstValueFrom(loader.getTranslation('en'));

    expect(leaves(german).sort()).toEqual(leaves(de).sort());
    expect(leaves(english).sort()).toEqual(leaves(en).sort());
    expect(german['COMMON']).toEqual(jasmine.objectContaining({ CANCEL: 'Abbrechen' }));
    expect(english['COMMON']).toEqual(jasmine.objectContaining({ CANCEL: 'Cancel' }));
    expect(leaves(german).length).withContext('not an empty file').toBeGreaterThan(100);
  });

  it('answers at once, without waiting for the agent', () => {
    http.get.and.returnValue(new Subject()); // never answers
    const loader = new DynamicTranslateLoader(http as any);
    let texts: Record<string, any> | undefined;

    loader.loadServed('de');
    loader.getTranslation('de').subscribe(value => (texts = value));

    expect(texts?.['COMMON']).toEqual(jasmine.objectContaining({ CLOSE: 'Schließen' }));
  });

  it('asks the agent only, never the host page for ./assets/i18n/', () => {
    const loader = new DynamicTranslateLoader(http as any);

    loader.loadServed('de');
    DynamicTranslateLoader.setApiUrl('https://agent.example.org');
    loader.loadServed('en');

    const asked = http.get.calls.allArgs().map(args => args[0] as string);
    expect(asked).toEqual([
      `/widget/i18n/de.json?v=${WIDGET_VERSION}`,
      `https://agent.example.org/widget/i18n/en.json?v=${WIDGET_VERSION}`,
    ]);
  });

  it('merges the agent\'s texts over the built-in ones', () => {
    http.get.and.returnValue(of({ COMMON: { CANCEL: 'Stopp' }, CUSTOM: { TEXT: 'Eigener Text' } }));
    const loader = new DynamicTranslateLoader(http as any);
    const served: { lang: string; texts: any }[] = [];
    loader.served$.subscribe(value => served.push(value));

    loader.loadServed('de');

    expect(served.length).toBe(1);
    expect(served[0].lang).toBe('de');
    expect(served[0].texts.COMMON).toEqual({ CANCEL: 'Stopp', CLOSE: 'Schließen', CONFIRM: 'Bestätigen' });
    expect(served[0].texts.CUSTOM).toEqual({ TEXT: 'Eigener Text' });
    expect(leaves(served[0].texts).length).toBe(leaves(de).length + 1);
  });

  it('asks again at the next use after a failure, and no more once it worked', () => {
    const loader = new DynamicTranslateLoader(http as any);
    loader.loadServed('de');
    expect(http.get).toHaveBeenCalledTimes(1);

    loader.loadServed('de');
    expect(http.get).withContext('the failure was not final').toHaveBeenCalledTimes(2);

    http.get.and.returnValue(of({ COMMON: { CANCEL: 'Stopp' } }));
    loader.loadServed('de');
    loader.loadServed('de');
    expect(http.get).withContext('loaded: not asked again').toHaveBeenCalledTimes(3);
  });

  it('asks the new address when the agent\'s address changes', () => {
    http.get.and.returnValue(of({}));
    const loader = new DynamicTranslateLoader(http as any);
    loader.loadServed('de');

    DynamicTranslateLoader.setApiUrl('https://agent.example.org');
    loader.loadServed('de');

    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('takes an answer that is no translation file for a failure', () => {
    http.get.and.returnValue(of(['not', 'a', 'record']));
    const loader = new DynamicTranslateLoader(http as any);
    const served: unknown[] = [];
    loader.served$.subscribe(value => served.push(value));

    loader.loadServed('de');
    loader.loadServed('de');

    expect(served).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});

describe('DynamicTranslateLoader API URL handling', () => {
  let http: { get: jasmine.Spy };
  let before: string;

  beforeEach(() => {
    before = DynamicTranslateLoader.apiUrl;
    http = { get: jasmine.createSpy('get').and.returnValue(of({ TEST: 'value' })) };
    DynamicTranslateLoader.apiUrl = '';
  });
  afterEach(() => (DynamicTranslateLoader.apiUrl = before));

  it('keeps a configured proxy prefix for translation requests', () => {
    DynamicTranslateLoader.setApiUrl('/api/proxy/metadata-agent-canvas/');
    const loader = new DynamicTranslateLoader(http as any);

    loader.loadServed('en');

    expect(http.get).toHaveBeenCalledWith(
      `/api/proxy/metadata-agent-canvas/widget/i18n/en.json?v=${WIDGET_VERSION}`,
    );
  });

  // The agent lets browsers keep translations for an hour. Without the
  // version in the URL, a new bundle met the old texts after a deploy and
  // showed its new keys raw ("EXTRACTION_RESULT.REQUEST_ID").
  it('asks for the translations of its own version', () => {
    DynamicTranslateLoader.setApiUrl('https://agent.example.org');
    const loader = new DynamicTranslateLoader(http as any);

    loader.loadServed('de');

    expect(http.get).toHaveBeenCalledWith(
      `https://agent.example.org/widget/i18n/de.json?v=${WIDGET_VERSION}`,
    );
  });
});
