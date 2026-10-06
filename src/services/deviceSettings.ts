// Per-device preferences, kept in the browser. With one shared family login these stand in for
// "who am I": the editor name (recorded in the audit log) and which person is "me" per family.
// Storage can be unavailable (private mode), so every access is guarded.

const KEYS = {
  editorName: 'ft.editorName',
  uiLanguage: 'ft.uiLanguage',
  me: (familyId: string) => `ft.me.${familyId}`,
  lastFamily: 'ft.lastFamily',
  lastPerson: (familyId: string) => `ft.lastPerson.${familyId}`,
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore: preference simply isn't remembered
  }
}

export const deviceSettings = {
  editorName: () => read(KEYS.editorName),
  setEditorName: (v: string | null) => write(KEYS.editorName, v?.trim().slice(0, 80) ?? null),
  uiLanguage: () => read(KEYS.uiLanguage),
  setUiLanguage: (v: string) => write(KEYS.uiLanguage, v),
  mePersonId: (familyId: string) => read(KEYS.me(familyId)),
  setMePersonId: (familyId: string, personId: string | null) => write(KEYS.me(familyId), personId),
  lastPersonId: (familyId: string) => read(KEYS.lastPerson(familyId)),
  setLastPersonId: (familyId: string, personId: string) => write(KEYS.lastPerson(familyId), personId),
  lastFamily: () => read(KEYS.lastFamily),
  setLastFamily: (familyId: string) => write(KEYS.lastFamily, familyId),
};
