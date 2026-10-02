import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from './ui/Button';
import { LanguageToggle } from './LanguageToggle';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-amber-900">
            {t('app.title')}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {session && (
              <Button variant="ghost" onClick={() => void signOut()}>
                {t('common.signOut')}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
