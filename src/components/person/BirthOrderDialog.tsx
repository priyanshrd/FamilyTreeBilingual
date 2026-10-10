import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { numberRows, rowsFromGroup, siblingGroup, type OrderRow } from '@/domain/family/birthOrder';
import { displayName, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import { saveBirthOrder } from '@/services/repositories/personRepo';
import { Button } from '@/components/ui/Button';
import { DIALOG_ACTIONS_CLASS, Dialog } from '@/components/ui/Dialog';
import { errorMessage } from './AddRelativeDialog';
import { recordChange } from '@/services/undo';

/** Put brothers and sisters in birth order (eldest first) and mark twins. */
export function BirthOrderDialog({ model, personId, onClose, onDone }: { model: FamilyModel; personId: string; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useI18n();
  const group = useMemo(() => siblingGroup(model.graph, personId), [model, personId]);
  const [rows, setRows] = useState<OrderRow[]>(() => (group ? rowsFromGroup(group) : []));

  const save = useMutation({
    mutationFn: () => recordChange('order', displayName(model.persons.get(personId), lang).text, () => saveBirthOrder(group!.parentIds, numberRows(rows))),
    onSuccess: onDone,
  });

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    next[0] = { ...next[0]!, twinWithPrevious: false };
    setRows(next);
  };

  return (
    <Dialog title={t('order.title')} onClose={onClose} onEnter={() => group && !save.isPending && save.mutate()}>
      <p className="mb-4 text-sm text-stone-600">{t('order.help')}</p>
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const p = model.persons.get(r.id);
          return (
            <li key={r.id} className={`rounded-lg border p-2 ${r.id === personId ? 'border-amber-700 bg-amber-50' : 'border-stone-200'} ${r.twinWithPrevious ? 'ml-6' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-6 text-center text-sm text-stone-500">{numberRows(rows).get(r.id)}</span>
                <span className="flex-1">
                  <span className="font-medium">{displayName(p, lang).text}</span>
                  {p && lifespan(p, lang) && <span className="ml-2 text-sm text-stone-500">{lifespan(p, lang)}</span>}
                </span>
                <button type="button" aria-label={t('order.up')} disabled={i === 0} onClick={() => move(i, -1)} className="size-9 rounded-lg border border-stone-300 disabled:opacity-30">
                  ▲
                </button>
                <button type="button" aria-label={t('order.down')} disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="size-9 rounded-lg border border-stone-300 disabled:opacity-30">
                  ▼
                </button>
              </div>
              {i > 0 && (
                <label className="mt-1 ml-8 flex items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.twinWithPrevious}
                    onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, twinWithPrevious: e.target.checked } : x)))}
                  />
                  {t('order.twin')}
                </label>
              )}
            </li>
          );
        })}
      </ol>
      {save.isError && <p className="mt-3 text-sm text-red-700">{errorMessage(save.error)}</p>}
      <div className={DIALOG_ACTIONS_CLASS}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!group || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('person.saving') : t('common.save')}
        </Button>
      </div>
    </Dialog>
  );
}
