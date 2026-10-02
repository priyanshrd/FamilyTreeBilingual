import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { deviceSettings } from '@/services/deviceSettings';
import { translate, UI_LANGUAGES, type StringKey, type UiLanguage } from './strings';

type I18n = {
  lang: UiLanguage;
  setLang: (l: UiLanguage) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18n | null>(null);

function initialLanguage(): UiLanguage {
  const saved = deviceSettings.uiLanguage();
  return (UI_LANGUAGES as readonly string[]).includes(saved ?? '') ? (saved as UiLanguage) : 'mr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(initialLanguage);
  const setLang = useCallback((l: UiLanguage) => {
    deviceSettings.setUiLanguage(l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
