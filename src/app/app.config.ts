import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { provideAnimations } from '@angular/platform-browser/animations';
import { HttpClient, provideHttpClient, withFetch } from '@angular/common/http';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';

import { DynamicTranslateLoader } from './core/dynamic-translate-loader';
import { WidgetOverlayContainer } from './core/widget-overlay-container';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideHttpClient(withFetch()),
    { provide: OverlayContainer, useClass: WidgetOverlayContainer },
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useFactory: (http: HttpClient) => new DynamicTranslateLoader(http),
        deps: [HttpClient]
      }
    })
  ]
};
