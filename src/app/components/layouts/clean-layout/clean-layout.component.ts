import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';

import { ContentType } from '../../../shared/models/canvas.models';
import { LayoutBase } from '../layout-base';
import { FieldComponent } from '../../field/field.component';
import { InputAreaComponent } from '../../shared/input-area/input-area.component';
import { StatusBarComponent } from '../../shared/status-bar/status-bar.component';
import { ExtractionFeedbackComponent } from '../../shared/extraction-feedback/extraction-feedback.component';
import { FloatingBarComponent } from '../../shared/floating-bar/floating-bar.component';
import { GroupHeaderComponent } from '../../shared/group-header/group-header.component';
import { PreviewThumbnailComponent } from '../../shared/preview-thumbnail/preview-thumbnail.component';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

/**
 * Clean Layout Component
 * 
 * Minimal, borderless layout for embedding in dialogs or external applications.
 * No text input area - controlled externally via events.
 * Compact design with minimal margins for dialog embedding.
 * 
 * Used in:
 * - edu-sharing Metadatenprüfdialog
 * - Review/validation workflows
 * - Clean embedded views
 * - External control via flying buttons
 * 
 * Activation:
 * - URL: ?layout=clean
 * - Attribute: layout="clean"
 * - Alias: layout="metadatenpruefdialog"
 */
@Component({
  selector: 'app-clean-layout',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    FieldComponent,
    InputAreaComponent,
    StatusBarComponent,
    ExtractionFeedbackComponent,
    FloatingBarComponent,
    GroupHeaderComponent,
    PreviewThumbnailComponent,
    SvgIconComponent,
  ],
  templateUrl: './clean-layout.component.html',
  styleUrls: ['./clean-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CleanLayoutComponent extends LayoutBase {
  override groupCollapse = true;
  // Data from parent
  @Input() contentTypes: ContentType[] = [];
  @Input() backgroundColor = '';
  @Input() columns: 1 | 2 | 3 | 4 = 2;

  @Input() userText = '';
  @Input() sourceUrl = '';
  @Input() nodeId = '';
  @Input() inputMode: 'text' | 'url' | 'nodeId' = 'text';
  
  // Element visibility
  @Input() showInputArea = false;
  @Input() showStatusBar = true;
  @Input() showFloatingControls = true;
  @Input() showContentTypeOnly = false;
  @Input() showLanguageSwitcher = true;
  @Input() showContentType = true;
  @Input() highlightAi = true;
  @Input() showPreview = true;
  @Input() screenshotEnabled = true;

  // Events
  @Output() userTextChange = new EventEmitter<string>();
  @Output() sourceUrlChange = new EventEmitter<string>();
  @Output() nodeIdChange = new EventEmitter<string>();
  @Output() startExtraction = new EventEmitter<void>();
  @Output() startUrlExtraction = new EventEmitter<string>();
  @Output() startNodeIdExtraction = new EventEmitter<string>();
  @Output() inputModeChange = new EventEmitter<'text' | 'url' | 'nodeId'>();
  @Output() reset = new EventEmitter<void>();
  @Output() screenshotToggle = new EventEmitter<boolean>();
  @Output() selectContentType = new EventEmitter<ContentType>();
  @Output() fieldValueChange = new EventEmitter<{ fieldId: string; value: any }>();
}
