import { describe, expect, it } from 'vitest';
import { applyAuto, canAutoFill, getText, isStale, setManual, type LocalizedText } from './localized';

const meta = { from: 'en', provider: 'test', at: '2026-01-01T00:00:00Z' };

describe('localized values', () => {
  it('reads with fallback', () => {
    const lt: LocalizedText = { en: { v: 'Engineer', src: 'manual' } };
    expect(getText(lt, 'en')).toEqual({ text: 'Engineer', lang: 'en', isFallback: false });
    expect(getText(lt, 'mr')).toEqual({ text: 'Engineer', lang: 'en', isFallback: true });
    expect(getText(null, 'mr')).toBeNull();
  });

  it('manual entry; editing an auto value marks it corrected; empty removes', () => {
    let lt = setManual(null, 'en', 'Engineer');
    expect(lt.en).toEqual({ v: 'Engineer', src: 'manual' });
    lt = applyAuto(lt, 'mr', 'इंजिनिअर', meta).value;
    lt = setManual(lt, 'mr', 'अभियंता');
    expect(lt.mr).toMatchObject({ v: 'अभियंता', src: 'corrected', from: 'en' });
    expect(setManual(lt, 'mr', '  ').mr).toBeUndefined();
  });

  it('never overwrites manual or corrected values automatically', () => {
    const lt = setManual(setManual(null, 'en', 'Engineer'), 'mr', 'अभियंता');
    const r = applyAuto(lt, 'mr', 'इंजिनिअर', meta);
    expect(r).toMatchObject({ applied: false, reason: 'protected' });
    expect(r.value.mr!.v).toBe('अभियंता');
    expect(canAutoFill(lt, 'mr')).toBe(false);
  });

  it('replaces an earlier automatic value', () => {
    let lt = setManual(null, 'en', 'Engineer');
    lt = applyAuto(lt, 'mr', 'इंजिनिअर', meta).value;
    expect(canAutoFill(lt, 'mr')).toBe(true);
    const r = applyAuto(lt, 'mr', 'अभियंता', meta);
    expect(r.applied).toBe(true);
    expect(r.value.mr).toMatchObject({ v: 'अभियंता', src: 'auto', provider: 'test' });
  });

  it('detects that the source changed after generation', () => {
    let lt = setManual(null, 'en', 'Engineer');
    lt = applyAuto(lt, 'mr', 'अभियंता', meta).value;
    expect(isStale(lt, 'mr')).toBe(false);
    lt = setManual(lt, 'en', 'Civil engineer');
    expect(isStale(lt, 'mr')).toBe(true);
    expect(isStale(lt, 'en')).toBe(false);
  });
});
