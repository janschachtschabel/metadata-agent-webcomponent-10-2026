import { Injectable } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

/** Class on this widget's overlay container; src/styles/main.scss scopes to it. */
export const WIDGET_OVERLAY_CLASS = 'metadata-agent-overlays';

/**
 * Menus, selects and the date and time pickers render into an overlay
 * container under <body>, outside <metadata-agent-canvas>. The Material theme
 * is scoped to the widget instead of <html>, so that a host page running
 * Angular Material itself (edu-sharing does) keeps its own tokens — this marks
 * the widget's container so its overlays are themed too. Each Angular
 * application creates its own container, so the host's stays unmarked.
 */
@Injectable()
export class WidgetOverlayContainer extends OverlayContainer {
  protected override _createContainer(): void {
    super._createContainer();
    this._containerElement?.classList.add(WIDGET_OVERLAY_CLASS);
  }
}
