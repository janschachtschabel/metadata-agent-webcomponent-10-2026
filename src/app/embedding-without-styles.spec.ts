/**
 * Audit 14.11. (U-16): every spec ran with the widget's global stylesheet.
 * edu-sharing loads runtime.js, polyfills.js and main.js only - no styles.css,
 * so the widget's theme, its fonts, its icon font and the focus ring of
 * src/styles/main.scss never arrive there. What the widget shows then is what
 * its components carry in main.js.
 *
 * Here the seven layouts run with that stylesheet switched off, and with no
 * Material theme of a host either (the worst case; edu-sharing brings its
 * own, which Karma cannot stand in for):
 * - no control without an accessible name,
 * - no icon that needs the widget's icon font to mean something: an icon is an
 *   inline SVG that is drawn, or decoration (aria-hidden) on a control that
 *   has a name of its own,
 * - the focused control can be seen,
 * - read-only values are text.
 *
 * Not covered: the widget's overlays (type menu, calendar, time list, the
 * vocabulary dialog) - they sit under <body>, outside the element, and take
 * their look from the host's theme alone.
 */
import { CanvasHarness, CORE_SCHEMA, EVENT_SCHEMA, PERSON_SCHEMA, mountCanvas } from './testing/canvas-harness';
import { seriousA11yViolations, withoutGlobalStyles } from './testing/a11y';

const SCHEMAS = {
  'core.json': CORE_SCHEMA,
  'person.json': PERSON_SCHEMA,
  'event.json': {
    fields: [
      ...EVENT_SCHEMA.fields,
      { id: 'schema:isAccessibleForFree', label: { de: 'Kostenlos' }, system: { datatype: 'boolean', multiple: false } },
      { id: 'schema:url', label: { de: 'Webseite' }, system: { datatype: 'uri', multiple: false } },
    ],
    groups: [],
  },
};
const RECORD = {
  metadataset: 'event.json',
  metadata: {
    'cclom:title': 'Konzert', 'cclom:general_keyword': ['Musik', 'Sommer'], 'schema:startDate': '2026-05-03',
    'schema:isAccessibleForFree': true, 'schema:url': 'https://example.org/konzert',
  },
};
const LAYOUTS = ['default', 'plugin', 'dialog', 'detail', 'clean', 'prueftisch', 'prueftisch-org'];
const READONLY_LAYOUTS = ['detail', 'prueftisch-org'];
const CONTROLS = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/** The controls of the widget an editor can reach. */
function controls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROLS))
    .filter(el => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
}

/** What names a control, without the ligature of an icon (a word only the icon font turns into a picture). */
function accessibleName(el: HTMLElement): string {
  const labelledBy = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? '').join(' ');
  const ownText = el.cloneNode(true) as HTMLElement;
  ownText.querySelectorAll('mat-icon').forEach(icon => icon.remove());
  const labels = Array.from((el as HTMLInputElement).labels ?? [], label => label.textContent ?? '').join(' ');
  return [el.getAttribute('aria-label'), labelledBy, labels, ownText.textContent, el.getAttribute('title')]
    .map(text => (text ?? '').trim()).find(Boolean) ?? '';
}

function describeControl(el: HTMLElement): string {
  return `<${el.tagName.toLowerCase()} class="${el.className}"> "${accessibleName(el).slice(0, 40)}"`;
}

const visibleColour = (colour: string) => !/^(transparent|rgba\(.*,\s*0\))$/.test(colour);

/**
 * Whether the focus on `el` shows, with styles the widget brings itself: an
 * outline on the control, or - for the input of a form field - the field's
 * frame, which the canvas draws 2 px wide while it holds the focus. A state
 * layer in a colour of the theme does not count: without a theme it is
 * transparent.
 */
function focusShows(el: HTMLElement): boolean {
  el.focus();
  if (document.activeElement !== el) return false;
  const own = getComputedStyle(el);
  if (own.outlineStyle !== 'none' && parseFloat(own.outlineWidth) >= 1 && visibleColour(own.outlineColor)) return true;
  // A native control Material hides under its own drawing (radio, checkbox): the drawing carries the ring.
  const proxy = el.closest('.mdc-radio, .mdc-checkbox');
  if (proxy) {
    const ring = getComputedStyle(proxy);
    return ring.outlineStyle !== 'none' && parseFloat(ring.outlineWidth) >= 1 && visibleColour(ring.outlineColor);
  }
  const frame = el.closest('mat-form-field.mat-focused')?.querySelector('.mdc-notched-outline__leading');
  if (!frame) return false;
  const border = getComputedStyle(frame);
  return parseFloat(border.borderTopWidth) >= 2 && visibleColour(border.borderTopColor);
}

for (const layout of LAYOUTS) {
  describe(`<metadata-agent-canvas layout="${layout}"> without styles.css`, () => {
    let h: CanvasHarness;

    beforeEach(async () => {
      withoutGlobalStyles();
      h = await mountCanvas({ layout, showInputArea: layout === 'default' || layout === 'plugin' }, SCHEMAS);
      await h.set('metadataInput', RECORD);
    });

    afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

    it('runs without the widget theme (the check itself)', () => {
      expect(getComputedStyle(h.root).getPropertyValue('--md-primary')).toBe('');
      expect(h.root.querySelectorAll('app-field').length).toBeGreaterThan(3);
    });

    it('has no serious accessibility violation', async () => {
      expect(await seriousA11yViolations(h.root)).toEqual([]);
    });

    it('names every control', () => {
      const all = controls(h.root);

      expect(all.length).toBeGreaterThan(0);
      expect(all.filter(el => !accessibleName(el)).map(describeControl)).toEqual([]);
    });

    it('needs no icon font to be understood: icons are drawn SVGs or decoration', () => {
      const icons = Array.from(h.root.querySelectorAll<HTMLElement>('mat-icon'));
      const drawn = (icon: HTMLElement) => {
        const svg = icon.querySelector('svg');
        const box = svg?.getBoundingClientRect();
        return !!svg?.querySelector('path')?.getAttribute('d') && !!box && box.width >= 12 && box.height >= 12;
      };
      const carriesMeaning = icons.filter(icon => !icon.querySelector('svg') && icon.getAttribute('aria-hidden') !== 'true');
      const brokenSvg = icons.filter(icon => icon.querySelector('svg') && !drawn(icon));

      expect(icons.length).toBeGreaterThan(0);
      expect(carriesMeaning.map(icon => icon.textContent?.trim())).withContext('ligatures that are not decoration').toEqual([]);
      expect(brokenSvg.map(icon => icon.outerHTML.slice(0, 80))).withContext('SVG icons without a size or a path').toEqual([]);
    });

    it('shows which control has the focus', () => {
      const unseen = controls(h.root).filter(el => !focusShows(el)).map(describeControl);

      expect(unseen).toEqual([]);
    });

    if (READONLY_LAYOUTS.includes(layout)) {
      it('shows the values as text, a web address as a named link', () => {
        const values = Array.from(h.root.querySelectorAll('.readonly-value'), value => value.textContent?.trim());
        const link = h.root.querySelector<HTMLAnchorElement>('.readonly-value a[href]');

        expect(h.root.querySelector('app-field input, app-field textarea')).toBeNull();
        expect(values).toContain('Konzert');
        expect(link?.href).toBe('https://example.org/konzert');
        expect(link?.textContent?.trim()).toBe('https://example.org/konzert');
      });
    } else {
      it('draws the remove symbol of a chip as SVG', () => {
        expect(h.root.querySelectorAll('mat-chip app-svg-icon svg path[d]').length).toBe(2);
      });
    }
  });
}
