import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';

import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { DetailLayoutComponent } from './detail-layout/detail-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { PrueftischLayoutComponent } from './prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from './prueftisch-org-layout/prueftisch-org-layout.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { inWidgetTheme, seriousA11yViolations } from '../../testing/a11y';

/**
 * Audit 14.11. (U-03, K-23, U-12): five of the seven layouts showed nothing
 * while an extraction ran (the editor clicked again), none could stop it, and
 * the banners could be closed in the default layout only; the notice banner
 * had no role. One shared component now, the same in every layout.
 */
const LAYOUTS: [string, Type<unknown>][] = [
  ['clean', CleanLayoutComponent],
  ['default', DefaultLayoutComponent],
  ['detail', DetailLayoutComponent],
  ['dialog', DialogLayoutComponent],
  ['plugin', PluginLayoutComponent],
  ['prueftisch', PrueftischLayoutComponent],
  ['prueftisch-org', PrueftischOrgLayoutComponent],
];

function state(overrides: Partial<CanvasState> = {}): CanvasState {
  const title = {
    fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: false,
    datatype: 'string', multiple: false,
  } as unknown as CanvasFieldState;
  return {
    ...createInitialState(),
    coreFields: [title],
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields: [title], isCore: true }],
    totalFields: 1,
    filledFields: 1,
    ...overrides,
  };
}

for (const [name, layout] of LAYOUTS) {
  describe(`${name} layout while an extraction runs`, () => {
    let fixture: ComponentFixture<unknown>;
    let root: HTMLElement;

    async function render(canvasState: CanvasState): Promise<void> {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      fixture = TestBed.createComponent(layout);
      inWidgetTheme(fixture.nativeElement as HTMLElement);
      fixture.componentRef.setInput('state', canvasState);
      fixture.detectChanges();
      await fixture.whenStable();
      root = fixture.nativeElement as HTMLElement;
    }

    it('shows a named, indeterminate progress bar above the fields', async () => {
      await render(state({ isExtracting: true }));
      const bar = root.querySelector('app-extraction-feedback [role="progressbar"]') as HTMLElement;

      expect(bar).withContext('progress bar').not.toBeNull();
      const named = bar.getAttribute('aria-label')
        || document.getElementById(bar.getAttribute('aria-labelledby') ?? '')?.textContent?.trim();
      expect(named).withContext('accessible name').toBeTruthy();
      expect(bar.hasAttribute('aria-valuenow')).withContext('indeterminate').toBeFalse();
      const fields = root.querySelector('.fields-section') as HTMLElement;
      expect(bar.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING)
        .withContext('before the fields').toBeTruthy();
    });

    it('marks the fields as busy', async () => {
      await render(state({ isExtracting: true }));

      expect(root.querySelector('.fields-section')!.getAttribute('aria-busy')).toBe('true');
    });

    it('offers to cancel the run', async () => {
      await render(state({ isExtracting: true }));
      let cancelled = 0;
      (fixture.componentInstance as any).cancelExtraction.subscribe(() => cancelled++);
      const cancel = root.querySelector('app-extraction-feedback .btn-cancel') as HTMLButtonElement;

      expect(cancel.getAttribute('type')).toBe('button');
      expect(cancel.textContent!.trim()).toBe('COMMON.CANCEL');
      cancel.click();

      expect(cancelled).toBe(1);
    });

    it('shows neither once the run is over', async () => {
      await render(state({ isExtracting: false }));

      expect(root.querySelector('app-extraction-feedback [role="progressbar"]')).toBeNull();
      expect(root.querySelector('app-extraction-feedback .btn-cancel')).toBeNull();
      expect(root.querySelector('.fields-section')!.hasAttribute('aria-busy')).toBeFalse();
    });

    it('has no serious accessibility violations while it runs', async () => {
      await render(state({ isExtracting: true }));

      expect(await seriousA11yViolations(root, { contrast: true })).toEqual([]);
    });
  });

  describe(`${name} layout banners`, () => {
    async function render(canvasState: CanvasState) {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      inWidgetTheme(fixture.nativeElement as HTMLElement);
      fixture.componentRef.setInput('state', canvasState);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    it('closes the error banner', async () => {
      const fixture = await render(state({ extractionError: 'Der Dienst antwortet nicht' }));
      let dismissed = 0;
      (fixture.componentInstance as any).dismissError.subscribe(() => dismissed++);
      const banner = fixture.nativeElement.querySelector('.extraction-error') as HTMLElement;

      expect(banner.getAttribute('role')).toBe('alert');
      const close = banner.querySelector('button') as HTMLButtonElement;
      expect(close.getAttribute('aria-label')).toBe('COMMON.CLOSE');
      close.click();

      expect(dismissed).toBe(1);
    });

    it('closes the notice banner, which is a status message', async () => {
      const fixture = await render(state({ extractionWarning: 'Nur 3 von 5 Feldern' }));
      let dismissed = 0;
      (fixture.componentInstance as any).dismissWarning.subscribe(() => dismissed++);
      const banner = fixture.nativeElement.querySelector('.extraction-warning') as HTMLElement;

      expect(banner.getAttribute('role')).toBe('status');
      const close = banner.querySelector('button') as HTMLButtonElement;
      expect(close.getAttribute('aria-label')).toBe('COMMON.CLOSE');
      close.click();

      expect(dismissed).toBe(1);
    });

    it('has no serious accessibility violations with both banners', async () => {
      const fixture = await render(state({ extractionError: 'Fehler', extractionWarning: 'Hinweis' }));

      expect(await seriousA11yViolations(fixture.nativeElement, { contrast: true })).toEqual([]);
    });
  });
}
