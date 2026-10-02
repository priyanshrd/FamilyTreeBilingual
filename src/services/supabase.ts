import { createClient } from '@supabase/supabase-js';
import { deviceSettings } from './deviceSettings';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const FAMILY_LOGIN_EMAIL = (import.meta.env.VITE_FAMILY_LOGIN_EMAIL as string | undefined) ?? '';
export const isConfigured = Boolean(url && key && FAMILY_LOGIN_EMAIL);

/**
 * Adds the device's editor name to every request, so the audit log can say who made a change
 * even though the family shares one login. (Header values must be ASCII-safe, so it is URI-encoded.)
 */
const fetchWithEditor: typeof fetch = (input, init) => {
  const name = deviceSettings.editorName();
  if (!name) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('x-editor-name', encodeURIComponent(name));
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: fetchWithEditor },
});
