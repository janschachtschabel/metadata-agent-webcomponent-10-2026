import { Injectable, OnDestroy, inject } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

/** Class on this widget's overlay container; src/styles/main.scss scopes to it. */
export const WIDGET_OVERLAY_CLASS = 'metadata-agent-overlays';

/**
 * Menus and the calendar render into an overlay container under <body>,
 * outside <metadata-agent-canvas>. The Material theme is scoped to the widget
 * instead of <html>, so that a host page running Angular Material itself
 * (edu-sharing does) keeps its own tokens — this marks the widget's container
 * so its overlays are themed too. Each Angular application creates its own
 * container, so the host's stays unmarked.
 *
 * Outside the widget, the container also lacks what the widget's element says
 * about itself (audit 14.11.):
 * - its language (U-23): the container carries the widget's `lang`;
 * - its place in a dialog of the host (U-09): a modal dialog of the host page
 *   sets aria-hidden on everything beside its own container, this one
 *   included. While the widget has an overlay open, the attribute is taken
 *   off again. Nothing is put back afterwards: the host sets it when it
 *   opens its next dialog.
 */
@Injectable()
export class WidgetOverlayContainer extends OverlayContainer implements OnDestroy {
  /** Absent only where the container is used without the widget's translations (a spec). */
  private readonly translate = inject(TranslateService, { optional: true });
  private languageChanges?: Subscription;
  private observer?: MutationObserver;

  protected override _createContainer(): void {
    super._createContainer();
    const container = this._containerElement;
    if (!container) return;
    container.classList.add(WIDGET_OVERLAY_CLASS);

    const speak = (lang: string | undefined) => {
      if (lang) container.setAttribute('lang', lang);
    };
    speak(this.translate?.getCurrentLang());
    this.languageChanges = this.translate?.onLangChange.subscribe(event => speak(event.lang));

    // An overlay was attached, or the host hid the container: with an overlay
    // of the widget open it must be reachable.
    this.observer = new MutationObserver(() => {
      if (container.hasAttribute('aria-hidden') && container.querySelector('.cdk-overlay-pane > *')) {
        container.removeAttribute('aria-hidden');
      }
    });
    this.observer.observe(container, { attributes: true, attributeFilter: ['aria-hidden'], childList: true, subtree: true });
  }

  override ngOnDestroy(): void {
    this.observer?.disconnect();
    this.languageChanges?.unsubscribe();
    super.ngOnDestroy();
  }
}
