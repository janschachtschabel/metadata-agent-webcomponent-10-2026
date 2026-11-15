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
 * Plugin Layout Component
 * 
 * Compact layout optimized for browser extension sidebar.
 * Includes input area for text/URL extraction.
 * 
 * Activation:
 * - URL: ?layout=plugin
 * - Attribute: layout="plugin"
 */
@Component({
  selector: 'app-plugin-layout',
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
  templateUrl: './plugin-layout.component.html',
  styleUrls: ['./plugin-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PluginLayoutComponent extends LayoutBase {
  override groupCollapse = true;
  @Input() contentTypes: ContentType[] = [];
  @Input() userText = '';
  @Input() sourceUrl = '';
  @Input() nodeId = '';
  @Input() inputMode: 'text' | 'url' | 'nodeId' = 'text';
  @Input() backgroundColor = '';
  @Input() columns: 1 | 2 | 3 | 4 = 1;

  @Input() showInputArea = true;
  @Input() showStatusBar = true;
  @Input() showFloatingControls = true;
  @Input() showContentTypeOnly = false;
  @Input() showUploadButton = false;
  @Input() showSaveButton = true;
  /** True while an upload runs: the upload button is aria-disabled and keeps its focus (U-02, U-05). */
  @Input() uploading = false;
  @Input() showLanguageSwitcher = true;
  @Input() showContentType = true;
  @Input() showResetButton = true;
  @Input() showPageMode = false;
  @Input() highlightAi = true;
  @Input() showPreview = true;
  @Input() screenshotEnabled = true;

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
  @Output() submit = new EventEmitter<void>();
  @Output() upload = new EventEmitter<void>();
  @Output() reloadFromPage = new EventEmitter<void>();
}
