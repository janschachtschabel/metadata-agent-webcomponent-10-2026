import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ContentType, FieldStatus } from '../../../shared/models/canvas.models';
import { LayoutBase } from '../layout-base';
import { FieldComponent } from '../../field/field.component';
import { JsonLoaderComponent } from '../../json-loader/json-loader.component';
import { LanguageSwitcherComponent } from '../../language-switcher/language-switcher.component';
import { PreviewThumbnailComponent } from '../../shared/preview-thumbnail/preview-thumbnail.component';
import { uniqueId } from '../../../shared/unique-id';

/**
 * Default Layout Component
 * 
 * Full-featured editing layout for:
 * - Local/Standalone mode
 * - Browser Extension
 * - Bookmarklet
 * - Hosted deployment
 * 
 * Features all UI elements: Input, StatusBar, Fields, Footer, FloatingControls
 */
@Component({
  selector: 'app-default-layout',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatMenuModule,
    MatTooltipModule,
    MatSlideToggleModule,
    FieldComponent,
    JsonLoaderComponent,
    LanguageSwitcherComponent,
    PreviewThumbnailComponent
  ],
  templateUrl: './default-layout.component.html',
  styleUrls: ['./default-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DefaultLayoutComponent extends LayoutBase {
  // Data from parent
  /** Prefix of the ids aria-controls points at; unique per instance. */
  readonly _uid = uniqueId('layout');
  @Input() contentTypes: ContentType[] = [];
  @Input() userText = '';
  @Input() sourceUrl = '';
  @Input() nodeId = '';
  @Input() backgroundColor = '';
  
  // Input mode: 'text' | 'url' | 'nodeId'
  @Input() inputMode: 'text' | 'url' | 'nodeId' = 'text';
  
  // Multi-column support
  @Input() columns: 1 | 2 | 3 | 4 = 1;
  
  // Element visibility (can override defaults)
  @Input() showInputArea = true;
  @Input() showStatusBar = true;
  @Input() showFooter = true;
  @Input() showFloatingControls = true;
  @Input() showFieldActions = true;
  @Input() showContentTypeOnly = false;
  @Input() showUploadButton = false;
  @Input() showSaveButton = true;
  @Input() showJsonLoader = true;
  @Input() showLanguageSwitcher = true;
  @Input() showContentType = true;
  @Input() showResetButton = true;
  @Input() highlightAi = true;
  @Input() showPreview = true;
  @Input() screenshotEnabled = true;
  
  /** True while an upload runs: the upload button is aria-disabled and keeps its focus (U-02, U-05). */
  @Input() uploading = false;

  _progressPercent = 0;
  _requiredStatus = { filled: 0, total: 0 };

  protected override onGroupsChanged(): void {
    this._progressPercent = this.computeProgressPercent();
    this._requiredStatus = this.computeRequiredFieldsStatus();
  }

  private computeProgressPercent(): number {
    if (!this.state || this.state.totalFields === 0) return 0;
    return Math.round((this.state.filledFields / this.state.totalFields) * 100);
  }

  private computeRequiredFieldsStatus(): { filled: number; total: number } {
    if (!this.state?.fieldGroups) return { filled: 0, total: 0 };
    let filled = 0;
    let total = 0;
    for (const group of this.state.fieldGroups) {
      const flatFields = this.getFlattenedFields(group.fields);
      for (const field of flatFields) {
        if (field.isRequired) {
          total++;
          if (field.status === FieldStatus.FILLED) filled++;
        }
      }
    }
    return { filled, total };
  }

  // Events
  @Output() userTextChange = new EventEmitter<string>();
  @Output() sourceUrlChange = new EventEmitter<string>();
  @Output() nodeIdChange = new EventEmitter<string>();
  @Output() startExtraction = new EventEmitter<void>();
  @Output() startUrlExtraction = new EventEmitter<string>();
  @Output() startNodeIdExtraction = new EventEmitter<string>();
  @Output() inputModeChange = new EventEmitter<'text' | 'url' | 'nodeId'>();
  @Output() reset = new EventEmitter<void>();
  @Output() selectContentType = new EventEmitter<ContentType>();
  @Output() fieldValueChange = new EventEmitter<{fieldId: string, value: unknown}>();
  @Output() jsonLoaded = new EventEmitter<Record<string, unknown>>();
  @Output() downloadJson = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
  @Output() upload = new EventEmitter<void>();
  @Output() dismissError = new EventEmitter<void>();
  @Output() dismissWarning = new EventEmitter<void>();
  @Output() jsonLoadError = new EventEmitter<void>();
  @Output() screenshotToggle = new EventEmitter<boolean>();
  
  /**
   * Enter adds a line, as in any text box; it used to be swallowed without any
   * effect (U-16). Ctrl+Enter (Cmd+Enter) starts the extraction.
   */
  onTextKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)
        && this.userText.trim() && !this.state?.isExtracting) {
      event.preventDefault();
      this.startExtraction.emit();
    }
  }
  
  onDismissError(): void {
    this.dismissError.emit();
  }

  onDismissWarning(): void {
    this.dismissWarning.emit();
  }
  
  onFieldChange(fieldId: string, value: unknown): void {
    this.fieldValueChange.emit({ fieldId, value });
  }
}
