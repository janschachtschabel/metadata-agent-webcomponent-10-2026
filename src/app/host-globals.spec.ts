/**
 * Audit 14.11. (K-25): polyfills.js - loaded by every page that embeds the
 * widget - set `__zone_symbol__PASSIVE_EVENTS` and `…UNPATCHED_EVENTS` on the
 * host's window (src/zone-flags.ts). Where the host's own zone.js had loaded
 * first they changed nothing but two globals; where the widget's was first,
 * they applied to the whole page: the host's wheel and touch listeners became
 * passive, nine events left every zone.
 *
 * The flags now belong to the standalone page alone (src/index.html). What
 * the element bundle consists of is decided in angular.json - whether the
 * built polyfills.js is free of them can only be seen in a build.
 */
import workspace from '../../angular.json';

const FLAGS = ['__zone_symbol__PASSIVE_EVENTS', '__zone_symbol__UNPATCHED_EVENTS'];

describe('the widget and the globals of the host page (K-25)', () => {
  const angular = workspace.projects['metadata-agent-canvas'].architect;

  it('ships zone.js alone as polyfills of the element bundle, in every configuration', () => {
    expect(angular.build.options.polyfills).toEqual(['zone.js']);
    for (const [name, configuration] of Object.entries<any>(angular.build.configurations)) {
      expect(configuration.polyfills).withContext(`configuration ${name} must not bring its own`).toBeUndefined();
    }
  });

  it('is tested with the same polyfills (plus zone.js/testing)', () => {
    expect(angular.test.options.polyfills).toEqual(['zone.js', 'zone.js/testing']);
  });

  it('leaves no zone.js flags on the window of a page that loaded its code', () => {
    // This page loaded zone.js and every module of the widget the specs import.
    const set = FLAGS.filter(flag => (window as unknown as Record<string, unknown>)[flag] !== undefined);

    expect(set).toEqual([]);
  });
});
