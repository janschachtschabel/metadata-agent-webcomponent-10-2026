import { ChangeDetectionStrategy, Component, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { FieldGroup } from '../../../shared/models/canvas.models';

/**
 * The header of a field group, the same markup in every layout: icon, an
 * <h3> with the group's name, what the layout adds (badge, counter), and -
 * where the preset allows collapsing - a real button with aria-expanded.
 *
 * The seven templates each had their own (audit 14.11., U-12, U-N): <h2> in
 * one and <h3> in the others, the name upper-cased by a pipe (which a screen
 * reader then spells out), a toggle in two layouts while five presets
 * promised one, and five copies of an icon map no group id ever matched.
 *
 * The host element is the layout's `.group-header`; the layout styles it and,
 * through ::ng-deep, what is inside.
 */
@Component({
  selector: 'app-group-header',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <mat-icon class="group-icon">{{ group.icon || 'folder' }}</mat-icon>
    <h3>
      <button *ngIf="collapsible; else plainName" type="button" class="group-toggle"
              [attr.aria-expanded]="!group.collapsed"
              [attr.aria-controls]="group.collapsed ? null : controls"
              (click)="$event.stopPropagation(); toggle()">{{ group.label }}</button>
      <ng-template #plainName>{{ group.label }}</ng-template>
    </h3>
    <ng-content></ng-content>
    <mat-icon class="collapse-icon" *ngIf="collapsible">{{ group.collapsed ? 'expand_more' : 'expand_less' }}</mat-icon>
  `,
  styles: [`
    :host { display: flex; align-items: center; }
    :host(.collapsible) { cursor: pointer; }
    h3 { flex: 1; min-width: 0; margin: 0; }
    /* The button inside a collapsible group heading (APG accordion pattern):
       looks like the heading text, keeps a visible focus ring. */
    .group-toggle {
      appearance: none;
      background: none;
      border: 0;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      text-align: start;
      cursor: pointer;
    }
    .group-toggle:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'group-header', '[class.collapsible]': 'collapsible' },
})
export class GroupHeaderComponent {
  @Input({ required: true }) group!: FieldGroup;
  /** Whether the group can be collapsed (preset key `groupCollapse`). */
  @Input() collapsible = false;
  /** Id of the element with the group's fields, for aria-controls. */
  @Input() controls: string | null = null;

  /** The whole header toggles, as before; the button is what the keyboard reaches. */
  @HostListener('click')
  toggle(): void {
    if (this.collapsible) this.group.collapsed = !this.group.collapsed;
  }
}
