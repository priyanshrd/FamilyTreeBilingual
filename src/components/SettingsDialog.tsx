import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import type { FamilyModel } from '@/domain/family/familyModel';
import { transliterate } from '@/domain/language/transliterate';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import { fillMissingNames } from '@/services/repositories/personRepo';
import { Button } from './ui/Button';
import { DIALOG_ACTIONS_CLASS, Dialog } from './ui/Dialog';
import { TextField } from './ui/TextField';
import { LanguageToggle } from './LanguageToggle';
import { Choice } from './ui/Choice';
import { setTextSize, useTextSize, type TextSize } from '@/services/textSize';

type Props = { familyId?: string; model?: FamilyModel; onClose: () => void; onChanged: () => void };

export function SettingsDialog({ familyId, model, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [name, setName] = useState(() => deviceSettings.editorName() ?? '');
  const [autoFill, setAutoFill] = useState(() => deviceSettings.autoFill());
  const [message, setMessage] = useState<string | null>(null);
  const textSize = useTextSize();

  const fill = useMutation({
    mutationFn: (to: 'en' | 'mr') => fillMissingNames(familyId!, [...model!.persons.values()], to, transliterate),
    onSuccess: (count) => {
      setMessage(count ? t('settings.filled', { count }) : t('settings.fillNone'));
      if (count) onChanged();
    },
    onError: (e) => setMessage(String((e as Error).message ?? e)),
  });

  return (
    <Dialog title={t('settings.heading')} onClose={onClose}>
      <div className="space-y-6">
        <div>
          <p className="mb-1 text-sm font-medium text-stone-700">{t('settings.language')}</p>
          <LanguageToggle />
        </div>

        <div>
          <Choice<TextSize>
            label={t('settings.textSize')}
            value={textSize}
            onChange={setTextSize}
            options={(['normal', 'large', 'xlarge'] as const).map((v) => ({ value: v, label: t(`textSize.${v}`) }))}
          />
          <p className="mt-1 text-sm text-stone-500">{t('settings.textSizeHint')}</p>
        </div>

        <TextField label={t('settings.editorName')} hint={t('settings.editorNameHint')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5" checked={autoFill} onChange={(e) => setAutoFill(e.target.checked)} />
          {t('settings.autoFill')}
        </label>

        {model && familyId && (
          <div className="space-y-2">
            <Button variant="secondary" className="w-full" disabled={fill.isPending} onClick={() => fill.mutate('mr')}>
              {t('settings.fillMissingMr')}
            </Button>
            <Button variant="secondary" className="w-full" disabled={fill.isPending} onClick={() => fill.mutate('en')}>
              {t('settings.fillMissingEn')}
            </Button>
            {message && (
              <p role="status" className="text-sm text-stone-600">
                {message}
              </p>
            )}
          </div>
        )}

        <div className={DIALOG_ACTIONS_CLASS}>
          <Button variant="ghost" className="mr-auto text-red-700" onClick={() => void signOut()}>
            {t('common.signOut')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              deviceSettings.setEditorName(name);
              deviceSettings.setAutoFill(autoFill);
              onClose();
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
