import axe from 'axe-core';

/**
 * axe violations of impact "serious" or "critical" inside `element`, one line each.
 *
 * Colour contrast is left to the manual check: Karma renders without the host
 * page's theme, so axe would measure colours nobody sees.
 */
export async function seriousA11yViolations(element: Element): Promise<string[]> {
  const result = await axe.run(element, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => `${n.target.join(' ')} (${n.failureSummary})`).join(' | ')}`);
}
