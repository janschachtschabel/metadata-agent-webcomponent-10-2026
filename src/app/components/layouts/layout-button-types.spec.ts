import { TestBed } from '@angular/core/testing';
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
 * Audit 13.11. (W-ARCH-01): 41 of the widget's 51 buttons had no `type`. The
 * widget renders into the light DOM of its host; inside a <form> of the host
 * page such a button is a submit button, and a click on "Zurücksetzen" or on
 * the type menu sent the host's form.
 *
 * Every layout with everything it can show, in each input mode and with its
 * menus open: no button without type="button", the ones from Material and the
 * time picker included.
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
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: false,
    datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

/** One field of every kind that brings buttons of its own. */
function filledState(): CanvasState {
  const subjects = ['Mathematik', 'Physik', 'Chemie', 'Biologie', 'Informatik'];
  const fields = [
    field({}),
    field({ fieldId: 'ccm:taxonid', label: 'Fach', value: ['http://w3id.org/s/0'], multiple: true,
      vocabulary: { type: 'closed', concepts: subjects.map((label, i) => ({ uri: `http://w3id.org/s/${i}`, label })) } as any }),
    field({ fieldId: 'schema:startDate', label: 'Datum', datatype: 'date', value: '2026-05-03' }),
    field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time', value: '14:30' }),
    field({ fieldId: 'schema:doorTime', label: 'Einlass', datatype: 'datetime', value: '2026-05-03T14:00' }),
    field({ fieldId: 'cclom:general_keyword', label: 'Schlagwörter', datatype: 'array', multiple: true, value: ['Brüche', 'Zahlen'] }),
  ];
  return {
    ...createInitialState(),
    coreFields: fields,
    fieldGroups: [{ id: 'basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }],
    totalFields: fields.length,
    filledFields: fields.length,
    contentTypeLabel: 'Veranstaltung',
    extractionError: 'Fehler',
    extractionWarning: 'Hinweis',
    previewImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };
}

const EVERYTHING: Record<string, unknown> = {
  readonly: false,
  userText: 'Ein Text', sourceUrl: 'https://example.org', nodeId: 'n1',
  contentTypes: [{ label: 'Veranstaltung', schemaFile: 'event.json', icon: 'event' }, { label: 'Person', schemaFile: 'person.json' }],
  showInputArea: true, showStatusBar: true, showFloatingControls: true, showContentType: true,
  showUploadButton: true, showSaveButton: true, showResetButton: true, showJsonLoader: true,
  showLanguageSwitcher: true, showPageMode: true, showPreview: true, showFieldActions: true,
};

for (const [name, layout] of LAYOUTS) {
  for (const inputMode of ['text', 'url', 'nodeId']) {
    it(`${name} layout (${inputMode}): every button is a type="button"`, async () => {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      const declared = new Set(reflectComponentType(layout)!.inputs.map(input => input.templateName));
      for (const [input, value] of Object.entries({ ...EVERYTHING, state: filledState(), inputMode })) {
        if (declared.has(input)) fixture.componentRef.setInput(input, value);
      }
      fixture.detectChanges();
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      // The menu items exist once their menu is open.
      for (const trigger of Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'))) {
        trigger.click();
        fixture.detectChanges();
      }
      await fixture.whenStable();

      const overlays = TestBed.inject(OverlayContainer).getContainerElement();
      const buttons = [...Array.from(root.querySelectorAll('button')), ...Array.from(overlays.querySelectorAll('button'))];
      const untyped = buttons
        .filter(button => button.getAttribute('type') !== 'button')
        .map(button => button.outerHTML.replace(/\s+/g, ' ').slice(0, 120));

      expect(buttons.length).toBeGreaterThan(0);
      expect(overlays.querySelectorAll('[mat-menu-item], .mat-mdc-menu-item').length).withContext('menu items rendered').toBeGreaterThan(0);
      expect(untyped).toEqual([]);
    });
  }
}
