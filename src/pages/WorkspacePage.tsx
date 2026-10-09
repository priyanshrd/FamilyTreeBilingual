import { useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { AddRelativeDialog } from '@/components/person/AddRelativeDialog';
import { DeletePersonDialog } from '@/components/person/DeletePersonDialog';
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
import { neighbourhood } from '@/graph/projection';
import { useFamily, useFamilyModel, useRefreshFamily } from '@/hooks/useFamily';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';

/** Above this many people the tree shows the neighbourhood of the selected person by default. */
const SHOW_ALL_LIMIT = 150;
const FOCUS_DEPTH = 4;

type Modal = { kind: 'add' } | { kind: 'edit' } | { kind: 'delete' } | { kind: 'first' } | { kind: 'settings' } | null;

export function WorkspacePage() {
  const { t, lang } = useI18n();
  const { signOut } = useAuth();
  const family = useFamily();
  const familyId = family.data?.id;
  const modelQuery = useFamilyModel(familyId);
  const refresh = useRefreshFamily(familyId);
  const model = modelQuery.data;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [showAll, setShowAll] = useState<boolean | null>(null);

  const lastId = familyId ? deviceSettings.lastPersonId(familyId) : null;
  const focusId = selectedId ?? (lastId && model?.persons.has(lastId) ? lastId : model ? firstPerson(model) : null);
  const large = (model?.persons.size ?? 0) > SHOW_ALL_LIMIT;
  const everyone = showAll ?? !large;

  const visible = useMemo(() => {
    if (!model) return new Set<string>();
    if (everyone || !focusId) return new Set(model.persons.keys());
    return neighbourhood(model.graph, focusId, FOCUS_DEPTH);
  }, [model, everyone, focusId]);

  function select(id: string, center = false) {
    setSelectedId(id);
    if (familyId) deviceSettings.setLastPersonId(familyId, id);
    if (center) setCenterOn(id);
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
          <span className="hidden sm:block">
            <LanguageToggle />
          </span>
          <Button variant="ghost" onClick={() => setModal({ kind: 'settings' })} aria-label={t('settings.open')}>
            ⚙
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('common.signOut')}
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
            <TreeCanvas model={model} visible={visible} selectedId={selectedId} centerOn={centerOn} onSelect={(id) => select(id)} />
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-sm shadow-sm">
              <span className="text-stone-600">{t('workspace.count', { count: [...model.persons.values()].filter((p) => !p.isPlaceholder).length })}</span>
              {large && (
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
          />
        )}
      </main>

      {modal?.kind === 'settings' && <SettingsDialog onClose={() => setModal(null)} />}
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
