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
  avatarUrl?: string | null;
}

interface Viewer {
  id: number;
  name: string;
  avatar?: { medium?: string | null } | null;
}

export async function viewer(token: string): Promise<Viewer> {
  const client = new AniListClient(fetchTransport({ token }));
  return (await client.query<{ Viewer: Viewer }>(queries.VIEWER, {})).Viewer;
}

export function avatarOf(v: Viewer): string | null {
  const url = v.avatar?.medium ?? null;
  return url?.startsWith("https://") ? url : null;
}

export const PIN_PAGE = "https://anilist.co/api/v2/oauth/pin";
const EXPIRY_MARGIN_MS = 24 * 3600 * 1000;
const TOKEN_LIFETIME_S = 365 * 86400;

export function clientId(): string | null {
  return __ANILIST_CLIENT_ID__ ? __ANILIST_CLIENT_ID__ : null;
}

export function authorizeUrl(id: string): string {
  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("response_type", "token");
  return url.href;
}

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
  if (!token || !/^[\w.-]{20,}$/.test(token))
    throw new Error("That doesn't look like the code AniList shows");
  const life = Number.isFinite(seconds) && seconds > 0 ? seconds : TOKEN_LIFETIME_S;
  return { token, expiresAt: now + life * 1000 };
}

export function usable(auth: Auth | null, now = Date.now()): Auth | null {
  if (auth?.kind !== "anilist") return null;
  return auth.expiresAt - EXPIRY_MARGIN_MS < now ? null : auth;
}

export async function loadAuth(): Promise<Auth | null> {
  return usable(await get<Auth>(AUTH_KEY));
}

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

export interface PendingSignIn {
  token: Promise<{ token: string; expiresAt: number }>;
  cancel(): void;
}

export async function startSignIn(): Promise<PendingSignIn> {
  const id = clientId();
  if (!id) throw new Error("AniList sign-in isn't set up in this build (no ANILIST_CLIENT_ID)");
  const ext = api();
  const access = { origins: [ANILIST_PAGES] };
  const watching =
    (await ext.permissions.contains(access).catch(() => false)) ||
    (await ext.permissions.request(access).catch(() => false));
  const home = await ext.tabs.getCurrent().catch(() => undefined);
  const tab = await ext.tabs.create({ url: authorizeUrl(id), active: true });
  let stop = () => {};
  const token = new Promise<{ token: string; expiresAt: number }>((resolve, reject) => {
    if (!watching || tab.id === undefined) return;
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
