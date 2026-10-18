import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { VocabTreePickerComponent } from './vocab-tree-picker.component';
import { seriousA11yViolations } from '../../../testing/a11y';

/**
 * The vocabulary picker is how most controlled fields are filled (audit U-01).
 * It opened only on mousedown, had no dialog role, no focus trap and no Escape,
 * and its listbox wrapped checkboxes and buttons - invalid ARIA that screen
 * readers announce as an empty list.
 */
describe('VocabTreePickerComponent accessibility', () => {
  let fixture: ComponentFixture<VocabTreePickerComponent>;
  let picker: VocabTreePickerComponent;

  const CONCEPTS = [
    { uri: 'http://w3id.org/a', label: 'Mathematik' },
    { uri: 'http://w3id.org/a1', label: 'Algebra', broader: 'http://w3id.org/a' },
    { uri: 'http://w3id.org/b', label: 'Physik' },
  ] as any[];

  async function openPicker(): Promise<HTMLElement> {
    fixture.componentRef.setInput('concepts', CONCEPTS);
    fixture.componentRef.setInput('hierarchical', true);
    fixture.componentRef.setInput('label', 'Fach');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VocabTreePickerComponent, TranslateModule.forRoot(), NoopAnimationsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(VocabTreePickerComponent);
    picker = fixture.componentInstance;
  });

  it('is a modal dialog named after the field', async () => {
    const el = await openPicker();
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog).withContext('role="dialog"').not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Fach');
  });

  it('keeps the focus inside while open', async () => {
    const el = await openPicker();

    // cdkTrapFocus puts its tabbable anchors right before and after the
    // trapped region; reaching one sends the focus back inside.
    const panel = el.querySelector('.picker-panel')!;
    expect(panel.previousElementSibling?.classList).toContain('cdk-focus-trap-anchor');
    expect(panel.nextElementSibling?.classList).toContain('cdk-focus-trap-anchor');
  });

  it('closes on Escape', async () => {
    const el = await openPicker();
    const closed = jasmine.createSpy('closed');
    picker.closed.subscribe(closed);

    el.querySelector('[role="dialog"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(closed).toHaveBeenCalled();
  });

  it('says whether a branch is open, in the widget language', async () => {
    const el = await openPicker();
    const expand = el.querySelector('.expand-btn') as HTMLElement;

    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(expand.getAttribute('aria-label')).toBe('FIELD.VOCAB_EXPAND');
  });

  it('has no serious accessibility violations', async () => {
    const el = await openPicker();

    expect(await seriousA11yViolations(el)).toEqual([]);
  });
});
