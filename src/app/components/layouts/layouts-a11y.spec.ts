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
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * Every layout, filled, with its default controls: no serious axe violations
 * (audits U-01, U-05, T-02). Icon buttons without a name, unnamed progress
 * bars and clickable divs were spread over all seven.
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
    datatype: 'string', multiple: false, isAiGenerated: true,
  } as unknown as CanvasFieldState;
  return {
    ...createInitialState(),
    coreFields: [title],
    fieldGroups: [{ id: 'basics', label: 'Grunddaten', schemaName: 'Core', fields: [title], isCore: true }],
    totalFields: 1,
    filledFields: 1,
    contentTypeLabel: 'Veranstaltung',
    selectedContentType: 'event.json',
    detectedContentType: 'event.json',
  };
}

for (const [name, layout] of LAYOUTS) {
  it(`${name} layout has no serious accessibility violations`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoopAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    fixture.componentRef.setInput('state', filledState());
    fixture.componentRef.setInput('contentTypes', [
      { schemaFile: 'event.json', label: 'Veranstaltung', icon: 'event' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
}
