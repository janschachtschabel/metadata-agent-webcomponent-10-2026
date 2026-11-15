import { LayoutConfig } from '../layout.models';

/**
 * Dialog Layout
 * 
 * Metadata review dialog for editorial environment.
 * 
 * USED IN:
 * - Repository editorial interface
 * - Metadata validation dialogs
 * - Quick review modals
 * 
 * FEATURES:
 * - No input area (metadata already exists)
 * - No status bar
 * - Floating buttons for save/cancel
 * - Fields are editable
 * - Compact for modal usage
 */
export const DIALOG_LAYOUT: LayoutConfig = {
  name: 'dialog',
  elements: {
    // Input
    inputArea: false,

    // Status
    statusBar: false,

    // Fields
    coreFields: true,
    specialFields: true,
    fieldActions: false,
    groupCollapse: false,

    // Floating bar
    floatingControls: true,
    contentTypeSelector: false,
    jsonLoader: false,
    saveButton: true,
    uploadButton: false,
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
