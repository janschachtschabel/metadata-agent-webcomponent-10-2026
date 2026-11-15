import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { InputAreaComponent } from '../shared/input-area/input-area.component';
import { StatusBarComponent } from '../shared/status-bar/status-bar.component';
import { CanvasFieldState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { NoAnimationsModule } from '../../testing/no-animations';
import { contrastRatio, inWidgetTheme } from '../../testing/a11y';
import de from '../../../assets/i18n/de.json';
import en from '../../../assets/i18n/en.json';

/** The small things of the audit of 14.11. (U-N) that can be pinned. */
const WITH_INPUTS: [string, Type<unknown>][] = [
  ['default layout', DefaultLayoutComponent],
  ['input area', InputAreaComponent],
];

async function render(component: Type<unknown>, inputs: Record<string, unknown> = {}) {
  await TestBed.configureTestingModule({
    imports: [component, TranslateModule.forRoot(), NoAnimationsModule],
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  inWidgetTheme(fixture.nativeElement);
  for (const [input, value] of Object.entries(inputs)) fixture.componentRef.setInput(input, value);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

for (const [name, component] of WITH_INPUTS) {
  describe(`${name}`, () => {
    // Three toggles "Text", "URL", "Node-ID" without a word about what they choose.
    it('names the group of input modes', async () => {
      const root = await render(component);

      expect(root.querySelector('mat-button-toggle-group')!.getAttribute('aria-label')).toBe('INPUT.MODE_LABEL');
    });

    // The track of the switched-on screenshot switch was #e2e8f6 on white: 1.2:1.
    it('shows the screenshot switch, switched on, at 3:1 or more', async () => {
      const root = await render(component, { screenshotEnabled: true });
      const track = root.querySelector('.screenshot-toggle .mdc-switch__track') as HTMLElement;

      expect(root.querySelector('.screenshot-toggle button[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
      expect(contrastRatio(getComputedStyle(track, '::after').backgroundColor, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(3);
    });
  });
}

describe('progress of the form', () => {
  function unfinished() {
    const title = {
      fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten', groupOrder: 1,
      schemaName: 'Core', aiFillable: true, repoField: true, status: FieldStatus.EMPTY, value: null,
      confidence: 0, isRequired: true, datatype: 'string', multiple: false,
    } as unknown as CanvasFieldState;
    return {
      ...createInitialState(), coreFields: [title], totalFields: 2, filledFields: 1,
      fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields: [title], isCore: true }],
    };
  }

  // "pending" in the shared status bar, "hourglass_empty" in the default layout's own.
  it('is drawn with the same icon in the default layout and in the shared status bar', async () => {
    const own = await render(DefaultLayoutComponent, { state: unfinished() });
    const icon = own.querySelector('.status-bar .progress-icon')!.textContent!.trim();
    TestBed.resetTestingModule();
    const shared = await render(StatusBarComponent, { state: unfinished() });

    expect(icon).toBe('hourglass_empty');
    expect(shared.querySelector('.progress-icon')!.textContent!.trim()).toBe(icon);
  });
});

describe('the German and English texts', () => {
  const texts = (tree: Record<string, unknown>): string[] =>
    Object.values(tree).flatMap(value => typeof value === 'string' ? [value] : texts(value as Record<string, unknown>));

  // "Sie" in most texts, "Nutze ..." in one.
  it('address the editor formally throughout', () => {
    const informal = texts(de).filter(text => /\b(Nutze|Wähle|Gib|Klicke|Prüfe|Bitte wähle|Bitte gib|Du|Dein\w*)\b/.test(text));

    expect(informal).toEqual([]);
  });

  // "Inhaltsart" in the messages, "Inhaltstyp" in the schema and the documentation.
  it('have one word for the content type', () => {
    expect(texts(de).filter(text => /Inhaltsart/i.test(text))).toEqual([]);
    expect(texts(de).filter(text => /Inhaltstyp/.test(text)).length).toBeGreaterThanOrEqual(4);
    expect(texts(en).filter(text => /kind of content|type of content/i.test(text))).toEqual([]);
    expect(texts(en).filter(text => /content type/i.test(text)).length).toBeGreaterThanOrEqual(4);
  });
});
