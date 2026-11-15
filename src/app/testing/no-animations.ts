import { NgModule } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

/**
 * Switches Material's animations off for a spec: a menu or panel is there, or
 * gone, as soon as the change is rendered.
 *
 * The specs used NoopAnimationsModule for this, the last thing that needed
 * @angular/animations after the clock of ngx-mat-timepicker went (audit
 * 14.11., U-19). Material 21 animates with CSS and reads this token.
 */
@NgModule({
  providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
})
export class NoAnimationsModule {}
