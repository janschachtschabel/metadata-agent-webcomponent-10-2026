import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NoAnimationsModule } from '../../testing/no-animations';

import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { DetailLayoutComponent } from './detail-layout/detail-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { PrueftischLayoutComponent } from './prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from './prueftisch-org-layout/prueftisch-org-layout.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { inWidgetTheme, seriousA11yViolations } from '../../testing/a11y';
import { I18nService } from '../../core/i18n.service';

/**
 * Audit 14.11. (U-02): a read-only view showed its values in disabled edit
 * fields. A URL sat in an <input> that never wraps: in a narrow column the
 * rest was cut off, and a disabled field can neither be focused nor scrolled -
 * the rest was unreachable. A screen reader announced every value as an
 * unavailable edit field. Read-only values are text now, URLs are links.
 */
const LAYOUTS: [string, Type<unknown>][] = [
  ['clean', CleanLayoutComponent],
  ['default', DefaultLayoutComponent],
  ['detail', DetailLayoutComponent],
  ['dialog', DialogLayoutComponent],
  ['plugin', PluginLayoutComponent],
  ['prueftisch', PrueftischLayoutComponent],
  ['prueftisch-org', PrueftischOrgLayoutComponent],
];

/** 120 characters, no place to break but the slashes and dots. */
const LONG_URL = 'https://www.example.org/' + 'lernmaterialien-mathematik-bruchrechnung/'.repeat(2) + 'aufgaben-1.pdf';

function field(overrides: Partial<CanvasFieldState>): CanvasFieldState {
  return {
    fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: false,
    datatype: 'string', multiple: false,
    ...overrides,
  } as unknown as CanvasFieldState;
}

function stateWith(fields: CanvasFieldState[]): CanvasState {
  return {
    ...createInitialState(),
    coreFields: fields,
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields, isCore: true }],
    totalFields: fields.length,
    filledFields: fields.length,
  };
}

/** One field of every kind of control. */
function everyKind(): CanvasFieldState[] {
  const subjects = ['Mathematik', 'Physik', 'Chemie', 'Biologie', 'Informatik'];
  return [
    field({}),
    field({ fieldId: 'ccm:wwwurl', label: 'Adresse', datatype: 'url', value: LONG_URL }),
    field({ fieldId: 'ccm:taxonid', label: 'Fach', value: ['http://w3id.org/s/0', 'http://w3id.org/s/1'], multiple: true,
      vocabulary: { type: 'closed', concepts: subjects.map((label, i) => ({ uri: `http://w3id.org/s/${i}`, label })) } as any }),
    field({ fieldId: 'schema:startDate', label: 'Datum', datatype: 'date', value: '2026-05-03' }),
    field({ fieldId: 'schema:startTime', label: 'Uhrzeit', datatype: 'time', value: '14:30' }),
    field({ fieldId: 'schema:doorTime', label: 'Einlass', datatype: 'datetime', value: '2026-05-03T14:00' }),
    field({ fieldId: 'schema:isAccessibleForFree', label: 'Kostenlos', datatype: 'boolean', value: true }),
    field({ fieldId: 'cclom:general_keyword', label: 'Schlagwörter', datatype: 'array', multiple: true, value: ['Brüche', 'Zahlen'] }),
    field({ fieldId: 'schema:maximumAttendeeCapacity', label: 'Plätze', datatype: 'integer', value: 25 }),
  ];
}

/**
 * The language is set like a host page sets it. Left open, the widget follows
 * the browser: the specs passed in a German Chrome and failed in the English
 * Chromium of the CI container (first pipeline of 4.0.0, 15.11.).
 */
async function render(
  layout: Type<unknown>, fields: CanvasFieldState[], width?: number, language = 'de',
): Promise<ComponentFixture<unknown>> {
  await TestBed.configureTestingModule({
    imports: [layout, TranslateModule.forRoot(), NoAnimationsModule],
  }).compileComponents();
  TestBed.inject(I18nService).setHostLanguage(language);
  const fixture = TestBed.createComponent(layout);
  const host = fixture.nativeElement as HTMLElement;
  inWidgetTheme(host);
  if (width) {
    host.style.display = 'block';
    host.style.width = `${width}px`;
  }
  fixture.componentRef.setInput('state', stateWith(fields));
  fixture.componentRef.setInput('readonly', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

/** The read-only value of the field labelled `label`. */
function valueOf(root: HTMLElement, label: string): HTMLElement {
  const found = Array.from(root.querySelectorAll('app-field'))
    .find(el => el.querySelector('.readonly-label')?.textContent?.trim().startsWith(label));
  if (!found) throw new Error(`no read-only field labelled "${label}"`);
  return found.querySelector('.readonly-value') as HTMLElement;
}

describe('detail layout, 300 px wide, with a 120-character URL', () => {
  let root: HTMLElement;
  let link: HTMLAnchorElement;

  beforeEach(async () => {
    expect(LONG_URL.length).toBe(120);
    const fixture = await render(DetailLayoutComponent, [field({ fieldId: 'ccm:wwwurl', label: 'Adresse', datatype: 'url', value: LONG_URL })], 300);
    root = fixture.nativeElement;
    link = valueOf(root, 'Adresse').querySelector('a') as HTMLAnchorElement;
  });

  it('shows the whole URL, wrapped inside the widget', () => {
    expect(link.textContent!.trim()).toBe(LONG_URL);
    const box = link.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    expect(box.right).withContext('not wider than the widget').toBeLessThanOrEqual(host.right);
    expect(box.height).withContext('several lines').toBeGreaterThan(2 * parseFloat(getComputedStyle(link).fontSize));
    const value = valueOf(root, 'Adresse');
    expect(value.scrollWidth).withContext('nothing cut off').toBeLessThanOrEqual(value.clientWidth);
  });

  it('is a link that leaves the host page alone', () => {
    expect(link.getAttribute('href')).toBe(LONG_URL);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.tabIndex).withContext('reachable by Tab').toBe(0);
  });

  it('is no edit field, available or not', () => {
    expect(root.querySelectorAll('app-field input, app-field textarea, app-field [disabled], app-field [aria-disabled="true"]').length).toBe(0);
  });
});

for (const [name, layout] of LAYOUTS) {
  describe(`${name} layout, read-only`, () => {
    let root: HTMLElement;

    beforeEach(async () => {
      root = (await render(layout, everyKind())).nativeElement;
    });

    it('shows every value as text, named by its label', () => {
      const text = (label: string) => valueOf(root, label).textContent!.replace(/\s+/g, ' ').trim();

      expect(text('Titel')).toBe('Bruchrechnung');
      expect(text('Adresse')).toBe(LONG_URL);
      expect(Array.from(valueOf(root, 'Fach').querySelectorAll('li')).map(li => li.textContent!.trim())).toEqual(['Mathematik', 'Physik']);
      expect(text('Datum')).toBe('03.05.2026');
      expect(text('Uhrzeit')).toBe('14:30');
      expect(text('Einlass')).toBe('03.05.2026 14:00');
      expect(text('Kostenlos')).toBe('FIELD.BOOLEAN.TRUE');
      expect(Array.from(valueOf(root, 'Schlagwörter').querySelectorAll('li')).map(li => li.textContent!.trim())).toEqual(['Brüche', 'Zahlen']);
      expect(text('Plätze')).toBe('25');
      for (const label of ['Titel', 'Fach', 'Kostenlos']) {
        const group = valueOf(root, label).closest('[role="group"]')!;
        expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).withContext(label).toContain(label);
      }
    });

    it('has no edit fields, pickers or remove buttons in its fields', () => {
      expect(root.querySelectorAll('app-field input, app-field textarea, app-field button, app-field mat-radio-button').length).toBe(0);
    });

    it('has no serious accessibility violations, colour contrast included', async () => {
      expect(await seriousA11yViolations(root, { contrast: true })).toEqual([]);
    });
  });
}

describe('read-only dates in an English widget', () => {
  it('are written the English way, with and without a time', async () => {
    // The date kept the German dots when the widget started in English: its
    // text was built before the date adapter knew the language.
    const root = (await render(DetailLayoutComponent, everyKind(), undefined, 'en')).nativeElement as HTMLElement;
    const text = (label: string) => valueOf(root, label).textContent!.replace(/\s+/g, ' ').trim();

    expect(text('Datum')).toBe('03/05/2026');
    expect(text('Einlass')).toBe('03/05/2026 14:00');
  });
});

describe('read-only values that are no web addresses', () => {
  it('are not linked', async () => {
    const fixture = await render(DefaultLayoutComponent, [
      field({ fieldId: 'a', label: 'Skript', datatype: 'url', value: 'javascript:alert(1)' }),
      field({ fieldId: 'b', label: 'Lizenz', datatype: 'uri', value: 'http://w3id.org/l/cc0',
        vocabulary: { type: 'closed', concepts: [{ uri: 'http://w3id.org/l/cc0', label: 'CC0' }, { uri: 'http://w3id.org/l/by', label: 'CC BY' },
          { uri: 'http://w3id.org/l/3', label: 'C' }, { uri: 'http://w3id.org/l/4', label: 'D' }, { uri: 'http://w3id.org/l/5', label: 'E' }] } as any }),
      field({ fieldId: 'c', label: 'Titel', value: 'Siehe https://example.org/seite' }),
    ]);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('app-field a').length).toBe(0);
    expect(valueOf(root, 'Skript').textContent!.trim()).toBe('javascript:alert(1)');
    expect(valueOf(root, 'Lizenz').textContent!.trim()).toBe('CC0');
  });

  it('keep their line breaks and wrap long words', async () => {
    const text = 'Erste Zeile\nZweite Zeile ' + 'Donaudampfschifffahrtsgesellschaftskapitän'.repeat(4);
    const fixture = await render(DefaultLayoutComponent, [field({ value: text })], 320);
    const value = valueOf(fixture.nativeElement, 'Titel');

    expect(value.textContent!.trim()).toBe(text);
    expect(getComputedStyle(value).whiteSpace).toMatch(/^pre-(line|wrap)$/);
    expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);
  });
});
