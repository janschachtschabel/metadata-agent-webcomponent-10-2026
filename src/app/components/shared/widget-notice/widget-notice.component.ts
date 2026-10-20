import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { uniqueId } from '../../../shared/unique-id';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

/** A message for the editor; `question` asks for confirmation instead. */
export interface Notice {
  text: string;
  kind: 'info' | 'error';
  question?: boolean;
  /** A question whose confirmation cannot be undone: the focus starts on Cancel. */
  destructive?: boolean;
}

/**
 * Messages and questions inside the widget, in place of alert()/confirm():
 * nothing blocks the host page, and sandboxed iframes cannot swallow them.
 * Information is announced politely, errors at once; a question is an
 * alertdialog with the focus on its confirm button, Escape cancels.
 */
@Component({
  selector: 'app-widget-notice',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule, SvgIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Live regions exist before any message: text inserted together with
         its region is often not announced (NVDA + Chrome). -->
    <div class="notice-live" role="status" aria-live="polite">{{ politeText }}</div>
    <div class="notice-live" role="alert">{{ alertText }}</div>

    <div *ngIf="notice as n"
         class="widget-notice"
         [class.error]="n.kind === 'error'"
         [attr.role]="n.question ? 'alertdialog' : null"
         [attr.aria-describedby]="n.question ? textId : null"
         [attr.aria-label]="n.question ? ('COMMON.CONFIRM' | translate) : null"
         (keydown.escape)="onEscape($event)">
      <!-- info_outline as SVG: edu-sharing's icon font has no such ligature. -->
      <mat-icon *ngIf="n.kind === 'error' || n.question; else infoIcon" aria-hidden="true">{{ n.kind === 'error' ? 'error_outline' : 'help_outline' }}</mat-icon>
      <ng-template #infoIcon><mat-icon aria-hidden="true"><app-svg-icon name="info_outline"></app-svg-icon></mat-icon></ng-template>
      <!-- A message is read from the live region above, a question from here. -->
      <p class="notice-text" [id]="textId" [attr.aria-hidden]="n.question ? null : 'true'">{{ n.text }}</p>
      <div class="notice-actions" *ngIf="n.question; else dismiss">
        <button #confirmButton mat-flat-button type="button" class="confirm-button" (click)="answer(true)">
          {{ 'COMMON.CONFIRM' | translate }}
        </button>
        <button #cancelButton mat-button type="button" class="cancel-button" (click)="answer(false)">
          {{ 'COMMON.CANCEL' | translate }}
        </button>
      </div>
      <ng-template #dismiss>
        <button mat-icon-button type="button" class="dismiss-button" (click)="answer(false)"
                [attr.aria-label]="'COMMON.CLOSE' | translate">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </ng-template>
    </div>
  `,
  styles: [`
    .widget-notice {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
      margin: 0 0 12px;
      padding: 12px 16px;
      border: 1px solid #b6cdea;
      border-radius: 8px;
      background: #eef4fb;
      color: #1b3a5c;
    }
    .widget-notice.error {
      border-color: #f1b5b5;
      background: #fdeeee;
      color: #7a1d1d;
    }
    .notice-text {
      flex: 1 1 12rem;
      margin: 2px 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .notice-live {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .notice-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `],
})
export class WidgetNoticeComponent implements OnChanges {
  @Input() notice: Notice | null = null;
  /** true when a question was confirmed; false for cancel, Escape or dismiss. */
  @Output() closed = new EventEmitter<boolean>();

  @ViewChild('confirmButton', { read: ElementRef }) private confirmButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('cancelButton', { read: ElementRef }) private cancelButton?: ElementRef<HTMLButtonElement>;

  readonly textId = uniqueId('notice-text');
  politeText = '';
  alertText = '';
  /** Where the focus was when the notice appeared; it goes back there on close. */
  private returnFocus: HTMLElement | null = null;

  private destroyed = false;

  constructor(private cdr: ChangeDetectorRef, destroyRef: DestroyRef) {
    destroyRef.onDestroy(() => (this.destroyed = true));
  }

  ngOnChanges(changes: SimpleChanges): void {
    const notice = this.notice;
    if (notice && !changes['notice']?.previousValue) {
      const active = document.activeElement;
      this.returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    // Empty first, fill a tick later: a live region only speaks when its
    // content changes, and the same message may come twice in a row.
    const message = notice && !notice.question ? notice.text : '';
    this.politeText = '';
    this.alertText = '';
    if (message) {
      setTimeout(() => {
        if (this.destroyed || this.notice !== notice) return;
        this.politeText = notice!.kind === 'error' ? '' : message;
        this.alertText = notice!.kind === 'error' ? message : '';
        this.cdr.detectChanges();
      });
    }

    if (notice?.question) {
      // After the view shows the question. Least harm first for what cannot be undone.
      setTimeout(() =>
        (notice.destructive ? this.cancelButton : this.confirmButton)?.nativeElement.focus()
      );
    }
  }

  onEscape(event: Event): void {
    if (!this.notice?.question) return;
    // A host dialog around the widget must not close as well.
    event.stopPropagation();
    this.answer(false);
  }

  answer(confirmed: boolean): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    this.closed.emit(confirmed);
    if (target) {
      setTimeout(() => {
        if (target.isConnected) target.focus();
      });
    }
  }
}
