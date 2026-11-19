import { api } from "./browser.ts";

export interface Prefs {
  badge: boolean;
  count: boolean;
  backgroundSync: boolean;
}

export const DEFAULT_PREFS: Prefs = { badge: false, count: false, backgroundSync: true };

const KEY = "prefs";

export const ANILIST_PAGES = "https://anilist.co/*";

export async function getPrefs(): Promise<Prefs> {
  const saved = (await api().storage.local.get(KEY))[KEY] as Partial<Prefs> | undefined;
  return { ...DEFAULT_PREFS, ...saved };
}

export async function setPrefs(change: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...change };
  await api().storage.local.set({ [KEY]: next });
  return next;
}

export const PREFS_KEY = KEY;
