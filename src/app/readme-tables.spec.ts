/**
 * Audit 14.11. (U-11, U-12): the README's layout matrix and alias table were
 * kept by hand next to the presets and drifted (rows for preset keys that no
 * longer exist, none for groupCollapse).
 *
 * Both tables are generated here from the presets and the alias map and
 * compared with the rows between the markers in README.md and README.de.md
 * (served to the specs under /repo/, angular.json). When a preset or an alias
 * changes, the failure prints the rows to paste.
 */
import { LAYOUT_PRESETS, LayoutConfig, MODE_LAYOUT_MAP } from './shared/layouts';

const LAYOUTS = Object.keys(LAYOUT_PRESETS) as (keyof typeof LAYOUT_PRESETS)[];

/** One row per preset key - elements, then behaviour and style - with its value in each layout. */
export function layoutMatrixRows(): string[] {
  const row = (key: string, value: (layout: LayoutConfig) => unknown) =>
    `| \`${key}\` | ${LAYOUTS.map(name => String(value(LAYOUT_PRESETS[name]))).join(' | ')} |`;
  const elements = Object.keys(LAYOUT_PRESETS.default.elements) as (keyof LayoutConfig['elements'])[];
  return [
    ...elements.map(key => row(key, layout => layout.elements[key])),
    row('readonly', layout => layout.behavior.readonly),
    row('columns', layout => layout.style.columns),
    row('borderless', layout => layout.style.borderless),
  ];
}

/** One row per layout: the other names that select it, in the order of the map. */
export function aliasRows(): string[] {
  return LAYOUTS.map(name => {
    const aliases = Object.keys(MODE_LAYOUT_MAP).filter(alias => MODE_LAYOUT_MAP[alias] === name && alias !== name);
    return `| ${aliases.map(alias => `\`${alias}\``).join(', ')} | \`${name}\` |`;
  });
}

/** The rows of the table between `<!-- name:start -->` and `<!-- name:end -->`, without its two header lines. */
function tableRows(readme: string, name: string): string[] {
  const block = readme.match(new RegExp(`<!-- ${name}:start -->([\\s\\S]*?)<!-- ${name}:end -->`));
  if (!block) throw new Error(`no table marked "${name}" in the README`);
  return block[1].split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('|')).slice(2);
}

for (const file of ['README.md', 'README.de.md']) {
  describe(`${file}: tables generated from the code`, () => {
    let readme: string;

    beforeAll(async () => {
      const response = await fetch(`/repo/${file}`);
      expect(response.ok).withContext(`${file} is served to the specs`).toBeTrue();
      readme = await response.text();
    });

    it('layout matrix = the presets (src/app/shared/layouts/presets)', () => {
      expect(layoutMatrixRows().length).toBe(16);
      expect(tableRows(readme, 'layout-matrix')).toEqual(layoutMatrixRows());
    });

    it('its header names the layouts in the order of the columns', () => {
      const header = readme.match(/<!-- layout-matrix:start -->\s*(\|[^\n]*)/)?.[1] ?? '';

      expect(Array.from(header.matchAll(/`([a-z-]+)`/g), match => match[1])).toEqual(LAYOUTS);
    });

    it('alias table = MODE_LAYOUT_MAP (src/app/shared/layouts/layout.models.ts)', () => {
      expect(tableRows(readme, 'layout-aliases')).toEqual(aliasRows());
    });
  });
}
