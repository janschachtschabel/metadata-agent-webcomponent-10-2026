import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatAutocomplete } from '@angular/material/autocomplete';
import { MatDatepicker } from '@angular/material/datepicker';
import { MatTimepicker } from '@angular/material/timepicker';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { appConfig } from '../../app.config';
import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { I18nService } from '../../core/i18n.service';
import { seriousA11yViolations } from '../../testing/a11y';

/**
 * Audit 14.11. (U-06, U-19): in the German interface the calendar said "Open
 * calendar" and "Previous month", and the clock - a library of its own, with
 * @angular/animations behind it - "CANCEL" and "OK". The calendar takes its
 * texts from the widget's translations now; the clock is Material's own
 * timepicker, a list of times without buttons.
 *
 * U-18: every field created two calendars, two clocks and an autocomplete,
 * whatever its datatype.
 */
const TEXTS = {
  de: {
    FIELD: { OPEN_CLOCK: 'Uhr öffnen', CHOOSE_TIME: 'Uhrzeit wählen' },
    DATEPICKER: {
      OPEN_CALENDAR: 'Kalender öffnen', CLOSE_CALENDAR: 'Kalender schließen', CALENDAR: 'Kalender',
      PREV_MONTH: 'Vorheriger Monat', NEXT_MONTH: 'Nächster Monat',
      PREV_YEAR: 'Vorheriges Jahr', NEXT_YEAR: 'Nächstes Jahr',
      PREV_MULTI_YEAR: 'Vorherige 24 Jahre', NEXT_MULTI_YEAR: 'Nächste 24 Jahre',
      SWITCH_TO_MONTH_VIEW: 'Datum wählen', SWITCH_TO_MULTI_YEAR_VIEW: 'Monat und Jahr wählen',
    },
  },
  en: {
    FIELD: { OPEN_CLOCK: 'Open clock', CHOOSE_TIME: 'Choose time' },
    DATEPICKER: {
      OPEN_CALENDAR: 'Open calendar', CLOSE_CALENDAR: 'Close calendar', CALENDAR: 'Calendar',
      PREV_MONTH: 'Previous month', NEXT_MONTH: 'Next month',
      PREV_YEAR: 'Previous year', NEXT_YEAR: 'Next year',
      PREV_MULTI_YEAR: 'Previous 24 years', NEXT_MULTI_YEAR: 'Next 24 years',
      SWITCH_TO_MONTH_VIEW: 'Choose date', SWITCH_TO_MULTI_YEAR_VIEW: 'Choose month and year',
    },
  },
};

function field(overrides: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'schema:startDate', label: 'Beginn', group: 'g', groupLabel: 'G', groupOrder: 1,
    schemaName: 'Core', aiFillable: true, repoField: true, status: FieldStatus.EMPTY,
    value: null, confidence: 0, isRequired: false, datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

describe('FieldComponent pickers', () => {
  let fixture: ComponentFixture<FieldComponent>;
  let root: HTMLElement;
  let emitted: unknown[];

  async function render(state: CanvasFieldState): Promise<void> {
    await TestBed.configureTestingModule({ imports: [FieldComponent, TranslateModule.forRoot()] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', TEXTS.de);
    translate.setTranslation('en', TEXTS.en);
    TestBed.inject(I18nService).setLanguage('de');
    fixture = TestBed.createComponent(FieldComponent);
    fixture.componentRef.setInput('field', state);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
    await settle();
    root = fixture.nativeElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const overlays = () => TestBed.inject(OverlayContainer).getContainerElement();

  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  describe('calendar', () => {
    const toggle = () => root.querySelector('mat-datepicker-toggle button') as HTMLButtonElement;

    it('names its button in the widget language and follows a switch', async () => {
      await render(field({ datatype: 'date' }));
      expect(toggle().getAttribute('aria-label')).toBe('Kalender öffnen');

      TestBed.inject(I18nService).setLanguage('en');
      await settle();

      expect(toggle().getAttribute('aria-label')).toBe('Open calendar');
    });

    it('names the buttons of the open calendar in the widget language', async () => {
      await render(field({ datatype: 'date', status: FieldStatus.FILLED, value: '2026-05-03' }));

      toggle().click();
      await settle();

      const labels = Array.from(overlays().querySelectorAll('.mat-calendar-header button')).map(b => b.getAttribute('aria-label'));
      expect(labels).toEqual(['Monat und Jahr wählen', 'Vorheriger Monat', 'Nächster Monat']);
    });

    it('is the same in a date-time field', async () => {
      await render(field({ datatype: 'datetime' }));

      expect(toggle().getAttribute('aria-label')).toBe('Kalender öffnen');
    });
  });

  describe('clock', () => {
    const toggle = () => root.querySelector('mat-timepicker-toggle button') as HTMLButtonElement;
    // Material 21 opens the list as a popover next to the field, not in the overlay container.
    const list = () => document.querySelector('.mat-timepicker-panel') as HTMLElement;
    const options = () => Array.from(document.querySelectorAll<HTMLElement>('.mat-timepicker-panel [role="option"]'));

    it('is a list of times with a named button, and no dialog with English buttons', async () => {
      await render(field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time' }));
      expect(root.querySelector('[class*="ngx-mat-timepicker"], ngx-mat-timepicker-toggle')).toBeNull();
      expect(toggle().getAttribute('aria-label')).toBe('Uhr öffnen');

      toggle().click();
      await settle();

      expect(options().slice(0, 3).map(o => o.textContent!.trim())).toEqual(['00:00', '00:15', '00:30']);
      expect(list().getAttribute('role')).toBe('listbox');
      expect(list().querySelectorAll('button').length).withContext('no OK / CANCEL').toBe(0);
      expect(overlays().querySelector('[class*="timepicker"]')).withContext('no dialog').toBeNull();
    });

    it('stores a picked time as before, and returns the focus to the typed input', async () => {
      await render(field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time' }));
      toggle().click();
      await settle();

      options().find(o => o.textContent!.trim() === '14:15')!.click();
      await settle();

      expect(emitted).toEqual(['14:15']);
      expect(document.activeElement).toBe(root.querySelector('input[matInput]'));
      expect(fixture.componentInstance.inputValue).toBe('14:15');
    });

    it('opens on the time the field holds', async () => {
      await render(field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time', status: FieldStatus.FILLED, value: '09:30' }));
      toggle().click();
      await settle();

      const selected = options().filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.textContent!.trim());
      expect(selected).toEqual(['09:30']);
    });

    it('changes the time of a date-time and keeps date, seconds and offset (W-47)', async () => {
      await render(field({ datatype: 'datetime', status: FieldStatus.FILLED, value: '2026-05-03T10:00:00+02:00' }));
      toggle().click();
      await settle();

      options().find(o => o.textContent!.trim() === '11:15')!.click();
      await settle();

      expect(emitted).toEqual(['2026-05-03T11:15:00+02:00']);
      expect(document.activeElement).toBe(root.querySelector('input[matInput]'));
    });

    it('is locked while the field is being extracted', async () => {
      await render(field({ fieldId: 'schema:startTime', datatype: 'time', status: FieldStatus.EXTRACTING }));

      expect(toggle().disabled).toBeTrue();
    });

    it('has no serious accessibility violations, closed or open', async () => {
      await render(field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time' }));
      expect(await seriousA11yViolations(root)).toEqual([]);

      toggle().click();
      await settle();

      expect(await seriousA11yViolations(root)).toEqual([]);
      expect(await seriousA11yViolations(list())).toEqual([]);
    });
  });

  describe('created only where the datatype needs them (U-18)', () => {
    const count = (type: unknown) => fixture.debugElement.queryAll(By.directive(type as any)).length;
    const vocabulary = { type: 'closed', concepts: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }] } as any;
    const CASES: [string, Partial<CanvasFieldState>, [number, number, number]][] = [
      ['a text field', {}, [0, 0, 0]],
      ['a number field', { datatype: 'number' }, [0, 0, 0]],
      ['a boolean field', { datatype: 'boolean' }, [0, 0, 0]],
      ['a date field', { datatype: 'date' }, [1, 0, 0]],
      ['a time field', { datatype: 'time' }, [0, 1, 0]],
      ['a date-time field', { datatype: 'datetime' }, [1, 1, 0]],
      ['a list of words with suggestions', { datatype: 'array', multiple: true, vocabulary: { ...vocabulary, type: 'open', concepts: vocabulary.concepts.slice(0, 3) } }, [0, 0, 1]],
      ['a field with a vocabulary picker', { vocabulary }, [0, 0, 0]],
    ];

    for (const [name, overrides, [calendars, clocks, autocompletes]] of CASES) {
      it(`${name}: ${calendars} calendar, ${clocks} clock, ${autocompletes} autocomplete`, async () => {
        await render(field(overrides));

        expect([count(MatDatepicker), count(MatTimepicker), count(MatAutocomplete)]).toEqual([calendars, clocks, autocompletes]);
      });
    }

    it('still suggests the terms of an open vocabulary while typing', async () => {
      await render(field({ datatype: 'array', multiple: true, vocabulary: { type: 'open', concepts: [{ label: 'Algebra' }, { label: 'Analysis' }, { label: 'Geometrie' }] } as any }));
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;

      textarea.focus();
      textarea.dispatchEvent(new Event('focusin', { bubbles: true }));
      textarea.value = 'A';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();

      const suggested = Array.from(document.querySelectorAll('.mat-mdc-autocomplete-panel mat-option')).map(o => o.textContent!.trim());
      expect(suggested).toContain('Algebra');
    });
  });
});

describe('the widget application', () => {
  it('needs no @angular/animations (U-19)', () => {
    const flat = (providers: unknown[]): unknown[] => providers.flatMap(p => Array.isArray(p) ? flat(p) : (p as any)?.ɵproviders ? flat((p as any).ɵproviders) : [p]);

    const tokens = flat(appConfig.providers as unknown[]).map(p => (p as any)?.provide);

    expect(tokens).not.toContain(ANIMATION_MODULE_TYPE);
  });
});
