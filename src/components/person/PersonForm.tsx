import { formatFuzzyDate, parseFuzzyDate } from '@/domain/dates/fuzzyDate';
import { isBlank, SIMPLE_FACTS, type Bi, type InputErrors, type PersonInput } from '@/domain/family/personInput';
import type { Gender } from '@/domain/genealogy/graph';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { BilingualField } from '@/components/ui/BilingualField';
import { Choice } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';

type Props = {
  value: PersonInput;
  onChange: (v: PersonInput) => void;
  errors: InputErrors;
  /** open the "More details" section initially (e.g. when editing a person who has details) */
  detailsOpen?: boolean;
};

const NAME_EXAMPLE: Bi = { mr: 'उदा. राजीव शंकर धोतर', en: 'e.g. Rajiv Shankar Dhotar' };

export function PersonForm({ value, onChange, errors, detailsOpen }: Props) {
  const { t, lang } = useI18n();
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => onChange({ ...value, [k]: v });
  const place: Bi = { mr: t('person.placeExampleMr'), en: t('person.placeExampleEn') };

  const dateHint = (text: string) => {
    if (!text.trim()) return t('person.dateHint');
    const fd = parseFuzzyDate(text);
    return fd ? t('person.dateUnderstood', { date: formatFuzzyDate(fd, lang) || '—' }) : t('person.dateHint');
  };

  return (
    <div className="space-y-5">
      <BilingualField
        label={t('person.name')}
        required
        requiredText={t('person.required')}
        value={value.name}
        onChange={(v) => set('name', v)}
        placeholder={NAME_EXAMPLE}
        error={errors.name ? t('person.nameRequired') : null}
      />

      <Choice<Gender>
        label={t('person.gender')}
        value={value.gender}
        onChange={(v) => set('gender', v)}
        options={(['male', 'female', 'other', 'unknown'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) }))}
      />

      <Choice<'yes' | 'no' | 'unknown'>
        label={t('person.living')}
        value={value.isLiving == null ? 'unknown' : value.isLiving ? 'yes' : 'no'}
        // marking someone as living clears any death details typed earlier
        onChange={(v) =>
          onChange({
            ...value,
            isLiving: v === 'unknown' ? null : v === 'yes',
            ...(v === 'yes' ? { death: '', deathPlace: { en: '', mr: '' } } : {}),
          })
        }
        options={[
          { value: 'yes', label: t('living.yes') },
          { value: 'no', label: t('living.no') },
          { value: 'unknown', label: t('living.unknown') },
        ]}
      />

      <div className="space-y-3 rounded-xl border border-stone-200 p-3">
        <TextField
          label={t('person.birth')}
          value={value.birth}
          onChange={(e) => set('birth', e.target.value)}
          hint={dateHint(value.birth)}
          error={errors.birth ? t('person.dateInvalid') : null}
        />
        <BilingualField label={t('person.birthPlace')} value={value.birthPlace} onChange={(v) => set('birthPlace', v)} placeholder={place} />
      </div>

      {value.isLiving !== true && (
        <div className="space-y-3 rounded-xl border border-stone-200 p-3">
          <TextField
            label={t('person.death')}
            value={value.death}
            onChange={(e) => set('death', e.target.value)}
            hint={value.death.trim() ? dateHint(value.death) : undefined}
            error={errors.death ? t('person.dateInvalid') : null}
          />
          <BilingualField label={t('person.deathPlace')} value={value.deathPlace} onChange={(v) => set('deathPlace', v)} placeholder={place} />
        </div>
      )}

      <details open={detailsOpen} className="group rounded-xl border border-stone-200">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-stone-700 select-none">
          <span className="mr-2 transition-transform group-open:rotate-90">›</span>
          {t('person.moreDetails')}
        </summary>
        <div className="space-y-4 border-t border-stone-200 p-3">
          {SIMPLE_FACTS.map((f) => (
            <BilingualField
              key={f.field}
              label={t(`person.${f.field}` as StringKey)}
              value={value[f.field]}
              onChange={(v) => set(f.field, v)}
              placeholder={f.in === 'place' ? place : undefined}
            />
          ))}
          <BilingualField label={t('person.nickname')} value={value.nickname} onChange={(v) => set('nickname', v)} />
          <BilingualField label={t('person.maidenName')} value={value.maidenName} onChange={(v) => set('maidenName', v)} />
          <BilingualField label={t('person.notes')} value={value.notes} onChange={(v) => set('notes', v)} multiline />
        </div>
      </details>
    </div>
  );
}

/** Whether any of the optional "More details" fields has a value. */
export function hasMoreDetails(v: PersonInput): boolean {
  return [...SIMPLE_FACTS.map((f) => v[f.field]), v.nickname, v.maidenName, v.notes].some((b) => !isBlank(b));
}
