import { useMemo } from 'react';
import { upcomingBirthdays } from '@/domain/family/birthdays';
import { displayName, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';

export function birthdaysOf(model: FamilyModel, today = new Date()) {
  return upcomingBirthdays(
    [...model.persons.values()].map((p) => ({ id: p.id, birth: p.birth.date, death: p.death.date, isLiving: p.isLiving, isPlaceholder: p.isPlaceholder })),
    today,
  );
}

/** Birthdays in the next 30 days. Tap a person to open them. */
export function BirthdaysDialog({
  model,
  photoUrl,
  onPick,
  onClose,
}: {
  model: FamilyModel;
  photoUrl: (id: string) => string | undefined;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const list = useMemo(() => birthdaysOf(model), [model]);
  const dateFormat = new Intl.DateTimeFormat(lang === 'mr' ? 'mr-IN' : 'en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <Dialog title={t('birthdays.title')} onClose={onClose}>
      {list.length === 0 && <p className="text-stone-600">{t('birthdays.none')}</p>}
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {list.map((b) => {
          const name = displayName(model.persons.get(b.id), lang).text;
          const when = b.inDays === 0 ? `🎂 ${t('birthdays.today')}` : b.inDays === 1 ? t('birthdays.tomorrow') : t('birthdays.inDays', { count: b.inDays });
          return (
            <li key={b.id}>
              <button type="button" onClick={() => onPick(b.id)} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-50 ${b.inDays === 0 ? 'bg-amber-50' : ''}`}>
                <Avatar url={photoUrl(b.id)} name={name} />
                <span className="flex-1">
                  <span className="block font-medium">{name}</span>
                  <span className="block text-sm text-stone-500">
                    {dateFormat.format(new Date(Date.UTC(2000, b.month - 1, b.day)))}
                    {b.turns != null && ` · ${t('birthdays.turns', { count: b.turns })}`}
                  </span>
                </span>
                <span className={`text-sm ${b.inDays === 0 ? 'font-semibold text-amber-800' : 'text-stone-500'}`}>{when}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
