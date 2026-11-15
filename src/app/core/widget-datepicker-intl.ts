import { Injectable, inject } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';

/** Material's property for each text of the calendar, and the widget's key for it. */
const LABELS: [keyof MatDatepickerIntl & string, string, string][] = [
  ['calendarLabel', 'DATEPICKER.CALENDAR', 'Calendar'],
  ['openCalendarLabel', 'DATEPICKER.OPEN_CALENDAR', 'Open calendar'],
  ['closeCalendarLabel', 'DATEPICKER.CLOSE_CALENDAR', 'Close calendar'],
  ['prevMonthLabel', 'DATEPICKER.PREV_MONTH', 'Previous month'],
  ['nextMonthLabel', 'DATEPICKER.NEXT_MONTH', 'Next month'],
  ['prevYearLabel', 'DATEPICKER.PREV_YEAR', 'Previous year'],
  ['nextYearLabel', 'DATEPICKER.NEXT_YEAR', 'Next year'],
  ['prevMultiYearLabel', 'DATEPICKER.PREV_MULTI_YEAR', 'Previous 24 years'],
  ['nextMultiYearLabel', 'DATEPICKER.NEXT_MULTI_YEAR', 'Next 24 years'],
  ['switchToMonthViewLabel', 'DATEPICKER.SWITCH_TO_MONTH_VIEW', 'Choose date'],
  ['switchToMultiYearViewLabel', 'DATEPICKER.SWITCH_TO_MULTI_YEAR_VIEW', 'Choose month and year'],
];

/**
 * The texts of Material's calendar in the widget's language (audit 14.11.,
 * U-06): its buttons said "Open calendar" and "Previous month" in the German
 * interface. One instance for all fields; it follows a language switch and
 * texts that arrive later.
 */
@Injectable({ providedIn: 'root' })
export class WidgetDatepickerIntl extends MatDatepickerIntl {
  private readonly translate = inject(TranslateService);

  constructor() {
    super();
    this.update();
    merge(this.translate.onLangChange, this.translate.onTranslationChange).subscribe(() => {
      this.update();
      this.changes.next();
    });
  }

  private update(): void {
    for (const [label, key, fallback] of LABELS) {
      const text = this.translate.instant(key);
      // Material's own text while the widget has none for the key.
      (this as unknown as Record<string, string>)[label] = text && text !== key ? text : fallback;
    }
  }
}
