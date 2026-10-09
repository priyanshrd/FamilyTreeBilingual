import { useEffect, useMemo, useRef, useState } from 'react';
import { AddRelativeDialog } from '@/components/person/AddRelativeDialog';
import { DeletePersonDialog } from '@/components/person/DeletePersonDialog';
import { BirthOrderDialog } from '@/components/person/BirthOrderDialog';
import { EditPersonDialog } from '@/components/person/EditPersonDialog';
import { PersonDrawer } from '@/components/person/PersonDrawer';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SearchBox } from '@/components/SearchBox';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TreeCanvas } from '@/components/tree/TreeCanvas';
import { Button } from '@/components/ui/Button';
import { SIDEBAR_RESERVE_CLASS } from '@/components/ui/Dialog';
import { ErrorMessage, Loading } from '@/components/ui/Status';
import type { FamilyModel } from '@/domain/family/familyModel';
import { getText } from '@/domain/localized/localized';
import { exportFileName, exportVisibleTree } from '@/export/exportView';
import { familyViewLayout } from '@/graph/familyView';
import { layoutTree } from '@/graph/layout';
import { neighbourhood } from '@/graph/projection';
import { PeopleList } from '@/components/PeopleList';
import { useFamily, useFamilyModel, useRefreshFamily } from '@/hooks/useFamily';
import { useI18n } from '@/i18n/I18nProvider';
import { useKinshipTerms } from '@/hooks/useKinshipTerms';
import { RelationshipFinder } from '@/components/relationship/RelationshipFinder';
import { deviceSettings } from '@/services/deviceSettings';
import { fillMissingNames, refreshAutoNames, repairNamedPlaceholders } from '@/services/repositories/personRepo';
import { transliterate } from '@/domain/language/transliterate';
import { BirthdaysDialog, birthdaysOf } from '@/components/BirthdaysDialog';
import { KinshipResolver } from '@/domain/kinship/resolve';
import { labelRelationship } from '@/domain/kinship/terms';
import { toTables } from '@/services/repositories/kinshipRepo';
import { usePhotoUrls } from '@/services/repositories/photoRepo';
import { undoLast, useUndoList, type UndoEntry } from '@/services/undo';

/** Toolbar button */
const TOOL = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-amber-800 hover:bg-amber-50 disabled:opacity-40';
/** Toolbar button with an icon; on phones the label sits under the icon */
const TOOL_ICON = `${TOOL} max-sm:flex-col max-sm:gap-0 max-sm:px-2`;
const ICON = 'text-base leading-none';
const ICON_LABEL = 'max-sm:text-xs';

/** Above this many people the tree shows the neighbourhood of the selected person by default. */
const SHOW_ALL_LIMIT = 150;
const FOCUS_DEPTH = 4;

type View = 'family' | 'tree' | 'list';

type Modal = { kind: 'relationship'; a: string | null; b: string | null } | { kind: 'add' } | { kind: 'order' } | { kind: 'edit' } | { kind: 'delete' } | { kind: 'first' } | { kind: 'settings' } | { kind: 'birthdays' } | null;

export function WorkspacePage() {
  const { t, lang } = useI18n();
  const family = useFamily();
  const familyId = family.data?.id;
  const modelQuery = useFamilyModel(familyId);
  const refresh = useRefreshFamily(familyId);
  const model = modelQuery.data;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [showAll, setShowAll] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('family');
  const [focus, setFocus] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const terms = useKinshipTerms(familyId);

  // "me" is remembered per browser (no accounts): it decides the "your uncle" labels
  const [meVersion, setMeVersion] = useState(0);
  const meId = useMemo(() => (familyId ? deviceSettings.mePersonId(familyId) : null), [familyId, meVersion, modal]); // eslint-disable-line react-hooks/exhaustive-deps
  function toggleMe(id: string) {
    if (!familyId) return;
    deviceSettings.setMePersonId(familyId, meId === id ? null : id);
    setMeVersion((v) => v + 1);
  }
  const relations = useMemo(() => {
    const out = new Map<string, string>();
    if (!model || !meId || !model.persons.has(meId)) return out;
    const resolver = new KinshipResolver(model.graph);
    const table = toTables(terms.rows)[lang];
    for (const p of model.persons.values()) {
      if (p.isPlaceholder) continue;
      if (p.id === meId) {
        out.set(p.id, t('me.you'));
        continue;
      }
      const r = resolver.find(meId, p.id);
      if (r.kind === 'none') continue;
      out.set(p.id, labelRelationship(r, lang, table).text);
    }
    return out;
  }, [model, meId, terms.rows, lang, t]);

  const thumbs = useMemo(() => (model ? [...model.persons.values()].flatMap((p) => (p.photo?.thumb ? [p.photo.thumb] : [])) : []), [model]);
  const photoUrls = usePhotoUrls(thumbs);
  const photoUrl = useMemo(() => {
    return (id: string) => {
      const thumb = model?.persons.get(id)?.photo?.thumb;
      return thumb ? photoUrls.get(thumb) : undefined;
    };
  }, [model, photoUrls]);

  const birthdays = useMemo(() => (model ? birthdaysOf(model) : []), [model]);

  // The header stays put when a side panel opens; panels start just below it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--header-h');
    };
  }, []);

  // Undo: the last changes made in this tab; a short message offers Undo after each save.
  const undoList = useUndoList();
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState<{ kind: 'saved' | 'done'; entry: UndoEntry } | { kind: 'failed'; reason: string } | null>(null);
  const undoText = (e: UndoEntry) => t(`undo.${e.kind}`, { name: e.name });
  const lastUndoCount = useRef(undoList.length);
  useEffect(() => {
    const last = undoList[undoList.length - 1];
    if (undoList.length > lastUndoCount.current && last) setToast({ kind: 'saved', entry: last });
    lastUndoCount.current = undoList.length;
  }, [undoList]);
  // long enough to read and reach (older eyes, slow taps); paused while the pointer or focus is on it
  const [toastHeld, setToastHeld] = useState(false);
  useEffect(() => {
    if (!toast || toastHeld) return;
    const id = setTimeout(() => setToast(null), 25000);
    return () => clearTimeout(id);
  }, [toast, toastHeld]);
  async function undo() {
    setUndoing(true);
    try {
      const entry = await undoLast();
      await Promise.all([refresh(), terms.refresh()]);
      if (entry) setToast({ kind: 'done', entry });
    } catch (e) {
      setToast({ kind: 'failed', reason: (e as Error).message });
    } finally {
      setUndoing(false);
    }
  }

  // Once per visit: tidy data entered before recent fixes (named placeholders, missing or outdated
  // automatic names). Never changes anything typed by hand.
  const backfilled = useRef(false);
  useEffect(() => {
    if (!model || !familyId || backfilled.current || !deviceSettings.autoFill()) return;
    backfilled.current = true;
    const people = [...model.persons.values()];
    void (async () => {
      const changed =
        (await repairNamedPlaceholders(people)) +
        (await fillMissingNames(familyId, people, 'mr', transliterate)) +
        (await fillMissingNames(familyId, people, 'en', transliterate)) +
        (await refreshAutoNames(people, transliterate));
      if (changed) await refresh();
    })().catch(() => {
      backfilled.current = false;
    });
  }, [model, familyId, refresh]);

  const lastId = familyId ? deviceSettings.lastPersonId(familyId) : null;
  const fallbackFocus = lastId && model?.persons.has(lastId) ? lastId : model ? firstPerson(model) : null;
  const focusId = (focus && model?.persons.has(focus) ? focus : null) ?? (selectedId && model?.persons.has(selectedId) ? selectedId : null) ?? fallbackFocus;
  const large = (model?.persons.size ?? 0) > SHOW_ALL_LIMIT;
  const everyone = showAll ?? !large;

  const visible = useMemo(() => {
    if (!model) return new Set<string>();
    if (everyone || !focusId) return new Set(model.persons.keys());
    return neighbourhood(model.graph, focusId, FOCUS_DEPTH);
  }, [model, everyone, focusId]);

  const layout = useMemo(() => {
    if (!model || !focusId || view === 'list') return null;
    return view === 'family' ? familyViewLayout(model.graph, focusId) : layoutTree(model.graph, visible);
  }, [model, focusId, view, visible]);

  /**
   * Select a person. They also become the centre of the family view (with Back history), whichever
   * view they were picked in, so switching to Family view opens their family.
   */
  function select(id: string, center = false) {
    setSelectedId(id);
    if (familyId) deviceSettings.setLastPersonId(familyId, id);
    if (focusId && focusId !== id) setHistory((h) => [...h.slice(-49), focusId]);
    setFocus(id);
    if (center && view !== 'family') setCenterOn(id);
  }

  const [exporting, setExporting] = useState(false);
  async function saveImage() {
    const el = document.querySelector<HTMLElement>('main .react-flow');
    if (!el) return;
    setExporting(true);
    try {
      await exportVisibleTree(el, exportFileName(title, t(`view.${view}`)));
    } catch {
      alert(t('export.failed'));
    } finally {
      setExporting(false);
    }
  }

  function back() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setFocus(prev);
    setSelectedId(prev);
  }

  async function afterChange(id?: string) {
    setModal(null);
    await refresh();
    if (id) select(id, true);
  }

  const title = getText(family.data?.name, lang)?.text ?? t('app.title');
  // The sidebar (person panel or a form) takes the right edge; header and tree shrink beside it.
  const panelOpen = modal != null || Boolean(selectedId && model?.persons.has(selectedId));

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header ref={headerRef} className="relative z-50 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <h1 className="mr-auto text-lg font-semibold text-amber-900">{title}</h1>
        <div className="order-last w-full sm:order-none sm:w-auto">
          {model && model.persons.size > 0 && <SearchBox model={model} onPick={(id) => select(id, true)} />}
        </div>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <Button variant="ghost" onClick={() => setModal({ kind: 'settings' })} aria-label={t('settings.open')}>
            ⚙
          </Button>
        </div>
      </header>

      <main className={`relative flex min-h-0 flex-1 flex-col transition-[padding] ${panelOpen ? SIDEBAR_RESERVE_CLASS : ''}`}>
        {(family.isPending || (familyId && modelQuery.isPending)) && <Loading />}
        {(family.isError || modelQuery.isError) && (
          <div className="p-4">
            <ErrorMessage onRetry={() => void (family.isError ? family.refetch() : modelQuery.refetch())} />
            <p className="mt-2 text-sm text-stone-500">{String((family.error ?? modelQuery.error) as Error)}</p>
          </div>
        )}

        {model && model.persons.size === 0 && (
          <div className="mx-auto max-w-lg p-6 text-center">
            <h2 className="text-2xl font-semibold">{t('workspace.empty.title')}</h2>
            <p className="mt-2 text-stone-600">{t('workspace.empty.body')}</p>
            <Button className="mt-6" onClick={() => setModal({ kind: 'first' })}>
              {t('person.add')}
            </Button>
          </div>
        )}

        {model && model.persons.size > 0 && (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-stone-200 bg-white px-2 py-1.5 text-sm whitespace-nowrap sm:gap-1.5 sm:px-3">
              <div role="group" aria-label={t('view.label')} className="inline-flex shrink-0 rounded-lg border border-stone-200 p-0.5 max-sm:flex max-sm:w-full">
                {(['family', 'tree', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`min-h-10 rounded-md px-3 max-sm:flex-1 max-sm:px-1 max-sm:leading-tight max-sm:whitespace-normal ${view === v ? 'bg-amber-800 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
              {view === 'family' && history.length > 0 && (
                <button type="button" onClick={back} className={TOOL}>
                  {t('view.back')}
                </button>
              )}
              {highlight && (
                <button type="button" onClick={() => setHighlight(null)} className={`${TOOL} text-sky-700 hover:bg-sky-50`}>
                  ✕ {t('rel.clearPath')}
                </button>
              )}
              <span className="hidden flex-1 sm:block" />
              <button
                type="button"
                onClick={() => void undo()}
                disabled={undoing || undoList.length === 0}
                title={undoList.length ? t('undo.title', { what: undoText(undoList[undoList.length - 1]!) }) : t('undo.nothing')}
                className={TOOL_ICON}
              >
                <span aria-hidden className={ICON}>
                  ↶
                </span>
                <span className={ICON_LABEL}>{t('undo.button')}</span>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'birthdays' })} className={TOOL_ICON}>
                <span aria-hidden className={`${ICON} relative`}>
                  🎂
                  {birthdays.length > 0 && (
                    <span className="absolute -top-1.5 -right-3 rounded-full bg-amber-700 px-1.5 text-xs leading-4 text-white sm:static sm:ml-1">{birthdays.length}</span>
                  )}
                </span>
                <span className={ICON_LABEL}>{t('birthdays.button')}</span>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'first' })} title={t('toolbar.addPersonHelp')} className={TOOL}>
                + {t('toolbar.addPerson')}
              </button>
              {view !== 'list' && (
                <button type="button" onClick={() => void saveImage()} disabled={exporting} title={t('export.png')} className={TOOL_ICON}>
                  <span aria-hidden className={ICON}>
                    ⤓
                  </span>
                  <span className={ICON_LABEL}>
                    <span className="sm:hidden">{t('export.short')}</span>
                    <span className="max-sm:hidden">{exporting ? t('export.saving') : t('export.png')}</span>
                  </span>
                </button>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              {view === 'list' ? (
                <PeopleList
                  model={model}
                  photoUrl={photoUrl}
                  relations={relations}
                  onPick={(id) => {
                    setView('family');
                    select(id);
                  }}
                />
              ) : (
                layout && (
                  <TreeCanvas
                    model={model}
                    layout={layout}
                    selectedId={selectedId}
                    highlight={highlight ?? undefined}
                    centerOn={centerOn}
                    focusId={focusId}
                    onSelect={(id) => select(id)}
                    photoUrl={photoUrl}
                    relations={relations}
                  />
                )
              )}
              <div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-2 text-xs text-stone-500">
                <span className="rounded bg-white/80 px-1.5 py-0.5">
                  {t('workspace.count', { count: [...model.persons.values()].filter((p) => !p.isPlaceholder).length })}
                </span>
                {view === 'tree' && large && (
                  <button type="button" className="pointer-events-auto rounded bg-white/80 px-1.5 py-0.5 text-amber-800 underline" onClick={() => setShowAll(!everyone)}>
                    {everyone ? t('workspace.showNearby') : t('workspace.showAll')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {model && selectedId && model.persons.has(selectedId) && (
          <PersonDrawer
            model={model}
            personId={selectedId}
            onSelect={(id) => select(id, true)}
            onClose={() => setSelectedId(null)}
            onAddRelative={() => setModal({ kind: 'add' })}
            onEdit={() => setModal({ kind: 'edit' })}
            onDelete={() => setModal({ kind: 'delete' })}
            onBirthOrder={() => setModal({ kind: 'order' })}
            onRelationship={() => {
              const me = familyId ? deviceSettings.mePersonId(familyId) : null;
              setModal({ kind: 'relationship', a: me && me !== selectedId ? me : null, b: selectedId });
            }}
            meId={meId}
            onToggleMe={() => toggleMe(selectedId)}
            relationToMe={selectedId !== meId ? relations.get(selectedId) : undefined}
            familyId={familyId!}
            onChanged={() => void refresh()}
          />
        )}
      </main>

      {model && selectedId && modal?.kind === 'order' && (
        <BirthOrderDialog model={model} personId={selectedId} onClose={() => setModal(null)} onDone={() => void afterChange(selectedId)} />
      )}
      {model && familyId && modal?.kind === 'relationship' && (
        <RelationshipFinder
          model={model}
          familyId={familyId}
          initialA={modal.a}
          initialB={modal.b}
          terms={terms}
          onClose={() => setModal(null)}
          onShowPath={(ids) => {
            setHighlight(new Set(ids));
            setView('tree');
            const last = ids[ids.length - 1];
            if (last) setCenterOn(last);
          }}
        />
      )}
      {model && modal?.kind === 'birthdays' && (
        <BirthdaysDialog
          model={model}
          photoUrl={photoUrl}
          onClose={() => setModal(null)}
          onPick={(id) => {
            setModal(null);
            select(id, true);
          }}
        />
      )}
      {modal?.kind === 'settings' && (
        <SettingsDialog familyId={familyId} model={model} onClose={() => setModal(null)} onChanged={() => void refresh()} />
      )}
      {modal?.kind === 'first' && familyId && (
        <EditPersonDialog familyId={familyId} person={null} onClose={() => setModal(null)} onDone={(id) => void afterChange(id)} />
      )}
      {model && selectedId && familyId && modal?.kind === 'add' && (
        <AddRelativeDialog model={model} anchorId={selectedId} onClose={() => setModal(null)} onDone={(id) => void afterChange(id)} />
      )}
      {model && selectedId && familyId && modal?.kind === 'edit' && (
        <EditPersonDialog
          familyId={familyId}
          person={model.persons.get(selectedId)!}
          onClose={() => setModal(null)}
          onDone={(id) => void afterChange(id)}
        />
      )}
      {model && selectedId && modal?.kind === 'delete' && (
        <DeletePersonDialog
          person={model.persons.get(selectedId)!}
          onClose={() => setModal(null)}
          onDone={() => {
            setSelectedId(null);
            void afterChange();
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          onMouseEnter={() => setToastHeld(true)}
          onMouseLeave={() => setToastHeld(false)}
          onFocus={() => setToastHeld(true)}
          onBlur={() => setToastHeld(false)}
          className={`fixed top-2 left-1/2 z-[60] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 py-2 pr-2 pl-4 text-sm text-white shadow-lg sm:top-auto sm:bottom-4 ${
            panelOpen ? 'sm:-ml-[13rem]' : ''
          }`}
        >
          <span className="truncate">
            {toast.kind === 'failed' ? t('undo.failed', { reason: toast.reason }) : t(`undo.${toast.kind}`, { what: undoText(toast.entry) })}
          </span>
          {toast.kind === 'saved' && undoList.at(-1)?.id === toast.entry.id && (
            <button type="button" onClick={() => void undo()} disabled={undoing} className="min-h-10 shrink-0 rounded-lg px-3 font-semibold text-amber-300 hover:bg-white/10">
              ↶ {t('undo.button')}
            </button>
          )}
          <button type="button" onClick={() => setToast(null)} aria-label={t('person.close')} className="min-h-10 shrink-0 rounded-lg px-2 text-stone-400 hover:bg-white/10">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function firstPerson(model: FamilyModel): string | null {
  for (const p of model.persons.values()) if (!p.isPlaceholder) return p.id;
  return null;
}
