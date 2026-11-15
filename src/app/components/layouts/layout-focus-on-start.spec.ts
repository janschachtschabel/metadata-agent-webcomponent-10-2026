import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { InputAreaComponent } from '../shared/input-area/input-area.component';
import { createInitialState } from '../../shared/models/canvas.models';
import { NoAnimationsModule } from '../../testing/no-animations';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * Audit 14.11. (U-14): Ctrl+Enter in the text box starts the extraction - and
 * the box became `disabled` at once. A disabled element cannot hold the focus:
 * it fell to <body>, and a keyboard user started again from the top of the
 * page. While a run is out the inputs are read-only now, and the buttons
 * beside them stay focusable.
 */
const WITH_INPUTS: [string, Type<unknown>][] = [
  ['default layout', DefaultLayoutComponent],
  ['input area', InputAreaComponent],
];
const MODES: [string, string, string][] = [
  ['text', 'textarea', 'userText'],
  ['url', 'input[type="url"]', 'sourceUrl'],
  ['nodeId', 'input[type="text"]', 'nodeId'],
];

for (const [name, component] of WITH_INPUTS) {
  describe(`${name} when an extraction starts`, () => {
    const extracting = (on: boolean): Record<string, unknown> => name === 'default layout'
      ? { state: { ...createInitialState(), isExtracting: on } }
      : { isExtracting: on };

    async function render(inputs: Record<string, unknown>) {
      await TestBed.configureTestingModule({
        imports: [component, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(component);
      for (const [input, value] of Object.entries({ ...inputs, ...extracting(false) })) fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    for (const [mode, selector, model] of MODES) {
      it(`keeps the focus in the ${mode} input, which is read-only meanwhile`, async () => {
        const fixture = await render({ inputMode: mode, [model]: 'https://example.org/seite' });
        const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
        input.focus();

        for (const [key, value] of Object.entries(extracting(true))) fixture.componentRef.setInput(key, value);
        fixture.detectChanges();

        expect(document.activeElement).toBe(input);
        expect(input.disabled).withContext('a disabled input drops the focus').toBeFalse();
        expect(input.readOnly).toBeTrue();
        expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
      });

      it(`lets the ${mode} input be edited again afterwards`, async () => {
        const fixture = await render({ inputMode: mode, [model]: 'https://example.org/seite' });
        const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
        for (const [key, value] of Object.entries(extracting(true))) fixture.componentRef.setInput(key, value);
        fixture.detectChanges();

        for (const [key, value] of Object.entries(extracting(false))) fixture.componentRef.setInput(key, value);
        fixture.detectChanges();

        expect(input.readOnly).toBeFalse();
      });
    }

    it('keeps the focus on "reset", which does nothing meanwhile', async () => {
      const fixture = await render({ userText: 'Ein Text' });
      const reset = fixture.nativeElement.querySelector('.btn-reset') as HTMLButtonElement;
      let resets = 0;
      (fixture.componentInstance as any).reset.subscribe(() => resets++);
      reset.focus();

      for (const [key, value] of Object.entries(extracting(true))) fixture.componentRef.setInput(key, value);
      fixture.detectChanges();
      reset.click();

      expect(document.activeElement).toBe(reset);
      expect(reset.getAttribute('aria-disabled')).toBe('true');
      expect(resets).toBe(0);
    });
  });
}
