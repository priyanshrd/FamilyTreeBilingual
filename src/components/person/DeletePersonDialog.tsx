import { useMutation, useQuery } from '@tanstack/react-query';
import { displayName, type PersonView } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import { deleteImpact, softDeletePerson } from '@/services/repositories/personRepo';
import { Button } from '@/components/ui/Button';
import { DIALOG_ACTIONS_CLASS, Dialog } from '@/components/ui/Dialog';
import { Loading } from '@/components/ui/Status';
import { errorMessage } from './AddRelativeDialog';
import { recordChange } from '@/services/undo';

/** In the confirmation, Delete (as well as Enter) confirms. */
const DELETE_KEYS = ['Delete'];

export function DeletePersonDialog({ person, onClose, onDone }: { person: PersonView; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useI18n();
  const name = displayName(person, lang).text;
  const impact = useQuery({ queryKey: ['deleteImpact', person.id], queryFn: () => deleteImpact(person.id), gcTime: 0 });
  const del = useMutation({ mutationFn: () => recordChange('delete', name, () => softDeletePerson(person.id)), onSuccess: onDone });

  return (
    <Dialog title={t('delete.title', { name })} onClose={onClose} onEnter={() => !del.isPending && del.mutate()} enterKeys={DELETE_KEYS}>
      {impact.isPending && <Loading />}
      {impact.data && (
        <div className="space-y-3">
          <p>{t('delete.has', { name })}</p>
          <ul className="list-inside list-disc text-stone-700">
            <li>{impact.data.parents === 1 ? t('delete.parents1') : t('delete.parents', { count: impact.data.parents })}</li>
            <li>{t('delete.partners', { count: impact.data.partners })}</li>
            <li>{impact.data.children === 1 ? t('delete.children1') : t('delete.children', { count: impact.data.children })}</li>
            <li>{impact.data.media === 1 ? t('delete.media1') : t('delete.media', { count: impact.data.media })}</li>
          </ul>
          <p className="text-sm text-stone-500">{t('delete.note')}</p>
        </div>
      )}
      {del.isError && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {errorMessage(del.error)}
        </p>
      )}
      <div className={DIALOG_ACTIONS_CLASS}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button className="bg-red-700 hover:bg-red-800" disabled={del.isPending} onClick={() => del.mutate()}>
          {t('delete.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
