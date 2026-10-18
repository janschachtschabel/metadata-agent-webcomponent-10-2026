import { parseDate, parseDateTime } from './date-parsing';

/** Final audit 18.10. (W-L2/W-L3): typed dates without range check or with guessing. */
describe('date-parsing', () => {
  describe('parseDate', () => {
    it('reads day-first dates with dot or slash and ISO dates', () => {
      expect(parseDate('03.05.2026')).toEqual({ year: 2026, month: 5, day: 3 });
      expect(parseDate('3/5/2026')).toEqual({ year: 2026, month: 5, day: 3 });
      expect(parseDate(' 2026-05-03 ')).toEqual({ year: 2026, month: 5, day: 3 });
      expect(parseDate('29.02.2028')).withContext('leap year').toEqual({ year: 2028, month: 2, day: 29 });
    });

    for (const text of ['31.02.2026', '29.02.2026', '2026-02-31', '00.05.2026', '03.13.2026', '1', 'Sommer 2026', '2026', 'morgen', '03.05.26', '']) {
      it(`refuses "${text}"`, () => {
        expect(parseDate(text)).toBeNull();
      });
    }
  });

  describe('parseDateTime', () => {
    it('reads date and time into ISO', () => {
      expect(parseDateTime('03.05.2026 9:30')).toBe('2026-05-03T09:30');
      expect(parseDateTime('03/05/2026 14:05')).toBe('2026-05-03T14:05');
      expect(parseDateTime('2026-05-03T14:05')).toBe('2026-05-03T14:05');
      expect(parseDateTime('03.05.2026')).toBe('2026-05-03T00:00');
    });

    for (const text of ['31.02.2026 25:99', '03.05.2026 24:00', '03.05.2026 12:60', '31.02.2026 10:00', 'morgen', '1', '10:00']) {
      it(`refuses "${text}"`, () => {
        expect(parseDateTime(text)).toBeNull();
      });
    }
  });
});
