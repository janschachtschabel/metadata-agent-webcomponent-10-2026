import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';
import { By } from '@angular/platform-browser';
import { MatTimepicker } from '@angular/material/timepicker';
import { DateAdapter } from '@angular/material/core';

import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';
import { I18nService } from '../../core/i18n.service';
import { commitPendingInputs } from '../../core/pending-inputs';

/**
 * A vocabulary field opens its picker from the keyboard and gets the focus
 * back when the picker closes (audit U-01). The trigger listened to mousedown
 * only: keyboard and screen-reader users could not fill these fields at all.
 */
describe('FieldComponent vocabulary picker by keyboard', () => {
  let fixture: ComponentFixture<FieldComponent>;

  const SUBJECTS = ['Mathematik', 'Physik', 'Chemie', 'Biologie', 'Informatik', 'Geschichte'];
  const FIELD: CanvasFieldState = {
    fieldId: 'ccm:taxonid',
    label: 'Fach',
    group: 'g',
    groupLabel: 'G',
    groupOrder: 1,
    schemaName: 'Core',
    aiFillable: true,
    repoField: true,
    status: FieldStatus.EMPTY,
    value: null,
    confidence: 0,
    isRequired: false,
    datatype: 'string',
    multiple: false,
    vocabulary: {
      type: 'closed',
      concepts: SUBJECTS.map((label, i) => ({ uri: `http://w3id.org/subject/${i}`, label })),
    },
  } as unknown as CanvasFieldState;

  function pickerInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('.picker-display-input');
  }

  function dialog(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="dialog"]');
  }

  async function press(target: HTMLElement, key: string): Promise<void> {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(FieldComponent);
    fixture.componentRef.setInput('field', FIELD);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  for (const key of ['Enter', ' ', 'ArrowDown']) {
    it(`opens the picker with "${key === ' ' ? 'Space' : key}"`, async () => {
      await press(pickerInput(), key);

      expect(dialog()).not.toBeNull();
    });
  }

  it('tells assistive technology that the field opens a dialog, and whether it is open', async () => {
    expect(pickerInput().getAttribute('aria-haspopup')).toBe('dialog');
    expect(pickerInput().getAttribute('aria-expanded')).toBe('false');

    await press(pickerInput(), 'Enter');

    expect(pickerInput().getAttribute('aria-expanded')).toBe('true');
  });

  it('gives the focus back to the field when the picker closes', async () => {
    await press(pickerInput(), 'Enter');
    await press(dialog()!, 'Escape');
    await new Promise(resolve => setTimeout(resolve));

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(pickerInput());
  });

  it('names the picker after the field', async () => {
    await press(pickerInput(), 'Enter');

    expect(dialog()!.getAttribute('aria-label')).toBe('Fach');
  });

  it('has no serious accessibility violations, closed or open', async () => {
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);

    await press(pickerInput(), 'Enter');

    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('FieldComponent chips', () => {
  it('names the remove button after the value it removes', async () => {
    await TestBed.configureTestingModule({
      imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', { FIELD: { REMOVE_VALUE: '{{value}} entfernen', SELECTED_VALUES: 'Ausgewählte Werte' } });
    translate.use('de');
    const fixture = TestBed.createComponent(FieldComponent);
    fixture.componentRef.setInput('field', {
      fieldId: 'cclom:general_keyword', label: 'Schlagwörter', group: 'g', groupLabel: 'G',
      groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
      status: FieldStatus.FILLED, value: ['Musik', 'Konzert'], confidence: 1, isRequired: false,
      datatype: 'array', multiple: true,
    } as unknown as CanvasFieldState);
    fixture.detectChanges();
    await fixture.whenStable();

    const remove = fixture.nativeElement.querySelector('[matChipRemove]') as HTMLElement;
    expect(remove.getAttribute('aria-label')).toBe('Musik entfernen');
    // An inline SVG, not a font ligature: edu-sharing loads main.js without
    // styles.css, so an icon font of the widget would render as text ("ca…").
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.textContent?.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('mat-chip-set').getAttribute('aria-label'))
      .toBe('Ausgewählte Werte');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
});

/**
 * Runs `act` and the field's 200 ms blur delay on a mock clock: no real
 * waiting, and no timing the test depends on (final audit 18.10., T-3).
 */
function passingBlurDelay(act: () => void): void {
  jasmine.clock().install();
  try {
    act();
    jasmine.clock().tick(250);
  } finally {
    jasmine.clock().uninstall();
  }
}

function plainField(overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId: 'cclom:title', label: 'Titel', group: 'g', groupLabel: 'G', groupOrder: 1,
    schemaName: 'Core', aiFillable: true, repoField: true, status: FieldStatus.EMPTY,
    value: null, confidence: 0, isRequired: false, datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

async function renderField(field: CanvasFieldState, lang = 'de', inputs: Record<string, unknown> = {}) {
  await TestBed.configureTestingModule({
    imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule],
  }).compileComponents();
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation(lang, {
    FIELD: {
      REQUIRED_HINT: 'Pflichtfeld – muss ausgefüllt werden',
      AI_SUGGESTION: 'KI-Vorschlag',
      DATE_PLACEHOLDER: lang === 'en' ? 'DD/MM/YYYY' : 'TT.MM.JJJJ',
    },
  });
  // Through I18nService, the widget's source of truth: created on the way (the
  // validation service needs it), it would otherwise apply its own language.
  TestBed.inject(I18nService).setLanguage(lang);
  const fixture = TestBed.createComponent(FieldComponent);
  fixture.componentRef.setInput('field', field);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

/**
 * Audit U-12: the error text and the required state were only visible. A
 * screen reader announced neither "required" nor what was wrong with a value.
 */
describe('FieldComponent errors and required state', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('says that a field is required and points at the hint', async () => {
    const fixture = await renderField(plainField({ isRequired: true }));
    const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    expect(input.getAttribute('aria-required')).toBe('true');
    const hint = fixture.nativeElement.querySelector(`#${input.getAttribute('aria-describedby')!.split(' ').join(', #')}`);
    expect(hint?.textContent.trim()).toBe('Pflichtfeld – muss ausgefüllt werden');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });

  it('marks an invalid value and points at the error text', async () => {
    const fixture = await renderField(plainField({ datatype: 'url' }));
    fixture.componentInstance.validationError = 'Ungültige URL';
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    const error = fixture.nativeElement.querySelector('.support-text.error') as HTMLElement;
    expect(ids).toContain(error.id);
    expect(error.textContent!.trim()).toBe('Ungültige URL');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });

  it('says that a choice of radio buttons is required', async () => {
    const fixture = await renderField(plainField({ datatype: 'boolean', isRequired: true }));
    const group = fixture.nativeElement.querySelector('mat-radio-group') as HTMLElement;

    expect(group.getAttribute('aria-required')).toBe('true');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });
});

/**
 * The 2.1.1 end-to-end check: what the editor types is validated on leaving
 * the field, and a rejection reaches them as a message outside Material's
 * subscript (which the layouts hide).
 */
describe('FieldComponent validation from typing to the error message', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function typeAndLeave(field: CanvasFieldState, text: string) {
    const fixture = await renderField(field);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    passingBlurDelay(() => {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur'));
    });
    fixture.detectChanges();
    return { alert: fixture.nativeElement.querySelector('.support-text.error') as HTMLElement | null, emitted };
  }

  it('shows a typed invalid number as an error message outside the Material subscript', async () => {
    const { alert, emitted } = await typeAndLeave(plainField({ datatype: 'integer' }), '12.7');

    expect(alert?.textContent?.trim()).toBeTruthy();
    expect(alert!.closest('.mat-mdc-form-field-subscript-wrapper')).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('shows no error for a typed valid number and emits it', async () => {
    const { alert, emitted } = await typeAndLeave(plainField({ datatype: 'number' }), '42');

    expect(alert).toBeNull();
    expect(emitted).toEqual([42]);
  });
});

/** Audit U-16: the AI origin was shown by colour alone. */
describe('FieldComponent AI origin', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('names the AI origin in text, not only in colour', async () => {
    const fixture = await renderField(
      plainField({ status: FieldStatus.FILLED, value: 'Bruchrechnung', isAiGenerated: true }),
      'de',
      { highlightAi: true },
    );

    expect(fixture.nativeElement.querySelector('.ai-origin')?.textContent).toContain('KI-Vorschlag');
    expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
  });

  it('says nothing about AI for a value the editor typed', async () => {
    const fixture = await renderField(
      plainField({ status: FieldStatus.FILLED, value: 'Bruchrechnung', isAiGenerated: false }),
      'de',
      { highlightAi: true },
    );

    expect(fixture.nativeElement.querySelector('.ai-origin')).toBeNull();
  });
});

/** Audit U-14: the time field accepted only the clock dial; dates were always German. */
describe('FieldComponent dates and times', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('accepts a typed time', async () => {
    const fixture = await renderField(plainField({ fieldId: 'schema:startTime', datatype: 'time' }));
    const input = fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement;
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));

    expect(input.readOnly).withContext('typing must be possible').toBeFalse();
    input.value = '9:30';
    input.dispatchEvent(new Event('change'));

    expect(emitted).toEqual(['09:30']);
  });

  // Release review 18.10. (#22): the timepicker directive on the typed input
  // parsed the text first and wrote "Invalid DateTime" back into it.
  describe('a typed time', () => {
    async function typeTime(text: string) {
      const fixture = await renderField(plainField({ fieldId: 'schema:startTime', datatype: 'time' }));
      const input = fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement;
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, input, emitted };
    }

    it('accepts a dot as separator', async () => {
      const { emitted, fixture } = await typeTime('9.30');

      expect(emitted).toEqual(['09:30']);
      expect(fixture.componentInstance.validationError).toBeFalsy();
    });

    it('the clock still sets the time and returns the focus to the typed input', async () => {
      const { fixture, input, emitted } = await typeTime('');
      // One clock, for this field: a field without a time has none (audit 14.11., U-18).
      const pickers = fixture.debugElement.queryAll(By.directive(MatTimepicker));
      expect(pickers.length).toBe(1);
      const picker = pickers[0].componentInstance as MatTimepicker<Date>;
      const quarterPastTwo = new Date(2026, 4, 3, 14, 15);

      picker.selected.emit({ value: quarterPastTwo, source: picker });
      picker.closed.emit();
      await fixture.whenStable();

      expect(emitted).toContain('14:15');
      expect(document.activeElement).toBe(input);
    });

    // Follow-up review 18.10.: the pickers take their disabled state from the
    // input they are registered with - the hidden anchor, which was never
    // disabled. The clock (and calendar) stayed usable while the field was not.
    for (const datatype of ['time', 'datetime']) {
      const toggles = (root: HTMLElement) => Array.from(root.querySelectorAll(
        'mat-timepicker-toggle button, mat-datepicker-toggle button'
      )) as HTMLButtonElement[];

      it(`an extracting ${datatype} field offers no picker`, async () => {
        const fixture = await renderField(plainField({ fieldId: 'schema:startTime', datatype, status: FieldStatus.EXTRACTING }));
        fixture.detectChanges();

        expect(toggles(fixture.nativeElement).length).toBeGreaterThan(0);
        expect(toggles(fixture.nativeElement).map(b => b.disabled)).toEqual(toggles(fixture.nativeElement).map(() => true));
      });

      // A read-only field is text (audit 14.11., U-02): no control, no picker.
      it(`a read-only ${datatype} field has no picker at all`, async () => {
        const fixture = await renderField(plainField({ fieldId: 'schema:startTime', datatype }), 'de', { readonly: true });
        fixture.detectChanges();

        expect(toggles(fixture.nativeElement)).toEqual([]);
      });
    }

    for (const text of ['930?', 'abc']) {
      it(`rejects "${text}" and keeps what the editor typed`, async () => {
        const { emitted, fixture, input } = await typeTime(text);

        expect(emitted).toEqual([]);
        expect(fixture.componentInstance.validationError).toBe('VALIDATION.INVALID_TIME');
        expect(input.value).toBe(text);
        expect(fixture.componentInstance.inputValue).toBe(text);
      });
    }
  });

  it('shows a date in the format of the current language', async () => {
    const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'date', value: '2026-05-03' }), 'en');
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement;
    expect(input.value).toBe('03/05/2026');
    expect(input.placeholder).toBe('DD/MM/YYYY');
  });

  it('keeps the German date format in German', async () => {
    const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'date', value: '2026-05-03' }), 'de');
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement;
    expect(input.value).toBe('03.05.2026');
  });

  // Final audit 18.10. (W-L2): a typed date-time had no range check, and text
  // that was not recognised was dropped without a word.
  describe('a typed date-time', () => {
    async function typeDateTime(text: string) {
      const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'datetime' }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
      fixture.componentInstance.inputValue = text;
      fixture.componentInstance.onDateTimeBlur();
      return { component: fixture.componentInstance, emitted };
    }

    for (const text of ['31.02.2026 25:99', '31.02.2026 10:00', 'morgen']) {
      it(`rejects "${text}" with a message and emits nothing`, async () => {
        const { component, emitted } = await typeDateTime(text);

        expect(emitted).toEqual([]);
        expect(component.validationError).toBe('VALIDATION.INVALID_DATETIME');
        expect(component.inputValue).withContext('what the editor typed stays').toBe(text);
      });
    }

    it('accepts a valid one', async () => {
      const { component, emitted } = await typeDateTime('03.05.2026 9:30');

      expect(emitted).toEqual(['2026-05-03T09:30']);
      expect(component.validationError).toBeFalsy();
    });

    it('says nothing about an AI value it cannot read while the editor did not touch it', async () => {
      const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'datetime', status: FieldStatus.FILLED, value: 'Frühjahr 2026' }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));

      fixture.componentInstance.onDateTimeBlur();

      expect(emitted).toEqual([]);
      expect(fixture.componentInstance.validationError).toBeFalsy();
    });
  });

  // Final audit 18.10. (W-L3): the date adapter rolled 31.02. over to March
  // and let Date.parse guess ("1" → 2001-01-01, "Sommer 2026" → 1 January).
  describe('the date adapter', () => {
    async function adapter(): Promise<DateAdapter<Date>> {
      const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'date' }));
      return fixture.debugElement.injector.get(DateAdapter) as DateAdapter<Date>;
    }

    it('reads a typed day-first date', async () => {
      const date = (await adapter()).parse('03.05.2026', null)!;

      expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 4, 3]);
    });

    for (const text of ['31.02.2026', '1', 'Sommer 2026']) {
      it(`does not turn "${text}" into a date`, async () => {
        const dates = await adapter();
        const parsed = dates.parse(text, null);

        expect(parsed === null || !dates.isValid(parsed)).toBeTrue();
      });
    }

    it('reports a typed date it cannot read', async () => {
      const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'date' }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));

      fixture.componentInstance.onDateChange({ value: new Date(NaN) });

      expect(emitted).toEqual([]);
      expect(fixture.componentInstance.validationError).toBe('VALIDATION.INVALID_DATE');
    });
  });

  it('shows a date and time in the format of the current language', async () => {
    const fixture = await renderField(plainField({ fieldId: 'schema:startDate', datatype: 'datetime', value: '2026-05-03T14:30' }), 'en');

    expect(fixture.componentInstance.inputValue).toBe('03/05/2026 14:30');
  });
});

/**
 * Review 18.10. (L-01 false positives): leaving a field emitted its value even
 * when nothing had changed. During a run the canvas took that for an edit and
 * kept the field against the AI value on its way.
 */
describe('FieldComponent leaving a field without a change', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function emissions(field: CanvasFieldState, act: (c: FieldComponent) => void | Promise<void>): Promise<unknown[]> {
    const fixture = await renderField(field);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    await act(fixture.componentInstance);
    return emitted;
  }


  it('emits nothing for an unchanged text value', async () => {
    const emitted = await emissions(
      plainField({ status: FieldStatus.FILLED, value: 'Bruchrechnung' }),
      c => passingBlurDelay(() => c.onBlur()),
    );

    expect(emitted).toEqual([]);
  });

  it('still emits a changed text value', async () => {
    const emitted = await emissions(
      plainField({ status: FieldStatus.FILLED, value: 'Bruchrechnung' }),
      c => passingBlurDelay(() => { c.inputValue = 'Dezimalzahlen'; c.onBlur(); }),
    );

    expect(emitted).toEqual(['Dezimalzahlen']);
  });

  it('emits nothing for an empty date-time field', async () => {
    const emitted = await emissions(
      plainField({ fieldId: 'schema:startDate', datatype: 'datetime' }),
      c => c.onDateTimeBlur(),
    );

    expect(emitted).toEqual([]);
  });

  it('emits nothing for an unchanged date-time', async () => {
    const emitted = await emissions(
      plainField({ fieldId: 'schema:startDate', datatype: 'datetime', status: FieldStatus.FILLED, value: '2026-05-03T14:30' }),
      c => c.onDateTimeBlur(),
    );

    expect(emitted).toEqual([]);
  });

  // Review 18.10.: a value from the backend with seconds or an offset is shown
  // as "TT.MM.JJJJ HH:MM". Tabbing through compared that with the stored value,
  // emitted "...T10:00" (offset gone) and marked the AI value as typed.
  for (const value of ['2026-05-03T10:00:00', '2026-05-03T10:00:00Z', '2026-05-03T10:00:00+02:00']) {
    it(`emits nothing for an unchanged date-time stored as ${value}`, async () => {
      const emitted = await emissions(
        plainField({ fieldId: 'schema:startDate', datatype: 'datetime', status: FieldStatus.FILLED, value }),
        c => c.onDateTimeBlur(),
      );

      expect(emitted).toEqual([]);
    });
  }

  it('still emits a changed date-time of a value stored with an offset', async () => {
    const emitted = await emissions(
      plainField({ fieldId: 'schema:startDate', datatype: 'datetime', status: FieldStatus.FILLED, value: '2026-05-03T10:00:00+02:00' }),
      c => { c.inputValue = '04.05.2026 10:00'; c.onDateTimeBlur(); },
    );

    // With the seconds and the offset the value had (audit 14.11., W-47);
    // this used to pin '2026-05-04T10:00'.
    expect(emitted).toEqual(['2026-05-04T10:00:00+02:00']);
  });

  it('still emits an emptied date-time', async () => {
    const emitted = await emissions(
      plainField({ fieldId: 'schema:startDate', datatype: 'datetime', status: FieldStatus.FILLED, value: '2026-05-03T14:30' }),
      c => { c.inputValue = ''; c.onDateTimeBlur(); },
    );

    expect(emitted).toEqual([null]);
  });
});

/**
 * Enter on a multi-value field adds a chip and empties the textarea. When no
 * change detection ran between the typing and the Enter (it runs coalesced,
 * after the event), the typed word stayed in the textarea next to its chip.
 */
describe('FieldComponent multi-value input', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('empties the textarea on the first Enter right after typing', async () => {
    const field = plainField({ fieldId: 'cclom:general_keyword', label: 'Schlagwörter', datatype: 'array', multiple: true });
    const fixture = await renderField(field);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    textarea.focus();
    textarea.value = 'Klassik';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
    // The canvas answers the emit with a new field state, as in the widget.
    fixture.componentRef.setInput('field', { ...field, status: FieldStatus.FILLED, value: ['Klassik'] });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toEqual([['Klassik']]);
    expect(textarea.value).toBe('');
  });
});

/**
 * Final audit 18.10. (W-L4): a multi-valued field of a special datatype
 * (person.json schema:url: uri + multiple) rendered one input with an empty
 * value - the existing values were invisible, new ones went in unchecked, and
 * leaving a multi-valued date-time emitted null and wiped the list.
 */
describe('FieldComponent multi-valued special datatypes', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  const URLS = plainField({
    fieldId: 'schema:url', label: 'Webseiten', datatype: 'uri', multiple: true,
    status: FieldStatus.FILLED, value: ['https://a.example', 'https://b.example'],
  });

  function chips(fixture: ComponentFixture<FieldComponent>): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('mat-chip') as NodeListOf<HTMLElement>)
      .map(chip => chip.textContent!.replace('cancel', '').trim());
  }

  async function type(fixture: ComponentFixture<FieldComponent>, text: string): Promise<unknown[]> {
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
    return emitted;
  }

  it('shows the values as chips', async () => {
    expect(chips(await renderField(URLS))).toEqual(['https://a.example', 'https://b.example']);
  });

  // Audit 14.11. (U-02): read-only, each address is a link in a list.
  it('shows the values as links when read-only', async () => {
    const fixture = await renderField(URLS, 'de', { readonly: true });
    const links = Array.from(fixture.nativeElement.querySelectorAll('.readonly-list li a')) as HTMLAnchorElement[];

    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://a.example', 'https://b.example']);
    expect(links.map(a => a.getAttribute('rel'))).toEqual(['noopener noreferrer', 'noopener noreferrer']);
  });

  it('checks a new item as an address', async () => {
    const fixture = await renderField(URLS);

    const emitted = await type(fixture, 'kein link');

    expect(emitted).toEqual([]);
    expect(fixture.componentInstance.validationError).toContain('VALIDATION.INVALID_URL');
  });

  it('adds a valid item, normalised', async () => {
    const fixture = await renderField(URLS);

    const emitted = await type(fixture, 'c.example');

    expect(emitted).toEqual([['https://a.example', 'https://b.example', 'https://c.example']]);
  });

  it('a multi-valued date-time keeps its list when left without typing', async () => {
    const fixture = await renderField(plainField({
      fieldId: 'schema:previousStartDate', datatype: 'datetime', multiple: true,
      status: FieldStatus.FILLED, value: ['2026-05-03T14:00'],
    }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const input = fixture.nativeElement.querySelector('textarea, input[matInput]') as HTMLElement;

    passingBlurDelay(() => input.dispatchEvent(new Event('blur')));

    expect(emitted).toEqual([]);
    expect(chips(fixture)).toEqual(['2026-05-03T14:00']);
  });

  it('checks a new date-time item as a date-time', async () => {
    const fixture = await renderField(plainField({
      fieldId: 'schema:previousStartDate', datatype: 'datetime', multiple: true, value: [],
    }));

    expect(await type(fixture, '31.02.2026 10:00')).toEqual([]);
    expect(fixture.componentInstance.validationError).toContain('VALIDATION.INVALID_DATETIME');
  });
});

/**
 * Audit 13.11. (W-LOG-01): every typed value waited 200 ms after the field was
 * left - for a click on an autocomplete option that most fields do not have.
 * Now only a field whose autocomplete panel is open waits, and whoever reads
 * the form at once takes the waiting value in first (pending-inputs.ts).
 */
describe('FieldComponent leaving a field after typing', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  const LEVEL = plainField({
    fieldId: 'ccm:level', label: 'Niveau',
    vocabulary: {
      type: 'open',
      concepts: [
        { uri: 'http://w3id.org/level/1', label: 'Einstieg' },
        { uri: 'http://w3id.org/level/2', label: 'Fortgeschritten' },
      ],
    },
  } as Partial<CanvasFieldState>);

  async function typing(field: CanvasFieldState, text: string, openPanel = false) {
    const fixture = await renderField(field);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => {
      emitted.push(v);
      // The canvas answers the emit with a new field state, as in the widget.
      fixture.componentRef.setInput('field', { ...field, status: FieldStatus.FILLED, value: v });
    });
    const input = fixture.nativeElement.querySelector('textarea[matInput], input[matInput]') as HTMLTextAreaElement;
    if (openPanel) {
      fixture.componentInstance.autocompleteTrigger!.openPanel();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.autocompleteTrigger!.panelOpen).withContext('panel open').toBeTrue();
    }
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { fixture, input, emitted };
  }

  it('takes the typed value at once, without a delay', async () => {
    const { input, emitted } = await typing(plainField(), 'Bruchrechnung');

    input.dispatchEvent(new FocusEvent('blur'));

    expect(emitted).toEqual(['Bruchrechnung']);
  });

  it('waits while its autocomplete panel is open, and hands the value over when the form is read', async () => {
    const { input, emitted } = await typing(LEVEL, 'Mittel', true);
    jasmine.clock().install();
    try {

      input.dispatchEvent(new FocusEvent('blur'));
      expect(emitted).withContext('an option may still be clicked').toEqual([]);

      commitPendingInputs();
      expect(emitted).toEqual(['Mittel']);

      jasmine.clock().tick(250);
      expect(emitted).withContext('the delay does not emit again').toEqual(['Mittel']);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('a click on an autocomplete option still wins over the typed fragment', async () => {
    const { fixture, input, emitted } = await typing(LEVEL, 'Fort', true);
    jasmine.clock().install();
    try {
      fixture.detectChanges();
      const option = Array.from(document.querySelectorAll('mat-option'))
        .find(o => o.textContent!.trim() === 'Fortgeschritten') as HTMLElement;

      input.dispatchEvent(new FocusEvent('blur')); // mousedown on the option
      option.click();
      jasmine.clock().tick(250);

      expect(emitted).toEqual(['http://w3id.org/level/2']);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  // Audit U-16: a value typed into a field that is then destroyed is not emitted later.
  it('drops a waiting value when the field goes away', async () => {
    const { fixture, input, emitted } = await typing(LEVEL, 'Mittel', true);
    jasmine.clock().install();
    try {

      input.dispatchEvent(new FocusEvent('blur'));
      fixture.destroy();
      commitPendingInputs();
      jasmine.clock().tick(250);

      expect(emitted).toEqual([]);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});

/**
 * Audit 13.11. (W-LOG-02): emptying a single-value field reported nothing -
 * the blur handler only looked at non-empty text, and the date field had no
 * branch for "no date". A wrong AI description, deleted and saved, stayed in
 * the record.
 */
describe('FieldComponent emptying a field', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  async function emptied(field: CanvasFieldState) {
    const fixture = await renderField(field);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const input = fixture.nativeElement.querySelector('textarea[matInput], input[matInput]') as HTMLInputElement;
    expect(input.value).withContext('shows the value first').not.toBe('');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    return { fixture, emitted };
  }

  const FILLED: [string, Partial<CanvasFieldState>][] = [
    ['text', { datatype: 'string', value: 'Bruchrechnung' }],
    ['number', { datatype: 'number', value: 42 }],
    ['integer', { datatype: 'integer', value: 7 }],
    ['URL', { datatype: 'url', value: 'https://example.org/kurs' }],
    ['duration', { datatype: 'duration', value: 'PT2H' }],
    ['JSON', { datatype: 'json', value: '{"a": 1}' }],
    ['date', { datatype: 'date', value: '2026-05-03' }],
    ['date-time', { datatype: 'datetime', value: '2026-05-03T14:30' }],
    ['time', { datatype: 'time', value: '14:30' }],
  ];

  for (const [name, overrides] of FILLED) {
    it(`reports an emptied ${name} field as null`, async () => {
      const { emitted } = await emptied(plainField({ status: FieldStatus.FILLED, ...overrides }));

      expect(emitted).toEqual([null]);
    });
  }

  it('reports nothing when an empty field is left empty', async () => {
    const fixture = await renderField(plainField());
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));

    (fixture.nativeElement.querySelector('textarea') as HTMLElement).dispatchEvent(new FocusEvent('blur'));

    expect(emitted).toEqual([]);
  });

  // The input of a list is only the draft of its next chip.
  it('keeps the list of a multi-value field whose input is left empty', async () => {
    const fixture = await renderField(plainField({
      fieldId: 'cclom:general_keyword', datatype: 'array', multiple: true,
      status: FieldStatus.FILLED, value: ['Musik', 'Konzert'],
    }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    input.value = 'Kla';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));

    expect(emitted).toEqual([]);
  });

  // A list the agent put into a single-value field is not shown in its input;
  // leaving that input is no decision to delete the list.
  it('keeps a value the input never showed', async () => {
    const fixture = await renderField(plainField({ status: FieldStatus.FILLED, value: ['Musik', 'Konzert'] }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));

    (fixture.nativeElement.querySelector('textarea') as HTMLElement).dispatchEvent(new FocusEvent('blur'));

    expect(emitted).toEqual([]);
  });

  it('reports a date it cannot read instead of emptying the field', async () => {
    const fixture = await renderField(plainField({ datatype: 'date', status: FieldStatus.FILLED, value: '2026-05-03' }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const input = fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement;

    input.value = '31.02.2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(emitted).toEqual([]);
    expect(fixture.componentInstance.validationError).toBe('VALIDATION.INVALID_DATE');
  });
});

/**
 * Audit 13.11. (W-LOG-07): the options of a boolean field were the texts
 * 'true'/'false', the agent answers with real booleans. After an extraction
 * neither option was selected, and a click stored text.
 */
describe('FieldComponent boolean fields', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  const ACCESSIBLE = { fieldId: 'schema:isAccessibleForFree', label: 'Kostenlos', datatype: 'boolean' };

  async function radios(value: unknown) {
    const fixture = await renderField(plainField({
      ...ACCESSIBLE, value, status: value === null ? FieldStatus.EMPTY : FieldStatus.FILLED,
    }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    // In template order: no selection, yes, no.
    return { fixture, emitted, none: inputs[0], yes: inputs[1], no: inputs[2] };
  }

  it('selects "yes" for the value true', async () => {
    const { none, yes, no } = await radios(true);

    expect([none.checked, yes.checked, no.checked]).toEqual([false, true, false]);
  });

  it('selects "no" for the value false', async () => {
    const { none, yes, no } = await radios(false);

    expect([none.checked, yes.checked, no.checked]).toEqual([false, false, true]);
  });

  for (const [text, expected] of [['true', [false, true, false]], ['false', [false, false, true]], ['Ja', [false, true, false]]] as [string, boolean[]][]) {
    it(`selects the option of a value stored as the text "${text}"`, async () => {
      const { none, yes, no } = await radios(text);

      expect([none.checked, yes.checked, no.checked]).toEqual(expected);
    });
  }

  it('reports a click as a boolean, not as text', async () => {
    const { emitted, yes, no } = await radios(null);

    yes.click();
    no.click();

    expect(emitted).toEqual([true, false]);
  });

  it('reports "no selection" as null', async () => {
    const { emitted, none } = await radios(true);

    none.click();

    expect(emitted).toEqual([null]);
  });
});
