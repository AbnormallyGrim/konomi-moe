/**
 * The background (a service worker in Chromium, an event page in Firefox): verdicts for the
 * AniList badge, the popup's and the badge's actions, the daily sync, the new-picks count on
 * the toolbar icon, and registering the badge's content script when it's switched on.
 */

import { Session, TYPES } from "@konomi/ui/session";
import { runAction } from "./actions.ts";
import { loadAuth } from "./auth.ts";
import { api } from "./browser.ts";
import { type Action, appIsOpen, askApp, CHANNEL, type ChannelMessage } from "./channel.ts";
import { allowEmbeds } from "./embeds.ts";
import { extensionHost } from "./host.ts";
import type { Reply, Request } from "./messages.ts";
import { ANILIST_PAGES, getPrefs, PREFS_KEY, setPrefs } from "./prefs.ts";
import { verdictFor } from "./verdicts.ts";

const SYNC_ALARM = "daily-sync";
const DAY_MINUTES = 24 * 60;
const CONTENT_SCRIPT = "anilist-badge";
/** A read-only session is reused this long for verdicts (opening one parses the whole store). */
const SESSION_TTL_MS = 5 * 60_000;
const SEEN_KEY = "seenPicks";

const ext = api();

/* Sessions */

let cached: { session: Promise<Session | null>; at: number } | null = null;

async function openSession(): Promise<Session | null> {
  const auth = await loadAuth();
  if (!auth) return null;
  return Session.open(extensionHost(auth, { page: false }), auth.name);
}

/** A session for reading (verdicts), cached until the store changes. */
function readSession(): Promise<Session | null> {
  if (!cached || Date.now() - cached.at > SESSION_TTL_MS) {
    cached = { session: openSession(), at: Date.now() };
    cached.session.catch(() => {
      cached = null;
    });
  }
  return cached.session;
}

// The app tab saved: the cached copy is out of date.
new BroadcastChannel(CHANNEL).onmessage = (e: MessageEvent<ChannelMessage>) => {
  if (e.data.type === "saved") cached = null;
};

/**
 * Chrome stops an idle service worker after 30 s, even mid-fetch; any extension API call
 * restarts that clock. Long jobs (a sync) call this to stay alive.
 */
async function keepAlive<T>(job: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => void ext.storage.local.get(PREFS_KEY), 20_000);
  try {
    return await job();
  } finally {
    clearInterval(timer);
  }
}

/* Actions: the open app tab is the only writer; without one, the background writes. */

async function act(action: Action): Promise<string> {
  if (await appIsOpen()) return askApp(action);
  const session = await openSession();
  if (!session) throw new Error("Open Konomi.moe and sign in first");
  const done = await runAction(session, action);
  cached = null;
  await updateCount(session);
  return done;
}

/* Daily sync and the new-picks count */

async function backgroundSync(): Promise<void> {
  const prefs = await getPrefs();
  if (!prefs.backgroundSync || (await appIsOpen())) return;
  const session = await openSession();
  if (!session || !(await session.lastSynced())) return; // the app runs the first sync
  await keepAlive(async () => {
    await session.sync();
    for (const type of TYPES) await session.recommend(type);
    await session.save(true);
  });
  cached = null;
  await updateCount(session);
}

/** The top page of picks per type: what "new picks" is counted against. */
async function topPicks(session: Session): Promise<number[]> {
  const { limit } = await session.settings();
  const ids: number[] = [];
  for (const type of TYPES) {
    const picks = await session.picks(type);
    for (const r of picks?.recommendations.slice(0, limit) ?? []) ids.push(r.media.id);
  }
  return ids;
}

async function updateCount(session: Session): Promise<void> {
  const ids = await topPicks(session);
  const saved = (await ext.storage.local.get(SEEN_KEY))[SEEN_KEY] as number[] | undefined;
  if (!saved) {
    // Nothing seen yet: today's picks are the baseline, not "new".
    await ext.storage.local.set({ [SEEN_KEY]: ids });
    return showCount(0);
  }
  const seen = new Set(saved);
  await showCount(ids.filter((id) => !seen.has(id)).length);
}

async function showCount(count: number): Promise<void> {
  const { count: on } = await getPrefs();
  await ext.action?.setBadgeText({ text: on && count > 0 ? String(Math.min(count, 99)) : "" });
}

async function markSeen(): Promise<void> {
  const session = await readSession();
  if (session) await ext.storage.local.set({ [SEEN_KEY]: await topPicks(session) });
  await showCount(0);
}

/* Preferences: the alarm and the badge's content script follow them */

async function applyPrefs(): Promise<void> {
  const prefs = await getPrefs();
  if (ext.alarms) {
    if (prefs.backgroundSync) {
      if (!(await ext.alarms.get(SYNC_ALARM)))
        ext.alarms.create(SYNC_ALARM, { periodInMinutes: DAY_MINUTES, delayInMinutes: 10 });
    } else await ext.alarms.clear(SYNC_ALARM);
  }
  if (!prefs.count) await ext.action?.setBadgeText({ text: "" });
  await syncContentScript(prefs.badge);
}

async function syncContentScript(wanted: boolean): Promise<void> {
  const scripting = ext.scripting;
  if (!scripting) return;
  const allowed = wanted && (await ext.permissions.contains({ origins: [ANILIST_PAGES] }));
  const registered = (await scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT] }))
    .length;
  if (allowed && !registered) {
    await scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT,
        matches: [ANILIST_PAGES],
        js: ["content.js"],
        runAt: "document_idle",
        persistAcrossSessions: false,
      },
    ]);
  } else if (!allowed && registered) {
    await scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT] });
  }
}

/* Events */

async function handle(request: Request): Promise<unknown> {
  switch (request.kind) {
    case "verdict": {
      const session = await readSession();
      if (!session) return { state: "setup", reason: "Open Konomi.moe to sign in" };
      return verdictFor(session, request.id);
    }
    case "action":
      return act(request.action);
    case "openApp":
      await ext.runtime.openOptionsPage();
      return null;
    case "seen":
      await markSeen();
      return null;
  }
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message as Request).then(
    (result) => sendResponse({ ok: true, result } satisfies Reply),
    (e: unknown) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      } satisfies Reply),
  );
  return true; // answers asynchronously
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PREFS_KEY]) void applyPrefs();
});

// Taking away anilist.co access in the browser's settings turns the badge off.
ext.permissions.onRemoved.addListener((removed) => {
  if (removed.origins?.some((o) => o.includes("anilist.co"))) void setPrefs({ badge: false });
});

ext.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void backgroundSync().catch(() => {});
});

ext.runtime.onInstalled.addListener((details) => {
  void applyPrefs();
  // First install: open the app, where sign-in and the first sync happen.
  if (details.reason === "install") void ext.runtime.openOptionsPage();
});
ext.runtime.onStartup.addListener(() => void applyPrefs());
void ext.action?.setBadgeBackgroundColor({ color: "#ff6fa3" });
// Content scripts registered for this session only; register again whenever the worker starts.
void getPrefs().then((p) => syncContentScript(p.badge));
void allowEmbeds().catch(() => {});
