/**
 * AniList sign-in, the way MAL-Sync does it: the user approves Konomi.moe on AniList (OAuth
 * implicit grant, so no secret ships with the extension) and the token comes back to the
 * extension. AniList sends it to the redirect URL of the API client, and Konomi.moe has no
 * website, so the client's redirect is AniList's own code page (https://anilist.co/api/v2/oauth/pin).
 * The extension watches the tab it opened, reads the token from that page's address and closes
 * it. That needs access to anilist.co (asked for at the click, and the same access the AniList
 * badge uses); without it, the user pastes the code the page shows. One client serves every
 * browser, whatever the extension's ID.
 */

import { AniListClient, fetchTransport, queries } from "@konomi/engine";
import { api } from "./browser.ts";
import { AUTH_KEY, get, put, remove } from "./kv.ts";
import { ANILIST_PAGES } from "./prefs.ts";

declare const __ANILIST_CLIENT_ID__: string;

export interface Auth {
  kind: "anilist";
  token: string;
  expiresAt: number;
  name: string;
  userId: number;
  /** AniList profile picture; absent for sign-ins saved before it was kept. */
  avatarUrl?: string | null;
}

interface Viewer {
  id: number;
  name: string;
  avatar?: { medium?: string | null } | null;
}

/** Who a token belongs to, with their profile picture. */
export async function viewer(token: string): Promise<Viewer> {
  const client = new AniListClient(fetchTransport({ token }));
  return (await client.query<{ Viewer: Viewer }>(queries.VIEWER, {})).Viewer;
}

/** Only AniList's own https pictures are shown. */
export function avatarOf(v: Viewer): string | null {
  const url = v.avatar?.medium ?? null;
  return url?.startsWith("https://") ? url : null;
}

/** Where AniList sends the token: the redirect URL to register on the API client. */
export const PIN_PAGE = "https://anilist.co/api/v2/oauth/pin";
/** A token this close to expiring counts as expired, so a sync doesn't fail halfway. */
const EXPIRY_MARGIN_MS = 24 * 3600 * 1000;
/** AniList's tokens last a year; assumed when it doesn't say. */
const TOKEN_LIFETIME_S = 365 * 86400;

/** The AniList API client's ID, or `null` when the build has none. */
export function clientId(): string | null {
  return __ANILIST_CLIENT_ID__ ? __ANILIST_CLIENT_ID__ : null;
}

export function authorizeUrl(id: string): string {
  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("response_type", "token");
  return url.href;
}

/**
 * The token from AniList's code page address (`…/pin#access_token=…&expires_in=…`), or from
 * the code itself as pasted by the user.
 */
export function parseToken(text: string, now = Date.now()): { token: string; expiresAt: number } {
  const trimmed = text.trim();
  let token: string | null = trimmed;
  let seconds = Number.NaN;
  if (/^https?:\/\//.test(trimmed)) {
    const url = new URL(trimmed);
    const params = new URLSearchParams(url.hash.replace(/^#/, "") || url.search);
    const error = params.get("error");
    if (error)
      throw new Error(
        error === "access_denied"
          ? "AniList sign-in was cancelled"
          : `AniList refused the sign-in (${params.get("error_description") ?? error})`,
      );
    token = params.get("access_token");
    seconds = Number(params.get("expires_in"));
  }
  // AniList's tokens are JWTs: letters, digits, dots, dashes and underscores.
  if (!token || !/^[\w.-]{20,}$/.test(token))
    throw new Error("That doesn't look like the code AniList shows");
  const life = Number.isFinite(seconds) && seconds > 0 ? seconds : TOKEN_LIFETIME_S;
  return { token, expiresAt: now + life * 1000 };
}

export function usable(auth: Auth | null, now = Date.now()): Auth | null {
  if (auth?.kind !== "anilist") return null; // earlier test builds saved username-only sign-ins
  return auth.expiresAt - EXPIRY_MARGIN_MS < now ? null : auth;
}

/** The saved sign-in, if it's still good. */
export async function loadAuth(): Promise<Auth | null> {
  return usable(await get<Auth>(AUTH_KEY));
}

/** Checks a token with AniList (whose user is it?) and saves the sign-in. */
export async function finishSignIn(token: string, expiresAt: number): Promise<Auth> {
  let v: Viewer;
  try {
    v = await viewer(token);
  } catch {
    throw new Error("AniList didn't accept that sign-in. Try again");
  }
  const auth: Auth = {
    kind: "anilist",
    token,
    expiresAt,
    name: v.name,
    userId: v.id,
    avatarUrl: avatarOf(v),
  };
  await put(AUTH_KEY, auth);
  return auth;
}

/** Fills in the profile picture of a sign-in saved before it was kept; best effort. */
export async function withAvatar(auth: Auth): Promise<Auth> {
  if (auth.avatarUrl !== undefined) return auth;
  try {
    const updated = { ...auth, avatarUrl: avatarOf(await viewer(auth.token)) };
    await put(AUTH_KEY, updated);
    return updated;
  } catch {
    return auth;
  }
}

/** A sign-in under way: `token` resolves when AniList's code page shows up in the tab. */
export interface PendingSignIn {
  /** Resolves with the token, or never when the user declined access to anilist.co. */
  token: Promise<{ token: string; expiresAt: number }>;
  cancel(): void;
}

/**
 * Opens AniList's approval page in a new tab. Call it straight from a click: the browser only
 * shows the anilist.co access prompt for a user's action.
 */
export async function startSignIn(): Promise<PendingSignIn> {
  const id = clientId();
  if (!id) throw new Error("AniList sign-in isn't set up in this build (no ANILIST_CLIENT_ID)");
  const ext = api();
  // Already granted when the AniList badge is on; otherwise ask (this needs the click).
  const access = { origins: [ANILIST_PAGES] };
  const watching =
    (await ext.permissions.contains(access).catch(() => false)) ||
    (await ext.permissions.request(access).catch(() => false));
  const home = await ext.tabs.getCurrent().catch(() => undefined);
  const tab = await ext.tabs.create({ url: authorizeUrl(id), active: true });
  let stop = () => {};
  const token = new Promise<{ token: string; expiresAt: number }>((resolve, reject) => {
    if (!watching || tab.id === undefined) return; // the user pastes the code instead
    const onUpdated = (tabId: number, change: { url?: string }) => {
      if (tabId !== tab.id || !change.url?.startsWith(PIN_PAGE)) return;
      stop();
      try {
        resolve(parseToken(change.url));
      } catch (e) {
        reject(e);
      }
      void ext.tabs.remove(tabId).catch(() => {});
      if (home?.id !== undefined) void ext.tabs.update(home.id, { active: true }).catch(() => {});
    };
    const onRemoved = (tabId: number) => {
      if (tabId !== tab.id) return;
      stop();
      reject(new Error("AniList sign-in was cancelled"));
    };
    stop = () => {
      ext.tabs.onUpdated.removeListener(onUpdated);
      ext.tabs.onRemoved.removeListener(onRemoved);
    };
    ext.tabs.onUpdated.addListener(onUpdated);
    ext.tabs.onRemoved.addListener(onRemoved);
  });
  return { token, cancel: () => stop() };
}

export async function signOut(): Promise<void> {
  await remove(AUTH_KEY);
}
