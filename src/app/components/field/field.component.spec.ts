import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { NgxMatTimepickerComponent } from 'ngx-mat-timepicker';
import { DateAdapter } from '@angular/material/core';

import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';
import { I18nService } from '../../core/i18n.service';

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
      imports: [FieldComponent, TranslateModule.forRoot(), NoopAnimationsModule],
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
      imports: [FieldComponent, TranslateModule.forRoot(), NoopAnimationsModule],
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
    imports: [FieldComponent, TranslateModule.forRoot(), NoopAnimationsModule],
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
 * the field, and a rejection reaches them as an alert outside Material's
 * subscript (which the layouts hide).
 */
describe('FieldComponent validation from typing to alert', () => {
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
    return { alert: fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null, emitted };
  }

  it('shows a typed invalid number as an alert outside the Material subscript', async () => {
    const { alert, emitted } = await typeAndLeave(plainField({ datatype: 'integer' }), '12.7');

    expect(alert?.textContent?.trim()).toBeTruthy();
    expect(alert!.closest('.mat-mdc-form-field-subscript-wrapper')).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('shows no alert for a typed valid number and emits it', async () => {
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

    it('the clock dial still sets the time and returns the focus to the typed input', async () => {
      const { fixture, input, emitted } = await typeTime('');
      // Both pickers are always in the template: the date-time one first, then this one.
      const pickers = fixture.debugElement.queryAll(By.directive(NgxMatTimepickerComponent));
      expect(pickers.length).toBe(2);
      const picker = pickers[1].componentInstance as NgxMatTimepickerComponent;

      expect(picker.inputElement).withContext('close() focuses it').toBeDefined();
      picker.timeChanged.emit('14:15');
      picker.closed.emit();

      expect(emitted).toContain('14:15');
      expect(document.activeElement).toBe(input);
    });

    // Follow-up review 18.10.: the pickers take their disabled state from the
    // input they are registered with - the hidden anchor, which was never
    // disabled. The clock (and calendar) stayed usable in a read-only field.
    for (const datatype of ['time', 'datetime']) {
      for (const [why, overrides, inputs] of [
        ['read-only', {}, { readonly: true }],
        ['extracting', { status: FieldStatus.EXTRACTING }, {}],
      ] as [string, Partial<CanvasFieldState>, Record<string, unknown>][]) {
        it(`a ${why} ${datatype} field offers no picker`, async () => {
          const fixture = await renderField(plainField({ fieldId: 'schema:startTime', datatype, ...overrides }), 'de', inputs);
          fixture.detectChanges();
          const toggles = Array.from(fixture.nativeElement.querySelectorAll(
            'ngx-mat-timepicker-toggle button, mat-datepicker-toggle button'
          )) as HTMLButtonElement[];

          expect(toggles.length).toBeGreaterThan(0);
          expect(toggles.map(b => b.disabled)).toEqual(toggles.map(() => true));
        });
      }
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

    expect(emitted).toEqual(['2026-05-04T10:00']);
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

  it('shows the values as chips, also read-only', async () => {
    expect(chips(await renderField(URLS))).toEqual(['https://a.example', 'https://b.example']);
    TestBed.resetTestingModule();
    expect(chips(await renderField(URLS, 'de', { readonly: true }))).toEqual(['https://a.example', 'https://b.example']);
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

/** Audit U-16: a value typed into a field that is then destroyed is not emitted later. */
describe('FieldComponent timers', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('drops a pending blur check when the field goes away', async () => {
    const fixture = await renderField(plainField());
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    fixture.componentInstance.inputValue = 'Bruchrechnung';

    passingBlurDelay(() => {
      fixture.componentInstance.onBlur();
      fixture.destroy();
    });

    expect(emitted).toEqual([]);
  });
});
