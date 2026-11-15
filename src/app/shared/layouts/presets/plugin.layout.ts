import { LayoutConfig } from '../layout.models';

/**
 * Plugin Layout
 * 
 * Optimized for Browser Extension sidebar integration.
 * 
 * USED IN:
 * - Browser Extension panel
 * - Narrow sidebar views
 * 
 * FEATURES:
 * - Compact input area
 * - Status bar with content type
 * - All fields visible
 * - Floating controls for quick actions
 * - Compact spacing
 */
export const PLUGIN_LAYOUT: LayoutConfig = {
  name: 'plugin',
  elements: {
    // Input
    inputArea: true,

    // Status
    statusBar: true,

    // Fields
    coreFields: true,
    specialFields: true,
    fieldActions: false,
    groupCollapse: true,

    // Floating bar
    floatingControls: true,
    contentTypeSelector: true,
    jsonLoader: false,
    saveButton: true,
    uploadButton: true,
    floatingResetButton: true,
    languageSwitcher: true
  },
  style: {
    borderless: true,
    columns: 1
  },
  behavior: {
    readonly: false
  }
};
