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

/** Final audit 18.10. (S-2): `app_language` is a name any host page may use itself. */
describe('I18nService remembered language', () => {
  const KEY = 'metadata-agent-canvas.language';
  function translateStub() {
    return {
      addLangs: () => undefined, setFallbackLang: () => undefined,
      getBrowserLang: () => 'de', use: () => undefined, instant: (key: string) => key,
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

  it('is taken over once from the old name', () => {
    localStorage.setItem('app_language', 'en');

    const service = new I18nService(translateStub());

    expect(service.currentLang).toBe('en');
    expect(localStorage.getItem(KEY)).toBe('en');
    expect(localStorage.getItem('app_language')).withContext('may be the host page own value').toBe('en');
  });

  it('prefers its own name over the old one', () => {
    localStorage.setItem(KEY, 'de');
    localStorage.setItem('app_language', 'en');

    expect(new I18nService(translateStub()).currentLang).toBe('de');
  });
});
