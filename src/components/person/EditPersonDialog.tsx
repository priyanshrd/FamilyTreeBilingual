import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { formatFuzzyDate } from '@/domain/dates/fuzzyDate';
import { displayName, type PersonView } from '@/domain/family/familyModel';
import { EMPTY_PERSON, validatePersonInput, type InputErrors, type PersonInput } from '@/domain/family/personInput';
import { useI18n } from '@/i18n/I18nProvider';
import { createPerson, updatePerson } from '@/services/repositories/personRepo';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { errorMessage } from './AddRelativeDialog';
import { PersonForm } from './PersonForm';

export function toInput(p: PersonView): PersonInput {
  return {
    nameEn: p.names.en?.full_name ?? '',
    nameMr: p.names.mr?.full_name ?? '',
    gender: p.gender,
    birth: formatFuzzyDate(p.birth.date, 'en'),
    death: formatFuzzyDate(p.death.date, 'en'),
    isLiving: p.isLiving,
  };
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
      if (person) {
        await updatePerson(familyId, person, input);
        return person.id;
      }
      return createPerson(familyId, input);
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
  return <PersonForm value={input} onChange={setInput} errors={errors} />;
}
