/**
 * Audit 14.11. (U-12): the presets promised elements their layouts did not
 * have - a floating reset button in four layouts, collapsible groups in three,
 * field actions in four - and carried twelve keys nothing read. A preset now
 * holds only keys with an effect, and every element it switches on is on the
 * screen: each key needs a check here, or this file does not compile.
 */
import { CanvasElements, LAYOUT_PRESETS } from '../../shared/layouts';
import { mountCanvas } from '../../testing/canvas-harness';

function hasField(root: HTMLElement, label: string): boolean {
  return Array.from(root.querySelectorAll('app-field mat-label, app-field .readonly-label')).some(el => el.textContent!.trim().startsWith(label));
}

const RENDERED: Record<keyof CanvasElements, (root: HTMLElement) => boolean> = {
  inputArea: root => !!root.querySelector('app-input-area, .input-section'),
  statusBar: root => !!root.querySelector('.status-bar'),
  coreFields: root => hasField(root, 'Titel'),
  specialFields: root => hasField(root, 'Beginn'),
  fieldActions: root => !!root.querySelector('.group-header .group-info'),
  groupCollapse: root => !!root.querySelector('.group-header button.group-toggle'),
  floatingControls: root => !!root.querySelector('app-floating-bar'),
  contentTypeSelector: root => !!root.querySelector('app-floating-bar app-content-type-menu'),
  jsonLoader: root => !!root.querySelector('app-floating-bar app-json-loader'),
  saveButton: root => !!root.querySelector('app-floating-bar .btn-save'),
  uploadButton: root => !!root.querySelector('app-floating-bar .btn-upload'),
  floatingResetButton: root => !!root.querySelector('app-floating-bar .btn-reset'),
  languageSwitcher: root => !!root.querySelector('app-floating-bar app-language-switcher'),
};

for (const [name, preset] of Object.entries(LAYOUT_PRESETS)) {
  describe(`layout preset "${name}"`, () => {
    afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

    it('holds exactly the keys a layout renders', () => {
      expect(Object.keys(preset.elements).sort()).toEqual(Object.keys(RENDERED).sort());
      expect(Object.keys(preset.style).sort()).toEqual(['borderless', 'columns']);
      expect(Object.keys(preset.behavior)).toEqual(['readonly']);
    });

    it('shows every element it switches on, and none it switches off', async () => {
      const h = await mountCanvas({ layout: name });
      await h.set('metadataInput', {
        metadataset: 'event.json',
        metadata: { 'cclom:title': 'Sommerfest', 'schema:startDate': '2026-05-03' },
      });

      const shown = Object.fromEntries(Object.entries(RENDERED).map(([key, rendered]) => [key, rendered(h.root)]));

      expect(shown).toEqual(preset.elements as unknown as Record<string, boolean>);
    });
  });
}
