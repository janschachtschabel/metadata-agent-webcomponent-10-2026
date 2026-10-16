import { of } from 'rxjs';
import { DynamicTranslateLoader } from './dynamic-translate-loader';
import { WIDGET_VERSION } from '../version';

describe('DynamicTranslateLoader API URL handling', () => {
  let http: { get: jasmine.Spy };

  beforeEach(() => {
    http = { get: jasmine.createSpy('get').and.returnValue(of({ TEST: 'value' })) };
    DynamicTranslateLoader.apiUrl = '';
  });

  it('loads bundled translations first during local development', () => {
    const loader = new DynamicTranslateLoader(http as any);

    loader.getTranslation('de').subscribe();

    expect(http.get).toHaveBeenCalledWith('./assets/i18n/de.json');
  });

  it('keeps a configured proxy prefix for translation requests', () => {
    DynamicTranslateLoader.setApiUrl('/api/proxy/metadata-agent-canvas/');
    const loader = new DynamicTranslateLoader(http as any);

    loader.getTranslation('en').subscribe();

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

    loader.getTranslation('de').subscribe();

    expect(http.get).toHaveBeenCalledWith(
      `https://agent.example.org/widget/i18n/de.json?v=${WIDGET_VERSION}`,
    );
  });
});
