import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';

import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { contrastRatio, inWidgetTheme } from '../../testing/a11y';

/**
 * Audit 14.11. (U-01): the description of a field was its placeholder - light
 * grey at 2.0:1, gone as soon as the field had a value, and no part of the
 * field's accessible description. It is a hint below the field now, and the
 * placeholder keeps only the hint about the format.
 *
 * U-13: the colours the audit measured below the WCAG thresholds.
 */
const WHITE = 'rgb(255, 255, 255)';

function field(overrides: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'cclom:title', label: 'Titel', description: 'Der Titel der Ressource, wie er auf der Seite steht',
    group: 'g', groupLabel: 'G', groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.EMPTY, value: null, confidence: 0, isRequired: false,
    datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

async function render(state: CanvasFieldState, inputs: Record<string, unknown> = {}): Promise<ComponentFixture<FieldComponent>> {
  await TestBed.configureTestingModule({
    imports: [FieldComponent, TranslateModule.forRoot(), NoAnimationsModule],
  }).compileComponents();
  const fixture = TestBed.createComponent(FieldComponent);
  inWidgetTheme(fixture.nativeElement);
  fixture.componentRef.setInput('field', state);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function describedBy(root: HTMLElement, control: Element): string[] {
  return (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    .map(id => root.querySelector(`#${id}`)?.textContent?.trim() ?? `missing #${id}`);
}

describe('FieldComponent description', () => {
  const DESCRIPTION = 'Der Titel der Ressource, wie er auf der Seite steht';

  it('is a hint below the field that describes the control', async () => {
    const root = (await render(field({}))).nativeElement as HTMLElement;
    const control = root.querySelector('textarea[matInput]') as HTMLTextAreaElement;
    const hint = root.querySelector('.support-text.description') as HTMLElement;

    expect(hint.textContent!.trim()).toBe(DESCRIPTION);
    expect(control.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).withContext('below the control').toBeTruthy();
    expect(describedBy(root, control)).toEqual([DESCRIPTION]);
    expect(control.placeholder).withContext('not in the placeholder').toBe('');
  });

  it('stays when the field has a value', async () => {
    const root = (await render(field({ status: FieldStatus.FILLED, value: 'Bruchrechnung' }))).nativeElement as HTMLElement;

    expect(root.querySelector('.support-text.description')!.textContent!.trim()).toBe(DESCRIPTION);
    expect(describedBy(root, root.querySelector('textarea[matInput]')!)).toEqual([DESCRIPTION]);
  });

  it('is named together with the required hint', async () => {
    const root = (await render(field({ isRequired: true }))).nativeElement as HTMLElement;

    expect(describedBy(root, root.querySelector('textarea[matInput]')!)).toEqual([DESCRIPTION, 'FIELD.REQUIRED_HINT']);
  });

  it('describes a radio group as well', async () => {
    const root = (await render(field({ datatype: 'boolean' }))).nativeElement as HTMLElement;

    expect(describedBy(root, root.querySelector('mat-radio-group')!)).toEqual([DESCRIPTION]);
  });

  it('is left out where a field has none', async () => {
    const root = (await render(field({ description: '' }))).nativeElement as HTMLElement;

    expect(root.querySelector('.support-text.description')).toBeNull();
    expect(root.querySelector('textarea[matInput]')!.hasAttribute('aria-describedby')).toBeFalse();
  });

  const FORMAT_HINTS: [string, Partial<CanvasFieldState>, string][] = [
    ['date', { datatype: 'date' }, 'FIELD.DATE_PLACEHOLDER'],
    ['datetime', { datatype: 'datetime' }, 'FIELD.DATETIME_PLACEHOLDER'],
    ['time', { datatype: 'time' }, 'HH:MM'],
    ['url', { datatype: 'url' }, 'https://...'],
    ['duration', { datatype: 'duration' }, 'FIELD.DURATION_PLACEHOLDER'],
    ['number', { datatype: 'number' }, ''],
    ['list', { datatype: 'array', multiple: true }, 'FIELD.ARRAY_PLACEHOLDER'],
  ];
  for (const [kind, overrides, hint] of FORMAT_HINTS) {
    it(`leaves a ${kind} field the hint about its format as placeholder`, async () => {
      const root = (await render(field(overrides))).nativeElement as HTMLElement;
      const control = root.querySelector('input[matInput], textarea[matInput]') as HTMLInputElement;

      expect(control.placeholder).toBe(hint);
      expect(describedBy(root, control)).toEqual([DESCRIPTION]);
    });
  }
});

describe('FieldComponent colours (U-01, U-13)', () => {
  it('shows the placeholder at 4.5:1 or more', async () => {
    const root = (await render(field({ datatype: 'url' }))).nativeElement as HTMLElement;
    const placeholder = getComputedStyle(root.querySelector('input[matInput]')!, '::placeholder').color;

    expect(contrastRatio(placeholder, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('shows the description and a warning at 4.5:1 or more', async () => {
    const fixture = await render(field({}));
    fixture.componentInstance.validationWarning = 'Dieser Wert ist nicht im Vokabular.';
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    for (const selector of ['.support-text.description', '.support-text.warning']) {
      expect(contrastRatio(getComputedStyle(root.querySelector(selector)!).color, WHITE)).withContext(selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws the radio buttons with an outline of 3:1 or more', async () => {
    const root = (await render(field({ datatype: 'boolean' }))).nativeElement as HTMLElement;
    const outline = getComputedStyle(root.querySelector('.mdc-radio__outer-circle')!).borderTopColor;

    expect(contrastRatio(outline, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the AI violet readable on a chip, also on the hovered one', async () => {
    const root = (await render(
      field({ datatype: 'array', multiple: true, status: FieldStatus.FILLED, value: ['Brüche'], isAiGenerated: true }),
      { highlightAi: true },
    )).nativeElement as HTMLElement;
    const chip = root.querySelector('mat-chip') as HTMLElement;
    const violet = getComputedStyle(chip.querySelector('.mdc-evolution-chip__text-label')!).color;

    expect(contrastRatio(violet, getComputedStyle(chip).backgroundColor)).withContext('chip').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(violet, 'rgb(212, 222, 244)')).withContext('hovered chip (#d4def4)').toBeGreaterThanOrEqual(4.5);
  });
});
