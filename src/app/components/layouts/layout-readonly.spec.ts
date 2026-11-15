import { TestBed } from '@angular/core/testing';
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

/**
 * Audit 13.11. (W-LOG-09): `readonly` locked the fields but not the content
 * type menu. Picking a type there rebuilt the form and, with a source text,
 * started an AI run - in a view that is only meant to be read.
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

function filledState(): CanvasState {
  const title = {
    fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: true,
    datatype: 'string', multiple: false,
  } as unknown as CanvasFieldState;
  return {
    ...createInitialState(),
    coreFields: [title],
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields: [title], isCore: true }],
    totalFields: 1,
    filledFields: 1,
    contentTypeLabel: 'Veranstaltung',
  };
}

for (const [name, layout] of LAYOUTS) {
  describe(`${name} layout content type menu`, () => {
    async function menuTriggers(readonly: boolean): Promise<HTMLButtonElement[]> {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      const inputs: Record<string, unknown> = {
        state: filledState(), readonly, showStatusBar: true, showFloatingControls: true, showContentType: true,
        contentTypes: [{ label: 'Veranstaltung', schemaFile: 'event.json' }, { label: 'Person', schemaFile: 'person.json' }],
      };
      for (const [input, value] of Object.entries(inputs)) fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      await fixture.whenStable();
      return Array.from(fixture.nativeElement.querySelectorAll('button[aria-haspopup="menu"]'));
    }

    it('is locked in a read-only view', async () => {
      const triggers = await menuTriggers(true);

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers.map(button => button.disabled)).toEqual(triggers.map(() => true));
    });

    it('stays available for editing', async () => {
      const triggers = await menuTriggers(false);

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers.map(button => button.disabled)).toEqual(triggers.map(() => false));
    });
  });
}
