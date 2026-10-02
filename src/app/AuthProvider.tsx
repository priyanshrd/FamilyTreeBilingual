import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FAMILY_LOGIN_EMAIL, supabase } from '@/services/supabase';

type Auth = {
  session: Session | null;
  loading: boolean;
  /** Signs in to the shared family account. Resolves to an error code, or null on success. */
  signIn: (password: string) => Promise<'wrong_password' | 'failed' | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: Auth = {
    session,
    loading,
    async signIn(password) {
      const { error } = await supabase.auth.signInWithPassword({ email: FAMILY_LOGIN_EMAIL, password });
      if (!error) return null;
      return error.code === 'invalid_credentials' || error.status === 400 ? 'wrong_password' : 'failed';
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
