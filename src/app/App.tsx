import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Loading } from '@/components/ui/Status';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { LoginPage } from '@/pages/LoginPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { isConfigured } from '@/services/supabase';
import { AuthProvider, useAuth } from './AuthProvider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NotConfigured() {
  const { t } = useI18n();
  return <p className="m-8 rounded-lg bg-red-50 p-4 text-red-800">{t('app.notConfigured')}</p>;
}

export function App() {
  return (
    <I18nProvider>
      {!isConfigured ? (
        <NotConfigured />
      ) : (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      )}
    </I18nProvider>
  );
}
