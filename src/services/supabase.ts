import { createClient } from '@supabase/supabase-js';
import { deviceSettings } from './deviceSettings';
import { operationContext } from './operationContext';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const FAMILY_LOGIN_EMAIL = (import.meta.env.VITE_FAMILY_LOGIN_EMAIL as string | undefined) ?? '';
export const isConfigured = Boolean(url && key && FAMILY_LOGIN_EMAIL);

/**
 * Adds the device's editor name to every request, so the audit log can say who made a change
 * even though the family shares one login (URI-encoded: header values must be ASCII-safe),
 * and the id of the change being saved, so it can be undone as a whole (see undo.ts).
 */
const fetchWithEditor: typeof fetch = (input, init) => {
  const name = deviceSettings.editorName();
  const op = operationContext.get();
  if (!name && !op) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (name) headers.set('x-editor-name', encodeURIComponent(name));
  if (op) headers.set('x-operation-id', op);
  return fetch(input, { ...init, headers });
};

/**
 * The login lasts for this browser session only: closing the browser (or the tab) means the family
 * password is asked again on the next visit. A refresh inside the same tab stays signed in.
 */
const sessionStore = {
  getItem: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // storage unavailable: the login simply isn't remembered
    }
  },
  removeItem: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

// Earlier versions kept the login in localStorage (signed in "forever"); remove it once.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
} catch {
  // ignore
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, storage: sessionStore },
  global: { fetch: fetchWithEditor },
});
