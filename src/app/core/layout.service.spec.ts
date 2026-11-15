import { LayoutService } from './layout.service';
import { DEFAULT_LAYOUT } from '../shared/layouts';

/**
 * Audit 13.11. (W-SEC-01): `el.layout = null`, `undefined` or
 * `el.removeAttribute('layout')` threw in the element's setter ("Cannot read
 * properties of null") instead of falling back to the default layout.
 */
describe('LayoutService.getLayout', () => {
  const layouts = new LayoutService();

  for (const value of [null, undefined, '', 42, {}]) {
    it(`falls back to the default layout for ${JSON.stringify(value) ?? 'undefined'}`, () => {
      expect(layouts.getLayout(value as any)).toBe(DEFAULT_LAYOUT);
    });
  }

  it('still finds a layout by its name or by a mode alias, whatever the case', () => {
    expect(layouts.getLayout('detail').name).toBe('detail');
    expect(layouts.getLayout('unknown')).toBe(DEFAULT_LAYOUT);
    expect(layouts.getLayout('Bookmarklet')).toBe(layouts.getLayout('bookmarklet'));
  });
});
