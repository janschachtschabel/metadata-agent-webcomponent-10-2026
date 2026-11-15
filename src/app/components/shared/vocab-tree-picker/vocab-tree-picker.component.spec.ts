import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../../testing/no-animations';

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
      imports: [VocabTreePickerComponent, TranslateModule.forRoot(), NoAnimationsModule],
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

/**
 * Audit 14.11. (U-15): long labels were cut off with an ellipsis and no way
 * to read the rest; the hierarchy was indentation only; a field that takes
 * one value offered checkboxes; and a vocabulary of several hundred concepts
 * rendered a checkbox for every one of them when the picker opened.
 */
describe('VocabTreePickerComponent choices', () => {
  let fixture: ComponentFixture<VocabTreePickerComponent>;
  let root: HTMLElement;

  const TREE = [
    { uri: 'http://w3id.org/a', label: 'Mathematik' },
    { uri: 'http://w3id.org/a1', label: 'Algebra', broader: 'http://w3id.org/a' },
    { uri: 'http://w3id.org/b', label: 'Physik' },
  ] as any[];

  async function open(inputs: Record<string, unknown>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VocabTreePickerComponent, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(VocabTreePickerComponent);
    for (const [name, value] of Object.entries({ label: 'Fach', ...inputs, open: true })) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement;
  }

  const nodes = () => Array.from(root.querySelectorAll<HTMLElement>('.tree-node'));

  it('wraps a long label instead of cutting it off', async () => {
    const long = 'Berufsbildende Schulen mit dem Schwerpunkt Wirtschaft und Verwaltung, Fachrichtung Gesundheitsökonomie';
    await open({ concepts: [{ uri: 'http://w3id.org/x', label: long }], multiple: true });
    const label = root.querySelector('.node-label') as HTMLElement;

    expect(getComputedStyle(label).whiteSpace).toBe('normal');
    expect(getComputedStyle(label).textOverflow).not.toBe('ellipsis');
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    expect(label.textContent!.trim()).toBe(long);
  });

  it('says the level of a narrower term in its name', async () => {
    await open({ concepts: TREE, hierarchical: true, multiple: true });
    (root.querySelector('.expand-btn') as HTMLElement).click();
    fixture.detectChanges();

    const names = nodes().map(node => node.querySelector('.node-label')!.textContent!.replace(/\s+/g, ' ').trim());
    expect(names).toEqual(['Mathematik', 'Algebra, FIELD.VOCAB_LEVEL', 'Physik']);
    expect(nodes()[1].querySelector('.node-label .sr-only')).withContext('for screen readers only').not.toBeNull();
  });

  describe('for a field that takes one value', () => {
    let emitted: string[][];

    beforeEach(async () => {
      await open({ concepts: TREE, hierarchical: true, multiple: false, selectedValues: ['http://w3id.org/b'] });
      emitted = [];
      fixture.componentInstance.selectionChange.subscribe(value => emitted.push(value));
    });

    const choices = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.tree-node button.node-choice'));

    it('offers buttons, not checkboxes, and says which one is chosen', () => {
      expect(root.querySelectorAll('mat-checkbox, input[type="checkbox"]').length).toBe(0);
      expect(choices().map(b => b.querySelector('.node-label')!.textContent!.trim())).toEqual(['Mathematik', 'Physik']);
      expect(choices().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      expect(choices().map(b => b.getAttribute('type'))).toEqual(['button', 'button']);
    });

    it('chooses with a press and takes the choice back with another', () => {
      choices()[0].click();
      choices()[1].click();

      expect(emitted).toEqual([['http://w3id.org/a'], []]);
    });

    it('has no serious accessibility violations', async () => {
      expect(await seriousA11yViolations(root)).toEqual([]);
    });
  });

  it('keeps checkboxes for a field that takes several values', async () => {
    await open({ concepts: TREE, multiple: true });

    expect(root.querySelectorAll('.tree-node mat-checkbox').length).toBe(3);
    expect(root.querySelectorAll('.node-choice').length).toBe(0);
  });

  describe('with 500 concepts', () => {
    const MANY = Array.from({ length: 500 }, (_, i) => ({ uri: `http://w3id.org/subject/${i}`, label: `Fach ${i}` })) as any[];

    beforeEach(async () => {
      await open({ concepts: MANY, multiple: true });
    });

    const more = () => root.querySelector('.tree-list .more-btn') as HTMLButtonElement | null;

    it('renders the first 200 and offers the rest', () => {
      expect(nodes().length).toBe(200);
      expect(more()).not.toBeNull();
      expect(more()!.getAttribute('type')).toBe('button');
      expect(more()!.textContent!.trim()).toBe('FIELD.VOCAB_SHOW_MORE');
    });

    it('adds the next 200 and puts the focus on the first of them', async () => {
      more()!.focus();
      more()!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(nodes().length).toBe(400);
      expect(nodes()[200].contains(document.activeElement)).withContext('focus on the first new entry').toBeTrue();

      more()!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(nodes().length).toBe(500);
      expect(more()).withContext('nothing left to show').toBeNull();
    });

    it('reaches every rendered entry with Tab: native controls only', () => {
      const controls = nodes().map(node => node.querySelector('input[type="checkbox"]') as HTMLInputElement);

      expect(controls.every(control => control && control.tabIndex === 0 && !control.disabled)).toBeTrue();
    });

    it('finds a concept beyond the first 200 with the filter', () => {
      fixture.componentInstance.filterText = 'Fach 49';
      fixture.componentInstance.onFilterChange();
      fixture.detectChanges();

      const names = nodes().map(node => node.querySelector('.node-label')!.textContent!.trim());
      expect(names).toEqual(['Fach 49', 'Fach 490', 'Fach 491', 'Fach 492', 'Fach 493', 'Fach 494', 'Fach 495', 'Fach 496', 'Fach 497', 'Fach 498', 'Fach 499']);
      expect(more()).toBeNull();
    });

    it('starts with the first 200 again when it is opened the next time', async () => {
      more()!.click();
      fixture.detectChanges();
      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();

      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(nodes().length).toBe(200);
    });
  });
});
