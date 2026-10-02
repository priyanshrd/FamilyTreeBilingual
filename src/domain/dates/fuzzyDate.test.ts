import { describe, expect, it } from 'vitest';
import {
  compareFuzzyDates,
  formatFuzzyDate,
  fromColumns,
  parseFuzzyDate,
  toColumns,
  type FuzzyDate,
} from './fuzzyDate';

describe('parseFuzzyDate', () => {
  it.each<[string, FuzzyDate]>([
    ['1958', { qualifier: 'exact', from: { year: 1958 } }],
    ['c. 1958', { qualifier: 'about', from: { year: 1958 } }],
    ['about 1958', { qualifier: 'about', from: { year: 1958 } }],
    ['~1958', { qualifier: 'about', from: { year: 1958 } }],
    ['est. 1958', { qualifier: 'estimated', from: { year: 1958 } }],
    ['before 1920', { qualifier: 'before', from: { year: 1920 } }],
    ['after 1950', { qualifier: 'after', from: { year: 1950 } }],
    ['1950-1955', { qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } }],
    ['1950–1955', { qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } }],
    ['between 1950 and 1955', { qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } }],
    ['Mar 1958', { qualifier: 'exact', from: { year: 1958, month: 3 } }],
    ['14 March 1958', { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }],
    ['March 14, 1958', { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }],
    ['14/03/1958', { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }],
    ['1958-03-14', { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }],
    ['1958-03', { qualifier: 'exact', from: { year: 1958, month: 3 } }],
    ['१९५८', { qualifier: 'exact', from: { year: 1958 } }],
    ['सुमारे १९५८', { qualifier: 'about', from: { year: 1958 } }],
    ['१९२० पूर्वी', { qualifier: 'before', from: { year: 1920 } }],
    ['१९५० नंतर', { qualifier: 'after', from: { year: 1950 } }],
    ['१४ मार्च १९५८', { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }],
    ['१९५० ते १९५५', { qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } }],
    ['', { qualifier: 'unknown' }],
    ['unknown', { qualifier: 'unknown' }],
    ['अज्ञात', { qualifier: 'unknown' }],
  ])('%s', (input, expected) => {
    expect(parseFuzzyDate(input)).toEqual(expected);
  });

  it.each(['31/02/1958', 'yesterday', '1955-1950', '13/13/1958', 'around Diwali'])('rejects %s', (input) => {
    expect(parseFuzzyDate(input)).toBeNull();
  });
});

describe('formatFuzzyDate', () => {
  it('formats English', () => {
    expect(formatFuzzyDate({ qualifier: 'about', from: { year: 1958 } }, 'en')).toBe('c. 1958');
    expect(formatFuzzyDate({ qualifier: 'before', from: { year: 1920 } }, 'en')).toBe('before 1920');
    expect(formatFuzzyDate({ qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }, 'en')).toBe('14 Mar 1958');
    expect(formatFuzzyDate({ qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } }, 'en')).toBe('1950–1955');
    expect(formatFuzzyDate({ qualifier: 'unknown' }, 'en')).toBe('');
  });

  it('formats Marathi with Devanagari digits by default', () => {
    expect(formatFuzzyDate({ qualifier: 'about', from: { year: 1958 } }, 'mr')).toBe('सुमारे १९५८');
    expect(formatFuzzyDate({ qualifier: 'before', from: { year: 1920 } }, 'mr')).toBe('१९२० पूर्वी');
    expect(formatFuzzyDate({ qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } }, 'mr', { digits: 'latin' })).toBe(
      '14 मार्च 1958',
    );
  });

  it('round-trips through the parser', () => {
    for (const s of ['c. 1958', 'before 1920', '14 Mar 1958', '1950–1955', 'est. 1700']) {
      expect(formatFuzzyDate(parseFuzzyDate(s)!, 'en')).toBe(s);
    }
  });
});

describe('database columns', () => {
  it('round-trips every qualifier', () => {
    const dates: FuzzyDate[] = [
      { qualifier: 'unknown' },
      { qualifier: 'exact', from: { year: 1958, month: 3, day: 14 } },
      { qualifier: 'about', from: { year: 1958 } },
      { qualifier: 'after', from: { year: 1950, month: 6 } },
      { qualifier: 'between', from: { year: 1950 }, to: { year: 1955 } },
    ];
    for (const d of dates) expect(fromColumns(toColumns(d))).toEqual({ ...d, text: undefined });
  });

  it('normalises to the start of the period, as the DB check requires', () => {
    expect(toColumns({ qualifier: 'about', from: { year: 1958 } })).toMatchObject({
      date_from: '1958-01-01',
      date_from_precision: 'year',
      date_to: null,
    });
  });
});

describe('compareFuzzyDates', () => {
  const d = (s: string) => parseFuzzyDate(s)!;
  it('orders when certain', () => {
    expect(compareFuzzyDates(d('1950'), d('1955'))).toBe(-1);
    expect(compareFuzzyDates(d('1960'), d('before 1955'))).toBe(1);
    expect(compareFuzzyDates(d('Mar 1958'), d('Apr 1958'))).toBe(-1);
  });
  it('refuses to guess when periods overlap or are unknown', () => {
    expect(compareFuzzyDates(d('1958'), d('Mar 1958'))).toBeNull();
    expect(compareFuzzyDates(d('c. 1958'), d('1959'))).toBeNull();
    expect(compareFuzzyDates(d('unknown'), d('1958'))).toBeNull();
    expect(compareFuzzyDates(d('after 1950'), d('1960'))).toBeNull();
  });
});
