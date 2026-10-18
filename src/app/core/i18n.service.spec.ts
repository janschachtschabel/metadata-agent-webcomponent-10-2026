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
      setDefaultLang: () => undefined,
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
