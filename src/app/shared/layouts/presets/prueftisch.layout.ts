import { LayoutConfig } from '../layout.models';

/**
 * Prüftisch Layout
 * 
 * Review table layout for metadata inspection in edu-sharing.
 * Clean, card-based display optimized for reviewing metadata.
 * 
 * USED IN:
 * - edu-sharing Prüftisch (Review Table)
 * - Metadata inspection workflows
 * - Quality assurance processes
 * 
 * FEATURES:
 * - No text input (data loaded externally)
 * - No status bar (clean view)
 * - Card-based field groups with icons
 * - Floating controls at bottom only
 * - Clean, minimal styling
 * 
 * ACTIVATION:
 * - URL: ?layout=prueftisch
 * - Attribute: layout="prueftisch"
 */
export const PRUEFTISCH_LAYOUT: LayoutConfig = {
  name: 'prueftisch',
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
