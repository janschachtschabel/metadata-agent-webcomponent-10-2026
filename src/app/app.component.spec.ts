import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { CanvasComponent } from './components/canvas/canvas.component';
import { configureCanvasTestBed } from './testing/canvas-harness';

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

/**
 * Audit 14.11. (U-11, docs/URL-PARAMETERS.md): `?viewerMode=true`, the old
 * name for `?readonly=true`, did nothing on the standalone page any more. The
 * page bound `[viewerMode]` and after it `[readonly]`, which is undefined
 * without `?readonly` - and since U-08 d an undefined `readonly` means "not
 * set", which took back what viewerMode had just set.
 */
describe('AppComponent: the old parameter viewerMode', () => {
  async function mount(set: (app: AppComponent) => void): Promise<CanvasComponent> {
    await configureCanvasTestBed(undefined, [{ provide: HttpClient, useValue: { get: () => of({ metadata: {} }) } }]);
    const fixture = TestBed.createComponent(AppComponent);
    set(fixture.componentInstance);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(CanvasComponent)).componentInstance;
  }

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('makes the form read-only', async () => {
    expect((await mount(app => (app.viewerMode = true))).effectiveReadonly).toBeTrue();
  });

  it('gives way to readonly when the page URL names both', async () => {
    const canvas = await mount(app => {
      app.viewerMode = true;
      app.readonly = false;
    });

    expect(canvas.effectiveReadonly).toBeFalse();
  });

  it('without either, the layout decides', async () => {
    expect((await mount(app => (app.layout = 'detail'))).effectiveReadonly).toBeTrue();
    TestBed.resetTestingModule();
    expect((await mount(app => (app.layout = 'clean'))).effectiveReadonly).toBeFalse();
  });
});
