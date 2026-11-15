import { Component, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Overlay, OverlayContainer, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TranslateModule } from '@ngx-translate/core';

import { appConfig } from '../app.config';
import { I18nService } from './i18n.service';
import { WIDGET_OVERLAY_CLASS, WidgetOverlayContainer } from './widget-overlay-container';

describe('WidgetOverlayContainer', () => {
  it('marks the overlay container, which the scoped Material theme targets', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: OverlayContainer, useClass: WidgetOverlayContainer }]
    });

    const container = TestBed.inject(OverlayContainer).getContainerElement();

    expect(container.classList).toContain('cdk-overlay-container');
    expect(container.classList).toContain(WIDGET_OVERLAY_CLASS);
  });

  it('is the overlay container of the widget application', () => {
    expect(appConfig.providers).toContain(
      jasmine.objectContaining({ provide: OverlayContainer, useClass: WidgetOverlayContainer })
    );
  });
});

/**
 * Audit 14.11. (U-23): menus and the calendar render under <body>, outside
 * the widget and its `lang`. In an English widget on a German page a screen
 * reader read them with German pronunciation, and the other way round.
 */
describe('WidgetOverlayContainer language', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: OverlayContainer, useClass: WidgetOverlayContainer }],
    });
  });
  afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

  it('says which language the overlays speak, and follows a switch', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');

    const container = TestBed.inject(OverlayContainer).getContainerElement();
    expect(container.getAttribute('lang')).toBe('en');

    i18n.setLanguage('de');
    expect(container.getAttribute('lang')).toBe('de');
  });
});

/**
 * Audit 14.11. (U-09): a modal dialog of the host page (edu-sharing uses the
 * CDK's) hides everything beside its own overlay container from assistive
 * technology with aria-hidden - the widget's container, a sibling under
 * <body>, included. A menu or calendar the widget then opened inside that
 * dialog was invisible to a screen reader.
 */
describe('WidgetOverlayContainer under a host dialog', () => {
  @Component({ standalone: true, template: '<ng-template #panel><div class="panel">Menü</div></ng-template>' })
  class Opener {
    @ViewChild('panel') panel!: TemplateRef<unknown>;
    constructor(readonly overlay: Overlay, readonly viewContainer: ViewContainerRef) {}
    open(): OverlayRef {
      const ref = this.overlay.create();
      ref.attach(new TemplatePortal(this.panel, this.viewContainer));
      return ref;
    }
  }

  /** MutationObserver callbacks run as microtasks. */
  const settled = () => new Promise(resolve => setTimeout(resolve));
  let container: HTMLElement;
  let opener: Opener;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Opener],
      providers: [{ provide: OverlayContainer, useClass: WidgetOverlayContainer }],
    });
    const fixture = TestBed.createComponent(Opener);
    fixture.detectChanges();
    opener = fixture.componentInstance;
    container = TestBed.inject(OverlayContainer).getContainerElement();
  });

  /** What the host's dialog does to the siblings of its own container. */
  const hostDialogHides = () => container.setAttribute('aria-hidden', 'true');

  it('is reachable again once the widget opens an overlay', async () => {
    hostDialogHides();

    opener.open();
    await settled();

    expect(container.hasAttribute('aria-hidden')).toBeFalse();
    expect(container.querySelector('.panel')).not.toBeNull();
  });

  it('is reachable when an overlay that existed before is opened again', async () => {
    const ref = opener.open();
    ref.detach();
    await settled();
    hostDialogHides();
    await settled();
    expect(container.hasAttribute('aria-hidden')).withContext('nothing open: the host decides').toBeTrue();

    ref.attach(new TemplatePortal(opener.panel, opener.viewContainer));
    await settled();

    expect(container.hasAttribute('aria-hidden')).toBeFalse();
  });

  it('stays reachable when the host hides it while an overlay is open', async () => {
    opener.open();
    await settled();

    hostDialogHides();
    await settled();

    expect(container.hasAttribute('aria-hidden')).toBeFalse();
  });

  it('leaves the attribute alone while the widget has nothing open, and restores nothing', async () => {
    hostDialogHides();
    await settled();
    expect(container.getAttribute('aria-hidden')).toBe('true');

    const ref = opener.open();
    await settled();
    ref.dispose();
    await settled();

    expect(container.hasAttribute('aria-hidden')).withContext('the host sets it again as it needs').toBeFalse();
  });
});
