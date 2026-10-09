import { describe, expect, it } from 'vitest';
import { EMPTY_PERSON, toPersonPayload, validatePersonInput, type PersonInput } from './personInput';

const full: PersonInput = {
  ...EMPTY_PERSON,
  name: { en: 'Rajiv Shankar Dhotar', mr: 'राजीव शंकर धोतर' },
  nickname: { en: 'Raju', mr: 'राजू' },
  gender: 'male',
  isLiving: null,
  birth: 'c. 1958',
  birthPlace: { en: 'Pune', mr: 'पुणे' },
  death: '2020',
  deathPlace: { en: '', mr: 'मुंबई' },
  nativePlace: { en: 'Satara', mr: 'सातारा' },
  occupation: { en: 'Engineer', mr: '' },
  gotra: { en: '', mr: 'कश्यप' },
  notes: { en: 'Loved music', mr: '' },
};

describe('person input', () => {
  it('only the name is required', () => {
    expect(validatePersonInput({ ...EMPTY_PERSON, name: { en: '', mr: 'राजीव' } })).toEqual({});
    expect(validatePersonInput(EMPTY_PERSON)).toEqual({ name: 'required' });
    expect(validatePersonInput({ ...EMPTY_PERSON, name: { en: 'x', mr: '' }, birth: 'yesterday' })).toEqual({ birth: 'invalid' });
  });

  it('builds names, facts and notes in both languages', () => {
    const p = toPersonPayload(full);
    expect(p.is_living).toBe(false);
    expect(p.names).toHaveLength(2);
    expect(p.names[1]).toMatchObject({ name_type: 'alias', is_primary: false });
    expect(p.notes).toEqual({ en: { v: 'Loved music', src: 'manual' } });
    const byType = Object.fromEntries((p.facts as { fact_type: string }[]).map((f) => [f.fact_type, f]));
    expect(Object.keys(byType).sort()).toEqual(['birth', 'death', 'gotra', 'native_place', 'occupation']);
    expect(byType.birth).toMatchObject({ date: { qualifier: 'about', from: '1958-01-01' }, place: { en: { v: 'Pune' }, mr: { v: 'पुणे' } } });
    expect(byType.native_place).toMatchObject({ place: { mr: { v: 'सातारा', src: 'manual' } } });
    expect(byType.occupation).toMatchObject({ value: { en: { v: 'Engineer' } } });
    expect(byType.gotra).toMatchObject({ value: { mr: { v: 'कश्यप' } } });
  });

  it('never sends JSON null (the database would reject it)', () => {
    const json = JSON.stringify(toPersonPayload({ ...EMPTY_PERSON, name: { en: 'Only a name', mr: '' }, birth: '1958' }));
    expect(JSON.parse(json).notes).toBeUndefined();
    expect(JSON.parse(json).facts[0].place).toBeUndefined();
  });

  it('drops death details for a living person', () => {
    const p = toPersonPayload({ ...full, isLiving: true });
    expect((p.facts as { fact_type: string }[]).some((f) => f.fact_type === 'death')).toBe(false);
  });
});
