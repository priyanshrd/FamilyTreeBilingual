import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Loading } from '@/components/ui/Status';
import { TextField } from '@/components/ui/TextField';
import { getText } from '@/domain/localized/localized';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import { getFamily } from '@/services/repositories/familyRepo';

export function FamilyHomePage() {
  const { familyId = '' } = useParams();
  const { t, lang } = useI18n();
  const family = useQuery({ queryKey: ['family', familyId], queryFn: () => getFamily(familyId) });

  useEffect(() => {
    if (family.data) deviceSettings.setLastFamily(family.data.id);
  }, [family.data]);

  if (family.isPending) return <Loading />;
  if (family.isError) return <ErrorMessage onRetry={() => void family.refetch()} />;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-amber-800 hover:underline">
          ← {t('family.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{getText(family.data?.name, lang)?.text}</h1>
        <p className="mt-2 text-stone-600">{t('family.placeholder')}</p>
      </div>
      <DeviceSettings />
    </div>
  );
}

function DeviceSettings() {
  const { t } = useI18n();
  const [name, setName] = useState(() => deviceSettings.editorName() ?? '');
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    deviceSettings.setEditorName(name);
    setSaved(true);
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t('settings.heading')}</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          className="flex-1"
          label={t('settings.editorName')}
          hint={t('settings.editorNameHint')}
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
        <Button type="submit" variant="secondary" className="sm:mt-6">
          {saved ? t('settings.saved') : t('common.save')}
        </Button>
      </form>
    </section>
  );
}
