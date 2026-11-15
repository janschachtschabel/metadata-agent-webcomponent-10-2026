import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { CanvasState } from '../../../shared/models/canvas.models';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';
import { uniqueId } from '../../../shared/unique-id';

/**
 * What every layout shows above its fields about the extraction: that one is
 * running (with a way to stop it), its error and its notice.
 *
 * One component for the seven layouts (audit 14.11., U-03, U-12, K-23). Each
 * layout had its own copy of the banners; only the default layout could close
 * them, the notice had no role, and five layouts showed nothing at all while
 * a run was out - the editor clicked the type button again.
 *
 * A layout places it with `--feedback-margin`; the margin sits on the single
 * boxes, so the component takes no room while it shows nothing.
 */
@Component({
  selector: 'app-extraction-feedback',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatButtonModule, MatIconModule, MatProgressBarModule, SvgIconComponent],
  templateUrl: './extraction-feedback.component.html',
  styleUrls: ['./extraction-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact' },
})
export class ExtractionFeedbackComponent {
  @Input() state: CanvasState | null = null;
  /** Smaller boxes for the sidebar of the browser extension. */
  @Input() compact = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() dismissError = new EventEmitter<void>();
  @Output() dismissWarning = new EventEmitter<void>();

  /** Id of the text that names the progress bar; unique per instance. */
  readonly progressLabelId = uniqueId('extraction-progress');
}
