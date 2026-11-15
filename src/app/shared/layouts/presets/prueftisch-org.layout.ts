import { LayoutConfig } from '../layout.models';

/**
 * Prüftisch Org Layout
 * 
 * edu-sharing organizational review table layout.
 * Light gray group headers with bottom border, borderless fields,
 * row-wise field arrangement with detail-view-like typography.
 * 
 * USED IN:
 * - edu-sharing organizational metadata review
 * - Quality assurance processes
 * 
 * FEATURES:
 * - Gray group headers with icon and uppercase label
 * - Borderless fields, clean typography
 * - Row-wise (single column) field arrangement
 * - Bold comma-separated multi-value display
 * - Default readonly
 * 
 * ACTIVATION:
 * - URL: ?layout=prueftisch-org
 * - Attribute: layout="prueftisch-org"
 */
export const PRUEFTISCH_ORG_LAYOUT: LayoutConfig = {
  name: 'prueftisch-org',
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
    readonly: true
  }
};
