/**
 * The widget's global stylesheet styles the widget, not the host page (audit U-05).
 *
 * It is injected into the host document (edu-sharing, WordPress, plugin
 * pages). Rules on html, body, :root, * or ::-webkit-scrollbar changed the
 * host's margins, focus rings, scrollbars and --mat-* tokens.
 */
const WIDGET_ROOTS = ['metadata-agent-canvas', 'app-root[data-metadata-agent-app]', '.metadata-agent-overlays'];
// Emitted globally by Angular Material on purpose (mat.elevation-classes,
// mat.app-background) - the same rules a Material host defines itself.
const ALLOWED_GLOBAL = [
  /^(\.mat-mdc-elevation-specific)?\.mat-elevation-(z\d+|transition)$/,
  /^\.mat-app-background$/,
];

function widgetStyleRules(): CSSStyleRule[] {
  const sheet = Array.from(document.styleSheets).find(s => {
    try {
      return Array.from(s.cssRules).some(r => r.cssText.includes('--metadata-agent-font-family'));
    } catch {
      return false;
    }
  });
  if (!sheet) throw new Error('global widget stylesheet not loaded');

  const rules: CSSStyleRule[] = [];
  const collect = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) rules.push(rule);
      else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules);
    }
  };
  collect(sheet.cssRules);
  return rules;
}

describe('global widget stylesheet', () => {
  it('only styles what sits inside the widget', () => {
    const leaking = widgetStyleRules()
      .flatMap(rule => rule.selectorText.split(',').map(s => s.trim()))
      .filter(selector => !WIDGET_ROOTS.some(root => selector.includes(root)))
      .filter(selector => !ALLOWED_GLOBAL.some(pattern => pattern.test(selector)));

    expect(leaking).toEqual([]);
  });

  it('leaves the host page its own design tokens', () => {
    const root = getComputedStyle(document.documentElement);

    expect(root.getPropertyValue('--md-primary')).toBe('');
    expect(root.getPropertyValue('--mat-app-primary')).toBe('');
  });
});
