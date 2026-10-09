// Upcoming birthdays of living people whose day and month of birth are known.
import type { FuzzyDate } from '@/domain/dates/fuzzyDate';

export type BirthdayPerson = { id: string; birth: FuzzyDate; death: FuzzyDate; isLiving: boolean | null; isPlaceholder: boolean };
export type Birthday = {
  id: string;
  /** days from today: 0 = today */
  inDays: number;
  month: number;
  day: number;
  /** age they turn, when the birth year is certain */
  turns: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Birthdays in the next `days` days (today included), soonest first. 29 February is celebrated on 28 February in other years. */
export function upcomingBirthdays(people: Iterable<BirthdayPerson>, today: Date, days = 30): Birthday[] {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const out: Birthday[] = [];
  for (const p of people) {
    if (p.isPlaceholder || p.isLiving === false || p.death.qualifier !== 'unknown') continue;
    const b = p.birth;
    if (b.qualifier !== 'exact' && b.qualifier !== 'about') continue;
    const { month, day, year } = b.from;
    if (month == null || day == null) continue;
    for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
      const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
      const d = month === 2 && day === 29 && !leap ? 28 : day;
      const inDays = Math.round((Date.UTC(y, month - 1, d) - start) / DAY_MS);
      if (inDays < 0) continue;
      if (inDays < days) out.push({ id: p.id, inDays, month, day, turns: b.qualifier === 'exact' && y > year ? y - year : null });
      break;
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
