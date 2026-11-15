/**
 * Layout models: what a preset says about its layout.
 *
 * A preset gives the defaults; the host page overrides single elements with
 * the widget's attributes (show-input-area, show-status-bar, readonly, ...).
 */

/**
 * The elements a preset switches on or off. Every key is read by the canvas
 * and rendered by the layout that sets it `true` (canvas-layout-presets.spec.ts);
 * the keys nothing read are gone (audit 14.11., U-12).
 */
export interface CanvasElements {
  /** Text / URL / node-ID input with the extraction buttons */
  inputArea: boolean;
  /** Status bar: content type, field counts, progress */
  statusBar: boolean;

  /** Core fields (title, description, keywords, ...) */
  coreFields: boolean;
  /** Fields of the content type */
  specialFields: boolean;
  /** Schema badge and counter in the group header */
  fieldActions: boolean;
  /** Groups can be collapsed from their header */
  groupCollapse: boolean;

  /** The floating bar as a whole */
  floatingControls: boolean;
  /** Content-type button in the floating bar */
  contentTypeSelector: boolean;
  /** JSON loader button */
  jsonLoader: boolean;
  /** Save: JSON download or metadataSubmit, by layout */
  saveButton: boolean;
  /** Upload to the repository */
  uploadButton: boolean;
  /** Reset button in the floating bar */
  floatingResetButton: boolean;
  /** Language switcher */
  languageSwitcher: boolean;
}

export interface LayoutStyle {
  /** Remove borders/padding for seamless embedding */
  borderless: boolean;
  /** Number of columns for field display (1-4) */
  columns: 1 | 2 | 3 | 4;
}

export interface LayoutBehavior {
  /** Disable all editing (read-only mode) */
  readonly: boolean;
}

export interface LayoutConfig {
  /** Unique layout name */
  name: string;
  /** Element visibility defaults */
  elements: CanvasElements;
  style: LayoutStyle;
  behavior: LayoutBehavior;
}

/**
 * Available layout presets
 */
export type LayoutPreset = 'default' | 'plugin' | 'dialog' | 'detail' | 'clean' | 'prueftisch' | 'prueftisch-org';

/**
 * Maps integration modes to layout presets
 * 
 * DEFAULT LAYOUT: Full editing capabilities
 * - standalone: Direct access (local, hosted, container)
 * - browser-extension: Running in extension panel
 * - bookmarklet: Running in iframe from bookmarklet
 * 
 * ALIASES (backward compat, map to default):
 * - viewer/view/embed/readonly: Default layout (use readonly attribute for read-only)
 */
export const MODE_LAYOUT_MAP: Record<string, LayoutPreset> = {
  // === DEFAULT LAYOUT ===
  'standalone': 'default',
  'local': 'default',
  'normal': 'default',
  'edit': 'default',
  'bookmarklet': 'default',
  
  // === PLUGIN LAYOUT ===
  'browser-extension': 'plugin',
  'extension': 'plugin',
  'plugin': 'plugin',
  'sidebar': 'plugin',
  
  // === DIALOG LAYOUT ===
  'dialog': 'dialog',
  'modal': 'dialog',
  'review': 'dialog',
  'redaktion': 'dialog',
  
  // === DETAIL LAYOUT ===
  'detail': 'detail',
  'preview': 'detail',
  'print': 'detail',
  
  // === ALIASES (backward compat → default) ===
  'webcomponent': 'default',
  'embed': 'default',
  'embedded': 'default',
  'viewer': 'default',
  'view': 'default',
  'readonly': 'default',
  
  // === CLEAN LAYOUT ===
  'clean': 'clean',
  'metadatenpruefdialog': 'clean',
  'pruefung': 'clean',
  'validation': 'clean',
  'check': 'clean',
  
  // === PRUEFTISCH LAYOUT ===
  'prueftisch': 'prueftisch',
  'reviewtable': 'prueftisch',
  'table': 'prueftisch',
  'qa': 'prueftisch',
  
  // === PRUEFTISCH GROSS → alias for prueftisch (use columns=2 instead) ===
  'prueftisch-gross': 'prueftisch',
  'prueftisch-large': 'prueftisch',
  'reviewtable-large': 'prueftisch',
  'qa-large': 'prueftisch',
  
  // === PRUEFTISCH ORG LAYOUT ===
  'prueftisch-org': 'prueftisch-org',
  'reviewtable-org': 'prueftisch-org',
  'qa-org': 'prueftisch-org',
  
  // === PRUEFTISCH ORG LARGE → alias for prueftisch-org (use columns=2 instead) ===
  'prueftisch-org-large': 'prueftisch-org',
  'reviewtable-org-large': 'prueftisch-org',
  'qa-org-large': 'prueftisch-org'
};
