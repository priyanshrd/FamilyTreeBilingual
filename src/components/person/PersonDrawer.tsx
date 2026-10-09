import { Fragment, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatFuzzyDate } from '@/domain/dates/fuzzyDate';
import { SIMPLE_FACTS } from '@/domain/family/personInput';
import { siblingGroup } from '@/domain/family/birthOrder';
import { getText, type LocalizedText } from '@/domain/localized/localized';
import { currentFact, displayName, isUnknown, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Button } from '@/components/ui/Button';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Avatar } from '@/components/ui/Avatar';
import { removeProfilePhoto, setProfilePhoto, usePhotoUrls } from '@/services/repositories/photoRepo';
import { recordChange } from '@/services/undo';
import { errorMessage } from './AddRelativeDialog';

type Props = {
  model: FamilyModel;
  personId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAddRelative: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRelationship: () => void;
  onBirthOrder: () => void;
  /** this device's "me" person, if set */
  meId?: string | null;
  onToggleMe: () => void;
  /** how this person is related to "me", e.g. "uncle" */
  relationToMe?: string;
  familyId: string;
  /** after a photo change */
  onChanged: () => void;
};

/** Height of the person panel on phones; the tree centres the selected person in the space above it. */
export const PHONE_SHEET_FRACTION = 0.55;
const PHONE_SHEET_CLASS = 'max-h-[55dvh]';

/** Profile panel. The graph node stays simple; details live here. */
export function PersonDrawer({
  model,
  personId,
  onSelect,
  onClose,
  onAddRelative,
  onEdit,
  onDelete,
  onRelationship,
  onBirthOrder,
  meId,
  onToggleMe,
  relationToMe,
  familyId,
  onChanged,
}: Props) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const p = model.persons.get(personId);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoUrls = usePhotoUrls(p?.photo ? [p.photo.path] : []);
  const photo = useMutation({
    mutationFn: ({ file }: { file: File | null }) =>
      recordChange(file ? 'photo' : 'photoRemove', displayName(p, lang).text, () => (file ? setProfilePhoto(familyId, p!, file) : removeProfilePhoto(p!))),
    onSuccess: onChanged,
  });
  if (!p) return null;
  const unknown = isUnknown(p);
  const g = model.graph;
  const other = lang === 'mr' ? 'en' : 'mr';

  const parents = g.parentEdges(personId).map((e) => ({ id: e.parentId, tag: e.lineage === 'biological' || e.lineage === 'unknown' ? null : `lineage.${e.lineage}` }));
  const partners = g.unionsOf(personId).flatMap((u) =>
    u.partnerIds
      .filter((x) => x !== personId)
      .map((id) => ({ id, tag: u.status === 'divorced' || u.status === 'separated' ? `union.${u.status}` : null })),
  );
  const children = g.childEdges(personId).map((e) => ({ id: e.childId, tag: e.lineage === 'biological' || e.lineage === 'unknown' ? null : `lineage.${e.lineage}` }));
  const siblings = g
    .siblings(personId)
    .map((s) => ({ id: s.id, tag: g.isTwin(personId, s.id) ? 'sibling.twin' : s.kind === 'full' ? null : `sibling.${s.kind}` }));
  const canOrder = (siblingGroup(g, personId)?.childIds.length ?? 0) >= 2;

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
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] sm:top-[var(--header-h,0px)] sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-xl ${
        expanded ? 'top-0 rounded-none' : PHONE_SHEET_CLASS
      }`}
    >
      {/* phones: the panel is a bottom sheet so the tree stays visible above it; tap the bar for full height */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? t('person.collapse') : t('person.expand')}
        aria-expanded={expanded}
        className="flex min-h-11 w-full shrink-0 items-center justify-center sm:hidden"
      >
        <span className="h-1.5 w-14 rounded-full bg-stone-400" />
      </button>
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4 pt-1 sm:pt-4">
        {!unknown && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={photo.isPending}
            aria-label={p.photo ? t('photo.change') : t('photo.add')}
            className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-amber-700"
          >
            <Avatar url={p.photo ? photoUrls.get(p.photo.path) : null} name={displayName(p, lang).text} size={72} className={photo.isPending ? 'opacity-40' : ''} />
            <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-sm shadow-sm" aria-hidden>
              📷
            </span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) photo.mutate({ file });
          }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{unknown ? t('person.unknownParent') : displayName(p, lang).text}</h2>
          {p.names[other] && <p className="text-stone-500">{p.names[other].full_name}</p>}
          {lifespan(p, lang) && <p className="mt-1 text-sm text-stone-500">{lifespan(p, lang)}</p>}
          {meId === personId ? (
            <p className="mt-1 inline-block rounded bg-sky-100 px-2 py-0.5 text-sm text-sky-800">{t('person.isMe')}</p>
          ) : (
            relationToMe && <p className="mt-1 inline-block rounded bg-sky-50 px-2 py-0.5 text-sm text-sky-800">{t('me.relation', { rel: relationToMe })}</p>
          )}
        </div>
        {/* the page header (with its language switch) is hidden only when the panel fills the phone screen */}
        {expanded && (
          <span className="ml-auto sm:hidden">
            <LanguageToggle compact />
          </span>
        )}
        <button type="button" onClick={onClose} aria-label={t('person.close')} className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-stone-500 hover:bg-stone-100">
          ×
        </button>
      </div>

      {(photo.isPending || photo.isError || p.photo) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2 text-sm">
          {photo.isPending && <span className="text-stone-500">{t('photo.uploading')}</span>}
          {photo.isError && (
            <span role="alert" className="text-red-700">
              {errorMessage(photo.error)}
            </span>
          )}
          {p.photo && !photo.isPending && (
            <>
              <button type="button" className="min-h-11 text-amber-800 hover:underline" onClick={() => fileInput.current?.click()}>
                {t('photo.change')}
              </button>
              <button type="button" className="min-h-11 text-red-700 hover:underline" onClick={() => photo.mutate({ file: null })}>
                {t('photo.remove')}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-stone-200 p-4">
        <Button onClick={onAddRelative}>{t('person.addRelative')}</Button>
        <Button variant="secondary" onClick={onEdit}>
          {t('person.edit')}
        </Button>
        <Button variant="secondary" onClick={onRelationship}>
          {t('person.relationship')}
        </Button>
        {!unknown && (
          <Button variant="secondary" aria-pressed={meId === personId} onClick={onToggleMe} title={t('me.help')}>
            {meId === personId ? `✓ ${t('me.set')}` : t('me.set')}
          </Button>
        )}
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
        {canOrder && (
          <button type="button" onClick={onBirthOrder} className="min-h-11 text-sm text-amber-800 hover:underline">
            ⇅ {t('person.birthOrder')}
          </button>
        )}
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
                  {isUnknown(person) ? t('person.unknownParent') : displayName(person, lang).text}
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
