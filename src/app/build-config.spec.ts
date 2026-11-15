/**
 * Audit 14.11. (U-24, U-N): angular.json listed `src/schemata`, a directory
 * that does not exist, and `src/examples`, two demo pages and a stylesheet
 * that had fallen behind the ones the agent ships (and that the build script
 * leaves out of the delivery on purpose). `ng serve` answered any host name.
 *
 * Whether the listed paths exist cannot be seen from a browser; the spec pins
 * the list, and the list was checked against the working tree when it was
 * written.
 */
import workspace from '../../angular.json';

describe('angular.json', () => {
  const architect = workspace.projects['metadata-agent-canvas'].architect;
  const inputs = (assets: unknown[]): string[] => assets.map(asset => typeof asset === 'string' ? asset : (asset as { input: string }).input);

  it('builds with the assets the widget has: its own, the icon font and Roboto', () => {
    expect(inputs(architect.build.options.assets)).toEqual([
      'src/assets',
      'node_modules/material-icons/iconfont',
      'node_modules/@fontsource/roboto/files',
    ]);
  });

  // Audit 14.11. (U-16, U-11): the specs also read the sources (i18n-keys.spec.ts)
  // and the README (readme-tables.spec.ts) as text, under /repo/.
  it('serves the specs the same, plus the codepoints of the icon font, the sources and the README', () => {
    expect(inputs(architect.test.options.assets)).toEqual([
      'src/assets',
      'node_modules/material-icons/iconfont',
      'node_modules/material-icons/css',
      'node_modules/@fontsource/roboto/files',
      'src/app',
      '.',
    ]);
  });

  // Audit 14.11. (U-18): the budget follows the delivered size (1.27 MB raw
  // after the time picker and @angular/animations went); the old one (1.6 / 2 MB)
  // would not have noticed 25 % more.
  it('fails the production build above 1.6 MB and warns above 1.4 MB', () => {
    for (const configuration of [architect.build.configurations.production, architect.build.configurations.extension]) {
      expect(configuration.budgets).toEqual([{ type: 'initial', maximumWarning: '1.4mb', maximumError: '1.6mb' }]);
    }
  });

  it('type-checks the build without the specs (tsconfig.app.json, U-20)', () => {
    expect(architect.build.options.tsConfig).toBe('tsconfig.app.json');
  });

  it('lets `ng serve` answer for localhost only', () => {
    expect(architect.serve.options.allowedHosts).toEqual(['localhost']);
  });
});
