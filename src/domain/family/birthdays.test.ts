import { describe, expect, it } from 'vitest';
import type { FuzzyDate } from '@/domain/dates/fuzzyDate';
import { upcomingBirthdays, type BirthdayPerson } from './birthdays';

const unknown: FuzzyDate = { qualifier: 'unknown' };
const born = (id: string, year: number, month?: number, day?: number, extra: Partial<BirthdayPerson> = {}): BirthdayPerson => ({
  id,
  birth: { qualifier: 'exact', from: { year, month, day } },
  death: unknown,
  isLiving: null,
  isPlaceholder: false,
  ...extra,
});
const today = new Date(2026, 9, 9); // 9 Oct 2026

describe('upcomingBirthdays', () => {
  it('lists birthdays in the next 30 days, soonest first, with the age they turn', () => {
    const list = upcomingBirthdays([born('later', 1990, 11, 1), born('today', 1958, 10, 9), born('soon', 1985, 10, 12)], today);
    expect(list.map((b) => [b.id, b.inDays, b.turns])).toEqual([
      ['today', 0, 68],
      ['soon', 3, 41],
      ['later', 23, 36],
    ]);
  });

  it('wraps into next year', () => {
    const list = upcomingBirthdays([born('newyear', 2000, 1, 2)], new Date(2026, 11, 20));
    expect(list).toEqual([{ id: 'newyear', inDays: 13, month: 1, day: 2, turns: 27 }]);
  });

  it('skips people who died, unknown days, placeholders and passed birthdays', () => {
    const list = upcomingBirthdays(
      [
        born('dead', 1930, 10, 10, { isLiving: false }),
        born('deathKnown', 1930, 10, 10, { death: { qualifier: 'exact', from: { year: 2000 } } }),
        born('yearOnly', 1960),
        born('placeholder', 1960, 10, 10, { isPlaceholder: true }),
        born('yesterday', 1960, 10, 8),
      ],
      today,
    );
    expect(list).toEqual([]);
  });

  it('gives no age when the year is approximate, and moves 29 Feb to 28 Feb in other years', () => {
    expect(upcomingBirthdays([{ ...born('c', 1950, 10, 20), birth: { qualifier: 'about', from: { year: 1950, month: 10, day: 20 } } }], today).at(0)?.turns).toBe(null);
    expect(upcomingBirthdays([born('leap', 2000, 2, 29)], new Date(2027, 1, 20)).at(0)).toMatchObject({ inDays: 8, turns: 27 });
  });
});
