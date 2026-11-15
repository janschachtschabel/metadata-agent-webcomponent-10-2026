import { TestBed } from '@angular/core/testing';
import { Type, reflectComponentType } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';

import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { DetailLayoutComponent } from './detail-layout/detail-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { PrueftischLayoutComponent } from './prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from './prueftisch-org-layout/prueftisch-org-layout.component';
import { pickerPanelPosition } from '../shared/vocab-tree-picker/vocab-tree-picker.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';

/**
 * Audit U-14 (reflow, WCAG 1.4.10): the widget sits in sidebars and dialogs,
 * so its columns must follow the widget's width, not the window's - a narrow
 * widget on a wide screen kept two to four squeezed columns. And the picker
 * panel was at least 360 px wide, wider than a 320 px viewport.
 */
describe('vocabulary picker panel on a narrow screen', () => {
  it('stays inside a 320 px viewport', () => {
    const style = pickerPanelPosition({ top: 100, bottom: 140, left: 16, width: 288 }, 320, 640);

    const left = parseFloat(style['left']);
    const width = parseFloat(style['width']);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(312);
  });

  it('keeps its width on a wide screen', () => {
    const style = pickerPanelPosition({ top: 100, bottom: 140, left: 100, width: 420 }, 1280, 800);

    expect(style['width']).toBe('420px');
    expect(style['left']).toBe('100px');
  });
});

function stateWithFields(count: number): CanvasState {
  const fields = Array.from({ length: count }, (_, i) => ({
    fieldId: `f${i}`, label: `Feld ${i}`, group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: `Wert ${i}`, confidence: 1, isRequired: false,
    datatype: 'string', multiple: false,
  } as unknown as CanvasFieldState));
  return {
    ...createInitialState(),
    coreFields: fields,
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }],
    totalFields: count,
    filledFields: count,
  };
}

const LAYOUTS: [string, Type<unknown>, Record<string, unknown>][] = [
  ['clean', CleanLayoutComponent, {}],
  ['default', DefaultLayoutComponent, {}],
  ['detail', DetailLayoutComponent, { flatGroups: true }],
  ['dialog', DialogLayoutComponent, {}],
  ['plugin', PluginLayoutComponent, {}],
  ['prueftisch', PrueftischLayoutComponent, {}],
  ['prueftisch-org', PrueftischOrgLayoutComponent, {}],
];

for (const [name, layout, extra] of LAYOUTS) {
  describe(`${name} layout columns`, () => {
    async function columnsAt(width: number): Promise<number> {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.width = `${width}px`;
      fixture.componentRef.setInput('state', stateWithFields(4));
      fixture.componentRef.setInput('columns', 2);
      for (const [input, value] of Object.entries(extra)) fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      await fixture.whenStable();
      const grid = host.querySelector('.group-fields.columns-2') as HTMLElement;
      expect(grid).withContext('the two-column grid is rendered').not.toBeNull();
      return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    }

    it('shows two columns when the widget is wide', async () => {
      expect(await columnsAt(1100)).toBe(2);
    });

    it('falls back to one column when the widget is narrow, whatever the window', async () => {
      expect(await columnsAt(360)).toBe(1);
    });
  });
}

/**
 * Audit 13.11. (W-LOG-10): the error banner did not break long words. The
 * request id of a failure has 32 characters since 3.0.1; at 320 px it ran out
 * of the banner. The warning shares the banner's rules.
 */
for (const [name, layout] of LAYOUTS) {
  for (const [banner, key] of [['extraction-error', 'extractionError'], ['extraction-warning', 'extractionWarning']]) {
    it(`${name} layout keeps a long ${banner} text inside a 320 px widget`, async () => {
      await TestBed.configureTestingModule({
        imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
      }).compileComponents();
      const fixture = TestBed.createComponent(layout);
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.width = '320px';
      fixture.componentRef.setInput('state', {
        ...stateWithFields(1),
        [key]: 'KI-Erschließung fehlgeschlagen: Der Dienst antwortet nicht (Anfrage-ID: 0123456789abcdef0123456789abcdef0123456789abcdef)',
      });
      fixture.detectChanges();
      await fixture.whenStable();

      const box = host.querySelector(`.${banner}`) as HTMLElement;
      const text = box.querySelector('span') as HTMLElement;
      expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(box.getBoundingClientRect().right);
      expect(box.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    });
  }
}

/**
 * Audit 14.11. (U-02): three layouts (clean, detail, plugin) gave their
 * fields the full width plus a padding. Without a host page that resets
 * box-sizing they stood 8 to 30 px out of the widget, and a long value ended
 * outside it.
 */
for (const [name, layout] of LAYOUTS) {
  it(`${name} layout keeps its fields inside a 320 px widget`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '320px';
    fixture.componentRef.setInput('state', stateWithFields(2));
    fixture.detectChanges();
    await fixture.whenStable();

    const fields = host.querySelector('.fields-section') as HTMLElement;
    expect(fields.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    for (const field of Array.from(host.querySelectorAll('app-field'))) {
      expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    }
  });
}

/**
 * Audit 14.11. (U-25): the floating bar could be wider than a 320 px widget -
 * the browser extension's bar has three buttons with their text, a type
 * button and the language switch - and its entrance animated a
 * `translateX(-50%)` left over from a centring it no longer uses: the bar
 * jumped half its width to the left and slid back.
 */
for (const [name, layout] of LAYOUTS) {
  it(`${name} layout keeps its floating bar inside a 320 px widget`, async () => {
    await TestBed.configureTestingModule({
      imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(layout);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '320px';
    const declared = new Set(reflectComponentType(layout)!.inputs.map(input => input.templateName));
    const everything: Record<string, unknown> = {
      state: { ...stateWithFields(2), contentTypeLabel: 'Bildungsangebot der beruflichen Weiterbildung' },
      contentTypes: [{ label: 'Veranstaltung', schemaFile: 'event.json' }],
      showFloatingControls: true, showContentType: true, showLanguageSwitcher: true,
      showJsonLoader: true, showSaveButton: true, showUploadButton: true, showResetButton: true,
    };
    for (const [input, value] of Object.entries(everything)) {
      if (declared.has(input)) fixture.componentRef.setInput(input, value);
    }
    fixture.detectChanges();
    await fixture.whenStable();

    const bar = host.querySelector('app-floating-bar') as HTMLElement;
    const edges = host.getBoundingClientRect();
    expect(bar.getBoundingClientRect().left).toBeGreaterThanOrEqual(edges.left);
    expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(edges.right);
    for (const part of Array.from(bar.children)) {
      expect(part.getBoundingClientRect().left).withContext(part.tagName).toBeGreaterThanOrEqual(edges.left);
      expect(part.getBoundingClientRect().right).withContext(part.tagName).toBeLessThanOrEqual(edges.right);
    }
  });
}

it('the floating bar slides up without moving sideways', async () => {
  await TestBed.configureTestingModule({
    imports: [DefaultLayoutComponent, TranslateModule.forRoot()],
  }).compileComponents();
  const fixture = TestBed.createComponent(DefaultLayoutComponent);
  fixture.componentRef.setInput('state', stateWithFields(1));
  fixture.detectChanges();
  const animation = getComputedStyle(fixture.nativeElement.querySelector('app-floating-bar')).animationName;

  const frames = Array.from(document.styleSheets)
    .flatMap(sheet => Array.from(sheet.cssRules))
    .filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule && rule.name === animation)
    .flatMap(rule => Array.from(rule.cssRules) as CSSKeyframeRule[]);

  expect(animation).withContext('the bar has an entrance animation').not.toBe('none');
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.map(frame => frame.style.transform).filter(transform => /translateX|translate\(/.test(transform))).toEqual([]);
  expect(frames.some(frame => frame.style.transform.includes('translateY'))).toBeTrue();
});
