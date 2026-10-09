import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { formatFuzzyDate } from '@/domain/dates/fuzzyDate';
import { currentFact, displayName, type PersonView } from '@/domain/family/familyModel';
import {
  EMPTY_PERSON,
  fromLocalized,
  SIMPLE_FACTS,
  validatePersonInput,
  type Bi,
  type InputErrors,
  type PersonInput,
} from '@/domain/family/personInput';
import { fillOtherLanguage } from '@/domain/family/personInput';
import { transliterate } from '@/domain/language/transliterate';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import { createPerson, updatePerson } from '@/services/repositories/personRepo';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { errorMessage } from './AddRelativeDialog';
import { hasMoreDetails, PersonForm } from './PersonForm';

export function toInput(p: PersonView): PersonInput {
  const forms = (f: Record<string, { full_name: string }> | undefined): Bi => ({ en: f?.en?.full_name ?? '', mr: f?.mr?.full_name ?? '' });
  const birth = currentFact(p, 'birth');
  const death = currentFact(p, 'death');
  const input: PersonInput = {
    ...EMPTY_PERSON,
    name: forms(p.names),
    nickname: forms(p.otherNames.alias?.forms),
    maidenName: forms(p.otherNames.birth?.forms),
    gender: p.gender,
    isLiving: p.isLiving,
    birth: formatFuzzyDate(p.birth.date, 'en'),
    birthPlace: fromLocalized(birth?.place),
    death: formatFuzzyDate(p.death.date, 'en'),
    deathPlace: fromLocalized(death?.place),
    notes: fromLocalized(p.notes),
  };
  for (const f of SIMPLE_FACTS) input[f.field] = fromLocalized(currentFact(p, f.type)?.[f.in]);
  return input;
}

/** Edit an existing person, or (person = null) create a person with no relationships yet. */
export function EditPersonDialog({
  familyId,
  person,
  onClose,
  onDone,
}: {
  familyId: string;
  person: PersonView | null;
  onClose: () => void;
  onDone: (personId: string) => void;
}) {
  const { t, lang } = useI18n();
  const [input, setInput] = useState<PersonInput>(person ? toInput(person) : EMPTY_PERSON);
  const [errors, setErrors] = useState<InputErrors>({});
  const save = useMutation({
    mutationFn: async () => {
      const toSave = deviceSettings.autoFill() ? fillOtherLanguage(input, transliterate) : input;
      if (person) {
        await updatePerson(familyId, person, toSave);
        return person.id;
      }
      return createPerson(familyId, toSave);
    },
    onSuccess: onDone,
  });

  return (
    <Dialog title={person ? displayName(person, lang).text : t('person.add')} onClose={onClose} wide>
      <PersonEditor input={input} setInput={setInput} errors={errors} />
      {save.isError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {t('error.title')}: {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => {
            const e = validatePersonInput(input);
            setErrors(e);
            if (!Object.keys(e).length) save.mutate();
          }}
        >
          {save.isPending ? t('person.saving') : t('person.save')}
        </Button>
      </div>
    </Dialog>
  );
}

function PersonEditor({ input, setInput, errors }: { input: PersonInput; setInput: (v: PersonInput) => void; errors: InputErrors }) {
  const [open] = useState(() => hasMoreDetails(input));
  return <PersonForm value={input} onChange={setInput} errors={errors} detailsOpen={open} />;
}
