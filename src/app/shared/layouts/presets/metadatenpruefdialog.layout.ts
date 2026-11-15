import { LayoutConfig } from '../layout.models';

/**
 * Clean Layout
 * 
 * Minimal, borderless layout for embedding in dialogs or external applications.
 * No input area, compact spacing, editable fields with floating controls.
 * 
 * USED IN:
 * - edu-sharing Metadatenprüfdialog
 * - Review/validation workflows
 * - Clean embedded views
 * - External control via events/buttons
 * 
 * FEATURES:
 * - No text input (controlled externally)
 * - Minimal margins for dialog embedding
 * - Floating content type selector
 * - Editable fields for corrections
 * - External control via events/buttons
 * 
 * ACTIVATION:
 * - URL: ?layout=clean
 * - Attribute: layout="clean"
 * - Alias: layout="metadatenpruefdialog"
 */
export const METADATENPRUEFDIALOG_LAYOUT: LayoutConfig = {
  name: 'clean',
  elements: {
    // Input
    inputArea: false,

    // Status
    statusBar: false,

    // Fields
    coreFields: true,
    specialFields: true,
    fieldActions: false,
    groupCollapse: true,

    // Floating bar
    floatingControls: true,
    contentTypeSelector: true,
    jsonLoader: false,
    saveButton: false,
    uploadButton: false,
    floatingResetButton: false,
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
