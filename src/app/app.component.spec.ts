import { of } from 'rxjs';
import { AppComponent } from './app.component';

/**
 * Final audit 18.10. (S-1): the standalone page took the agent address and a
 * data URL from its own query string. A link could point a deployed page at
 * another server, which then received every upload and every metadata record.
 */
describe('AppComponent query parameters', () => {
  function parse(search: string, hostname: string) {
    const http = { get: jasmine.createSpy('get').and.returnValue(of({ metadata: {} })) };
    const app = new AppComponent(http as any);
    (app as any).parseQueryParams(search, hostname);
    return { app, http };
  }

  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    it(`takes apiUrl and dataUrl on ${host} (development)`, () => {
      const { app, http } = parse('?apiUrl=http://localhost:8000&dataUrl=assets/example.json', host);

      expect(app.apiUrl).toBe('http://localhost:8000');
      expect(http.get).toHaveBeenCalledWith('assets/example.json');
    });
  }

  it('ignores apiUrl and dataUrl on any other host', () => {
    const { app, http } = parse('?apiUrl=https://evil.example&dataUrl=https://evil.example/x.json', 'agent.wirlernenonline.de');

    expect(app.apiUrl).toBe('');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('still takes the display parameters on any host', () => {
    const { app } = parse('?layout=plugin&readonly=true', 'agent.wirlernenonline.de');

    expect(app.layout).toBe('plugin');
    expect(app.readonly).toBeTrue();
  });
});
