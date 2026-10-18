import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { CanvasComponent } from './canvas.component';
import { CanvasService } from '../../core/canvas.service';
import { SchemaService } from '../../core/schema.service';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { DefaultLayoutComponent } from '../layouts/default-layout/default-layout.component';
import { PluginLayoutComponent } from '../layouts/plugin-layout/plugin-layout.component';
import { DialogLayoutComponent } from '../layouts/dialog-layout/dialog-layout.component';
import { DetailLayoutComponent } from '../layouts/detail-layout/detail-layout.component';
import { CleanLayoutComponent } from '../layouts/clean-layout/clean-layout.component';
import { PrueftischLayoutComponent } from '../layouts/prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from '../layouts/prueftisch-org-layout/prueftisch-org-layout.component';
import { WidgetNoticeComponent } from '../shared/widget-notice/widget-notice.component';

/**
 * What the canvas hands each layout and what it does with the layout's events
 * (audit M-02: the canvas template repeated the same ~40 bindings seven times).
 * Written against the template with the seven blocks; it pins the behaviour a
 * leaner template has to keep: per layout exactly these inputs, following the
 * canvas, and these outputs, each reaching the same canvas method.
 */

const COMMON_INPUTS = [
  'state', 'contentTypes', 'userText', 'sourceUrl', 'nodeId', 'inputMode', 'backgroundColor',
  'columns', 'flatGroups', 'showInputArea', 'showStatusBar', 'showCoreFields', 'showSpecialFields',
  'showFloatingControls', 'showFieldActions', 'showContentTypeOnly', 'showLanguageSwitcher',
  'showContentType', 'showResetButton', 'readonly', 'highlightAi', 'showPreview', 'screenshotEnabled',
];
const COMMON_OUTPUTS = [
  'userTextChange', 'sourceUrlChange', 'nodeIdChange', 'startExtraction', 'startUrlExtraction',
  'startNodeIdExtraction', 'inputModeChange', 'reset', 'selectContentType', 'fieldValueChange',
  'screenshotToggle',
];
const UPLOAD_INPUTS = ['showUploadButton', 'showSaveButton', 'uploading'];

const LAYOUTS: { name: string; type: Type<unknown>; inputs: string[]; outputs: string[] }[] = [
  {
    name: 'default', type: DefaultLayoutComponent,
    inputs: [...COMMON_INPUTS, ...UPLOAD_INPUTS, 'showFooter', 'showJsonLoader'],
    outputs: [...COMMON_OUTPUTS, 'jsonLoaded', 'jsonLoadError', 'downloadJson', 'submit', 'upload',
      'dismissError', 'dismissWarning'],
  },
  {
    name: 'plugin', type: PluginLayoutComponent,
    inputs: [...COMMON_INPUTS, ...UPLOAD_INPUTS, 'showPageMode'],
    outputs: [...COMMON_OUTPUTS, 'reloadFromPage', 'submit', 'upload'],
  },
  {
    name: 'dialog', type: DialogLayoutComponent,
    inputs: [...COMMON_INPUTS, ...UPLOAD_INPUTS],
    outputs: [...COMMON_OUTPUTS, 'submit', 'upload'],
  },
  { name: 'detail', type: DetailLayoutComponent, inputs: COMMON_INPUTS, outputs: COMMON_OUTPUTS },
  { name: 'clean', type: CleanLayoutComponent, inputs: COMMON_INPUTS, outputs: COMMON_OUTPUTS },
  { name: 'prueftisch', type: PrueftischLayoutComponent, inputs: COMMON_INPUTS, outputs: COMMON_OUTPUTS },
  { name: 'prueftisch-org', type: PrueftischOrgLayoutComponent, inputs: COMMON_INPUTS, outputs: COMMON_OUTPUTS },
];

/** The value the canvas passes for an input, as the template wrote it. */
function expected(c: any, input: string): unknown {
  const special: Record<string, () => unknown> = {
    state: () => c.state,
    contentTypes: () => c.contentTypes,
    userText: () => c.userText,
    sourceUrl: () => c.sourceUrl,
    nodeId: () => c.nodeId,
    inputMode: () => c.inputModeValue,
    backgroundColor: () => c.backgroundColor,
    columns: () => c.effectiveColumns,
    flatGroups: () => c._flatGroups,
    showContentTypeOnly: () => c._showContentTypeOnly,
    showPageMode: () => c._showPageMode,
    uploading: () => c.uploading,
    readonly: () => c.effectiveReadonly,
    highlightAi: () => c._highlightAi,
    showPreview: () => c._showPreview,
    screenshotEnabled: () => c.state?.screenshotEnabled ?? true,
  };
  if (special[input]) return special[input]();
  // showX -> effectiveShowX
  return c['effective' + input[0].toUpperCase() + input.slice(1)];
}

describe('CanvasComponent layout bindings', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let canvas: any;
  let state$: BehaviorSubject<any>;

  beforeEach(async () => {
    state$ = new BehaviorSubject<any>({ screenshotEnabled: false, isExtracting: false });
    canvas = {
      state$,
      bindToInstance: () => undefined,
      relocalizeFields: () => Promise.resolve(),
      getMetadataForExport: () => ({}),
      setError: () => undefined,
      updateFieldValue: jasmine.createSpy('updateFieldValue'),
      clearError: jasmine.createSpy('clearError'),
      clearWarning: jasmine.createSpy('clearWarning'),
      setScreenshotEnabled: jasmine.createSpy('setScreenshotEnabled'),
    };
    const blank = { set: { template: '', imports: [] } };
    TestBed.configureTestingModule({
      imports: [CanvasComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SchemaService, useValue: {
          setContext: () => Promise.resolve(),
          loadCoreSchema: () => Promise.resolve(),
          getContentTypes: () => Promise.resolve([{ schemaFile: 'event.json' }]),
        } },
        { provide: ApiService, useValue: {} },
        { provide: I18nService, useValue: {
          language$: new BehaviorSubject('de'), currentLang: 'de', instant: (k: string) => k,
        } },
      ],
    });
    for (const layout of LAYOUTS) TestBed.overrideComponent(layout.type, blank);
    TestBed.overrideComponent(WidgetNoticeComponent, blank);
    TestBed.overrideComponent(CanvasComponent, {
      set: { providers: [{ provide: CanvasService, useValue: canvas }] },
    });
    await TestBed.compileComponents();
  });

  async function render(layoutName: string): Promise<any> {
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('layout', layoutName);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const type = LAYOUTS.find(l => l.name === layoutName)!.type;
    return fixture.debugElement.query(By.directive(type)).componentInstance;
  }

  for (const layout of LAYOUTS) {
    describe(layout.name, () => {
      it('receives exactly its inputs, with the canvas values', async () => {
        const instance = await render(layout.name);

        for (const input of layout.inputs) {
          expect(instance[input]).withContext(input).toEqual(expected(component, input));
        }
        // No other layout is rendered next to it.
        for (const other of LAYOUTS.filter(l => l !== layout)) {
          expect(fixture.debugElement.query(By.directive(other.type))).withContext(other.name).toBeNull();
        }
      });

      it('follows the canvas when its values change', async () => {
        const instance = await render(layout.name);

        component.userText = 'neuer Text';
        state$.next({ screenshotEnabled: true, isExtracting: false });
        fixture.detectChanges();

        expect(instance.userText).toBe('neuer Text');
        expect(instance.screenshotEnabled).toBeTrue();
        expect(instance.state).toEqual({ screenshotEnabled: true, isExtracting: false });
      });

      it('shows what its own event changed without anyone marking the canvas', async () => {
        // OnPush: only the event listener marks the canvas for check.
        const instance = await render(layout.name);

        instance.inputModeChange.emit('url');
        fixture.detectChanges();

        expect(instance.inputMode).toBe('url');
      });

      it('passes its events to the canvas', async () => {
        const instance = await render(layout.name);
        const c: any = component;
        const methods = ['startExtraction', 'startUrlExtraction', 'startNodeIdExtraction', 'reset',
          'selectContentType', 'onJsonLoaded', 'onJsonLoadError', 'downloadJson', 'submit',
          'uploadToRepository'];
        for (const m of methods) spyOn(c, m).and.stub();
        spyOn(c.reloadFromPage, 'emit');

        const effects: Record<string, [unknown, () => void]> = {
          userTextChange: ['T', () => expect(c.userText).toBe('T')],
          sourceUrlChange: ['https://x', () => expect(c.sourceUrl).toBe('https://x')],
          nodeIdChange: ['n1', () => expect(c.nodeId).toBe('n1')],
          startExtraction: [undefined, () => expect(c.startExtraction).toHaveBeenCalledWith()],
          startUrlExtraction: ['https://u', () => expect(c.startUrlExtraction).toHaveBeenCalledWith('https://u')],
          startNodeIdExtraction: ['n2', () => expect(c.startNodeIdExtraction).toHaveBeenCalledWith('n2')],
          inputModeChange: ['url', () => expect(c._inputMode).toBe('url')],
          reset: [undefined, () => expect(c.reset).toHaveBeenCalled()],
          reloadFromPage: [undefined, () => expect(c.reloadFromPage.emit).toHaveBeenCalled()],
          selectContentType: [{ schemaFile: 'x' }, () => expect(c.selectContentType).toHaveBeenCalledWith({ schemaFile: 'x' })],
          fieldValueChange: [{ fieldId: 'f', value: 1 }, () => expect(canvas.updateFieldValue).toHaveBeenCalledWith('f', 1)],
          jsonLoaded: [{ a: 1 }, () => expect(c.onJsonLoaded).toHaveBeenCalledWith({ a: 1 })],
          jsonLoadError: [undefined, () => expect(c.onJsonLoadError).toHaveBeenCalled()],
          downloadJson: [undefined, () => expect(c.downloadJson).toHaveBeenCalled()],
          submit: [undefined, () => expect(c.submit).toHaveBeenCalled()],
          upload: [undefined, () => expect(c.uploadToRepository).toHaveBeenCalled()],
          dismissError: [undefined, () => expect(canvas.clearError).toHaveBeenCalled()],
          dismissWarning: [undefined, () => expect(canvas.clearWarning).toHaveBeenCalled()],
          screenshotToggle: [false, () => expect(canvas.setScreenshotEnabled).toHaveBeenCalledWith(false)],
        };

        for (const output of layout.outputs) {
          instance[output].emit(effects[output][0]);
          effects[output][1]();
        }
      });
    });
  }

  // Final audit 18.10. (U-1): start and end of an extraction were not
  // announced; warnings came in a role=status element inserted with its text.
  describe('announcements', () => {
    const tick = () => new Promise(resolve => setTimeout(resolve));
    function region(): HTMLElement {
      return fixture.nativeElement.querySelector('[aria-live="polite"][role="status"]');
    }
    async function next(state: Record<string, unknown>): Promise<string> {
      state$.next({ screenshotEnabled: false, ...state });
      fixture.detectChanges();
      await tick();
      fixture.detectChanges();
      return region().textContent!.trim();
    }

    it('has one live region from the start, empty', async () => {
      await render('default');

      expect(fixture.nativeElement.querySelectorAll('[aria-live="polite"][role="status"]').length).toBe(1);
      expect(region().textContent!.trim()).toBe('');
    });

    it('announces the start and the end of an extraction', async () => {
      await render('default');

      expect(await next({ isExtracting: true })).toBe('ANNOUNCE.EXTRACTION_STARTED');
      expect(await next({ isExtracting: false, filledFields: 3 })).toBe('ANNOUNCE.EXTRACTION_DONE');
    });

    it('announces a warning with the end', async () => {
      await render('default');
      await next({ isExtracting: true });

      expect(await next({ isExtracting: false, filledFields: 3, extractionWarning: 'Nur teilweise' }))
        .toBe('ANNOUNCE.EXTRACTION_DONE Nur teilweise');
    });

    it('announces nothing new for changes outside an extraction', async () => {
      await render('default');

      expect(await next({ isExtracting: false, filledFields: 4 })).toBe('');
    });

    it('ignores the extraction buttons while an extraction runs', async () => {
      const instance = await render('default');
      const c: any = component;
      spyOn(c, 'startExtraction').and.stub();
      spyOn(c, 'startUrlExtraction').and.stub();
      spyOn(c, 'startNodeIdExtraction').and.stub();
      await next({ isExtracting: true });

      instance.startExtraction.emit();
      instance.startUrlExtraction.emit('https://u');
      instance.startNodeIdExtraction.emit('n');

      expect(c.startExtraction).not.toHaveBeenCalled();
      expect(c.startUrlExtraction).not.toHaveBeenCalled();
      expect(c.startNodeIdExtraction).not.toHaveBeenCalled();
    });
  });

  // Final audit 18.10. (P-1): ngDoCheck marked the layout on every tick,
  // so the OnPush layout tree was checked on every change detection.
  it('does not check the layout again on a tick that changed nothing', async () => {
    await render('default');
    const columns = spyOnProperty(component, 'effectiveColumns', 'get').and.callThrough();

    fixture.detectChanges();
    fixture.detectChanges();

    expect(columns).not.toHaveBeenCalled();
  });

  it('checks the layout when an input of the element changes', async () => {
    const instance = await render('default');

    fixture.componentRef.setInput('columns', 3);
    fixture.detectChanges();

    expect(instance.columns).toBe(3);
  });

  it('swaps the layout when the layout input changes', async () => {
    await render('default');

    fixture.componentRef.setInput('layout', 'plugin');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(DefaultLayoutComponent))).toBeNull();
    expect(fixture.debugElement.query(By.directive(PluginLayoutComponent))).not.toBeNull();
  });
});
