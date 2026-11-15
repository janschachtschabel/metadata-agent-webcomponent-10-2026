/**
 * Audit 14.11. (U-16, U-17): the version the widget reports
 * (`customElements.get('metadata-agent-canvas').widgetVersion`, the `?v=` of
 * the text request) is written by hand in version.ts. Nothing tied it to
 * package.json, which the delivery stamps into build.json.
 */
import packageJson from '../../package.json';
import { WIDGET_VERSION } from './version';

describe('WIDGET_VERSION', () => {
  it('is the version of package.json', () => {
    expect(WIDGET_VERSION).toBe(packageJson.version);
  });
});
