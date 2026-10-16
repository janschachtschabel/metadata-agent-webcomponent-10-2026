import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';

import { appConfig } from '../app.config';
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
