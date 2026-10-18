/**
 * Layout System - Central Export
 * 
 * Two main layouts with individually toggleable elements.
 * 
 * ## Usage
 * 
 * ### Via layout attribute:
 * ```html
 * <app-canvas layout="default"></app-canvas>
 * <app-canvas layout="default" [readonly]="true"></app-canvas>
 * ```
 * 
 * ### Via readonly:
 * ```html
 * <app-canvas layout="default" [readonly]="true"></app-canvas>
 * ```
 * 
 * ### Individual element control (works in any layout):
 * ```html
 * <app-canvas 
 *   layout="default"
 *   [showInputArea]="true"
 *   [showStatusBar]="true"
 *   [showCoreFields]="true"
 *   [showSpecialFields]="true"
 *   [showFooter]="true"
 *   [showFloatingControls]="true"
 *   [showFieldActions]="true">
 * </app-canvas>
 * ```
 * 
 * ## Layouts
 * 
 * | Layout | Use Case |
 * |--------|----------|
 * | `default` | Local, Standalone, Bookmarklet, Extension, Hosted |
 * | `readonly` | Use [readonly]="true" attribute on any layout |
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
