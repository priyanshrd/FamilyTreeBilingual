import { useMutation } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { displayName, type FamilyModel } from '@/domain/family/familyModel';
import { EMPTY_PERSON, validatePersonInput, type InputErrors, type PersonInput } from '@/domain/family/personInput';
import type { Gender } from '@/domain/genealogy/graph';
import { fillOtherLanguage } from '@/domain/family/personInput';
import { transliterate } from '@/domain/language/transliterate';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import type { StringKey } from '@/i18n/strings';
import { addRelative, connectExisting, saveBirthOrder, type Relation, type RelationOptions } from '@/services/repositories/personRepo';
import { numberRows, placeNewSibling, rowsFromGroup, siblingGroup, type RelativePosition } from '@/domain/family/birthOrder';
import { Button } from '@/components/ui/Button';
import { Choice } from '@/components/ui/Choice';
import { DIALOG_ACTIONS_CLASS, Dialog } from '@/components/ui/Dialog';
import { PersonPicker } from '@/components/PersonPicker';
import { DuplicateWarning, useDuplicates } from './DuplicateWarning';
import { PersonForm } from './PersonForm';

type Kind = 'father' | 'mother' | 'spouse' | 'son' | 'daughter' | 'brother' | 'sister' | 'adoptiveParent' | 'stepParent';

const KINDS: { kind: Kind; relation: Relation; gender: Gender }[] = [
  { kind: 'father', relation: 'parent', gender: 'male' },
  { kind: 'mother', relation: 'parent', gender: 'female' },
  { kind: 'spouse', relation: 'spouse', gender: 'unknown' },
  { kind: 'son', relation: 'child', gender: 'male' },
  { kind: 'daughter', relation: 'child', gender: 'female' },
  { kind: 'brother', relation: 'sibling', gender: 'male' },
  { kind: 'sister', relation: 'sibling', gender: 'female' },
  { kind: 'adoptiveParent', relation: 'adoptive_parent', gender: 'unknown' },
  { kind: 'stepParent', relation: 'step_parent', gender: 'unknown' },
];

type Props = { model: FamilyModel; anchorId: string; onClose: () => void; onDone: (personId: string) => void };

export function AddRelativeDialog({ model, anchorId, onClose, onDone }: Props) {
  const { t, lang } = useI18n();
  const anchorName = displayName(model.persons.get(anchorId), lang).text;
  const [step, setStep] = useState<'choose' | 'new' | 'connect'>('choose');
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null);

  // new-person state
  const [input, setInput] = useState<PersonInput>(EMPTY_PERSON);
  const [errors, setErrors] = useState<InputErrors>({});
  // connect state
  const [otherId, setOtherId] = useState<string | null>(null);
  const [connectRelation, setConnectRelation] = useState<Relation>('spouse');
  // shared
  const relation = step === 'connect' ? connectRelation : (kind?.relation ?? 'spouse');
  const [options, setOptions] = useState<RelationOptions>({});
  const [position, setPosition] = useState<RelativePosition | 'unknown'>('unknown');
  const context = useRelationContext(model, anchorId, relation);
  const effectiveOptions = { ...context.defaults, ...options };

  const nearby = useMemo(
    () => [anchorId, ...model.graph.parents(anchorId), ...model.graph.children(anchorId), ...model.graph.partners(anchorId)],
    [model, anchorId],
  );
  const duplicates = useDuplicates(model, input, nearby).filter((m) => m.id !== anchorId);

  const save = useMutation({
    mutationFn: async () => {
      const before = siblingGroup(model.graph, anchorId);
      const res =
        step === 'connect'
          ? await connectExisting(anchorId, otherId!, relation, effectiveOptions)
          : await addRelative(anchorId, relation, deviceSettings.autoFill() ? fillOtherLanguage(input, transliterate) : input, effectiveOptions);
      // optional birth order relative to the person they were added from
      if (relation === 'sibling' && position !== 'unknown') {
        const parentIds = res.placeholder_id ? [res.placeholder_id] : (effectiveOptions.parent_ids ?? before?.parentIds ?? []);
        const rows = before ? rowsFromGroup(before) : [{ id: anchorId, twinWithPrevious: false }];
        await saveBirthOrder(parentIds, numberRows(placeNewSibling(rows, anchorId, res.person_id, position)));
      }
      return res.person_id;
    },
    onSuccess: (id) => onDone(id),
  });

  function choose(k: (typeof KINDS)[number]) {
    setKind(k);
    setInput({ ...EMPTY_PERSON, gender: k.gender });
    setOptions({});
    setStep('new');
  }

  function connectInstead(id: string) {
    setOtherId(id);
    setConnectRelation(kind?.relation ?? 'spouse');
    setOptions({});
    setStep('connect');
  }

  function submit() {
    if (step === 'new') {
      const e = validatePersonInput(input);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    if (!context.valid(effectiveOptions)) return;
    save.mutate();
  }

  return (
    <Dialog title={t('relative.title', { name: anchorName })} onClose={onClose} wide>
      {step === 'choose' && (
        <div>
          <p className="mb-3 text-stone-600">{t('relative.choose')}</p>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <Button key={k.kind} variant="secondary" onClick={() => choose(k)}>
                {t(`relative.${k.kind}` as StringKey)}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="mt-4 w-full border border-dashed border-stone-300" onClick={() => setStep('connect')}>
            {t('relative.connect')}
          </Button>
        </div>
      )}

      {step !== 'choose' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button type="button" className="min-h-11 text-sm text-amber-800 hover:underline" onClick={() => setStep('choose')}>
            {t('relative.back')}
          </button>

          {step === 'new' && kind && (
            <>
              <h3 className="font-medium">{t('relative.newPerson', { relation: t(`relative.${kind.kind}` as StringKey) })}</h3>
              <PersonForm value={input} onChange={setInput} errors={errors} />
              <DuplicateWarning model={model} matches={duplicates} onUse={connectInstead} />
            </>
          )}

          {step === 'connect' && (
            <>
              <PersonPicker model={model} excludeId={anchorId} value={otherId} onChange={setOtherId} />
              <Choice<Relation>
                label={t('relative.connectAs', { name: anchorName })}
                value={connectRelation}
                onChange={(r) => {
                  setConnectRelation(r);
                  setOptions({});
                }}
                options={(['parent', 'child', 'spouse', 'sibling', 'adoptive_parent', 'step_parent'] as Relation[]).map((r) => ({
                  value: r,
                  label: t(`relation.${r}` as StringKey),
                }))}
              />
            </>
          )}

          {context.render(effectiveOptions, (o) => setOptions({ ...options, ...o }))}

          {relation === 'sibling' && (
            <div>
              <Choice<RelativePosition | 'unknown'>
                label={t('order.compared', { name: anchorName })}
                value={position}
                onChange={setPosition}
                options={[
                  { value: 'elder', label: t('order.elder') },
                  { value: 'younger', label: t('order.younger') },
                  { value: 'twin', label: t('order.twinOf') },
                  { value: 'unknown', label: t('order.unknown') },
                ]}
              />
              {step === 'new' && <p className="mt-1 text-xs text-stone-500">{t('order.dateWins')}</p>}
            </div>
          )}

          {save.isError && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {t('error.title')}: {errorMessage(save.error)}
            </p>
          )}

          <div className={DIALOG_ACTIONS_CLASS}>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={save.isPending || (step === 'connect' && !otherId) || !context.valid(effectiveOptions)}
            >
              {save.isPending ? t('person.saving') : step === 'connect' ? t('relative.connectSubmit') : t('person.save')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

// ---------------------------------------------------------------------------
// Context questions per relation
// ---------------------------------------------------------------------------
type Context = {
  defaults: RelationOptions;
  valid: (o: RelationOptions) => boolean;
  render: (o: RelationOptions, set: (o: RelationOptions) => void) => ReactNode;
};

function useRelationContext(model: FamilyModel, anchorId: string, relation: Relation): Context {
  const { t, lang } = useI18n();
  const g = model.graph;
  const name = (id: string) => displayName(model.persons.get(id), lang).text;
  const unionOf = (a: string, b: string) =>
    [...model.unions.values()].find((u) => u.partnerIds.length === 2 && u.partnerIds.includes(a) && u.partnerIds.includes(b))?.id;
  const childrenOfUnion = (unionId: string, except: string) =>
    [...new Set(g.allPeople().flatMap((p) => g.parentEdges(p.id).filter((e) => e.unionId === unionId).map(() => p.id)))].filter(
      (id) => id !== except,
    );
  const none: Context = { defaults: {}, valid: () => true, render: () => null };

  switch (relation) {
    case 'child': {
      const partners = g.partners(anchorId);
      if (!partners.length) return none;
      const defaultUnion = partners.length === 1 ? unionOf(anchorId, partners[0]!) : undefined;
      return {
        defaults: defaultUnion ? { union_id: defaultUnion } : {},
        valid: () => true,
        render: (o, set) => (
          <Choice<string>
            label={t('relative.otherParent')}
            value={o.union_id ?? 'none'}
            onChange={(v) => set({ union_id: v === 'none' ? undefined : v })}
            options={[
              ...partners.map((p) => ({ value: unionOf(anchorId, p) ?? 'none', label: name(p) })),
              { value: 'none', label: t('relative.otherParentUnknown') },
            ]}
          />
        ),
      };
    }
    case 'sibling': {
      const parents = g.parentEdges(anchorId).filter((e) => e.lineage === 'biological').map((e) => e.parentId);
      if (parents.length === 0) {
        return { ...none, render: () => <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">{t('relative.noParentsNote')}</p> };
      }
      if (parents.length === 1) return none;
      return {
        defaults: {},
        valid: () => true,
        render: (o, set) => (
          <Choice<string>
            label={t('relative.sharedParents')}
            value={o.parent_ids?.[0] ?? 'both'}
            onChange={(v) => set({ parent_ids: v === 'both' ? undefined : [v] })}
            options={[
              { value: 'both', label: t('relative.sharedBoth', { names: parents.map(name).join(', ') }) },
              ...parents.map((p) => ({ value: p, label: t('relative.sharedOnly', { name: name(p) }) })),
            ]}
          />
        ),
      };
    }
    case 'parent':
    case 'adoptive_parent': {
      const lineage = relation === 'parent' ? 'biological' : 'adoptive';
      const existing = g.parentEdges(anchorId).filter((e) => e.lineage === lineage);
      const u = existing.length === 1 ? existing[0]!.unionId : null;
      const others = u && model.unions.get(u)?.partnerIds.length === 1 ? childrenOfUnion(u, anchorId) : [];
      if (!others.length) return none;
      return {
        defaults: { apply_to_siblings: true },
        valid: () => true,
        render: (o, set) => (
          <label className="flex items-center gap-3 rounded-lg bg-stone-100 p-3 text-sm">
            <input type="checkbox" className="size-5" checked={o.apply_to_siblings !== false} onChange={(e) => set({ apply_to_siblings: e.target.checked })} />
            {t('relative.alsoSiblings', { names: others.map(name).join(', ') })}
          </label>
        ),
      };
    }
    case 'step_parent': {
      const parents = g.parents(anchorId);
      if (!parents.length) {
        return {
          defaults: {},
          valid: () => false,
          render: () => <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('relative.viaParentNone')}</p>,
        };
      }
      return {
        defaults: parents.length === 1 ? { via_parent_id: parents[0] } : {},
        valid: (o) => Boolean(o.via_parent_id),
        render: (o, set) => (
          <Choice<string>
            label={t('relative.viaParent')}
            value={o.via_parent_id ?? ''}
            onChange={(v) => set({ via_parent_id: v })}
            options={parents.map((p) => ({ value: p, label: name(p) }))}
          />
        ),
      };
    }
    case 'spouse': {
      const single = [...model.unions.values()].find((u) => u.partnerIds.length === 1 && u.partnerIds[0] === anchorId);
      const kids = single ? childrenOfUnion(single.id, anchorId) : [];
      if (!single || !kids.length) return none;
      return {
        defaults: {},
        valid: () => true,
        render: (o, set) => (
          <label className="flex items-center gap-3 rounded-lg bg-stone-100 p-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={Boolean(o.union_id)}
              onChange={(e) => set(e.target.checked ? { union_id: single.id, children_lineage: 'biological' } : { union_id: undefined, children_lineage: undefined })}
            />
            {t('relative.alsoChildren', { names: kids.map(name).join(', ') })}
          </label>
        ),
      };
    }
  }
}


