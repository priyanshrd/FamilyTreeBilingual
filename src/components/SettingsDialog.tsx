import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { deviceSettings } from '@/services/deviceSettings';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { TextField } from './ui/TextField';
import { LanguageToggle } from './LanguageToggle';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => deviceSettings.editorName() ?? '');
  return (
    <Dialog title={t('settings.heading')} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-1 text-sm font-medium text-stone-700">{t('settings.language')}</p>
          <LanguageToggle />
        </div>
        <TextField label={t('settings.editorName')} hint={t('settings.editorNameHint')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              deviceSettings.setEditorName(name);
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
