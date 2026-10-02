import { describe, expect, it } from 'vitest';
import { parseFuzzyDate } from '@/domain/dates/fuzzyDate';
import { fixtureFamily } from '@/domain/testing/familyBuilder';
import { parentChildWarnings, partnerWarnings, personWarnings } from './plausibility';

const d = (s: string) => parseFuzzyDate(s)!;

describe('plausibility warnings', () => {
  it('birth after death', () => {
    expect(personWarnings(d('1960'), d('1950'), 'x')).toEqual([{ code: 'birth_after_death', personId: 'x' }]);
    expect(personWarnings(d('c. 1950'), d('1951'))).toEqual([]);
  });

  it('parent born after child, or too young', () => {
    expect(parentChildWarnings({ id: 'p', birth: d('1990') }, { id: 'c', birth: d('1980') })[0]!.code).toBe('parent_born_after_child');
    expect(parentChildWarnings({ id: 'p', birth: d('1980') }, { id: 'c', birth: d('1985') })[0]!.code).toBe('parent_too_young');
    expect(parentChildWarnings({ id: 'p', birth: d('1955') }, { id: 'c', birth: d('1985') })).toEqual([]);
  });

  it('does not warn when dates are unknown or too vague to be sure', () => {
    expect(parentChildWarnings({ id: 'p' }, { id: 'c', birth: d('1985') })).toEqual([]);
    expect(parentChildWarnings({ id: 'p', birth: d('after 1970') }, { id: 'c', birth: d('1985') })).toEqual([]);
  });

  it('child born well after a parent died', () => {
    expect(parentChildWarnings({ id: 'p', death: d('1970') }, { id: 'c', birth: d('1980') })[0]!.code).toBe('born_after_parent_death');
    expect(parentChildWarnings({ id: 'p', death: d('1970') }, { id: 'c', birth: d('1971') })).toEqual([]);
  });

  it('partnering close relatives', () => {
    const g = fixtureFamily();
    expect(partnerWarnings(g, 'me', 'fz')[0]).toMatchObject({ code: 'close_relative_partner', english: 'paternal_aunt' });
    // cousin marriage (e.g. मामाची मुलगी) is customary in many families: no warning
    expect(partnerWarnings(g, 'me', 'mbs')).toEqual([]);
    expect(partnerWarnings(g, 'me', 'stranger')).toEqual([]);
    expect(partnerWarnings(g, 'me', 'gfbss')).toEqual([]);
  });
});
