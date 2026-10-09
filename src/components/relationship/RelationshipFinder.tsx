import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { displayName, type FamilyModel } from '@/domain/family/familyModel';
import { KinshipResolver, type KinshipResult } from '@/domain/kinship/resolve';
import { labelRelationship, stepWord, type TermTable } from '@/domain/kinship/terms';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import { saveTerm, type KinshipTermRow } from '@/services/repositories/kinshipRepo';
import { PersonPicker } from '@/components/PersonPicker';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { errorMessage } from '@/components/person/AddRelativeDialog';

type Props = {
  model: FamilyModel;
  familyId: string;
  initialA: string | null;
  initialB: string | null;
  terms: { rows: KinshipTermRow[]; tables: Record<string, TermTable>; refresh: () => Promise<unknown> };
  onClose: () => void;
  onShowPath: (personIds: string[]) => void;
};

/** "How are we related?" — computed live from the tree; nothing is stored except the family's own words. */
export function RelationshipFinder({ model, familyId, initialA, initialB, terms, onClose, onShowPath }: Props) {
  const { t, lang } = useI18n();
  const [a, setA] = useState<string | null>(initialA);
  const [b, setB] = useState<string | null>(initialB);
  const [me, setMe] = useState(() => deviceSettings.mePersonId(familyId));
  const resolver = useMemo(() => new KinshipResolver(model.graph), [model]);
  const result = a && b ? resolver.find(a, b) : null;
  const name = (id: string) => displayName(model.persons.get(id), lang).text;

  return (
    <Dialog title={t('rel.title')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <PersonPicker model={model} value={a} onChange={setA} label={t('rel.from')} />
          {a && (
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                className="size-4"
                checked={me === a}
                onChange={(e) => {
                  const v = e.target.checked ? a : null;
                  deviceSettings.setMePersonId(familyId, v);
                  setMe(v);
                }}
              />
              {t('rel.setMe')}
            </label>
          )}
        </div>
        <PersonPicker model={model} value={b} onChange={setB} label={t('rel.to')} />

        {!result && <p className="text-stone-500">{t('rel.pickBoth')}</p>}
        {result && a && b && (
          <ResultView
            result={result}
            a={a}
            b={b}
            aName={name(a)}
            isMe={a === me}
            model={model}
            familyId={familyId}
            terms={terms}
            onShowPath={onShowPath}
          />
        )}
      </div>
    </Dialog>
  );
}

function ResultView({
  result,
  a,
  b,
  aName,
  isMe,
  model,
  familyId,
  terms,
  onShowPath,
}: {
  result: KinshipResult;
  a: string;
  b: string;
  aName: string;
  isMe: boolean;
  model: FamilyModel;
  familyId: string;
  terms: Props['terms'];
  onShowPath: (ids: string[]) => void;
}) {
  const { t, lang } = useI18n();
  const other = lang === 'mr' ? 'en' : 'mr';
  const name = (id: string) => displayName(model.persons.get(id), lang).text;
  const label = labelRelationship(result, lang, terms.tables[lang]);
  const otherLabel = labelRelationship(result, other, terms.tables[other]);
  const mrLabel = lang === 'mr' ? label : otherLabel;
  const [editing, setEditing] = useState(false);
  const [mrWord, setMrWord] = useState('');
  const [enWord, setEnWord] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      await saveTerm(familyId, terms.rows, result.key, 'mr', mrWord);
      await saveTerm(familyId, terms.rows, result.key, 'en', enWord);
      await terms.refresh();
    },
    onSuccess: () => setEditing(false),
  });

  if (result.kind === 'self') return <p className="rounded-lg bg-stone-100 p-3">{t('rel.self')}</p>;
  if (result.kind === 'none') return <p className="rounded-lg bg-stone-100 p-3">{t('rel.none')}</p>;

  const needsWord = mrLabel.source === 'generated';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-stone-600">{(isMe ? t('rel.sentenceMe', { b: name(b), rel: '' }) : t('rel.sentence', { a: aName, b: name(b), rel: '' })).trim()}</p>
        <p className="mt-1 text-2xl font-semibold text-amber-900">{label.text}</p>
        <p className="text-stone-600">{otherLabel.text}</p>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-medium text-stone-500">{t('rel.path')}</h3>
        <ol className="space-y-1">
          <li className="font-medium">{name(a)}</li>
          {result.steps.map((s, i) => (
            <li key={i} className="pl-3">
              <span className="text-sm text-stone-500">↓ {stepWord(s.code, lang, terms.tables[lang])}</span>
              <span className="block font-medium">{name(s.to)}</span>
            </li>
          ))}
        </ol>
        <Button variant="secondary" className="mt-3" onClick={() => onShowPath(result.personPath)}>
          {t('rel.showOnTree')}
        </Button>
      </section>

      {result.alternatives.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-stone-500">{t('rel.alternatives')}</h3>
          <ul className="list-inside list-disc text-sm">
            {result.alternatives.map((alt) => (
              <li key={alt.key}>{labelRelationship(alt, lang, terms.tables[lang]).text}</li>
            ))}
          </ul>
        </section>
      )}

      {(needsWord || editing) && (
        <section className="space-y-3 rounded-xl border border-stone-200 p-3">
          <p className="text-sm text-stone-700">{needsWord && !editing ? t('rel.noWord') : t('rel.changeWord')}</p>
          <TextField label="मराठी" lang="mr" value={mrWord} onChange={(e) => setMrWord(e.target.value)} placeholder="उदा. आजेसासरे" />
          <TextField label="English" lang="en" value={enWord} onChange={(e) => setEnWord(e.target.value)} placeholder={otherLabel.text} />
          {save.isError && <p className="text-sm text-red-700">{errorMessage(save.error)}</p>}
          <Button disabled={save.isPending || (!mrWord.trim() && !enWord.trim())} onClick={() => save.mutate()}>
            {t('rel.saveWord')}
          </Button>
        </section>
      )}
      {!needsWord && !editing && (
        <button
          type="button"
          className="text-sm text-amber-800 hover:underline"
          onClick={() => {
            setMrWord(terms.tables.mr?.[result.key] ?? '');
            setEnWord(terms.tables.en?.[result.key] ?? '');
            setEditing(true);
          }}
        >
          ✎ {t('rel.changeWord')}
        </button>
      )}
    </div>
  );
}
