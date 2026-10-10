import { useMemo } from 'react';
import { upcomingBirthdays } from '@/domain/family/birthdays';
import { displayName, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';

/** Birthdays coming up in the next `days` days (a whole year by default), soonest first. */
export function birthdaysOf(model: FamilyModel, today = new Date(), days = 366) {
  return upcomingBirthdays(
    [...model.persons.values()].map((p) => ({ id: p.id, birth: p.birth.date, death: p.death.date, isLiving: p.isLiving, isPlaceholder: p.isPlaceholder })),
    today,
    days,
  );
}

/** Everyone's birthday over the coming year, in date order and grouped by month. Tap a person to open them. */
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
  const locale = lang === 'mr' ? 'mr-IN' : 'en-IN';
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  // one section per month, starting with this month (next year's months carry their year)
  const groups = useMemo(() => {
    const today = new Date();
    const out: { key: string; label: string; items: typeof list }[] = [];
    for (const b of list) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + b.inDays);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (out.at(-1)?.key !== key) out.push({ key, label: monthFormat.format(date), items: [] });
      out.at(-1)!.items.push(b);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthFormat follows lang
  }, [list, lang]);
  return (
    <Dialog title={t('birthdays.title')} onClose={onClose}>
      {list.length === 0 && <p className="text-stone-600">{t('birthdays.none')}</p>}
      <div className="space-y-4">
        {groups.map(({ key, label, items }) => (
          <section key={key}>
            <h3 className="mb-1 text-sm font-semibold text-stone-600">{label}</h3>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {items.map((b) => {
                const name = displayName(model.persons.get(b.id), lang).text;
                const when =
                  b.inDays === 0 ? `🎂 ${t('birthdays.today')}` : b.inDays === 1 ? t('birthdays.tomorrow') : b.inDays < 31 ? t('birthdays.inDays', { count: b.inDays }) : '';
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onPick(b.id)}
                      className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-50 ${b.inDays === 0 ? 'bg-amber-50' : ''}`}
                    >
                      <Avatar url={photoUrl(b.id)} name={name} />
                      <span className="flex-1">
                        <span className="block font-medium">{name}</span>
                        <span className="block text-sm text-stone-600">
                          {dateFormat.format(new Date(Date.UTC(2000, b.month - 1, b.day)))}
                          {b.turns != null && ` · ${t('birthdays.turns', { count: b.turns })}`}
                        </span>
                      </span>
                      {when && <span className={`text-sm ${b.inDays === 0 ? 'font-semibold text-amber-800' : 'text-stone-600'}`}>{when}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
