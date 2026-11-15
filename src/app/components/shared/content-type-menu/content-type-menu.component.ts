import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { CanvasState, ContentType } from '../../../shared/models/canvas.models';

/**
 * The content-type button with its menu, in the status bar and in the floating
 * bar of every layout.
 *
 * It existed in nine copies that had drifted (audit 14.11., U-12, U-03): only
 * the default layout locked it during a run - elsewhere a second click started
 * a second run -, the label of "no type yet" came in two wordings and the
 * chosen type was marked with a class, a check mark or not at all.
 */
@Component({
  selector: 'app-content-type-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './content-type-menu.component.html',
  styleUrls: ['./content-type-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentTypeMenuComponent {
  @Input() state: CanvasState | null = null;
  @Input() contentTypes: ContentType[] = [];
  /** A read-only view offers no type choice (W-LOG-09). */
  @Input() readonly = false;

  @Output() selectContentType = new EventEmitter<ContentType>();

  /**
   * No choice while a run is out: it would start another one. The button
   * stays focusable (aria-disabled) - natively disabled it dropped the focus
   * of whoever had just chosen a type from the keyboard, since that choice
   * starts the run (U-14).
   */
  get busy(): boolean {
    return !this.readonly && !!this.state?.isExtracting;
  }

  constructor() {
    // An aria-disabled button still gets its clicks, and the menu trigger on
    // it would open the menu: the click ends here, before it reaches the button.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const swallowWhileBusy = (event: Event) => {
      if (this.busy) event.stopPropagation();
    };
    host.addEventListener('click', swallowWhileBusy, true);
    inject(DestroyRef).onDestroy(() => host.removeEventListener('click', swallowWhileBusy, true));
  }

  isChosen(type: ContentType): boolean {
    return this.state?.contentTypeLabel === type.label;
  }
}
