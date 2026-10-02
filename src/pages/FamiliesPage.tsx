import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Loading } from '@/components/ui/Status';
import { TextField } from '@/components/ui/TextField';
import { getText, setManual } from '@/domain/localized/localized';
import { useI18n } from '@/i18n/I18nProvider';
import { createFamily, listFamilies } from '@/services/repositories/familyRepo';

export function FamiliesPage() {
  const { t, lang } = useI18n();
  const families = useQuery({ queryKey: ['families'], queryFn: listFamilies });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">{t('families.heading')}</h1>
        {families.isPending && <Loading />}
        {families.isError && <ErrorMessage onRetry={() => void families.refetch()} />}
        {families.data?.length === 0 && <p className="mt-4 text-stone-600">{t('families.empty')}</p>}
        {families.data && families.data.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {families.data.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/f/${f.id}`}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-700 hover:shadow-sm"
                >
                  <span className="block text-lg font-medium">{getText(f.name, lang)?.text}</span>
                  <span className="text-sm text-stone-500">{t('families.people', { count: f.peopleCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CreateFamilyForm />
    </div>
  );
}

function CreateFamilyForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState('');
  const [nameMr, setNameMr] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFamily(setManual(setManual(null, 'en', nameEn), 'mr', nameMr)),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['families'] });
      navigate(`/f/${id}`);
    },
    onError: () => setError(t('common.error')),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nameEn.trim() && !nameMr.trim()) return setError(t('families.nameRequired'));
    setError(null);
    create.mutate();
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t('families.create')}</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('families.nameMr')}
          lang="mr"
          placeholder={t('families.namePlaceholderMr')}
          value={nameMr}
          onChange={(e) => setNameMr(e.target.value)}
        />
        <TextField
          label={t('families.nameEn')}
          lang="en"
          placeholder={t('families.namePlaceholderEn')}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('families.creating') : t('families.create')}
          </Button>
        </div>
      </form>
    </section>
  );
}
