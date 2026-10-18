import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * A collapsible field group is opened and closed from the keyboard (audit U-01).
 * The headers were divs with a click handler: not reachable by Tab, no
 * expanded/collapsed state for screen readers.
 */
const LAYOUTS: [string, Type<unknown>][] = [
  ['default', DefaultLayoutComponent],
  ['clean', CleanLayoutComponent],
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
        imports: [layout, TranslateModule.forRoot(), NoopAnimationsModule],
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
