import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

function isShownAddress(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  if (/^data:/i.test(value)) return /^data:image\//i.test(value);
  try {
    const url = new URL(value, document.baseURI);
    return url.protocol === 'https:' || url.origin === location.origin;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-preview-thumbnail',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './preview-thumbnail.component.html',
  styleUrls: ['./preview-thumbnail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewThumbnailComponent {
  /**
   * Shown are an inline image, one over https and one from the host page's
   * own origin (W-SEC-01): the address can come from an imported record, and
   * the browser would fetch it from whatever host it names. The own origin
   * stays, for a host that hands in its preview as a relative address or
   * runs without TLS in development.
   */
  @Input() set imageUrl(value: string | undefined) {
    this._imageUrl = isShownAddress(value) ? value : undefined;
  }
  get imageUrl(): string | undefined {
    return this._imageUrl;
  }
  private _imageUrl: string | undefined;
  @Input() compact = false;

  isExpanded = false;

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }
}
