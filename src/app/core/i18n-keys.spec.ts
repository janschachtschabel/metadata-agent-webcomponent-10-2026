import { LAYOUT_PRESETS } from '../shared/layouts';

/**
 * Audit M-06: ten LAYOUT keys the presets name were missing from both files,
 * so the layout names showed as raw keys. German and English must also offer
 * the same keys, or one language shows keys where the other shows text.
 */
describe('translation files', () => {
  async function load(lang: string): Promise<Record<string, unknown>> {
    const response = await fetch(`/assets/i18n/${lang}.json`);
    expect(response.ok).withContext(`${lang}.json is served`).toBeTrue();
    return response.json();
  }

  function leaves(tree: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(tree).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object' ? leaves(value as Record<string, unknown>, path) : [path];
    });
  }

  it('offer the same keys in German and English', async () => {
    const [de, en] = await Promise.all([load('de'), load('en')]);

    expect(leaves(en).sort()).toEqual(leaves(de).sort());
  });

  it('contain the name and description of every layout preset', async () => {
    const de = leaves(await load('de'));
    const named = Object.values(LAYOUT_PRESETS).flatMap(p => [p.i18nKey, p.i18nDescription].filter(Boolean) as string[]);

    expect(named.filter(key => !de.includes(key))).toEqual([]);
  });
});
