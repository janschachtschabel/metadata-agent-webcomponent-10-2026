import { TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';

import { DynamicTranslateLoader } from './dynamic-translate-loader';
import { I18nService } from './i18n.service';

/**
 * Storage can be blocked: sandboxed or third-party iframes, strict privacy
 * settings. Reading localStorage then throws a SecurityError - in the
 * constructor, which used to stop the whole widget from starting (audit U-03).
 */
describe('I18nService with blocked storage', () => {
  function translateStub(browserLang = 'en') {
    return {
      addLangs: () => undefined,
      setFallbackLang: () => undefined,
      getBrowserLang: () => browserLang,
      use: jasmine.createSpy('use'),
      instant: (key: string) => key,
    } as any;
  }

  beforeEach(() => {
    spyOn(Storage.prototype, 'getItem').and.throwError(new DOMException('blocked', 'SecurityError'));
    spyOn(Storage.prototype, 'setItem').and.throwError(new DOMException('blocked', 'SecurityError'));
  });

  it('starts with the browser language instead of failing', () => {
    let service!: I18nService;

    expect(() => (service = new I18nService(translateStub('en')))).not.toThrow();
    expect(service.currentLang).toBe('en');
  });

  it('still switches the language when it cannot be remembered', () => {
    const translate = translateStub('de');
    const service = new I18nService(translate);

    expect(() => service.setLanguage('en')).not.toThrow();
    expect(service.currentLang).toBe('en');
    expect(translate.use).toHaveBeenCalledWith('en');
  });
});

/**
 * Final audit 18.10. (S-2): `app_language` is a name any host page may use
 * itself. Audit 14.11. (U-05): it is not read any more, and only a choice is
 * remembered - the language the widget started with used to be stored at once,
 * so every later visit had a "choice" nobody made.
 */
describe('I18nService remembered language', () => {
  const KEY = 'metadata-agent-canvas.language';
  function translateStub(browserLang = 'de') {
    return {
      addLangs: () => undefined, setFallbackLang: () => undefined,
      getBrowserLang: () => browserLang, use: () => undefined, instant: (key: string) => key,
    } as any;
  }

  // Other specs leave the language they used behind.
  const clear = () => {
    localStorage.removeItem(KEY);
    localStorage.removeItem('app_language');
  };
  beforeEach(clear);
  afterEach(clear);

  it('is stored under its own name', () => {
    new I18nService(translateStub()).setLanguage('en');

    expect(localStorage.getItem(KEY)).toBe('en');
    expect(localStorage.getItem('app_language')).toBeNull();
  });

  it('is not taken from the old name, which may be the host page\'s', () => {
    localStorage.setItem('app_language', 'en');

    const service = new I18nService(translateStub('de'));

    expect(service.currentLang).toBe('de');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('app_language')).toBe('en');
  });

  it('is not written by starting alone', () => {
    const service = new I18nService(translateStub('en'));

    expect(service.currentLang).toBe('en');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('counts before the page and the browser, and after the host', () => {
    localStorage.setItem(KEY, 'en');
    const service = new I18nService(translateStub('de'));
    expect(service.currentLang).toBe('en');

    service.setPageLanguage('de');
    expect(service.currentLang).withContext('page language does not replace a choice').toBe('en');

    service.setHostLanguage('de');
    expect(service.currentLang).withContext('the host decides').toBe('de');
    expect(localStorage.getItem(KEY)).withContext('and leaves the choice stored').toBe('en');

    service.setHostLanguage(null);
    expect(service.currentLang).toBe('en');
  });

  it('tells its listeners about a change, not about the same language again', () => {
    const service = new I18nService(translateStub('de'));
    const seen: string[] = [];
    service.language$.subscribe(lang => seen.push(lang));

    service.setPageLanguage('de');
    service.setHostLanguage('en');
    service.setHostLanguage('en-GB');

    expect(seen).toEqual(['de', 'en']);
  });
});

/**
 * Audit 14.11. (U-04): with the widget's own loader, as in app.config.ts. The
 * texts are there at once, the agent's are merged in when they arrive, and a
 * load that failed is tried again when the language is used next.
 */
describe('I18nService with the built-in texts', () => {
  const KEY = 'metadata-agent-canvas.language';
  let http: { get: jasmine.Spy };
  let apiUrl: string;

  function create(): { i18n: I18nService; translate: TranslateService } {
    TestBed.configureTestingModule({
      providers: [provideTranslateService({
        loader: { provide: TranslateLoader, useFactory: () => new DynamicTranslateLoader(http as any) },
      })],
    });
    return { i18n: TestBed.inject(I18nService), translate: TestBed.inject(TranslateService) };
  }

  beforeEach(() => {
    apiUrl = DynamicTranslateLoader.apiUrl;
    DynamicTranslateLoader.apiUrl = 'https://agent.example.org';
    localStorage.setItem(KEY, 'de');
    http = { get: jasmine.createSpy('get') };
  });
  afterEach(() => {
    DynamicTranslateLoader.apiUrl = apiUrl;
    localStorage.removeItem(KEY);
  });

  it('speaks before the agent has answered', () => {
    http.get.and.returnValue(new Subject()); // never answers

    const { i18n } = create();

    expect(i18n.instant('COMMON.CANCEL')).toBe('Abbrechen');
    expect(i18n.instant('INPUT.START_EXTRACTION')).toBe('Extraktion starten');
  });

  it('speaks when the agent cannot be reached, in both languages', () => {
    http.get.and.returnValue(throwError(() => ({ status: 504 })));
    const { i18n } = create();

    expect(i18n.instant('COMMON.CANCEL')).toBe('Abbrechen');
    i18n.setLanguage('en');
    expect(i18n.instant('COMMON.CANCEL')).toBe('Cancel');
  });

  it('takes the agent\'s texts when they arrive, and tells the interface', () => {
    const answer = new Subject<unknown>();
    http.get.and.returnValue(answer);
    const { i18n, translate } = create();
    let changes = 0;
    translate.onTranslationChange.subscribe(() => changes++);

    answer.next({ COMMON: { CANCEL: 'Stopp' } });

    expect(i18n.instant('COMMON.CANCEL')).toBe('Stopp');
    expect(i18n.instant('COMMON.CLOSE')).withContext('built-in where the agent serves nothing').toBe('Schließen');
    expect(changes).toBe(1);
  });

  it('asks again when the language is used next, after a failure', () => {
    http.get.and.returnValue(throwError(() => ({ status: 0 })));
    const { i18n } = create();
    expect(http.get).toHaveBeenCalledTimes(1);

    http.get.and.returnValue(of({ COMMON: { CANCEL: 'Stopp' } }));
    i18n.setLanguage('de');

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(i18n.instant('COMMON.CANCEL')).toBe('Stopp');
  });

  it('asks the new address after api-url changed, and keeps the texts meanwhile', () => {
    http.get.and.returnValue(of({ COMMON: { CANCEL: 'Stopp' } }));
    const { i18n } = create();
    const answer = new Subject<unknown>();
    http.get.and.returnValue(answer);

    DynamicTranslateLoader.setApiUrl('https://other.example.org');
    i18n.reloadTranslations();

    expect(http.get.calls.mostRecent().args[0]).toContain('https://other.example.org/widget/i18n/de.json');
    expect(i18n.instant('COMMON.CANCEL')).withContext('no raw keys while the request is out').toBe('Stopp');
    answer.next({ COMMON: { CANCEL: 'Halt' } });
    expect(i18n.instant('COMMON.CANCEL')).toBe('Halt');
  });
});
