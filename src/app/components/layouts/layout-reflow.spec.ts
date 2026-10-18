import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { DetailLayoutComponent } from './detail-layout/detail-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { PrueftischLayoutComponent } from './prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from './prueftisch-org-layout/prueftisch-org-layout.component';
import { pickerPanelPosition } from '../shared/vocab-tree-picker/vocab-tree-picker.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';

/**
 * Audit U-14 (reflow, WCAG 1.4.10): the widget sits in sidebars and dialogs,
 * so its columns must follow the widget's width, not the window's - a narrow
 * widget on a wide screen kept two to four squeezed columns. And the picker
 * panel was at least 360 px wide, wider than a 320 px viewport.
 */
describe('vocabulary picker panel on a narrow screen', () => {
  it('stays inside a 320 px viewport', () => {
    const style = pickerPanelPosition({ top: 100, bottom: 140, left: 16, width: 288 }, 320, 640);

    const left = parseFloat(style['left']);
    const width = parseFloat(style['width']);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(312);
  });

  it('keeps its width on a wide screen', () => {
    const style = pickerPanelPosition({ top: 100, bottom: 140, left: 100, width: 420 }, 1280, 800);

    expect(style['width']).toBe('420px');
    expect(style['left']).toBe('100px');
  });
});

function stateWithFields(count: number): CanvasState {
  const fields = Array.from({ length: count }, (_, i) => ({
    fieldId: `f${i}`, label: `Feld ${i}`, group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: `Wert ${i}`, confidence: 1, isRequired: false,
    datatype: 'string', multiple: false,
  } as unknown as CanvasFieldState));
  return {
    ...createInitialState(),
    coreFields: fields,
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }],
    totalFields: count,
    filledFields: count,
  };
}

const LAYOUTS: [string, Type<unknown>, Record<string, unknown>][] = [
  ['clean', CleanLayoutComponent, {}],
  ['default', DefaultLayoutComponent, {}],
  ['detail', DetailLayoutComponent, { flatGroups: true }],
  ['dialog', DialogLayoutComponent, {}],
  ['plugin', PluginLayoutComponent, {}],
  ['prueftisch', PrueftischLayoutComponent, {}],
  ['prueftisch-org', PrueftischOrgLayoutComponent, {}],
];

for (const [name, layout, extra] of LAYOUTS) {
  describe(`${name} layout columns`, () => {
    async function columnsAt(width: number): Promise<number> {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoopAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.width = `${width}px`;
      fixture.componentRef.setInput('state', stateWithFields(4));
      fixture.componentRef.setInput('columns', 2);
      for (const [input, value] of Object.entries(extra)) fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      await fixture.whenStable();
      const grid = host.querySelector('.group-fields.columns-2') as HTMLElement;
      expect(grid).withContext('the two-column grid is rendered').not.toBeNull();
      return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    }

    it('shows two columns when the widget is wide', async () => {
      expect(await columnsAt(1100)).toBe(2);
    });

    it('falls back to one column when the widget is narrow, whatever the window', async () => {
      expect(await columnsAt(360)).toBe(1);
    });
  });
}
