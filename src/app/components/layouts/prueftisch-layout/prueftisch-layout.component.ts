import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

import { ContentType, FieldGroup } from '../../../shared/models/canvas.models';
import { LayoutBase } from '../layout-base';
import { FieldComponent } from '../../field/field.component';
import { LanguageSwitcherComponent } from '../../language-switcher/language-switcher.component';
import { InputAreaComponent } from '../../shared/input-area/input-area.component';
import { StatusBarComponent } from '../../shared/status-bar/status-bar.component';
import { PreviewThumbnailComponent } from '../../shared/preview-thumbnail/preview-thumbnail.component';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

/**
 * Prüftisch Layout Component
 * 
 * Review table layout for metadata inspection in edu-sharing.
 * Clean, card-based display with icons in group headers.
 * No input area, no status bar - just fields and floating controls.
 * 
 * Used in:
 * - edu-sharing Prüftisch (Review Table)
 * - Metadata inspection workflows
 * - Quality assurance processes
 * 
 * Activation:
 * - URL: ?layout=prueftisch
 * - Attribute: layout="prueftisch"
 */
@Component({
  selector: 'app-prueftisch-layout',
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
  templateUrl: './prueftisch-layout.component.html',
  styleUrls: ['./prueftisch-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrueftischLayoutComponent extends LayoutBase {
  // Data from parent
  @Input() contentTypes: ContentType[] = [];
  @Input() backgroundColor = '';
  @Input() columns: 1 | 2 | 3 | 4 = 1;

  @Input() userText = '';
  @Input() sourceUrl = '';
  @Input() nodeId = '';
  @Input() inputMode: 'text' | 'url' | 'nodeId' = 'text';
  
  // Element visibility
  @Input() showInputArea = false;
  @Input() showStatusBar = false;
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

  getGroupIcon(group: FieldGroup): string {
    // Map group IDs to Material icons
    const iconMap: Record<string, string> = {
      'beschreibung': 'description',
      'description': 'description',
      'paedagogisches': 'school',
      'pedagogical': 'school',
      'zielgruppe': 'groups',
      'target_audience': 'groups',
      'technisches': 'settings',
      'technical': 'settings',
      'rechtliches': 'gavel',
      'legal': 'gavel',
      'klassifikation': 'category',
      'classification': 'category',
      'core': 'star',
      'special': 'extension'
    };
    
    const groupId = group.id.toLowerCase();
    return iconMap[groupId] || 'folder';
  }
}
