import { Injectable } from '@angular/core';
import { LayoutConfig, MODE_LAYOUT_MAP, LAYOUT_PRESETS, DEFAULT_LAYOUT } from '../shared/layouts';

/**
 * Resolves the `layout` input - a layout name or one of the mode names such
 * as 'bookmarklet' (MODE_LAYOUT_MAP) - to its preset.
 *
 * That is all the canvas asks of it. The service used to carry an "active
 * layout", registration, merging and i18n helpers that nothing called (audit
 * 14.11., W-51); before that, an integration-mode detection (audit M-03).
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly layouts = new Map<string, LayoutConfig>(Object.entries(LAYOUT_PRESETS));

  /**
   * Get layout by name (supports mode aliases like 'bookmarklet', 'webcomponent', etc.)
   */
  getLayout(name: string): LayoutConfig {
    // `el.layout = null` or removeAttribute('layout') arrive here as well (W-SEC-01).
    if (typeof name !== 'string') return DEFAULT_LAYOUT;
    const mappedName = MODE_LAYOUT_MAP[name.toLowerCase()];
    if (mappedName) {
      return this.layouts.get(mappedName) || DEFAULT_LAYOUT;
    }
    return this.layouts.get(name) || DEFAULT_LAYOUT;
  }
}
