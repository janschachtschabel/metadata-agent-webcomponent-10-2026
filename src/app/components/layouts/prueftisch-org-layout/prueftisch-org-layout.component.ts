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
 * Prüftisch Org Layout Component
 * 
 * edu-sharing organizational review table layout.
 * Light gray group headers with bottom border, borderless fields,
 * row-wise field arrangement with detail-view-like typography.
 * 
 * Activation:
 * - URL: ?layout=prueftisch-org
 * - Attribute: layout="prueftisch-org"
 */
@Component({
  selector: 'app-prueftisch-org-layout',
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
  templateUrl: './prueftisch-org-layout.component.html',
  styleUrls: ['./prueftisch-org-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrueftischOrgLayoutComponent extends LayoutBase {
  @Input() contentTypes: ContentType[] = [];
  @Input() backgroundColor = '';
  @Input() columns: 1 | 2 | 3 | 4 = 1;

  @Input() userText = '';
  @Input() sourceUrl = '';
  @Input() nodeId = '';
  @Input() inputMode: 'text' | 'url' | 'nodeId' = 'text';

  @Input() showInputArea = false;
  @Input() showStatusBar = false;
  @Input() showFloatingControls = true;
  @Input() showContentTypeOnly = false;
  @Input() showLanguageSwitcher = true;
  @Input() showContentType = true;
  override readonly = true;
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
}
