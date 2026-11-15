/**
 * The seven layout presets by name; LayoutService resolves a layout name or
 * alias (MODE_LAYOUT_MAP) to one of them. Which elements each layout shows by
 * default is in presets/; the README of the repository has the matrix.
 */

// Models
export * from './layout.models';

// Presets
export { DEFAULT_LAYOUT } from './presets/default.layout';

// All layouts as object
import { DEFAULT_LAYOUT } from './presets/default.layout';
import { PLUGIN_LAYOUT } from './presets/plugin.layout';
import { DIALOG_LAYOUT } from './presets/dialog.layout';
import { DETAIL_LAYOUT } from './presets/detail.layout';
import { METADATENPRUEFDIALOG_LAYOUT } from './presets/metadatenpruefdialog.layout';
import { PRUEFTISCH_LAYOUT } from './presets/prueftisch.layout';
import { PRUEFTISCH_ORG_LAYOUT } from './presets/prueftisch-org.layout';
import { LayoutConfig, LayoutPreset } from './layout.models';

export const LAYOUT_PRESETS: Record<LayoutPreset, LayoutConfig> = {
  default: DEFAULT_LAYOUT,
  plugin: PLUGIN_LAYOUT,
  dialog: DIALOG_LAYOUT,
  detail: DETAIL_LAYOUT,
  clean: METADATENPRUEFDIALOG_LAYOUT,
  prueftisch: PRUEFTISCH_LAYOUT,
  'prueftisch-org': PRUEFTISCH_ORG_LAYOUT
};
