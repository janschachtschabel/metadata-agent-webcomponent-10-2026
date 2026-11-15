import axe from 'axe-core';

/**
 * axe violations of impact "serious" or "critical" inside `element`, one line each.
 *
 * Colour contrast only with `contrast: true`, and only for an element that
 * `inWidgetTheme` put under the widget's theme: elsewhere Karma renders the
 * Material parts without any theme, and axe would measure colours nobody sees.
 * (A host that brings its own Material theme, as edu-sharing does, is not
 * covered: that needs a look in the host.)
 */
export async function seriousA11yViolations(element: Element, options: { contrast?: boolean } = {}): Promise<string[]> {
  const result = await axe.run(element, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: !!options.contrast } },
  });
  return result.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => `${n.target.join(' ')} (${n.failureSummary})`).join(' | ')}`);
}

/**
 * Moves a fixture's element under a root that src/styles/main.scss themes, as
 * a host page has it that loads the widget's styles.css: the widget's colours,
 * fonts and Material tokens apply (audit 14.11., U-13). Call it before the
 * first change detection; the root is removed after the spec.
 */
export function inWidgetTheme(element: HTMLElement): HTMLElement {
  const root = document.createElement('metadata-agent-canvas');
  root.style.display = 'block';
  document.body.appendChild(root);
  root.appendChild(element);
  themedRoots.push(root);
  return root;
}
const themedRoots: HTMLElement[] = [];
afterEach(() => themedRoots.splice(0).forEach(root => root.remove()));

/**
 * Switches the widget's global stylesheet (styles.css, built from
 * src/styles/main.scss) off for the running spec: edu-sharing loads the three
 * scripts only, so theme, fonts, icon font and the focus ring of that file
 * never arrive there (audit 14.11., U-16). What is left are the styles the
 * components carry in main.js. Switched on again after the spec.
 */
export function withoutGlobalStyles(): void {
  const sheet = Array.from(document.styleSheets).find(candidate => {
    try {
      return Array.from(candidate.cssRules).some(rule => rule.cssText.includes('--metadata-agent-font-family'));
    } catch {
      return false; // a sheet of another origin
    }
  });
  if (!sheet) throw new Error('global widget stylesheet not loaded');
  sheet.disabled = true;
  disabledSheets.push(sheet);
}
const disabledSheets: CSSStyleSheet[] = [];
afterEach(() => disabledSheets.splice(0).forEach(sheet => (sheet.disabled = false)));

/** WCAG contrast ratio of two opaque CSS colours as getComputedStyle gives them (`rgb(r, g, b)`). */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length < 3) throw new Error(`not an rgb colour: ${color}`);
    const [r, g, b] = channels.map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
