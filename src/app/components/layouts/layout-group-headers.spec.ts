import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';

import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { DetailLayoutComponent } from './detail-layout/detail-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { PrueftischLayoutComponent } from './prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from './prueftisch-org-layout/prueftisch-org-layout.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * A collapsible field group is opened and closed from the keyboard (audit U-01).
 * The headers were divs with a click handler: not reachable by Tab, no
 * expanded/collapsed state for screen readers.
 *
 * Audit 14.11. (U-12): the presets of plugin and prueftisch promised the same
 * and their templates had no toggle; they have one now, from the same
 * component. Dialog, detail and prueftisch-org promise none.
 */
const LAYOUTS: [string, Type<unknown>][] = [
  ['default', DefaultLayoutComponent],
  ['clean', CleanLayoutComponent],
  ['plugin', PluginLayoutComponent],
  ['prueftisch', PrueftischLayoutComponent],
];
const WITHOUT_TOGGLE: [string, Type<unknown>][] = [
  ['detail', DetailLayoutComponent],
  ['dialog', DialogLayoutComponent],
  ['prueftisch-org', PrueftischOrgLayoutComponent],
];

function stateWithOneGroup(): CanvasState {
  const field = {
    fieldId: 'cclom:title',
    label: 'Titel',
    group: 'basics',
    groupLabel: 'Grunddaten',
    groupOrder: 1,
    schemaName: 'Core',
    aiFillable: true,
    repoField: true,
    status: FieldStatus.FILLED,
    value: 'Bruchrechnung',
    confidence: 1,
    isRequired: true,
    datatype: 'string',
    multiple: false,
  } as unknown as CanvasFieldState;
  return {
    ...createInitialState(),
    coreFields: [field],
    fieldGroups: [{ id: 'basics', label: 'Grunddaten', schemaName: 'Core', fields: [field], isCore: true }],
    totalFields: 1,
    filledFields: 1,
  };
}

for (const [name, layout] of LAYOUTS) {
  describe(`${name} layout group headers`, () => {
    async function render() {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      fixture.componentRef.setInput('state', stateWithOneGroup());
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    it('is a button that says whether the group is open', async () => {
      const fixture = await render();
      const toggle = fixture.nativeElement.querySelector('.group-header button') as HTMLButtonElement;

      expect(toggle).withContext('a real button, reachable by Tab').not.toBeNull();
      expect(toggle.textContent!.trim()).toBe('Grunddaten');
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const fields = fixture.nativeElement.querySelector(`#${toggle.getAttribute('aria-controls')}`);
      expect(fields).withContext('aria-controls points at the fields').not.toBeNull();
    });

    it('opens and closes with the button', async () => {
      const fixture = await render();
      const toggle = () => fixture.nativeElement.querySelector('.group-header button') as HTMLButtonElement;

      toggle().click();
      fixture.detectChanges();

      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(fixture.nativeElement.querySelector('.group-fields')).toBeNull();
      expect(toggle().getAttribute('aria-controls'))
        .withContext('no reference to fields that are not rendered').toBeNull();

      toggle().click();
      fixture.detectChanges();

      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('has no serious accessibility violations', async () => {
      const fixture = await render();

      expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
    });
  });
}

/**
 * Audit 14.11. (U-N): the detail layout named its groups in an <h2>, the
 * others in an <h3>; three layouts upper-cased the name with a pipe, so a
 * screen reader got "GRUNDDATEN" as text and may spell it out.
 */
for (const [name, layout] of [...LAYOUTS, ...WITHOUT_TOGGLE]) {
  it(`${name} layout names a group in an <h3>, spelled as in the schema`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    fixture.componentRef.setInput('state', stateWithOneGroup());
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(Array.from(root.querySelectorAll('h1, h2, h4')).length).toBe(0);
    expect(root.querySelector('.group-header h3')!.textContent!.trim()).toBe('Grunddaten');
  });
}

for (const [name, layout] of WITHOUT_TOGGLE) {
  it(`${name} layout has plain group headings: its preset promises no collapsing`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    const state = stateWithOneGroup();
    state.fieldGroups[0].collapsed = true; // collapsed in another layout on the same instance
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.group-header button')).toBeNull();
    expect(root.querySelector('.group-fields app-field')).withContext('fields stay visible').not.toBeNull();
  });
}
