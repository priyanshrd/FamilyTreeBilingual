import { useI18n } from '@/i18n/I18nProvider';
import { Button } from './Button';

export function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="py-12 text-center text-stone-500">
      {t('common.loading')}
    </p>
  );
}

export function ErrorMessage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <p>{t('common.error')}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
