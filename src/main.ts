import { bootstrapApplication, createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { createCanvasElement } from './app/canvas-element';
import { AppComponent } from './app/app.component';

import { WIDGET_VERSION } from './app/version';
import { WidgetDebug } from './app/core/debug';

const ELEMENT_NAME = 'metadata-agent-canvas';

/**
 * Bootstrap mode detection:
 * - Standalone mode: only our own index.html carries the marked <app-root>.
 *   A host page that is itself an Angular app may have an unmarked <app-root>;
 *   that must not switch the widget into standalone mode.
 * - Web Component mode: everywhere else (embedded via <metadata-agent-canvas>).
 */
const isWebComponentMode = !document.querySelector('app-root[data-metadata-agent-app]');

/**
 * A skipped evaluation usually means a duplicate or outdated script tag on the
 * host page; naming both versions shows which bundle is actually running.
 */
function warnSkippedBundle(): void {
  const running = (customElements.get(ELEMENT_NAME) as { widgetVersion?: string } | undefined)
    ?.widgetVersion ?? 'unknown';
  console.warn(
    `<${ELEMENT_NAME}> v${running} is already registered; skipping this bundle ` +
    `(v${WIDGET_VERSION}). Check the page for duplicate or outdated widget scripts.`
  );
}

if (isWebComponentMode) {
  // Web Component Mode: Register as Custom Element
  (async () => {
    // Hosts can evaluate the bundle more than once. A second
    // customElements.define() throws NotSupportedError, so keep the first one.
    if (customElements.get(ELEMENT_NAME)) {
      warnSkippedBundle();
      return;
    }

    const app = await createApplication(appConfig);

    // Another evaluation may have registered the element while we awaited ours.
    if (customElements.get(ELEMENT_NAME)) {
      app.destroy();
      warnSkippedBundle();
      return;
    }

    const canvasElement = createCanvasElement(app.injector);
    Object.defineProperty(canvasElement, 'widgetVersion', { value: WIDGET_VERSION });

    customElements.define(ELEMENT_NAME, canvasElement);

    // The host page's console stays quiet (W-ARCH-01); the version is on
    // customElements.get('metadata-agent-canvas').widgetVersion.
    if (WidgetDebug.enabled) console.log(`✅ Web Component <${ELEMENT_NAME}> v${WIDGET_VERSION} registered`);
  })().catch(err => console.error('Web Component bootstrap error:', err));
} else {
  // Standalone Mode: Bootstrap Angular App
  bootstrapApplication(AppComponent, appConfig)
    .catch(err => console.error('Bootstrap error:', err));
}
