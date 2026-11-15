/**
 * Typed dates and date-times, strictly (final audit 18.10., W-L2/W-L3).
 *
 * `new Date(2026, 1, 31)` rolls over to 3 March and `Date.parse` guesses
 * ("1" → 2001-01-01, "Sommer 2026" → 2026-01-01), so a value is accepted only
 * in one of the formats below and only if the calendar has that day: the Date
 * built from the parts must give back the same parts (round trip).
 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** Whether the day exists (31.02. does not). */
function exists({ year, month, day }: DateParts): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function checked(year: string, month: string, day: string): DateParts | null {
  const parts = { year: +year, month: +month, day: +day };
  return exists(parts) ? parts : null;
}

/**
 * "DD.MM.YYYY" or "DD/MM/YYYY" (the widget's display formats, day first in
 * both languages) or ISO "YYYY-MM-DD"; nothing else, and only a real day.
 */
export function parseDate(text: string): DateParts | null {
  const value = text.trim();
  const dayFirst = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dayFirst) return checked(dayFirst[3], dayFirst[2], dayFirst[1]);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return checked(iso[1], iso[2], iso[3]);
  return null;
}

export function isoDate({ year, month, day }: DateParts): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A real day in ISO form ("YYYY-MM-DD", nothing after it): what a date field stores. */
export function isIsoDate(text: string): boolean {
  const iso = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return !!iso && checked(iso[1], iso[2], iso[3]) !== null;
}

/**
 * `edited` ("YYYY-MM-DDTHH:MM", what the form produces) with the seconds and
 * the UTC offset `previous` had. The form shows and edits day, hour and
 * minute; "…T10:00:00+02:00" came back as "…T11:00" after the hour was
 * changed - another moment in time for everyone who reads the offset
 * (audit 14.11., W-47).
 */
export function keepSecondsAndOffset(edited: string, previous: unknown): string {
  const before = typeof previous === 'string'
    ? previous.match(/T\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)
    : null;
  if (!before) return edited;
  const [, seconds, offset] = before;
  return `${edited}${seconds ?? (offset ? ':00' : '')}${offset ?? ''}`;
}

/** "HH:MM" from hours and minutes in range; null otherwise. */
function time(hours: string, minutes: string): string | null {
  if (+hours > 23 || +minutes > 59) return null;
  return `${hours.padStart(2, '0')}:${minutes}`;
}

/**
 * A typed date-time as ISO "YYYY-MM-DDTHH:MM": "DD.MM.YYYY HH:MM" (or with
 * "/"), a date alone (00:00), or ISO "YYYY-MM-DDTHH:MM". Null for anything
 * else, a day that does not exist or a time out of range.
 */
export function parseDateTime(text: string): string | null {
  const value = text.trim();
  const withTime = value.match(/^(.+?)(?:\s+|T)(\d{1,2}):(\d{2})$/);
  const datePart = withTime ? withTime[1] : value;
  const date = parseDate(datePart);
  if (!date) return null;
  const hhmm = withTime ? time(withTime[2], withTime[3]) : '00:00';
  return hhmm ? `${isoDate(date)}T${hhmm}` : null;
}
