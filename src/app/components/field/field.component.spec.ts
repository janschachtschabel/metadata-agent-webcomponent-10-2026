/**
 * Validation messages of a field must reach the editor.
 *
 * They used to sit in <mat-error>, which Material renders only while the
 * control is in its error state — and these ngModel fields have no validators,
 * so it never was. On top of that the layouts hide the subscript area where
 * <mat-error> lives. The message was set and never seen.
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

import { FieldComponent } from './field.component';
import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';

function field(overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId: 'cclom:title',
    uri: 'cclom:title',
    label: 'Titel',
    description: '',
    group: 'core',
    groupLabel: 'Kern',
    groupOrder: 0,
    schemaName: 'core.json',
    aiFillable: true,
    repoField: true,
    status: FieldStatus.FILLED,
    value: 'Bruchrechnung',
    confidence: 1,
    isRequired: false,
    datatype: 'string',
    multiple: false,
    ...overrides,
  } as CanvasFieldState;
}

describe('FieldComponent validation messages', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldComponent, TranslateModule.forRoot()],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  function render(state: CanvasFieldState) {
    const fixture = TestBed.createComponent(FieldComponent);
    fixture.componentInstance.field = state;
    fixture.detectChanges();
    return fixture;
  }

  /** What an editor does: type a value and leave the field. */
  function typeAndLeave(fixture: ReturnType<typeof render>, text: string) {
    fixture.componentInstance.inputValue = text;
    fixture.componentInstance.onBlur();
    tick(200);
    fixture.detectChanges();
  }

  it('shows a rejected value as an alert', fakeAsync(() => {
    const fixture = render(field({ datatype: 'number', value: null, status: FieldStatus.EMPTY }));

    typeAndLeave(fixture, 'keine Zahl');

    const alert: HTMLElement | null = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBeTruthy();
  }));

  it('places the error outside the Material subscript the layouts hide', fakeAsync(() => {
    const fixture = render(field({ datatype: 'number', value: null, status: FieldStatus.EMPTY }));

    typeAndLeave(fixture, 'keine Zahl');

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.closest('.mat-mdc-form-field-subscript-wrapper')).toBeNull();
  }));

  it('shows nothing for an accepted value', fakeAsync(() => {
    const fixture = render(field({ datatype: 'number', value: null, status: FieldStatus.EMPTY }));

    typeAndLeave(fixture, '42');

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  }));
});
