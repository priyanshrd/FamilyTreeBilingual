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

/** Above this many people the tree shows the neighbourhood of the selected person by default. */
const SHOW_ALL_LIMIT = 150;
const FOCUS_DEPTH = 4;

type View = 'family' | 'tree' | 'list';

type Modal = { kind: 'relationship'; a: string | null; b: string | null } | { kind: 'add' } | { kind: 'order' } | { kind: 'edit' } | { kind: 'delete' } | { kind: 'first' } | { kind: 'settings' } | null;

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
    <div className={`flex h-dvh flex-col bg-stone-50 transition-[padding] ${panelOpen ? SIDEBAR_RESERVE_CLASS : ''}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
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

      <main className="relative flex-1">
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
            {view === 'list' ? (
              <PeopleList model={model} onPick={(id) => { setView('family'); select(id); }} />
            ) : (
              layout && (
                <TreeCanvas
                  model={model}
                  layout={layout}
                  selectedId={selectedId}
                  highlight={highlight ?? undefined}
                  centerOn={centerOn}
                  onSelect={(id) => select(id)}
                />
              )
            )}
            <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-white/95 p-1.5 text-sm shadow-sm">
              <div role="group" aria-label={t('view.label')} className="inline-flex rounded-md border border-stone-200 p-0.5">
                {(['family', 'tree', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`min-h-8 rounded px-2.5 ${view === v ? 'bg-amber-800 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
              {view === 'family' && history.length > 0 && (
                <button type="button" onClick={back} className="min-h-8 rounded px-2 text-amber-800 hover:bg-amber-50">
                  {t('view.back')}
                </button>
              )}
              {highlight && (
                <button type="button" onClick={() => setHighlight(null)} className="min-h-8 rounded px-2 text-sky-700 hover:bg-sky-50">
                  ✕ {t('rel.clearPath')}
                </button>
              )}
              {view !== 'list' && (
                <button type="button" onClick={() => void saveImage()} disabled={exporting} className="min-h-8 rounded px-2 text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                  ⤓ {exporting ? t('export.saving') : t('export.png')}
                </button>
              )}
              <span className="px-1 text-stone-500">{t('workspace.count', { count: [...model.persons.values()].filter((p) => !p.isPlaceholder).length })}</span>
              {view === 'tree' && large && (
                <button type="button" className="text-amber-800 underline" onClick={() => setShowAll(!everyone)}>
                  {everyone ? t('workspace.showNearby') : t('workspace.showAll')}
                </button>
              )}
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
            meId={familyId ? deviceSettings.mePersonId(familyId) : null}
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
    </div>
  );
}

function firstPerson(model: FamilyModel): string | null {
  for (const p of model.persons.values()) if (!p.isPlaceholder) return p.id;
  return null;
}
