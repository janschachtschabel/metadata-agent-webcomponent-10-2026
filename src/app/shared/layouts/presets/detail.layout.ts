import { LayoutConfig } from '../layout.models';

/**
 * Detail Layout
 * 
 * Multi-column read-only detail view.
 * 
 * USED IN:
 * - Repository detail pages
 * - Metadata preview
 * - Print/Export views
 * 
 * FEATURES:
 * - No input/editing UI
 * - Multi-column display (2-4 columns)
 * - Grouped field display
 * - Read-only
 * - Floating bar with content type and language only
 */
export const DETAIL_LAYOUT: LayoutConfig = {
  name: 'detail',
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
    saveButton: false,
    uploadButton: false,
    floatingResetButton: false,
    languageSwitcher: true
  },
  style: {
    borderless: true,
    columns: 4
  },
  behavior: {
    readonly: true
  }
};
