import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type, reflectComponentType } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
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

/**
 * Audit 14.11. (U-12): the seven layout templates had drifted. The type menu
 * was locked during a run in the default layout only; the floating type button
 * appeared by two rules and under two labels; the chosen type was marked in
 * three ways; the floating reset stayed active during a run. The same rules
 * now, from the same components, in every layout.
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
const WITH_RESET = ['default', 'dialog', 'plugin'];

const TYPES = [
  { label: 'Veranstaltung', schemaFile: 'event.json', icon: 'event' },
  { label: 'Person', schemaFile: 'person.json' },
];

function filledState(overrides: Partial<CanvasState> = {}): CanvasState {
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
    contentTypeLabel: 'Veranstaltung',
    ...overrides,
  };
}

for (const [name, layout] of LAYOUTS) {
  describe(`${name} layout`, () => {
    let fixture: ComponentFixture<unknown>;
    let root: HTMLElement;

    /** The layout as an editor has it (not read-only), with every type menu it can show. */
    async function render(state: CanvasState, extra: Record<string, unknown> = {}): Promise<void> {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      fixture = TestBed.createComponent(layout);
      const declared = new Set(reflectComponentType(layout)!.inputs.map(input => input.templateName));
      const inputs: Record<string, unknown> = {
        state, readonly: false, contentTypes: TYPES,
        showStatusBar: true, showFloatingControls: true, showContentType: true, showResetButton: true,
        ...extra,
      };
      for (const [input, value] of Object.entries(inputs)) {
        if (declared.has(input)) fixture.componentRef.setInput(input, value);
      }
      fixture.detectChanges();
      await fixture.whenStable();
      root = fixture.nativeElement as HTMLElement;
    }

    const triggers = () => Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'));
    const overlays = () => TestBed.inject(OverlayContainer).getContainerElement();

    it('locks every type menu while an extraction runs, without taking the focus', async () => {
      await render(filledState());
      const all = triggers();
      expect(all.length).withContext('status bar and floating bar').toBe(2);
      all[1].focus();

      fixture.componentRef.setInput('state', filledState({ isExtracting: true }));
      fixture.detectChanges();
      for (const trigger of triggers()) trigger.click();
      fixture.detectChanges();

      expect(triggers().map(t => t.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
      expect(overlays().querySelector('.mat-mdc-menu-panel')).withContext('no menu opens').toBeNull();
      expect(document.activeElement).withContext('focus stays on the trigger').toBe(all[1]);
    });

    it('shows the floating type button before the form has fields', async () => {
      await render(createInitialState());

      expect(root.querySelector('app-floating-bar app-content-type-menu')).not.toBeNull();
    });

    it('says "please choose" until a type is chosen', async () => {
      await render(filledState({ contentTypeLabel: undefined }));

      const labels = Array.from(root.querySelectorAll('.split-button-label span')).map(el => el.textContent!.trim());
      expect(labels).toEqual(['CONTENT_TYPE.NOT_DETECTED', 'CONTENT_TYPE.NOT_DETECTED']);
    });

    it('marks the chosen type in the menu, also for screen readers', async () => {
      await render(filledState());

      for (const trigger of triggers()) {
        trigger.click();
        fixture.detectChanges();
        const items = Array.from(overlays().querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
        expect(items.map(item => item.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio']);
        expect(items.map(item => item.getAttribute('aria-checked'))).toEqual(['true', 'false']);
        expect(items.map(item => !!item.querySelector('mat-icon'))).withContext('check mark').toEqual([true, false]);
        items[0].closest('.cdk-overlay-container')!.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
        fixture.detectChanges();
        await fixture.whenStable();
      }
    });

    if (WITH_RESET.includes(name)) {
      it('locks the floating reset while an extraction runs, without taking the focus', async () => {
        await render(filledState());
        const reset = root.querySelector('app-floating-bar .btn-reset') as HTMLButtonElement;
        let resets = 0;
        (fixture.componentInstance as any).reset.subscribe(() => resets++);
        reset.focus();

        fixture.componentRef.setInput('state', filledState({ isExtracting: true }));
        fixture.detectChanges();
        reset.click();

        expect(reset.getAttribute('aria-disabled')).toBe('true');
        expect(document.activeElement).toBe(reset);
        expect(resets).toBe(0);
      });

      it('resets from the floating bar otherwise', async () => {
        await render(filledState());
        let resets = 0;
        (fixture.componentInstance as any).reset.subscribe(() => resets++);

        (root.querySelector('app-floating-bar .btn-reset') as HTMLButtonElement).click();

        expect(resets).toBe(1);
      });
    } else {
      it('has no floating reset: its preset promises none', async () => {
        await render(filledState());

        expect(root.querySelector('app-floating-bar .btn-reset')).toBeNull();
      });
    }
  });
}
