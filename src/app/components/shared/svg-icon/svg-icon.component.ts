import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Icons whose ligature the host's icon font may lack, drawn as inline SVG.
 *
 * edu-sharing loads main.js without styles.css, so the widget's own icon fonts
 * never arrive there; its own 'Material Icons' face (Material Symbols) knows
 * neither the class material-icons-outlined nor the name info_outline, and the
 * ligature showed as text ("ca…", "info_outline"). Paths: Material Icons,
 * outlined (Apache-2.0, see NOTICE).
 *
 * Placed inside <mat-icon>, it fills it: the layouts' size, colour and opacity
 * rules for mat-icon keep applying.
 */
const PATHS = {
  cancel:
    'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.59-13L12 10.59 8.41 7 7 8.41 10.59 12 7 15.59 8.41 17 12 13.41 15.59 17 17 15.59 13.41 12 17 8.41z',
  info_outline:
    'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  // The two below: names edu-sharing's Material Symbols font may lack as well (audit 14.11., U-07).
  error_outline:
    'M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  help_outline:
    'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
} as const;

export type SvgIconName = keyof typeof PATHS;

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="path"></path></svg>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; line-height: 0; }
    svg { display: block; width: 100%; height: 100%; fill: currentColor; }
  `],
})
export class SvgIconComponent {
  @Input({ required: true }) name!: SvgIconName;

  get path(): string {
    return PATHS[this.name];
  }
}
