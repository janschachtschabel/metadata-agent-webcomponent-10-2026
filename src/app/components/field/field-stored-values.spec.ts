/**
 * Stored values a field's control cannot show, and values it must not
 * shorten (audit 14.11.):
 *
 * - W-43: a list in a single-value field (`'cclom:title': ['a', 'b']`, as the
 *   README example had it) or a date that is not ISO ("03.05.2026") left the
 *   control empty while the value stayed in the record and counted as filled.
 *   A single value in a list field broke the chips altogether.
 * - W-47: editing a date-time dropped its seconds and its UTC offset.
 * - W-N: the text of every chip was computed twice on every change detection.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoAnimationsModule } from '../../testing/no-animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FieldComponent } from './field.component';
import { I18nService } from '../../core/i18n.service';
import { keepSecondsAndOffset } from '../../core/date-parsing';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';

function field(overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId: 'cclom:title', label: 'Titel', group: 'g', groupLabel: 'G', groupOrder: 1,
    schemaName: 'Core', aiFillable: true, repoField: true, status: FieldStatus.FILLED,
    value: null, confidence: 0, isRequired: false, datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

async function render(state: CanvasFieldState, translations: Record<string, Record<string, string>> = {}): Promise<ComponentFixture<FieldComponent>> {
  await TestBed.configureTestingModule({
    imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule],
  }).compileComponents();
  TestBed.inject(TranslateService).setTranslation('de', translations);
  TestBed.inject(I18nService).setLanguage('de');
  const fixture = TestBed.createComponent(FieldComponent);
  fixture.componentRef.setInput('field', state);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const alertText = (fixture: ComponentFixture<FieldComponent>): string =>
  (fixture.nativeElement.querySelector('.support-text.error') as HTMLElement | null)?.textContent?.trim() ?? '';

describe('FieldComponent: a stored value that does not fit the field (W-43)', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  describe('a list in a single-value field', () => {
    it('is named in a message instead of an empty control that says nothing', async () => {
      const fixture = await render(field({ value: ['Erster Titel', 'Zweiter Titel'] }));

      expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
      expect(alertText(fixture)).toContain('Erster Titel, Zweiter Titel');
      expect(alertText(fixture)).toContain('takes only one');
      expect(fixture.nativeElement.querySelector('textarea').getAttribute('aria-invalid')).toBe('true');
    });

    it('is not converted: leaving the field emits nothing', async () => {
      const fixture = await render(field({ value: ['Erster Titel', 'Zweiter Titel'] }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));

      (fixture.nativeElement.querySelector('textarea') as HTMLElement).dispatchEvent(new FocusEvent('blur'));

      expect(emitted).toEqual([]);
      expect(alertText(fixture)).toContain('Erster Titel');
    });

    it('goes with the value the editor enters', async () => {
      const fixture = await render(field({ value: ['Erster Titel', 'Zweiter Titel'] }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
      const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

      textarea.value = 'Erster Titel';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent('blur'));
      expect(emitted).toEqual(['Erster Titel']);

      fixture.componentRef.setInput('field', field({ value: 'Erster Titel' }));
      fixture.detectChanges();

      expect(alertText(fixture)).toBe('');
      expect(textarea.value).toBe('Erster Titel');
    });

    it('comes back when the editor typed and deleted again', async () => {
      const fixture = await render(field({ value: ['a', 'b'] }));
      const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

      textarea.value = 'x';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(alertText(fixture)).withContext('while typing').toBe('');
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();

      expect(alertText(fixture)).toContain('a, b');
    });

    it('speaks the language of the widget when the text is there', async () => {
      const fixture = await render(field({ value: ['a', 'b'] }),
        { VALIDATION: { STORED_LIST_ON_SINGLE: 'Mehrere Werte ({{values}}), das Feld nimmt nur einen.' } });

      expect(alertText(fixture)).toBe('Mehrere Werte (a, b), das Feld nimmt nur einen.');
    });

    it('says nothing about an empty list', async () => {
      const fixture = await render(field({ value: [], status: FieldStatus.EMPTY }));

      expect(alertText(fixture)).toBe('');
    });
  });

  describe('a date that is not ISO', () => {
    for (const stored of ['03.05.2026', '2026-05-03T10:00:00', 'Sommer 2026', '2026-02-31']) {
      it(`"${stored}" is named in a message, not shown as an empty date`, async () => {
        const fixture = await render(field({ fieldId: 'schema:startDate', label: 'Beginn', datatype: 'date', value: stored }));

        expect((fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement).value).toBe('');
        expect(alertText(fixture)).toContain(`“${stored}”`);
      });
    }

    it('an ISO date is shown and needs no message', async () => {
      const fixture = await render(field({ fieldId: 'schema:startDate', label: 'Beginn', datatype: 'date', value: '2026-05-03' }));

      expect((fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement).value).toBe('03.05.2026');
      expect(alertText(fixture)).toBe('');
    });
  });

  describe('a number that is none', () => {
    it('is named in a message', async () => {
      const fixture = await render(field({ fieldId: 'schema:numberOfCredits', label: 'Punkte', datatype: 'integer', value: 'fünf' }));

      expect(alertText(fixture)).toContain('“fünf”');
    });

    for (const stored of [5, 0, '5', '2.5']) {
      it(`${JSON.stringify(stored)} is shown and needs no message`, async () => {
        const fixture = await render(field({ fieldId: 'schema:numberOfCredits', label: 'Punkte', datatype: 'number', value: stored }));

        expect((fixture.nativeElement.querySelector('input[matInput]') as HTMLInputElement).value).toBe(String(stored));
        expect(alertText(fixture)).toBe('');
      });
    }
  });

  describe('a single value in a list field', () => {
    const KEYWORDS = { fieldId: 'cclom:general_keyword', label: 'Schlagworte', datatype: 'array', multiple: true };

    it('is shown as the one chip it is', async () => {
      const fixture = await render(field({ ...KEYWORDS, value: 'einzeln' }));

      const chips = Array.from(fixture.nativeElement.querySelectorAll('mat-chip')) as HTMLElement[];
      expect(chips.map(chip => chip.textContent?.trim())).toEqual(['einzeln']);
      expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).withContext('not a draft of a second chip').toBe('');
      expect(alertText(fixture)).toBe('');
    });

    it('is kept when the editor adds another value', async () => {
      const fixture = await render(field({ ...KEYWORDS, value: 'einzeln' }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
      const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

      textarea.value = 'zweites';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent('blur'));

      expect(emitted).toEqual([['einzeln', 'zweites']]);
    });

    it('can be removed', async () => {
      const fixture = await render(field({ ...KEYWORDS, value: 'einzeln' }));
      const emitted: unknown[] = [];
      fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));

      fixture.componentInstance.removeChip('einzeln');

      expect(emitted).toEqual([[]]);
    });
  });
});

describe('FieldComponent chips', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('compute their text when the value changes, not on every change detection (W-N)', async () => {
    const concepts = Array.from({ length: 300 }, (_, i) => ({ uri: `http://w3id.org/subject/${i}`, label: `Fach ${i}` }));
    const state = field({
      fieldId: 'ccm:taxonid', label: 'Fach', datatype: 'array', multiple: true,
      vocabulary: { type: 'closed', concepts } as any,
      value: ['http://w3id.org/subject/7', 'http://w3id.org/subject/299'],
    });
    const fixture = await render(state);
    const lookups = spyOn(fixture.componentInstance, 'getChipDisplayValue').and.callThrough();

    for (let i = 0; i < 5; i++) {
      fixture.componentRef.setInput('highlightAi', i % 2 === 0); // any change that re-renders the field
      fixture.detectChanges();
    }

    expect(lookups).not.toHaveBeenCalled();
    const chips = Array.from(fixture.nativeElement.querySelectorAll('mat-chip')) as HTMLElement[];
    expect(chips.map(chip => chip.textContent?.trim())).toEqual(['Fach 7', 'Fach 299']);

    fixture.componentRef.setInput('field', { ...state, value: ['http://w3id.org/subject/1'] });
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('mat-chip') as HTMLElement).textContent?.trim()).toBe('Fach 1');
  });
});

describe('FieldComponent: editing a date-time keeps seconds and offset (W-47)', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  const START = { fieldId: 'schema:startDate', label: 'Beginn', datatype: 'datetime' };

  async function emittedBy(stored: string, act: (component: FieldComponent) => void): Promise<unknown[]> {
    const fixture = await render(field({ ...START, value: stored }));
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
    act(fixture.componentInstance);
    return emitted;
  }

  it('a typed hour: the offset stays', async () => {
    const emitted = await emittedBy('2026-05-03T10:00:00+02:00', component => {
      component.inputValue = '03.05.2026 11:00';
      component.onDateTimeBlur();
    });

    expect(emitted).toEqual(['2026-05-03T11:00:00+02:00']);
  });

  it('a day picked in the calendar: seconds and Z stay', async () => {
    const emitted = await emittedBy('2026-05-03T10:00:30Z', component =>
      component.onDateTimePickerSelect({ value: new Date(2026, 4, 9) }));

    expect(emitted).toEqual(['2026-05-09T10:00:30Z']);
  });

  it('a time picked on the clock: the offset stays', async () => {
    const emitted = await emittedBy('2026-05-03T10:00:00+02:00', component => component.onDateTimeTimeChange('14:30'));

    expect(emitted).toEqual(['2026-05-03T14:30:00+02:00']);
  });

  it('a value without seconds and offset gets none', async () => {
    const emitted = await emittedBy('2026-05-03T10:00', component => {
      component.inputValue = '03.05.2026 11:00';
      component.onDateTimeBlur();
    });

    expect(emitted).toEqual(['2026-05-03T11:00']);
  });

  it('typing the same moment again is no change', async () => {
    const emitted = await emittedBy('2026-05-03T10:00:00+02:00', component => {
      component.inputValue = '3.5.2026 10:00';
      component.onDateTimeBlur();
    });

    expect(emitted).toEqual([]);
  });

  describe('keepSecondsAndOffset', () => {
    const CASES: [unknown, string][] = [
      ['2026-05-03T10:00:00+02:00', '2026-06-01T08:15:00+02:00'],
      ['2026-05-03T10:00:00.250Z', '2026-06-01T08:15:00.250Z'],
      ['2026-05-03T10:00+0200', '2026-06-01T08:15:00+0200'],
      ['2026-05-03T10:00:45', '2026-06-01T08:15:45'],
      ['2026-05-03T10:00', '2026-06-01T08:15'],
      ['2026-05-03', '2026-06-01T08:15'],
      [null, '2026-06-01T08:15'],
      [['2026-05-03T10:00:00Z'], '2026-06-01T08:15'],
    ];

    for (const [previous, expected] of CASES) {
      it(`after ${JSON.stringify(previous)}: ${expected}`, () => {
        expect(keepSecondsAndOffset('2026-06-01T08:15', previous)).toBe(expected);
      });
    }
  });
});
