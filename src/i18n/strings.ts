// UI chrome strings. (Family data — names, places, notes — is stored per language in the database.)
export const UI_LANGUAGES = ['en', 'mr'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

const en = {
  'app.title': 'Family Tree',
  'app.notConfigured': 'The app is not configured. Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_FAMILY_LOGIN_EMAIL.',
  'login.heading': 'Welcome',
  'login.subheading': 'Enter the family password to continue.',
  'login.password': 'Family password',
  'login.submit': 'Open family tree',
  'login.submitting': 'Opening…',
  'login.wrong': 'That password is not right. Please try again.',
  'login.failed': 'Could not sign in. Check your internet connection and try again.',
  'common.signOut': 'Sign out',
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.error': 'Something went wrong.',
  'common.retry': 'Try again',
  'families.heading': 'Family trees',
  'families.empty': 'No family tree yet. Create the first one.',
  'families.create': 'Create a family tree',
  'families.nameEn': 'Name in English',
  'families.nameMr': 'Name in Marathi',
  'families.namePlaceholderEn': 'e.g. Dhotar family',
  'families.namePlaceholderMr': 'उदा. धोतर कुटुंब',
  'families.nameRequired': 'Enter a name in at least one language.',
  'families.creating': 'Creating…',
  'families.people': '{count} people',
  'family.back': 'All family trees',
  'family.placeholder': 'The tree view and adding people arrive in the next phases.',
  'settings.heading': 'This device',
  'settings.editorName': 'Your name (shown in change history)',
  'settings.editorNameHint': 'Everyone shares one login, so this tells others who made a change from this device.',
  'settings.saved': 'Saved',
  'settings.language': 'Language',
} as const;

export type StringKey = keyof typeof en;

const mr: Record<StringKey, string> = {
  'app.title': 'कुटुंबवृक्ष',
  'app.notConfigured': 'अ‍ॅप कॉन्फिगर केलेले नाही. VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY आणि VITE_FAMILY_LOGIN_EMAIL सेट करा.',
  'login.heading': 'स्वागत आहे',
  'login.subheading': 'पुढे जाण्यासाठी कुटुंबाचा पासवर्ड टाका.',
  'login.password': 'कुटुंबाचा पासवर्ड',
  'login.submit': 'कुटुंबवृक्ष उघडा',
  'login.submitting': 'उघडत आहे…',
  'login.wrong': 'पासवर्ड चुकीचा आहे. पुन्हा प्रयत्न करा.',
  'login.failed': 'साइन इन करता आले नाही. इंटरनेट तपासून पुन्हा प्रयत्न करा.',
  'common.signOut': 'बाहेर पडा',
  'common.loading': 'लोड होत आहे…',
  'common.save': 'जतन करा',
  'common.cancel': 'रद्द करा',
  'common.error': 'काहीतरी चुकले.',
  'common.retry': 'पुन्हा प्रयत्न करा',
  'families.heading': 'कुटुंबवृक्ष',
  'families.empty': 'अजून कुटुंबवृक्ष नाही. पहिला तयार करा.',
  'families.create': 'नवीन कुटुंबवृक्ष तयार करा',
  'families.nameEn': 'इंग्रजीत नाव',
  'families.nameMr': 'मराठीत नाव',
  'families.namePlaceholderEn': 'e.g. Dhotar family',
  'families.namePlaceholderMr': 'उदा. धोतर कुटुंब',
  'families.nameRequired': 'किमान एका भाषेत नाव टाका.',
  'families.creating': 'तयार होत आहे…',
  'families.people': '{count} व्यक्ती',
  'family.back': 'सर्व कुटुंबवृक्ष',
  'family.placeholder': 'वृक्ष दृश्य आणि व्यक्ती जोडणे पुढील टप्प्यांत येईल.',
  'settings.heading': 'हे उपकरण',
  'settings.editorName': 'तुमचे नाव (बदलांच्या इतिहासात दिसेल)',
  'settings.editorNameHint': 'सर्वजण एकच लॉगिन वापरतात, म्हणून या उपकरणावरून बदल कोणी केला हे यावरून कळते.',
  'settings.saved': 'जतन केले',
  'settings.language': 'भाषा',
};

export const STRINGS: Record<UiLanguage, Record<StringKey, string>> = { en, mr };

export function translate(lang: UiLanguage, key: StringKey, vars: Record<string, string | number> = {}): string {
  let s = STRINGS[lang][key] ?? STRINGS.en[key];
  for (const [k, v] of Object.entries(vars)) {
    const value = lang === 'mr' && typeof v === 'number' ? new Intl.NumberFormat('mr-IN').format(v) : String(v);
    s = s.replace(`{${k}}`, value);
  }
  return s;
}
