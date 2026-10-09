import { Fragment } from 'react';
import { formatFuzzyDate } from '@/domain/dates/fuzzyDate';
import { SIMPLE_FACTS } from '@/domain/family/personInput';
import { getText, type LocalizedText } from '@/domain/localized/localized';
import { currentFact, displayName, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Button } from '@/components/ui/Button';
import { LanguageToggle } from '@/components/LanguageToggle';

type Props = {
  model: FamilyModel;
  personId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAddRelative: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRelationship: () => void;
  /** this device's "me" person, if set */
  meId?: string | null;
};

/** Profile panel. The graph node stays simple; details live here. */
export function PersonDrawer({ model, personId, onSelect, onClose, onAddRelative, onEdit, onDelete, onRelationship, meId }: Props) {
  const { t, lang } = useI18n();
  const p = model.persons.get(personId);
  if (!p) return null;
  const g = model.graph;
  const other = lang === 'mr' ? 'en' : 'mr';

  const parents = g.parentEdges(personId).map((e) => ({ id: e.parentId, tag: e.lineage === 'biological' || e.lineage === 'unknown' ? null : `lineage.${e.lineage}` }));
  const partners = g.unionsOf(personId).flatMap((u) =>
    u.partnerIds
      .filter((x) => x !== personId)
      .map((id) => ({ id, tag: u.status === 'divorced' || u.status === 'separated' ? `union.${u.status}` : null })),
  );
  const children = g.childEdges(personId).map((e) => ({ id: e.childId, tag: e.lineage === 'biological' || e.lineage === 'unknown' ? null : `lineage.${e.lineage}` }));
  const siblings = g.siblings(personId).map((s) => ({ id: s.id, tag: s.kind === 'full' ? null : `sibling.${s.kind}` }));

  const text = (lt: LocalizedText | null | undefined) => getText(lt, lang)?.text ?? '';
  const nameIn = (forms: Record<string, { full_name: string }> | undefined) => (forms ? (forms[lang] ?? Object.values(forms)[0])?.full_name ?? '' : '');
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  const birthFact = currentFact(p, 'birth');
  const deathFact = currentFact(p, 'death');
  const details: [string, string][] = (
    [
      [t('person.gender'), t(`gender.${p.gender}` as StringKey)],
      [t('person.living'), p.isLiving == null ? '' : p.isLiving ? t('living.yes') : t('living.no')],
      [t('person.birth'), join(formatFuzzyDate(p.birth.date, lang), text(birthFact?.place))],
      [t('person.death'), join(formatFuzzyDate(p.death.date, lang), text(deathFact?.place))],
      ...SIMPLE_FACTS.map((f) => [t(`person.${f.field}` as StringKey), text(currentFact(p, f.type)?.[f.in])] as [string, string]),
      [t('person.nickname'), nameIn(p.otherNames.alias?.forms)],
      [t('person.maidenName'), nameIn(p.otherNames.birth?.forms)],
      [t('person.notes'), text(p.notes)],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const hasRelatives = parents.length + partners.length + children.length + siblings.length > 0;

  return (
    <aside
      aria-label={displayName(p, lang).text}
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[26rem] sm:border-l sm:border-stone-200 sm:shadow-xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
        <div>
          <h2 className="text-xl font-semibold">{p.isPlaceholder ? t('person.unknownParent') : displayName(p, lang).text}</h2>
          {p.names[other] && <p className="text-stone-500">{p.names[other].full_name}</p>}
          {lifespan(p, lang) && <p className="mt-1 text-sm text-stone-500">{lifespan(p, lang)}</p>}
          {meId === personId && <p className="mt-1 inline-block rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800">{t('person.isMe')}</p>}
        </div>
        <span className="ml-auto sm:hidden">
          <LanguageToggle compact />
        </span>
        <button type="button" onClick={onClose} aria-label={t('person.close')} className="-m-1 rounded-lg p-2 text-2xl leading-none text-stone-500 hover:bg-stone-100">
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-stone-200 p-4">
        <Button onClick={onAddRelative}>{t('person.addRelative')}</Button>
        <Button variant="secondary" onClick={onEdit}>
          {t('person.edit')}
        </Button>
        <Button variant="secondary" onClick={onRelationship}>
          {t('person.relationship')}
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={onDelete}>
          {t('person.delete')}
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
        {details.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-stone-500">{label}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </Fragment>
        ))}
      </dl>

      <div className="space-y-4 p-4 pt-0">
        {!hasRelatives && <p className="text-sm text-stone-500">{t('person.noRelatives')}</p>}
        <RelativeList title={t('person.parents')} items={parents} model={model} onSelect={onSelect} />
        <RelativeList title={t('person.partners')} items={partners} model={model} onSelect={onSelect} />
        <RelativeList title={t('person.children')} items={children} model={model} onSelect={onSelect} />
        <RelativeList title={t('person.siblings')} items={siblings} model={model} onSelect={onSelect} />
      </div>
    </aside>
  );
}

function RelativeList({
  title,
  items,
  model,
  onSelect,
}: {
  title: string;
  items: { id: string; tag: string | null }[];
  model: FamilyModel;
  onSelect: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  if (!items.length) return null;
  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-stone-500">{title}</h3>
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {items.map(({ id, tag }) => {
          const person = model.persons.get(id);
          return (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left hover:bg-stone-50">
                <span>
                  {person?.isPlaceholder ? t('person.unknownParent') : displayName(person, lang).text}
                  {tag && <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{t(tag as StringKey)}</span>}
                </span>
                <span className="text-xs text-stone-500">{person ? lifespan(person, lang) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
