import { FieldValidationService, FieldValidationConfig } from './field-validation.service';

/**
 * What the form accepts and how it normalises it (audit T-02: 787 lines, no spec).
 * The service decides whether an editor's input is an error, a warning or fine,
 * and the normalised value is what ends up in the repository.
 */
describe('FieldValidationService', () => {
  const i18n = { instant: (key: string) => key } as any;
  const service = new FieldValidationService(i18n);
  const check = (value: unknown, config: Partial<FieldValidationConfig>) =>
    service.validate(value, { datatype: 'string', ...config } as FieldValidationConfig);

  const LANGUAGES = {
    type: 'closed' as const,
    concepts: [
      { uri: 'http://w3id.org/lang/de', label: { de: 'Deutsch', en: 'German' } },
      { uri: 'http://w3id.org/lang/en', label: { de: 'Englisch', en: 'English' }, altLabels: ['english'] },
    ],
  };

  describe('empty values', () => {
    it('are an error when the field is required', () => {
      expect(check('', { required: true })).toEqual({ valid: false, error: 'VALIDATION.REQUIRED_FIELD' });
    });

    it('are fine and null otherwise', () => {
      expect(check(null, {})).toEqual({ valid: true, normalizedValue: null });
    });
  });

  describe('strings', () => {
    it('are trimmed', () => {
      expect(check('  Bruchrechnung  ', {}).normalizedValue).toBe('Bruchrechnung');
    });

    it('respect pattern and length rules', () => {
      expect(check('abc', { validation: { pattern: '^\\d+$' } }).valid).toBeFalse();
      expect(check('ab', { validation: { minLength: 3 } }).valid).toBeFalse();
      expect(check('abcd', { validation: { maxLength: 3 } }).valid).toBeFalse();
      expect(check('abc', { validation: { minLength: 3, maxLength: 3 } }).valid).toBeTrue();
    });
  });

  describe('numbers', () => {
    it('accept numbers and numeric text', () => {
      expect(check(42, { datatype: 'integer' })).toEqual(jasmine.objectContaining({ valid: true, normalizedValue: 42 }));
      expect(check('12,5', { datatype: 'number' }).normalizedValue).toBe(12.5);
    });

    it('reject text that is no number', () => {
      expect(check('viele', { datatype: 'number' }).valid).toBeFalse();
    });

    // Final audit 18.10. (L-9): parseFloat/parseInt read the start of the text.
    for (const text of ['12abc', '1.2.3', '12,5,1', '1.23,4']) {
      it(`reject "${text}" as a number`, () => {
        expect(check(text, { datatype: 'number' }).valid).toBeFalse();
      });
    }

    it('read German thousands separators and decimal commas', () => {
      expect(check('1.234,5', { datatype: 'number' }).normalizedValue).toBe(1234.5);
      expect(check('1.234.567', { datatype: 'number' }).normalizedValue).toBe(1234567);
      expect(check('-0,75', { datatype: 'number' }).normalizedValue).toBe(-0.75);
    });

    it('read a point as decimal point when there is no comma (what a number input gives)', () => {
      expect(check('1.234', { datatype: 'number' }).normalizedValue).toBe(1.234);
      expect(check('1234.5', { datatype: 'number' }).normalizedValue).toBe(1234.5);
    });

    it('do not cut a fraction off an integer', () => {
      expect(check('12.7', { datatype: 'integer' }).valid).toBeFalse();
      expect(check('12', { datatype: 'integer' }).normalizedValue).toBe(12);
      expect(check('1.200.000', { datatype: 'integer' }).normalizedValue).toBe(1200000);
    });

    it('respect min and max', () => {
      expect(check(5, { datatype: 'number', validation: { min: 10 } }).valid).toBeFalse();
      expect(check(50, { datatype: 'number', validation: { max: 10 } }).valid).toBeFalse();
    });
  });

  describe('booleans', () => {
    for (const [input, expected] of [[true, true], ['ja', true], ['false', false], ['nein', false]] as const) {
      it(`read ${JSON.stringify(input)} as ${expected}`, () => {
        expect(check(input, { datatype: 'boolean' }).normalizedValue).toBe(expected);
      });
    }
  });

  describe('dates and times', () => {
    it('keep ISO dates and turn German ones into ISO', () => {
      expect(check('2026-05-03', { datatype: 'date' }).normalizedValue).toBe('2026-05-03');
      expect(check('03.05.2026', { datatype: 'date' }).normalizedValue).toBe('2026-05-03');
    });

    it('reject what is no date', () => {
      expect(check('irgendwann', { datatype: 'date' }).valid).toBeFalse();
    });

    // Final audit 18.10. (W-L3): Date rolled over and Date.parse guessed.
    for (const text of ['2026-02-31', '31.02.2026', '1', 'Sommer 2026', '2026', '13/13/2026']) {
      it(`reject "${text}" as a date`, () => {
        expect(check(text, { datatype: 'date' }).valid).toBeFalse();
      });
    }

    it('accept a date with slashes, day first', () => {
      expect(check('03/05/2026', { datatype: 'date' }).normalizedValue).toBe('2026-05-03');
    });

    for (const text of ['2026-02-31T10:00', 'Sommer 2026', '1', '2026-05-03T25:00']) {
      it(`reject "${text}" as a date-time`, () => {
        expect(check(text, { datatype: 'datetime' }).valid).toBeFalse();
      });
    }

    it('keep ISO date-times as they are and read German ones', () => {
      expect(check('2026-05-03T14:30', { datatype: 'datetime' }).normalizedValue).toBe('2026-05-03T14:30');
      expect(check('2026-05-03T14:30:00+02:00', { datatype: 'datetime' }).normalizedValue).toBe('2026-05-03T14:30:00+02:00');
      expect(check('2026-05-03', { datatype: 'datetime' }).normalizedValue).toBe('2026-05-03T00:00:00');
      expect(check('03.05.2026 14:30', { datatype: 'datetime' }).normalizedValue).toBe('2026-05-03T14:30');
    });

    it('accept times', () => {
      expect(check('14:30', { datatype: 'time' }).valid).toBeTrue();
    });
  });

  describe('URLs', () => {
    it('accept http(s) addresses', () => {
      expect(check('https://example.org/kurs', { datatype: 'url' }).valid).toBeTrue();
    });

    it('reject text that is no address', () => {
      expect(check('kein link', { datatype: 'url' }).valid).toBeFalse();
    });

    it('reject an address with a space, which the browser would encode and accept', () => {
      expect(check('https://example.org/a b', { datatype: 'url' }).valid).toBeFalse();
    });
  });

  describe('vocabularies', () => {
    it('map a label of a closed vocabulary to its URI', () => {
      expect(check('Deutsch', { vocabulary: LANGUAGES })).toEqual(
        jasmine.objectContaining({ valid: true, normalizedValue: 'http://w3id.org/lang/de' })
      );
    });

    it('find a concept by its other labels', () => {
      expect(check('english', { vocabulary: LANGUAGES }).normalizedValue).toBe('http://w3id.org/lang/en');
    });

    it('reject a value outside a closed vocabulary', () => {
      expect(check('Klingonisch', { vocabulary: LANGUAGES }).valid).toBeFalse();
    });

    it('allow free text in an open vocabulary, with a warning', () => {
      const result = check('Klingonisch', { vocabulary: { ...LANGUAGES, type: 'open' } });

      expect(result.valid).toBeTrue();
      expect(result.warning).toBeTruthy();
    });
  });

  describe('lists', () => {
    it('validate every item and keep the valid ones', () => {
      const result = check(['Deutsch', 'Klingonisch', ''], { multiple: true, vocabulary: LANGUAGES });

      expect(result.valid).toBeFalse();
      expect(result.normalizedValue).toEqual(['http://w3id.org/lang/de']);
      expect(result.error).toContain('Klingonisch');
    });

    it('treat a list of objects as objects, not as text', () => {
      const result = check(['Virtuelles Haus'], {
        datatype: 'array', itemDatatype: 'object', objectKey: 'name', multiple: true,
      });

      expect(result.normalizedValue).toEqual([{ name: 'Virtuelles Haus' }]);
    });
  });
});
