import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/app/AuthProvider';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n/I18nProvider';

export function LoginPage() {
  const { t } = useI18n();
  const { session, signIn } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    const result = await signIn(password);
    setBusy(false);
    if (result === 'wrong_password') setError(t('login.wrong'));
    else if (result === 'failed') setError(t('login.failed'));
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 px-4">
      <div className="flex justify-end py-3">
        <LanguageToggle />
      </div>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-24">
        <h1 className="text-3xl font-semibold text-amber-900">{t('app.title')}</h1>
        <p className="mt-2 text-stone-600">{t('login.subheading')}</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {/* Hidden username helps password managers remember the shared login. */}
          <input type="email" name="username" autoComplete="username" value={import.meta.env.VITE_FAMILY_LOGIN_EMAIL ?? ''} readOnly hidden />
          <TextField
            label={t('login.password')}
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </main>
    </div>
  );
}
