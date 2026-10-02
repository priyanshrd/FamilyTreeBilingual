import { describe, expect, it } from 'vitest';
import { findPossibleDuplicates, nameSimilarity, phoneticKey, type DedupeCandidate } from './dedupe';

const people: DedupeCandidate[] = [
  { id: 'rajiv58', names: ['Rajiv Dhotar', 'राजीव धोतर'], birthYear: 1958, birthPlace: 'Pune', relativeIds: ['madhuri'] },
  { id: 'rajiv90', names: ['Rajiv Dhotar'], birthYear: 1990 },
  { id: 'sunil', names: ['Sunil Patil'], birthYear: 1958 },
  { id: 'ph', names: ['Rajiv Dhotar'], isPlaceholder: true },
];

describe('phonetic matching', () => {
  it('treats common spelling variants as equal', () => {
    expect(phoneticKey('Rajeev')).toBe(phoneticKey('Rajiv'));
    expect(phoneticKey('Shrikrishna')).toBe(phoneticKey('Shreekrishn'));
    expect(phoneticKey('Ramaa')).toBe(phoneticKey('Ram'));
  });

  it('compares only within the same script', () => {
    expect(nameSimilarity(['राजीव धोतर'], ['Rajiv Dhotar']).score).toBe(0);
    expect(nameSimilarity(['राजीव धोतर'], ['राजीव धोतर']).score).toBe(1);
  });
});

describe('findPossibleDuplicates', () => {
  it('finds the spec example: Rajiv Dhotar 1958', () => {
    const [top, ...rest] = findPossibleDuplicates({ names: ['Rajiv Dhotar'], birthYear: 1958 }, people);
    expect(top).toMatchObject({ id: 'rajiv58', reasons: expect.arrayContaining(['name', 'birth_year']) });
    expect(rest.map((m) => m.id)).not.toContain('rajiv90'); // 32 years apart
  });

  it('matches across spelling variants and in Marathi', () => {
    expect(findPossibleDuplicates({ names: ['Rajeev Dhotar'] }, people).map((m) => m.id)).toContain('rajiv58');
    expect(findPossibleDuplicates({ names: ['राजीव धोतर'] }, people)[0]!.id).toBe('rajiv58');
  });

  it('boosts people connected to the same relatives and place', () => {
    const [m] = findPossibleDuplicates({ names: ['Rajiv Dhotar'], birthPlace: 'pune', nearbyIds: ['madhuri'] }, people);
    expect(m!.reasons).toEqual(expect.arrayContaining(['place', 'relatives']));
  });

  it('ignores different names, and never suggests placeholders', () => {
    const ids = findPossibleDuplicates({ names: ['Sunita Kale'], birthYear: 1958 }, people).map((m) => m.id);
    expect(ids).toEqual([]);
    expect(findPossibleDuplicates({ names: ['Rajiv Dhotar'] }, people).map((m) => m.id)).not.toContain('ph');
  });
});
