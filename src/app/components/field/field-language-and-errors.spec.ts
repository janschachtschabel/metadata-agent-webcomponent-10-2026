import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { I18nService } from '../../core/i18n.service';
import { NoAnimationsModule } from '../../testing/no-animations';

function field(overrides: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'schema:isAccessibleForFree', label: 'Kostenlos', group: 'g', groupLabel: 'G', groupOrder: 1,
    schemaName: 'Core', aiFillable: true, repoField: true, status: FieldStatus.FILLED,
    value: true, confidence: 1, isRequired: false, datatype: 'boolean', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

async function render(state: CanvasFieldState, inputs: Record<string, unknown> = {}): Promise<ComponentFixture<FieldComponent>> {
  await TestBed.configureTestingModule({ imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule] }).compileComponents();
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('de', { FIELD: { BOOLEAN: { TRUE: 'Ja', FALSE: 'Nein' }, RADIO: { NO_SELECTION: 'keine Angabe' } } });
  translate.setTranslation('en', { FIELD: { BOOLEAN: { TRUE: 'Yes', FALSE: 'No' }, RADIO: { NO_SELECTION: 'no selection' } } });
  TestBed.inject(I18nService).setLanguage('de');
  const fixture = TestBed.createComponent(FieldComponent);
  fixture.componentRef.setInput('field', state);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

/**
 * Audit 14.11. (U-21): the options of a yes/no field were put into words when
 * the field changed, not when the language did - after the first switch they
 * could stay in the old language next to a label in the new one.
 */
describe('FieldComponent yes/no in the current language', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  const options = (fixture: ComponentFixture<FieldComponent>) =>
    Array.from(fixture.nativeElement.querySelectorAll('mat-radio-button') as NodeListOf<HTMLElement>).map(o => o.textContent!.trim());

  it('follows a language switch', async () => {
    const fixture = await render(field({}));
    expect(options(fixture)).toEqual(['keine Angabe', 'Ja', 'Nein']);

    TestBed.inject(I18nService).setLanguage('en');
    fixture.detectChanges();

    expect(options(fixture)).toEqual(['no selection', 'Yes', 'No']);
  });

  it('follows texts that arrive later', async () => {
    const fixture = await render(field({}));

    TestBed.inject(TranslateService).setTranslation('de', { FIELD: { BOOLEAN: { TRUE: 'Jawohl', FALSE: 'Nein' } } }, true);
    fixture.detectChanges();

    expect(options(fixture)).toContain('Jawohl');
  });

  it('follows a language switch in a read-only view as well', async () => {
    const fixture = await render(field({}), { readonly: true });
    const shown = () => fixture.nativeElement.querySelector('.readonly-value').textContent.trim();
    expect(shown()).toBe('Ja');

    TestBed.inject(I18nService).setLanguage('en');
    fixture.detectChanges();

    expect(shown()).toBe('Yes');
  });
});

/**
 * Audit 14.11. (U-22): every field's error was a role="alert". Leaving a form
 * with several wrong values, or loading a record whose values do not fit, made
 * a screen reader interrupt itself with all of them at once. The error is tied
 * to its field (aria-invalid, aria-describedby) and announced politely.
 */
describe('FieldComponent error message', () => {
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('is announced politely and belongs to its field', async () => {
    const fixture = await render(field({ datatype: 'url', value: null, status: FieldStatus.EMPTY, label: 'Adresse' }));
    fixture.componentInstance.validationError = 'Ungültige URL';
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const error = root.querySelector('.support-text.error') as HTMLElement;
    const input = root.querySelector('input[matInput]') as HTMLInputElement;

    expect(root.querySelector('[role="alert"]')).withContext('no assertive alert per field').toBeNull();
    expect(error.getAttribute('aria-live')).toBe('polite');
    expect(error.textContent!.trim()).toBe('Ungültige URL');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')!.split(' ')).toContain(error.id);
  });
});
