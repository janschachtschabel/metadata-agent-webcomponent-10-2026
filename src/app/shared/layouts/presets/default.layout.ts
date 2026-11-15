import { LayoutConfig } from '../layout.models';

/**
 * Default Layout
 * 
 * Full-featured layout for standalone usage.
 * 
 * USED IN:
 * - Local development (npm start)
 * - Hosted deployment
 * - Docker container
 * - Browser Extension panel
 * - Bookmarklet iframe
 * 
 * FEATURES:
 * - Full input area with extract/reset buttons
 * - Status bar with content type and progress
 * - All field groups visible
 * - Floating controls for quick actions
 * 
 * Each element can be individually hidden via component inputs.
 */
export const DEFAULT_LAYOUT: LayoutConfig = {
  name: 'default',
  elements: {
    // Input
    inputArea: true,

    // Status
    statusBar: true,

    // Fields
    coreFields: true,
    specialFields: true,
    fieldActions: true,
    groupCollapse: true,

    // Floating bar
    floatingControls: true,
    contentTypeSelector: true,
    jsonLoader: true,
    saveButton: true,
    uploadButton: true,
    floatingResetButton: true,
    languageSwitcher: true
  },
  style: {
    borderless: false,
    columns: 1
  },
  behavior: {
    readonly: false
  }
};
