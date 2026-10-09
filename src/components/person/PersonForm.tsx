import { formatFuzzyDate, parseFuzzyDate } from '@/domain/dates/fuzzyDate';
import type { InputErrors, PersonInput } from '@/domain/family/personInput';
import type { Gender } from '@/domain/genealogy/graph';
import { useI18n } from '@/i18n/I18nProvider';
import { Choice } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';

// Each name box is labelled in its own language, whatever the UI language is.
const NAME_LABELS = { mr: 'नाव (मराठीत)', en: 'Name (in English)' };

type Props = {
  value: PersonInput;
  onChange: (v: PersonInput) => void;
  errors: InputErrors;
};

export function PersonForm({ value, onChange, errors }: Props) {
  const { t, lang } = useI18n();
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => onChange({ ...value, [k]: v });

  const dateHint = (text: string) => {
    if (!text.trim()) return t('person.dateHint');
    const fd = parseFuzzyDate(text);
    return fd ? t('person.dateUnderstood', { date: formatFuzzyDate(fd, lang) || '—' }) : t('person.dateHint');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <TextField
          label={NAME_LABELS.mr}
          lang="mr"
          placeholder={t('person.namePlaceholderMr')}
          value={value.nameMr}
          onChange={(e) => set('nameMr', e.target.value)}
          error={errors.name ? t('person.nameRequired') : null}
        />
        <TextField
          label={NAME_LABELS.en}
          lang="en"
          placeholder={t('person.namePlaceholderEn')}
          value={value.nameEn}
          onChange={(e) => set('nameEn', e.target.value)}
        />
      </div>
      <Choice<Gender>
        label={t('person.gender')}
        value={value.gender}
        onChange={(v) => set('gender', v)}
        options={[
          { value: 'male', label: t('gender.male') },
          { value: 'female', label: t('gender.female') },
          { value: 'other', label: t('gender.other') },
          { value: 'unknown', label: t('gender.unknown') },
        ]}
      />
      <Choice<'yes' | 'no' | 'unknown'>
        label={t('person.living')}
        value={value.isLiving == null ? 'unknown' : value.isLiving ? 'yes' : 'no'}
        // marking someone as living clears any death date typed earlier
        onChange={(v) => onChange({ ...value, isLiving: v === 'unknown' ? null : v === 'yes', death: v === 'yes' ? '' : value.death })}
        options={[
          { value: 'yes', label: t('living.yes') },
          { value: 'no', label: t('living.no') },
          { value: 'unknown', label: t('living.unknown') },
        ]}
      />
      <div className="grid gap-4">
        <TextField
          label={t('person.birth')}
          inputMode="text"
          value={value.birth}
          onChange={(e) => set('birth', e.target.value)}
          hint={dateHint(value.birth)}
          error={errors.birth ? t('person.dateInvalid') : null}
        />
        {value.isLiving !== true && (
          <TextField
            label={t('person.death')}
            value={value.death}
            onChange={(e) => set('death', e.target.value)}
            hint={value.death.trim() ? dateHint(value.death) : undefined}
            error={errors.death ? t('person.dateInvalid') : null}
          />
        )}
      </div>
    </div>
  );
}
