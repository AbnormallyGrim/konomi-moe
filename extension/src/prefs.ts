/** The extension's own switches, in `storage.local` so every part sees them and their changes. */

import { api } from "./browser.ts";

export interface Prefs {
  /** The verdict badge on AniList title pages (needs access to anilist.co, asked when turned on). */
  badge: boolean;
  /** The count of new picks on the toolbar icon, after a background sync. */
  count: boolean;
  /** Sync and rank once a day while the browser is open. */
  backgroundSync: boolean;
}

/** Quiet until asked: no badge and no count, but picks kept fresh. */
export const DEFAULT_PREFS: Prefs = { badge: false, count: false, backgroundSync: true };

const KEY = "prefs";

/** What the badge needs: AniList's pages, nothing else. */
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
