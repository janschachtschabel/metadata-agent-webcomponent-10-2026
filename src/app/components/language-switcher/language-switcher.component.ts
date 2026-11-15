import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule],
  // The name starts with the visible "DE"/"EN" (WCAG 2.5.3) and says what the
  // button does; a tooltip is no accessible name (U-16). The switch texts are
  // phrased in the target language on purpose.
  template: `
    <button type="button"
      mat-button
      class="lang-button"
      (click)="toggleLanguage()"
      [matTooltip]="switchKey | translate"
      [attr.aria-label]="label + ' – ' + (switchKey | translate)">
      <mat-icon class="lang-icon" aria-hidden="true">language</mat-icon>
      <span class="lang-label">{{ label }}</span>
    </button>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
    }
    .lang-button {
      display: flex !important;
      align-items: center;
      gap: 4px;
      min-width: auto !important;
      padding: 0 12px !important;
      height: 36px !important;
      line-height: 36px !important;
      background: #e2e8f6 !important;
      border-radius: 20px !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15);
    }
    .lang-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #1f2a3d;
    }
    .lang-label {
      font-size: 13px;
      font-weight: 500;
      color: #1f2a3d;
    }
  `]
})
export class LanguageSwitcherComponent {
  get currentLang(): string {
    return this.i18n.currentLang;
  }

  get label(): string {
    return this.currentLang === 'de' ? 'DE' : 'EN';
  }

  get switchKey(): string {
    return this.currentLang === 'de' ? 'LANGUAGE.SWITCH_TO_ENGLISH' : 'LANGUAGE.SWITCH_TO_GERMAN';
  }

  constructor(private i18n: I18nService) {}

  toggleLanguage(): void {
    const newLang = this.currentLang === 'de' ? 'en' : 'de';
    this.i18n.setLanguage(newLang);
  }
}
