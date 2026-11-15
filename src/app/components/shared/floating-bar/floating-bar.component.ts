import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CanvasState, ContentType } from '../../../shared/models/canvas.models';
import { ContentTypeMenuComponent } from '../content-type-menu/content-type-menu.component';
import { JsonLoaderComponent } from '../../json-loader/json-loader.component';
import { LanguageSwitcherComponent } from '../../language-switcher/language-switcher.component';

/**
 * The floating bar at the bottom of every layout: content type, the actions
 * the layout offers (load JSON, save, upload, reset) and the language switch.
 *
 * One component instead of seven template blocks (audit 14.11., U-12). They
 * differed in when the type button shows, in its label, in whether the type
 * menu and the reset are locked during a run, and four of them had no reset
 * although their preset promised one. A layout passes what it offers; what it
 * does not pass is not rendered.
 *
 * The host element is the layout's `.floating-controls` (sticky, centred).
 */
@Component({
  selector: 'app-floating-bar',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, MatButtonModule, MatIconModule, MatTooltipModule,
    ContentTypeMenuComponent, JsonLoaderComponent, LanguageSwitcherComponent,
  ],
  templateUrl: './floating-bar.component.html',
  styleUrls: ['./floating-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'floating-controls' },
})
export class FloatingBarComponent {
  @Input() state: CanvasState | null = null;
  @Input() contentTypes: ContentType[] = [];
  @Input() readonly = false;

  @Input() showContentType = true;
  /** Only the content-type button (OEH embedding). */
  @Input() showContentTypeOnly = false;
  @Input() showLanguageSwitcher = true;
  @Input() showJsonLoader = false;
  @Input() showSaveButton = false;
  @Input() showUploadButton = false;
  @Input() showResetButton = false;
  /** True while an upload runs: the upload button is aria-disabled and keeps its focus (U-02, U-05). */
  @Input() uploading = false;

  /** Buttons with their text instead of icon buttons (sidebar of the browser extension). */
  @Input() labelled = false;
  /** What "save" means in this layout: its text ... */
  @Input() saveLabel = 'CONTROLS.SAVE';
  /** ... and its icon. */
  @Input() saveIcon = 'save';

  @Output() selectContentType = new EventEmitter<ContentType>();
  @Output() jsonLoaded = new EventEmitter<Record<string, unknown>>();
  @Output() jsonLoadError = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() upload = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  get extracting(): boolean {
    return this.state?.isExtracting ?? false;
  }

  get hasActions(): boolean {
    return this.showJsonLoader || this.showSaveButton || this.showUploadButton || this.showResetButton;
  }

  /**
   * Upload and reset stay focusable while they are unavailable (aria-disabled,
   * U-05); a click then does nothing. No reset during a run, as in the input
   * area: a run is stopped with "Abbrechen" in the progress line.
   */
  onUpload(): void {
    if (!this.extracting) this.upload.emit();
  }

  onReset(): void {
    if (!this.extracting) this.reset.emit();
  }
}
