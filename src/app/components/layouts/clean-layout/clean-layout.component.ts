import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

import { ContentType } from '../../../shared/models/canvas.models';
import { LayoutBase } from '../layout-base';
import { FieldComponent } from '../../field/field.component';
import { LanguageSwitcherComponent } from '../../language-switcher/language-switcher.component';
import { InputAreaComponent } from '../../shared/input-area/input-area.component';
import { StatusBarComponent } from '../../shared/status-bar/status-bar.component';
import { PreviewThumbnailComponent } from '../../shared/preview-thumbnail/preview-thumbnail.component';
import { uniqueId } from '../../../shared/unique-id';
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
    MatMenuModule,
    MatButtonModule,
    FieldComponent,
    LanguageSwitcherComponent,
    InputAreaComponent,
    StatusBarComponent,
    PreviewThumbnailComponent,
    SvgIconComponent,
  ],
  templateUrl: './clean-layout.component.html',
  styleUrls: ['./clean-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CleanLayoutComponent extends LayoutBase {
  // Data from parent
  /** Prefix of the ids aria-controls points at; unique per instance. */
  readonly _uid = uniqueId('layout');
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
  @Input() showFieldActions = true;
  @Input() showFloatingControls = true;
  @Input() showContentTypeOnly = false;
  @Input() showLanguageSwitcher = true;
  @Input() showContentType = true;
  @Input() showResetButton = true;
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
