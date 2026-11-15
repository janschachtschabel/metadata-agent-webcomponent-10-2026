/**
 * German and English must offer the same keys, or one language shows keys
 * where the other shows text (audit M-06).
 */

/**
 * The application's source files, by path below src/app: webpack lists what
 * the directory holds when the specs are built, so a new file is looked
 * through without being named here.
 */
const SOURCE_FILES = (import.meta as unknown as {
  webpackContext(directory: string, options: { recursive: boolean; regExp: RegExp }): { keys(): string[] };
}).webpackContext('../', { recursive: true, regExp: /^\.\/(?!testing\/)(?!.*\.spec\.ts$).*\.ts$/ })
  .keys().map(file => file.replace(/^\.\//, ''));

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

  // Audit 14.11. (U-16): a key written in a template or in code that neither
  // file has shows as the key (or, with a fallback, in English only). Looked
  // for in the sources as they are served to the specs (angular.json, test
  // assets): every quoted, dotted, upper-case name is a key.
  describe('keys used in templates and code', () => {
    /** Quoted dotted upper-case names that are no translation keys. */
    const NOT_A_KEY = ['DD.MM.YYYY'];

    function keysIn(source: string): string[] {
      return Array.from(source.matchAll(/['"`]([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)['"`]/g), match => match[1])
        .filter(key => !NOT_A_KEY.includes(key));
    }

    async function sources(): Promise<Record<string, string>> {
      const texts: Record<string, string> = {};
      const read = async (file: string) => {
        const response = await fetch(`/repo/src/app/${file}`);
        expect(response.ok).withContext(`${file} is served to the specs`).toBeTrue();
        texts[file] = await response.text();
      };
      await Promise.all(SOURCE_FILES.map(read));
      // The templates the components name.
      const templates = Object.entries(texts).flatMap(([file, text]) =>
        Array.from(text.matchAll(/templateUrl:\s*['"]\.\/([^'"]+)['"]/g), match => file.replace(/[^/]+$/, match[1])));
      await Promise.all(templates.map(read));
      return texts;
    }

    it('finds the keys in a source (the check itself)', () => {
      expect(keysIn(`{{ 'COMMON.CLOSE' | translate }} say("ALERTS.INPUT_REQUIRED") \`FIELD.STATUS.FILLED\` 'DD.MM.YYYY' 'Core' "a.b"`))
        .toEqual(['COMMON.CLOSE', 'ALERTS.INPUT_REQUIRED', 'FIELD.STATUS.FILLED']);
    });

    it('all exist in German and in English', async () => {
      const [de, en, texts] = await Promise.all([load('de'), load('en'), sources()]);
      const german = new Set(leaves(de));
      const english = new Set(leaves(en));

      const used = Object.entries(texts).flatMap(([file, text]) => keysIn(text).map(key => ({ key, file })));
      const missing = used
        .filter(({ key }) => !german.has(key) || !english.has(key))
        .map(({ key, file }) => `${key} (${file})`);

      expect(Object.keys(texts).length).withContext('sources read').toBeGreaterThan(60);
      expect(Object.keys(texts).filter(file => file.endsWith('.html')).length).withContext('templates read').toBeGreaterThan(10);
      expect(new Set(used.map(use => use.key)).size).withContext('keys found').toBeGreaterThan(100);
      expect(missing).toEqual([]);
    });
  });

  // Final audit 18.10.: the agent serves these files to 2.1.1 widgets as well
  // (mixed deployments), and the 2.1.1 bundle still uses this key.
  it('keep the keys a 2.1.1 widget still uses', async () => {
    const [de, en] = await Promise.all([load('de'), load('en')]);

    expect((de['FIELD'] as any)?.BOOLEAN?.EMPTY).toBe('Bitte auswählen');
    expect((en['FIELD'] as any)?.BOOLEAN?.EMPTY).toBe('Please select');
  });
});
