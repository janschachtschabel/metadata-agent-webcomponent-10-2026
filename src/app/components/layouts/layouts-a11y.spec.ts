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
import { inWidgetTheme, seriousA11yViolations } from '../../testing/a11y';

/**
 * Every layout, filled, with its default controls: no serious axe violations
 * (audits U-01, U-05, T-02). Icon buttons without a name, unnamed progress
 * bars and clickable divs were spread over all seven.
 *
 * Audit 14.11. (U-13): with colour contrast, under the widget's own theme -
 * the check was off, and four colours were below the WCAG thresholds.
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

function field(overrides: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: true,
    datatype: 'string', multiple: false, isAiGenerated: true,
    ...overrides,
  } as unknown as CanvasFieldState;
}

/**
 * One field of every kind of input (final audit 18.10., T-2): the check ran
 * with a single text field, so picker, date, time, radio and chip markup were
 * never looked at.
 */
function filledState(): CanvasState {
  const subjects = ['Mathematik', 'Physik', 'Chemie', 'Biologie', 'Informatik'];
  const fields = [
    field({}),
    field({ fieldId: 'ccm:taxonid', label: 'Fach', isRequired: false, value: ['http://w3id.org/s/0'], multiple: true,
      vocabulary: { type: 'closed', concepts: subjects.map((label, i) => ({ uri: `http://w3id.org/s/${i}`, label })) } as any }),
    field({ fieldId: 'schema:startDate', label: 'Datum', datatype: 'date', value: '2026-05-03', isRequired: false }),
    field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time', value: '14:30', isRequired: false }),
    field({ fieldId: 'schema:doorTime', label: 'Einlass', datatype: 'datetime', value: '2026-05-03T14:00', isRequired: false }),
    field({ fieldId: 'schema:isAccessibleForFree', label: 'Kostenlos', datatype: 'boolean', value: 'true', isRequired: false }),
    field({ fieldId: 'cclom:general_keyword', label: 'Schlagwörter', datatype: 'array', multiple: true, value: ['Brüche', 'Zahlen'], isRequired: false }),
  ];
  return {
    ...createInitialState(),
    coreFields: fields,
    fieldGroups: [{ id: 'basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }],
    totalFields: fields.length,
    filledFields: fields.length,
    contentTypeLabel: 'Veranstaltung',
    selectedContentType: 'event.json',
    detectedContentType: 'event.json',
  };
}

for (const [name, layout] of LAYOUTS) {
  it(`${name} layout has no serious accessibility violations`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    inWidgetTheme(fixture.nativeElement);
    fixture.componentRef.setInput('state', filledState());
    fixture.componentRef.setInput('contentTypes', [
      { schemaFile: 'event.json', label: 'Veranstaltung', icon: 'event' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(await seriousA11yViolations(fixture.nativeElement, { contrast: true })).toEqual([]);
  });
}

/**
 * The same with a form that still lacks its required field: the open-required
 * badge of the status bar, the required hint, descriptions and placeholders
 * (audit 14.11., U-13 - the filled form shows none of them).
 */
for (const [name, layout] of LAYOUTS) {
  it(`${name} layout has no serious accessibility violations while a required field is empty`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    inWidgetTheme(fixture.nativeElement);
    const fields = [
      field({ status: FieldStatus.EMPTY, value: null, isAiGenerated: false, description: 'Der Titel der Ressource' }),
      field({ fieldId: 'schema:startDate', label: 'Datum', datatype: 'date', status: FieldStatus.EMPTY, value: null, isRequired: false, description: 'Beginn' }),
      field({ fieldId: 'cclom:general_keyword', label: 'Schlagwörter', datatype: 'array', multiple: true, value: ['Brüche'], isRequired: false }),
    ];
    fixture.componentRef.setInput('state', { ...filledState(), coreFields: fields, totalFields: 3, filledFields: 1,
      fieldGroups: [{ id: 'basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }] });
    fixture.componentRef.setInput('readonly', false);
    fixture.componentRef.setInput('showStatusBar', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(await seriousA11yViolations(fixture.nativeElement, { contrast: true })).toEqual([]);
  });
}

/**
 * The empty state's icon is an inline SVG: edu-sharing loads no styles.css, and
 * its own icon font (Material Symbols) has no ligature "info_outline" - the
 * name showed as text.
 */
for (const [name, layout] of LAYOUTS.filter(([n]) => n !== 'default')) {
  it(`${name} layout draws the empty-state icon without an icon font`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    fixture.componentRef.setInput('state', createInitialState());
    fixture.detectChanges();
    await fixture.whenStable();

    const icon = fixture.nativeElement.querySelector('.empty-state mat-icon') as HTMLElement;
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.textContent?.trim()).toBe('');
  });
}
