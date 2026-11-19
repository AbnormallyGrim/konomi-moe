/** The shared UI, ported from the approved mockup (design/mock/app.html). */

import {
  type Filters,
  FORMATS,
  GENRES,
  type Media,
  type MediaType,
  makeFilters,
  mediaLength,
  type Recommendation,
  requiredLabels,
  type SavedExclusions,
  STATUSES,
  type Theme,
  type TitleDetails,
  type Trailer,
} from "@konomi/engine";
import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import LOGO from "./assets/logo.png";
import type { Host, HostUser } from "./host.ts";
import { ANILIST_LOGO } from "./logos.ts";
import {
  displayTitle,
  type Picks,
  POOL,
  Session,
  type Settings,
  type Taste,
  type TitleLanguage,
  TYPES,
} from "./session.ts";
import { startTour } from "./tour.ts";

type View = "foryou" | "stats" | "settings";

const NAME = "Konomi.moe";

/** AniList allows 30 requests a minute; the client spaces them about this far apart. */
const SECONDS_PER_REQUEST = 2;

/* Helpers */

export const scoreColour = (s: number) =>
  `hsl(${Math.max(0, Math.min(120, (s - 45) * 2.6))}, 70%, 55%)`;
export const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString();
const kindWord = (t: MediaType) => (t === "ANIME" ? "anime" : "manga");
const FORMAT_NAMES: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV short",
  MOVIE: "Movie",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Special",
  MUSIC: "Music",
  MANGA: "Manga",
  NOVEL: "Light novel",
  ONE_SHOT: "One shot",
};
const formatName = (f: string | null) => (f ? (FORMAT_NAMES[f] ?? f) : "—");
/** AniList country codes offered as a filter. */
export const COUNTRIES: [string, string][] = [
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["CN", "China"],
  ["TW", "Taiwan"],
];
const countryName = (c: string) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
const STATUS_NAMES: Record<string, string> = {
  FINISHED: "Finished",
  RELEASING: "Releasing",
  NOT_YET_RELEASED: "Not yet released",
  CANCELLED: "Cancelled",
  HIATUS: "On hiatus",
};
const statusName = (s: string) => STATUS_NAMES[s] ?? s;
/** `tag:Iyashikei` → `["tag", "Iyashikei"]`. */
export function splitLabel(key: string): [string, string] {
  const i = key.indexOf(":");
  return i < 0 ? ["", key] : [key.slice(0, i), key.slice(i + 1)];
}
const LABEL_KINDS: Record<string, string> = {
  genre: "Genre",
  tag: "Tag",
  studio: "Studio",
  country: "Country",
  format: "Format",
};
/** A label key as shown: `country:KR` → "South Korea", `format:NOVEL` → "Light novel". */
export function labelName(key: string): string {
  const [kind, value] = splitLabel(key);
  return kind === "country" ? countryName(value) : kind === "format" ? formatName(value) : value;
}
/** "Tag: Gore", for tooltips and the blacklist search. */
const labelTitle = (key: string) =>
  `${LABEL_KINDS[splitLabel(key)[0]] ?? "Label"}: ${labelName(key)}`;
function ago(at: number | null): string {
  if (at === null) return "never";
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Icon({ d, cls = "icon" }: { d: string; cls?: string }) {
  return (
    <svg
      class={cls}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  foryou: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3",
  filters: "M3 5h18M6 12h12M10 19h4",
  caret: "M6 9l6 6 6-6",
  next: "M9 6l6 6-6 6",
  sliders: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4",
};

function Seg<T extends string>(props: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <fieldset class="seg" aria-label={props.label}>
      {props.options.map(([v, text]) => (
        <button
          type="button"
          key={v}
          class={v === props.value ? "on" : ""}
          aria-pressed={v === props.value}
          onClick={() => props.onChange(v)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  // A label, so clicking the drawn switch toggles the (invisible) checkbox inside it.
  return (
    <label class="switch">
      <input
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      <span />
    </label>
  );
}

/* Loading overlay */

/** What's running: a step, with how far through it is when that's known. */
export interface Busy {
  step: string;
  done?: number | undefined;
  total?: number | undefined;
}

function LoadingOverlay({ busy, note }: { busy: Busy; note?: string | null }) {
  const known = busy.total !== undefined && busy.total > 0;
  const done = Math.min(busy.done ?? 0, busy.total ?? 0);
  const left = known ? Math.max(0, (busy.total ?? 0) - done) * SECONDS_PER_REQUEST : 0;
  return (
    <div class="overlay" role="status" aria-live="polite">
      <div class="overlay-card">
        <span class="spinner big" />
        <h2>{busy.step}…</h2>
        <div class={`progress ${known ? "" : "indeterminate"}`}>
          <i style={known ? { width: `${(done / (busy.total ?? 1)) * 100}%` } : undefined} />
        </div>
        {known && left >= 5 && (
          <p class="muted">About {left < 60 ? `${left} s` : `${Math.ceil(left / 60)} min`} left</p>
        )}
        {note && <p class="overlay-note">{note}</p>}
      </div>
    </div>
  );
}

/* App */

export function App({ host }: { host: Host }) {
  const [session, setSession] = useState<Session | null>(null);
  const [needsUser, setNeedsUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The host's background first sync, while the page waits for it. */
  const [setup, setSetup] = useState<Busy | null>(null);
  /** Bumped when the store is reopened after an outside change, to start the page afresh. */
  const [revision, setRevision] = useState(0);

  /** The signed-in user as the host knows them (the extension adds a profile picture). */
  const [user, setUser] = useState<HostUser | null>(null);

  const start = useCallback(
    async (who: HostUser) => {
      const { name } = who;
      setUser(who);
      try {
        // If the host is already syncing (the Seanime plugin's first run), show the usual
        // loader with its progress and open the store once it's saved. A failed background
        // sync only means the page syncs itself, as it would have anyway.
        await host
          .waitForSetup?.((step, done, total) => setSetup({ step, done, total }))
          .catch(() => {});
        setSetup(null);
        setSession(await Session.open(host, name));
        setNeedsUser(false);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [host],
  );

  useEffect(() => {
    host.user().then(
      (u) => (u ? start(u) : setNeedsUser(true)),
      (e) => setError(errorText(e)),
    );
  }, [host, start]);

  // While the page is open, the extension's popup and AniList badge act through its session
  // (the page is then the store's only writer); redraw after their changes.
  useEffect(() => {
    if (!session || !host.serve) return;
    return host.serve(session, () => setRevision((r) => r + 1));
  }, [host, session]);

  if (error)
    return (
      <div class="empty">
        <h2>Something went wrong</h2>
        <p>{error}</p>
      </div>
    );
  if (needsUser)
    return (
      <Welcome
        host={host}
        onUser={async (who, typed) => {
          if (typed) await host.setUser?.(who.name);
          await start(who);
        }}
      />
    );
  if (setup) return <LoadingOverlay busy={setup} note={FIRST_SYNC_NOTE} />;
  if (!session)
    return (
      <div class="empty">
        <span class="spinner" />
      </div>
    );
  return <Shell key={revision} session={session} avatarUrl={user?.avatarUrl ?? null} />;
}

/** The user's AniList picture, or their initial when there's none or it fails to load. */
function UserAvatar({ name, url }: { name: string; url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken)
    return <img class="avatar" src={url} alt="" onError={() => setBroken(true)} />;
  return <div class="avatar">{name.slice(0, 1).toUpperCase()}</div>;
}

function Welcome(props: { host: Host; onUser: (user: HostUser, typed: boolean) => void }) {
  const { host } = props;
  const signIn = host.signIn?.bind(host);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  /** idle → waiting for AniList (the paste box shows) → checking the token. */
  const [step, setStep] = useState<"idle" | "waiting" | "checking">("idle");
  const [failed, setFailed] = useState<string | null>(null);
  const done = useRef(false);

  const finish = (user: HostUser) => {
    if (done.current) return;
    done.current = true;
    props.onUser(user, false);
  };
  const fail = (e: unknown) => {
    if (done.current) return;
    setFailed(errorText(e));
    setStep("idle");
  };

  return (
    <div class="welcome">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "waiting" && code.trim() && host.signInWithCode) {
            setStep("checking");
            host.signInWithCode(code.trim()).then(finish, fail);
          } else if (!signIn && name.trim()) props.onUser({ name: name.trim() }, true);
        }}
      >
        <img class="logo" src={LOGO} alt="" width={44} height={44} />
        <h1>Find your next favourite</h1>
        <p class="muted">
          Recommendations learned from your own anime and manga list: what you scored, finished and
          dropped. Everything stays on this device.
        </p>
        {signIn ? (
          <>
            {step !== "waiting" && (
              <button
                type="button"
                class="btn primary signin"
                disabled={step === "checking"}
                aria-busy={step === "checking"}
                onClick={() => {
                  setFailed(null);
                  setStep("waiting");
                  // Called straight from the click: the browser may ask for access to AniList.
                  signIn().then(finish, fail);
                }}
              >
                {step === "checking" ? (
                  <span class="spinner small" aria-hidden="true" />
                ) : (
                  <img src={ANILIST_LOGO} alt="" width={18} height={18} />
                )}
                {step === "checking" ? "Signing in…" : "Sign in with AniList"}
              </button>
            )}
            {step === "idle" && (
              <p class="muted signin-note">
                You approve {NAME} on AniList, which lets it read your lists (private ones too) and
                add picks to your planning list. Nothing else.
              </p>
            )}
            {step === "waiting" && (
              <>
                <div class="signin-wait">
                  <span class="spinner small" aria-hidden="true" />
                  Approve {NAME} in the AniList tab that opened.
                </div>
                {host.signInWithCode && (
                  <>
                    <label class="label" for="code">
                      Didn't come back here? Paste the code AniList shows
                    </label>
                    <input
                      id="code"
                      class="field"
                      value={code}
                      autocomplete="off"
                      spellcheck={false}
                      placeholder="eyJ0eXAiOiJKV1Qi…"
                      onInput={(e) => setCode((e.target as HTMLInputElement).value)}
                    />
                    <button
                      class="btn primary"
                      type="submit"
                      disabled={!code.trim()}
                      style="justify-content:center;height:42px"
                    >
                      Continue
                    </button>
                  </>
                )}
                <button
                  type="button"
                  class="btn ghost"
                  style="justify-content:center"
                  onClick={() => setStep("idle")}
                >
                  Start again
                </button>
              </>
            )}
            {failed && <p class="signin-error">{failed}</p>}
          </>
        ) : (
          <>
            <label class="label" for="username">
              AniList username
            </label>
            <input
              id="username"
              class="field"
              value={name}
              placeholder="Your public AniList username"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
            <button class="btn primary" type="submit" style="justify-content:center;height:42px">
              See my picks
            </button>
          </>
        )}
      </form>
    </div>
  );
}

/* Shell */

function Shell({ session, avatarUrl }: { session: Session; avatarUrl: string | null }) {
  const seanime = session.host.kind === "seanime";
  const [view, setView] = useState<View>("foryou");
  const [kind, setKind] = useState<MediaType>("ANIME");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }, []);

  useEffect(() => {
    session.settings().then(setSettings);
    session.lastSynced().then(setSynced);
  }, [session]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      setSettings(next);
      await session.setSettings(next);
    },
    [session],
  );

  const tour = useCallback(() => {
    const from = view;
    startTour({
      appName: NAME,
      setView,
      onEnd: async () => {
        setView(from);
        // Read the latest settings: the page may have saved others while the tour ran.
        await saveSettings({ ...(await session.settings()), tourSeen: true });
      },
    });
  }, [session, saveSettings, view]);

  // Once, on the first visit, after For you has finished loading (the first sync can take a
  // minute, and the tour would only cover the loading screen).
  const [loaded, setLoaded] = useState(false);
  const markLoaded = useCallback(() => setLoaded(true), []);
  const toured = useRef(false);
  useEffect(() => {
    if (!settings || settings.tourSeen || !loaded || toured.current) return;
    toured.current = true;
    tour();
  }, [settings, loaded, tour]);

  if (!settings) return null;
  const nav: [View, string][] = [
    ["foryou", "For you"],
    ["stats", "Stats"],
    ["settings", "Settings"],
  ];
  return (
    <div class={`shell ${seanime ? "host-seanime" : ""}`}>
      <aside class="side">
        <div class="brand">
          <img class="logo" src={LOGO} alt="" width={30} height={30} />
          {NAME}
        </div>
        {nav.map(([v, text]) => (
          <button
            type="button"
            key={v}
            class={`nav ${view === v ? "on" : ""}`}
            data-tour={`nav-${v}`}
            aria-current={view === v ? "page" : undefined}
            onClick={() => setView(v)}
          >
            <Icon d={ICONS[v]} />
            {text}
          </button>
        ))}
        <div class="side-foot">
          <div class="sync">
            <span class="dot" />
            Synced {ago(synced)}
          </div>
          <div class="me">
            <UserAvatar name={session.user} url={avatarUrl} />
            <div>
              {session.user}
              <small>AniList</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <div class="page-tabs" role="tablist">
          {nav.map(([v, text]) => (
            <button
              type="button"
              role="tab"
              key={v}
              aria-selected={view === v}
              class={`page-tab ${view === v ? "on" : ""}`}
              data-tour={`nav-${v}`}
              onClick={() => setView(v)}
            >
              {text}
            </button>
          ))}
          <span class="note">Signed in through Seanime · synced {ago(synced)}</span>
        </div>
        {view === "foryou" && (
          <ForYou
            session={session}
            kind={kind}
            setKind={setKind}
            settings={settings}
            saveSettings={saveSettings}
            setSynced={setSynced}
            toast={toast}
            onLoaded={markLoaded}
          />
        )}
        {view === "stats" && <StatsView session={session} kind={kind} setKind={setKind} />}
        {view === "settings" && (
          <SettingsView
            session={session}
            settings={settings}
            saveSettings={saveSettings}
            toast={toast}
            startTour={tour}
          />
        )}
      </main>
      <div class={`toast ${toastText ? "show" : ""}`} role="status">
        {toastText}
      </div>
    </div>
  );
}

/* For you */

const FIRST_SYNC_NOTE =
  "Setting up your recommendations. The first sync reads your whole anime and manga list and fetches details from AniList, which can take up to a minute.";

function ForYou(props: {
  session: Session;
  kind: MediaType;
  setKind: (k: MediaType) => void;
  settings: Settings;
  saveSettings: (s: Settings) => Promise<void>;
  setSynced: (at: number | null) => void;
  toast: (text: string) => void;
  /** Called when a load finishes: saved picks shown, or a sync and ranking done. */
  onLoaded: () => void;
}) {
  const { session, kind, settings, toast, onLoaded } = props;
  const lang = settings.titleLanguage;
  const [picks, setPicks] = useState<Picks | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [firstSync, setFirstSync] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mains, setMains] = useState<Map<number, string[]>>(new Map());
  const [open, setOpen] = useState<Recommendation | null>(null);
  const [pages, setPages] = useState(1);
  const [pool, setPool] = useState(POOL);
  const running = useRef(false);

  const report = useCallback(
    (step: string, done?: number, total?: number) => setBusy({ step, done, total }),
    [],
  );

  /** Sync (optionally) and rank; `size` is how many picks to rank. */
  const refresh = useCallback(
    async (alsoSync: boolean, size = POOL) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      try {
        if (alsoSync) {
          setFirstSync((await session.lastSynced()) === null);
          await session.sync(report);
          props.setSynced(await session.lastSynced());
        }
        report("Finding your picks");
        const found = await session.recommend(kind, report, size);
        setPicks(found);
        setPool(size);
        if (size === POOL) setPages(1);
        if (!found && alsoSync)
          setError(
            `No titles came back from your ${kindWord(kind)} list, so there's nothing to learn from yet.`,
          );
      } catch (e) {
        setError(errorText(e));
      } finally {
        running.current = false;
        setBusy(null);
        setFirstSync(false);
        onLoaded();
      }
    },
    [session, kind, report, props.setSynced, onLoaded],
  );

  // On open: show saved picks at once; sync first if nothing was ever synced.
  useEffect(() => {
    let live = true;
    (async () => {
      const saved = await session.picks(kind);
      if (!live) return;
      setPicks(saved);
      setPages(1);
      setPool(Math.max(POOL, saved?.recommendations.length ?? 0));
      if (saved) onLoaded();
      else await refresh((await session.lastSynced()) === null);
    })();
    return () => {
      live = false;
    };
  }, [session, kind, refresh, onLoaded]);

  const shown = useMemo(
    () => (picks?.recommendations ?? []).slice(0, pages * settings.limit),
    [picks, pages, settings.limit],
  );

  useEffect(() => {
    Promise.all(
      shown.map(
        async (r) =>
          [
            r.media.id,
            (await session.themesOf(r.media)).filter((t) => t.main).map((t) => t.genre),
          ] as const,
      ),
    ).then((pairs) => setMains(new Map(pairs)));
  }, [session, shown]);

  /** After an exclusion: show what's left at once, and rank more quietly if the page ran short. */
  const afterExclusion = async (left: Record<MediaType, Picks | null>) => {
    const mine = left[kind];
    setPicks(mine);
    if (mine && mine.recommendations.length < pages * settings.limit && !running.current) {
      setRefilling(true);
      running.current = true;
      try {
        setPicks(await session.recommend(kind, () => {}, pool));
      } catch (e) {
        setError(errorText(e));
      } finally {
        running.current = false;
        setRefilling(false);
      }
    }
  };

  const total = picks?.recommendations.length ?? 0;
  const more = total > shown.length || total >= pool;
  const showMore = async () => {
    if (total > shown.length) setPages(pages + 1);
    else {
      await refresh(false, pool + POOL);
      setPages(pages + 1);
    }
  };

  const filters = settings.filters[kind];
  return (
    <section class="view on">
      <div class="head">
        <div>
          <h1>For you</h1>
          <div class="sub">
            {picks
              ? `${kind === "ANIME" ? "Anime" : "Manga"} picks from your AniList · updated ${ago(picks.at)}`
              : "Picks from your AniList"}
          </div>
        </div>
        <div class="tools">
          <Seg
            label="Anime or manga"
            value={kind}
            options={[
              ["ANIME", "Anime"],
              ["MANGA", "Manga"],
            ]}
            onChange={props.setKind}
          />
        </div>
      </div>

      <FiltersPanel
        session={session}
        advancedOpen={settings.advancedOpen}
        setAdvancedOpen={(v) => props.saveSettings({ ...settings, advancedOpen: v })}
        kind={kind}
        filters={filters}
        busy={busy !== null}
        version={picks?.at ?? 0}
        onApply={async (f) => {
          // Anything now filtered by can't stay excluded.
          const required = requiredLabels(f);
          const next = { ...f, exclude: f.exclude.filter((k) => !required.has(k)) };
          await props.saveSettings({ ...settings, filters: { ...settings.filters, [kind]: next } });
          // Apply also reads the lists again, so new scores and drops count; only changes fetch.
          await refresh(true);
        }}
        onUnexclude={async (key) => {
          const next = { ...filters, exclude: filters.exclude.filter((k) => k !== key) };
          await props.saveSettings({ ...settings, filters: { ...settings.filters, [kind]: next } });
          // Titles it kept out were never ranked, so rank again (the lists aren't reread).
          await refresh(false);
          toast(`${labelName(key)} is back in this search`);
        }}
      />

      {busy && <LoadingOverlay busy={busy} note={firstSync ? FIRST_SYNC_NOTE : null} />}
      {refilling && (
        <div class="status">
          <span class="spinner" />
          Finding more picks…
        </div>
      )}
      {error && <div class="warn error">{error}</div>}
      {picks?.warnings.map((w) => (
        <div key={w} class="warn">
          {w}
        </div>
      ))}

      {!busy && picks === null && !error && (
        <div class="empty">
          <h2>No picks yet</h2>
          <p>Press Apply above to read your lists and find picks.</p>
        </div>
      )}
      {picks && shown.length === 0 && !busy && !refilling && (
        <div class="empty">
          <h2>Nothing matches</h2>
          <p>Try fewer filters or fewer exclusions.</p>
        </div>
      )}

      <div class="grid">
        {shown.map((r, i) => (
          <Card
            key={r.media.id}
            rec={r}
            rank={i + 1}
            title={displayTitle(r.media, lang)}
            mains={mains.get(r.media.id) ?? []}
            showRatings={settings.showRatings}
            onOpen={() => setOpen(r)}
            onNope={async () => {
              const title = displayTitle(r.media, lang);
              await afterExclusion(await session.notInterested(r.media));
              toast(`Not interested in ${title}. Future picks will lean away from it.`);
            }}
          />
        ))}
      </div>
      {shown.length > 0 && more && (
        <div class="more">
          <button type="button" class="btn" disabled={busy !== null} onClick={showMore}>
            Show more
          </button>
        </div>
      )}

      {open && (
        <Details
          session={session}
          rec={open}
          title={displayTitle(open.media, lang)}
          showRatings={settings.showRatings}
          onClose={() => setOpen(null)}
          filters={filters}
          onExcludeLabels={async (keys) => {
            setOpen(null);
            const done = await session.excludeLabels(kind, keys);
            await props.saveSettings(done.settings);
            await afterExclusion(done.left);
            if (done.excluded.length)
              toast(`Excluded ${done.excluded.map(labelName).join(", ")} from this search`);
          }}
          onPlanned={async (media) => {
            // It's on the list now, so it leaves the picks; the dialog stays open to show that.
            setPicks((await session.dropPicks((m) => m.id === media.id))[kind]);
            toast(`Added ${displayTitle(media, lang)} to your planning list`);
          }}
          toast={toast}
        />
      )}
    </section>
  );
}

function Card(props: {
  rec: Recommendation;
  rank: number;
  title: string;
  mains: string[];
  showRatings: boolean;
  onOpen: () => void;
  onNope: () => void;
}) {
  const { media: m, reasons } = props.rec;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the card holds its own ✕ button, and buttons can't nest
    <div
      class="card"
      role="button"
      tabIndex={0}
      aria-label={`#${props.rank} ${props.title}`}
      onClick={props.onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && props.onOpen()}
    >
      <div class="cv">
        {m.coverUrl ? (
          <img src={m.coverUrl} alt="" loading="lazy" />
        ) : (
          <span class="ph">No cover</span>
        )}
        <span class={`rank ${props.rank <= 3 ? "top3" : ""}`}>#{props.rank}</span>
        <span class="format">{formatName(m.format)}</span>
        <button
          type="button"
          class="nope"
          title="Not interested: hides it and its sequels, and teaches your picks to lean away"
          aria-label={`Not interested in ${props.title}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onNope();
          }}
        >
          ✕
        </button>
        {props.showRatings && m.averageScore !== null && (
          <span class="score">
            <i style={{ background: scoreColour(m.averageScore) }} />
            {m.averageScore}%
          </span>
        )}
        {props.showRatings && m.popularity !== null && (
          <span class="users">{compact(m.popularity)}</span>
        )}
      </div>
      <h3>{props.title}</h3>
      <div class="meta">
        {m.year ?? "—"}
        {m.status ? ` · ${statusName(m.status)}` : ""}
        {m.country && m.country !== "JP" ? ` · ${countryName(m.country)}` : ""}
      </div>
      {props.mains.length > 0 && <div class="main">Mainly {props.mains.join(" & ")}</div>}
      <div class="tags">
        {reasons.slice(0, 2).map((r) => (
          <span key={r.value} class="pill">
            {r.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Filters: one row of dropdowns with the chosen filters as chips, and an Advanced section */

type Pop = "genres" | "format" | "years" | "status";

/** Year presets in the Released dropdown, relative to this year. */
const YEAR_PRESETS: [string, (now: number) => [number | null, number | null]][] = [
  ["Last 5 years", (now) => [now - 4, null]],
  ["2010s", () => [2010, 2019]],
  ["2000s", () => [2000, 2009]],
  ["Before 2000", () => [null, 1999]],
];

/** Advanced filters that are on, for the count on the Advanced button. */
function advancedCount(f: Filters): number {
  return (
    f.tags.length +
    f.countries.length +
    (f.minTagRank && f.tags.length ? 1 : 0) +
    (f.minScore ? 1 : 0) +
    (f.hideListed ? 0 : 1) +
    (f.hideSeenAdaptations ? 1 : 0)
  );
}

function FiltersPanel(props: {
  session: Session;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  kind: MediaType;
  filters: Filters;
  busy: boolean;
  /** Changes after each run, so suggestions reload once the list is synced. */
  version: number;
  onApply: (f: Filters) => void;
  /** Puts an excluded label back into this search at once. */
  onUnexclude: (key: string) => void;
}) {
  const [f, setF] = useState(props.filters);
  useEffect(() => setF(props.filters), [props.filters]);
  // Blacklisted labels (Settings) can't be chosen as filters.
  const [blacklisted, setBlacklisted] = useState<Set<string>>(new Set());
  useEffect(() => {
    props.session.exclusions().then((e) => setBlacklisted(new Set(e.labels)));
  }, [props.session]);
  const [pop, setPop] = useState<Pop | null>(null);
  useEffect(() => {
    if (!pop) return;
    const down = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.(".dd")) setPop(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [pop]);

  const dirty = JSON.stringify(f) !== JSON.stringify(props.filters);
  const listWord = props.kind === "ANIME" ? "reading" : "watching";
  const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v.trim()) : null);
  const pill = (key: string, on: boolean, text: string, flip: () => void) => {
    const blocked = blacklisted.has(key) && !on;
    return (
      <button
        type="button"
        key={key}
        class={`pill btnlike ${on ? "on" : ""} ${blocked ? "blocked" : ""}`}
        aria-pressed={on}
        disabled={blocked}
        title={blocked ? `${text} is blacklisted in Settings` : undefined}
        onClick={flip}
      >
        {text}
      </button>
    );
  };
  const clear = (onClick: () => void) => (
    <button type="button" class="linkish" onClick={onClick}>
      Clear
    </button>
  );
  const dropdown = (
    id: Pop,
    name: string,
    count: number,
    set: boolean,
    body: ComponentChildren,
  ) => (
    <div class="dd">
      <button
        type="button"
        class={`trigger ${set ? "set" : ""} ${pop === id ? "open" : ""}`}
        aria-expanded={pop === id}
        onClick={() => setPop(pop === id ? null : id)}
      >
        <span class="t-name">{name}</span>
        {count > 0 && <span class="count">{count}</span>}
        <Icon d={ICONS.caret} cls="caret" />
      </button>
      {pop === id && <div class={`pop ${id === "genres" ? "wide" : ""}`}>{body}</div>}
    </div>
  );

  // The chosen filters, each a chip that removes itself (applied with the rest).
  const range =
    f.yearFrom && f.yearTo
      ? f.yearFrom === f.yearTo
        ? `${f.yearFrom}`
        : `${f.yearFrom}–${f.yearTo}`
      : f.yearFrom
        ? `From ${f.yearFrom}`
        : f.yearTo
          ? `Until ${f.yearTo}`
          : null;
  const kept: [string, string, () => void][] = [
    ...f.genres.map((g): [string, string, () => void] => [
      `genre:${g}`,
      g,
      () => setF({ ...f, genres: toggle(f.genres, g) }),
    ]),
    ...(f.mainTheme && f.genres.length
      ? [
          ["main", "Main theme", () => setF({ ...f, mainTheme: false })] as [
            string,
            string,
            () => void,
          ],
        ]
      : []),
    ...f.formats.map((x): [string, string, () => void] => [
      `format:${x}`,
      formatName(x),
      () => setF({ ...f, formats: toggle(f.formats, x) }),
    ]),
    ...(range
      ? [
          ["years", range, () => setF({ ...f, yearFrom: null, yearTo: null })] as [
            string,
            string,
            () => void,
          ],
        ]
      : []),
    ...f.statuses.map((s): [string, string, () => void] => [
      `status:${s}`,
      statusName(s),
      () => setF({ ...f, statuses: toggle(f.statuses, s) }),
    ]),
    ...(f.minScore
      ? [
          ["score", `Score ${f.minScore}%+`, () => setF({ ...f, minScore: 0 })] as [
            string,
            string,
            () => void,
          ],
        ]
      : []),
    ...f.tags.map((t): [string, string, () => void] => [
      `tag:${t}`,
      t,
      () => setF({ ...f, tags: toggle(f.tags, t) }),
    ]),
    ...(f.minTagRank && f.tags.length
      ? [
          ["rank", `Tags ${f.minTagRank}%+`, () => setF({ ...f, minTagRank: 0 })] as [
            string,
            string,
            () => void,
          ],
        ]
      : []),
    ...f.countries.map((c): [string, string, () => void] => [
      `country:${c}`,
      countryName(c),
      () => setF({ ...f, countries: toggle(f.countries, c) }),
    ]),
    ...(f.hideListed
      ? []
      : [
          ["listed", "Showing my titles", () => setF({ ...f, hideListed: true })] as [
            string,
            string,
            () => void,
          ],
        ]),
    ...(f.hideSeenAdaptations
      ? [
          [
            "seen",
            `Hiding my ${listWord} list`,
            () => setF({ ...f, hideSeenAdaptations: false }),
          ] as [string, string, () => void],
        ]
      : []),
  ];
  const chips = [
    ...kept.map(([key, text, remove]) => (
      <button
        type="button"
        key={key}
        class="pill btnlike on"
        title={`Remove ${text}`}
        onClick={remove}
      >
        {text} <span class="x">✕</span>
      </button>
    )),
    // Excluded from this search: put back at once, like before.
    ...f.exclude.map((k) => (
      <button
        type="button"
        key={`not:${k}`}
        class="pill btnlike excluded"
        title={`Excluded from this search. Put ${labelTitle(k)} back`}
        aria-label={`Put ${labelName(k)} back in this search`}
        disabled={props.busy}
        onClick={() => props.onUnexclude(k)}
      >
        <span class="kind">not</span> {labelName(k)} <span class="x">✕</span>
      </button>
    )),
  ];

  return (
    <div class="fx" data-tour="filters">
      <div class="fx-row">
        {dropdown(
          "genres",
          "Genres",
          f.genres.length,
          f.genres.length > 0,
          <>
            <div class="pop-grid">
              {GENRES.map((g) => (
                <Check
                  key={g}
                  on={f.genres.includes(g)}
                  text={g}
                  blocked={blacklisted.has(`genre:${g}`)}
                  onClick={() => setF({ ...f, genres: toggle(f.genres, g) })}
                />
              ))}
            </div>
            <div class="pop-theme">
              <Toggle
                small
                label="Enforce as main theme"
                checked={f.mainTheme}
                onChange={(v) => setF({ ...f, mainTheme: v })}
              />
            </div>
            <div class="pop-foot">
              <span class="muted">Titles must have every genre you pick</span>
              {clear(() => setF({ ...f, genres: [] }))}
            </div>
          </>,
        )}
        {dropdown(
          "format",
          "Format",
          f.formats.length,
          f.formats.length > 0,
          <>
            <div class="pop-list">
              {(FORMATS[props.kind] ?? []).map((x) => (
                <Check
                  key={x}
                  on={f.formats.includes(x)}
                  text={formatName(x)}
                  blocked={blacklisted.has(`format:${x}`)}
                  onClick={() => setF({ ...f, formats: toggle(f.formats, x) })}
                />
              ))}
            </div>
            <div class="pop-foot end">{clear(() => setF({ ...f, formats: [] }))}</div>
          </>,
        )}
        {dropdown(
          "years",
          "Released",
          0,
          Boolean(f.yearFrom || f.yearTo),
          <>
            <div class="label">First released</div>
            <div class="years">
              <input
                class="field"
                aria-label="From year"
                placeholder="Any"
                value={f.yearFrom ?? ""}
                onChange={(e) =>
                  setF({ ...f, yearFrom: year((e.target as HTMLInputElement).value) })
                }
              />
              <span class="muted">to</span>
              <input
                class="field"
                aria-label="To year"
                placeholder="Any"
                value={f.yearTo ?? ""}
                onChange={(e) => setF({ ...f, yearTo: year((e.target as HTMLInputElement).value) })}
              />
            </div>
            <div class="label" style="margin-top:.85rem">
              Quick picks
            </div>
            <div class="pills">
              {YEAR_PRESETS.map(([text, span]) => (
                <button
                  type="button"
                  key={text}
                  class="pill btnlike"
                  onClick={() => {
                    const [yearFrom, yearTo] = span(new Date().getFullYear());
                    setF({ ...f, yearFrom, yearTo });
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
            <div class="pop-foot end">
              {clear(() => setF({ ...f, yearFrom: null, yearTo: null }))}
            </div>
          </>,
        )}
        {dropdown(
          "status",
          "Status",
          f.statuses.length,
          f.statuses.length > 0,
          <>
            <div class="pop-list">
              {(STATUSES[props.kind] ?? []).map((s) => (
                <Check
                  key={s}
                  on={f.statuses.includes(s)}
                  text={statusName(s)}
                  onClick={() => setF({ ...f, statuses: toggle(f.statuses, s) })}
                />
              ))}
            </div>
            <div class="pop-foot end">{clear(() => setF({ ...f, statuses: [] }))}</div>
          </>,
        )}
        <button
          type="button"
          class={`adv-btn ${props.advancedOpen ? "open" : ""}`}
          aria-expanded={props.advancedOpen}
          onClick={() => props.setAdvancedOpen(!props.advancedOpen)}
        >
          <Icon d={ICONS.sliders} />
          Advanced
          {advancedCount(f) > 0 && <span class="count">{advancedCount(f)}</span>}
          <Icon d={ICONS.caret} cls="caret" />
        </button>
        <ChipStrip count={chips.length}>
          {chips.length ? chips : <span class="muted">No filters: picks from everything</span>}
        </ChipStrip>
        {chips.length > 0 && (
          <button
            type="button"
            class="round small"
            title="Clear all filters"
            aria-label="Clear all filters"
            onClick={() => setF(makeFilters())}
          >
            ✕
          </button>
        )}
        <button
          type="button"
          class={`btn primary ${dirty ? "" : "idle"}`}
          disabled={props.busy}
          title={dirty ? "Unapplied changes" : "Apply also rereads your lists"}
          onClick={() => props.onApply(f)}
        >
          Apply
          {dirty && <span class="dot-new" />}
        </button>
      </div>
      {props.advancedOpen && (
        <div class="adv-body">
          {/* Each column is a two-row subgrid, so the two sliders share a row and line up. */}
          <div class="adv-col">
            <div>
              <div class="label">Tags</div>
              <TagPicker
                session={props.session}
                kind={props.kind}
                version={props.version}
                chosen={f.tags}
                blocked={blacklisted}
                onChange={(tags) => setF({ ...f, tags })}
              />
            </div>
            <TagRank
              value={f.minTagRank}
              active={f.tags.length > 0}
              onChange={(minTagRank) => setF({ ...f, minTagRank })}
            />
          </div>
          <div class="adv-col">
            <div>
              <div class="label">Country of origin</div>
              <div class="pills">
                {COUNTRIES.map(([code, name]) =>
                  pill(`country:${code}`, f.countries.includes(code), name, () =>
                    setF({ ...f, countries: toggle(f.countries, code) }),
                  ),
                )}
              </div>
              <div class="label" style="margin-top:1rem">
                Your list
              </div>
              <div class="toggles">
                <Toggle
                  label="Hide my titles"
                  checked={f.hideListed}
                  onChange={(v) => setF({ ...f, hideListed: v })}
                />
                <Toggle
                  label={`Hide titles on my ${listWord} list`}
                  checked={f.hideSeenAdaptations}
                  onChange={(v) => setF({ ...f, hideSeenAdaptations: v })}
                />
              </div>
            </div>
            <ScoreMin value={f.minScore} onChange={(minScore) => setF({ ...f, minScore })} />
          </div>
        </div>
      )}
    </div>
  );
}

/** A checkbox row in a dropdown. */
function Check(props: { on: boolean; text: string; blocked?: boolean; onClick: () => void }) {
  const blocked = Boolean(props.blocked) && !props.on;
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={props.on}
      class={`check ${props.on ? "on" : ""} ${blocked ? "blocked" : ""}`}
      disabled={blocked}
      title={blocked ? `${props.text} is blacklisted in Settings` : undefined}
      onClick={props.onClick}
    >
      <span class="box">{props.on ? "✓" : ""}</span>
      {props.text}
    </button>
  );
}

/**
 * The chosen filters on one line that never grows: past its width it scrolls sideways (the
 * mouse wheel too), with faded edges and a "+N" count of the chips out of sight.
 */
function ChipStrip(props: { count: number; children: ComponentChildren }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false, hidden: 0 });
  const count = useRef(props.count);
  const measure = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const over = t.scrollWidth > t.clientWidth + 1;
    const edge = t.scrollLeft + t.clientWidth;
    setEdges({
      left: over && t.scrollLeft > 1,
      right: over && edge < t.scrollWidth - 1,
      hidden: [...t.children].filter(
        (c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth / 2 > edge,
      ).length,
    });
  }, []);
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    // A wheel scrolls it sideways, so mouse users needn't hold Shift.
    const wheel = (e: WheelEvent) => {
      if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      t.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(t);
    t.addEventListener("wheel", wheel, { passive: false });
    return () => {
      resize.disconnect();
      t.removeEventListener("wheel", wheel);
    };
  }, [measure]);
  useEffect(() => {
    const t = track.current;
    // A chip was added: it lands at the end, so bring the end into view.
    if (t && props.count > count.current) t.scrollTo({ left: t.scrollWidth, behavior: "smooth" });
    count.current = props.count;
    measure();
  });
  const by = (dir: number) => {
    const t = track.current;
    t?.scrollBy({ left: dir * t.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <div class={`chip-strip ${edges.left ? "fade-l" : ""} ${edges.right ? "fade-r" : ""}`}>
      <div class="chip-track" ref={track} onScroll={measure}>
        {props.children}
      </div>
      <button
        type="button"
        class="chip-more l"
        aria-label="Scroll filters left"
        onClick={() => by(-1)}
      >
        <Icon d={ICONS.next} cls="caret" />
      </button>
      <button
        type="button"
        class="chip-more r"
        aria-label={`${edges.hidden} more filters`}
        onClick={() => by(1)}
      >
        {edges.hidden > 0 && `+${edges.hidden}`}
        <Icon d={ICONS.next} cls="caret" />
      </button>
    </div>
  );
}

/** Minimum tag percentage (AniList's tag rank); 0 is off. Dimmed until a tag is chosen. */
function TagRank(props: { value: number; active: boolean; onChange: (v: number) => void }) {
  const on = props.value > 0;
  return (
    <div class={`tagmin ${on ? "on" : ""} ${props.active ? "" : "idle"}`}>
      <div class="tagmin-head">
        <span>Minimum tag percentage</span>
        <b>{on ? `${props.value}%+` : "Off"}</b>
        {on && (
          <button type="button" class="linkish muted" onClick={() => props.onChange(0)}>
            Turn off
          </button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={props.value}
        aria-label="Minimum tag percentage"
        aria-valuetext={on ? `${props.value}% or more` : "Off"}
        style={{ "--p": `${props.value}%` }}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
      <div class="tagmin-ticks">
        <span>Off</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      <div class="hint">
        {props.active
          ? "Only count a tag where AniList ranks it at least this relevant to the title."
          : "Applies once you pick a tag."}
      </div>
    </div>
  );
}

/** The lowest AniList average score to show, in Advanced beside the tag percentage. */
function ScoreMin(props: { value: number; onChange: (v: number) => void }) {
  const on = props.value > 0;
  return (
    <div class={`tagmin ${on ? "on" : ""}`}>
      <div class="tagmin-head">
        <span>Minimum AniList score</span>
        <b>{on ? `${props.value}%+` : "Off"}</b>
        {on && (
          <button type="button" class="linkish muted" onClick={() => props.onChange(0)}>
            Turn off
          </button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={props.value}
        aria-label="Minimum AniList score"
        aria-valuetext={on ? `${props.value}% or more` : "Off"}
        style={{ "--p": `${props.value}%` }}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
      <div class="tagmin-ticks">
        <span>Off</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      <div class="hint">
        Only titles AniList's users average at least this high; titles without a score yet are left
        out.
      </div>
    </div>
  );
}

/** Pick tags from AniList's full list, with the user's own top tags one click away. */
function TagPicker(props: {
  session: Session;
  kind: MediaType;
  version: number;
  chosen: string[];
  /** Blacklisted labels (`tag:…`), left out of the choices. */
  blocked?: Set<string>;
  onChange: (tags: string[]) => void;
}) {
  const [all, setAll] = useState<string[]>([]);
  const [yours, setYours] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    props.session.tagNames().then(setAll);
  }, [props.session]);
  useEffect(() => {
    props.session.tasteFor(props.kind).then(
      (t) => setYours(t?.likedTags.slice(0, 8) ?? []),
      () => setYours([]),
    );
  }, [props.session, props.kind, props.version]);

  const q = query.trim().toLowerCase();
  const offered = (t: string) => !props.chosen.includes(t) && !props.blocked?.has(`tag:${t}`);
  const matches = (q ? all.filter((t) => t.toLowerCase().includes(q)) : all).filter(offered);
  const add = (t: string) => {
    props.onChange([...props.chosen, t]);
    setQuery("");
  };

  return (
    <div class="tag-picker">
      {props.chosen.length > 0 && (
        <div class="pills" style="margin-bottom:.5rem">
          {props.chosen.map((t) => (
            <button
              type="button"
              key={t}
              class="pill btnlike on"
              title={`Remove ${t}`}
              onClick={() => props.onChange(props.chosen.filter((x) => x !== t))}
            >
              {t} <span class="x">✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        class="field"
        aria-label="Search tags"
        placeholder={all.length ? `Search ${all.length} AniList tags…` : "Loading tags…"}
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            add(matches[0]);
          }
        }}
      />
      {focused && matches.length > 0 && (
        <div class="tag-menu" role="listbox">
          {matches.map((t) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={t}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {yours.filter(offered).length > 0 && (
        <div class="pills" style="margin-top:.5rem;align-items:center">
          <span class="muted" style="font-size:.78rem">
            Your top tags:
          </span>
          {yours.filter(offered).map((t) => (
            <button type="button" key={t} class="pill btnlike" onClick={() => add(t)}>
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
}) {
  return (
    <label class={`toggle ${props.small ? "small" : ""}`}>
      <span class="switch">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
        />
        <span />
      </span>
      {props.label}
    </label>
  );
}

/* Details */

function Details(props: {
  session: Session;
  rec: Recommendation;
  title: string;
  showRatings: boolean;
  /** The current search's filters: what they ask for can't be excluded. */
  filters: Filters;
  onClose: () => void;
  onExcludeLabels: (keys: string[]) => void;
  onPlanned: (media: Media) => void;
  toast: (text: string) => void;
}) {
  const { session, rec, onClose } = props;
  const m = rec.media;
  const host = session.host;
  const [themes, setThemes] = useState<Theme[]>([]);
  const [details, setDetails] = useState<TitleDetails | null | "failed">(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [planning, setPlanning] = useState<"idle" | "busy" | "done" | "listed">("idle");
  /** The trailer playing in the embedded player, on hosts that can embed one. */
  const [playing, setPlaying] = useState<Trailer | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    session.themesOf(m).then(setThemes);
    session.titleDetails(m.id).then(setDetails, () => setDetails("failed"));
    // Escape closes the player first, then the dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playingRef.current) setPlaying(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("dialog-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("dialog-open");
    };
  }, [session, m, onClose]);

  const labels = useMemo(
    () => [
      ...m.genres.map((g) => `genre:${g}`),
      ...m.tags
        .filter((t) => !t.spoiler)
        .slice(0, 8)
        .map((t) => `tag:${t.name}`),
      ...m.studios.map((s) => `studio:${s}`),
      ...(m.format ? [`format:${m.format}`] : []),
      ...(m.country ? [`country:${m.country}`] : []),
    ],
    [m],
  );
  const filtering = useMemo(() => requiredLabels(props.filters), [props.filters]);
  const dist = m.scoreDistribution ?? [];
  const max = Math.max(1, ...dist.map(([, n]) => n));
  const length = mediaLength(m);
  const unit = m.type === "ANIME" ? "episode" : "chapter";

  return (
    <>
      <button type="button" class="scrim open" tabIndex={-1} aria-label="Close" onClick={onClose} />
      <div class="drawer open" role="dialog" aria-modal="true" aria-label={props.title}>
        <button type="button" class="close" title="Close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div class="dtop">
          <div class="dcover">
            {m.coverUrl ? <img src={m.coverUrl} alt="" /> : null}
            {details && details !== "failed" && details.trailer && (
              <TrailerButton
                trailer={details.trailer}
                onOpen={async (trailer) => {
                  // Only YouTube is embedded: Dailymotion's player answered 403 when tested.
                  if (host.embedsTrailers && trailer.site === "youtube") {
                    setPlaying(trailer);
                    return;
                  }
                  if (!host.openTrailer) {
                    window.open(trailer.url, "_blank", "noopener");
                    return;
                  }
                  try {
                    await host.openTrailer(m, trailer);
                  } catch (e) {
                    props.toast(`Couldn't open the trailer: ${errorText(e)}`);
                  }
                }}
              />
            )}
          </div>
          <div class="dinfo">
            <h2>{props.title}</h2>
            <div class="muted" style="font-size:.88rem">
              {formatName(m.format)} · {m.year ?? "—"}
              {m.status ? ` · ${statusName(m.status)}` : ""}
              {length ? ` · ${length} ${unit}${length === 1 ? "" : "s"}` : ""}
              {m.studios[0] ? ` · ${m.studios[0]}` : ""}
              {m.country ? ` · ${countryName(m.country)}` : ""}
            </div>
            <div class="themes">
              {themes.slice(0, 5).map((t) => (
                <span key={t.genre} class={`theme ${t.main ? "main" : ""}`}>
                  {t.genre}
                  {t.main ? " · main theme" : ""}
                </span>
              ))}
            </div>
            {props.showRatings && m.averageScore !== null && (
              <div class="ratings">
                <div class="metrics">
                  <Metric name="Average" value={`${m.averageScore}%`} />
                  <Metric name="Mean" value={m.meanScore !== null ? `${m.meanScore}%` : "—"} />
                  <Metric
                    name="Users"
                    value={m.popularity !== null ? compact(m.popularity) : "—"}
                  />
                  <Metric
                    name="Favourites"
                    value={m.favourites !== null ? compact(m.favourites) : "—"}
                  />
                </div>
                {dist.length > 0 && (
                  <>
                    <div class="dist">
                      {dist.map(([s, n]) => (
                        <span
                          key={s}
                          title={`${s}: ${n.toLocaleString()} users`}
                          style={{
                            height: `${Math.max(3, (n / max) * 100)}%`,
                            background: `hsl(${((s - 10) / 90) * 120},65%,52%)`,
                          }}
                        />
                      ))}
                    </div>
                    <div class="dist-axis">
                      {dist.map(([s]) => (
                        <span key={s}>{s}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div class="synopsis">
              {details === null
                ? "Loading the description…"
                : details === "failed"
                  ? ""
                  : details.description}
            </div>
          </div>
        </div>
        <div class="dfoot">
          <div class="actions">
            {host.addToPlanning ? (
              <button
                type="button"
                class={`btn primary ${planning === "done" || planning === "listed" ? "done" : ""}`}
                disabled={planning !== "idle"}
                aria-busy={planning === "busy"}
                onClick={async () => {
                  setPlanning("busy");
                  try {
                    await session.addToPlanning(m);
                    setPlanning("done");
                    props.onPlanned(m);
                  } catch (e) {
                    const listed = errorText(e).includes("already on your list");
                    setPlanning(listed ? "listed" : "idle");
                    props.toast(
                      listed ? "It's already on your list" : `Couldn't add it: ${errorText(e)}`,
                    );
                  }
                }}
              >
                {planning === "busy" ? (
                  <>
                    <span class="spinner small" aria-hidden="true" />
                    Adding…
                  </>
                ) : planning === "done" ? (
                  "✓ On your planning list"
                ) : planning === "listed" ? (
                  "Already on your list"
                ) : (
                  "＋ Add to planning"
                )}
              </button>
            ) : null}
            {host.kind === "seanime" && (
              <button type="button" class="btn" onClick={() => host.openTitle(m)}>
                Open in Seanime
              </button>
            )}
            <button
              type="button"
              class="btn site"
              title="Open on AniList"
              onClick={async () => {
                if (!host.openOnSite) {
                  if (m.siteUrl) window.open(m.siteUrl, "_blank", "noopener");
                  return;
                }
                try {
                  await host.openOnSite(m);
                } catch (e) {
                  props.toast(`Couldn't open AniList: ${errorText(e)}`);
                }
              }}
            >
              <img src={ANILIST_LOGO} alt="" width={18} height={18} />
              AniList
            </button>
          </div>
          <div>
            <div class="label">Exclude from this search</div>
            <div class="chips dtags" style="margin:0">
              {labels.map((k) => {
                // Excluding what the search filters by would leave nothing to find.
                const locked = filtering.has(k);
                return (
                  <button
                    type="button"
                    key={k}
                    class={`pill btnlike ${chosen.includes(k) ? "on" : ""} ${locked ? "blocked" : ""}`}
                    aria-pressed={chosen.includes(k)}
                    disabled={locked}
                    title={
                      locked
                        ? `You're filtering by ${labelName(k)}, so it can't be excluded`
                        : labelTitle(k)
                    }
                    onClick={() => setChosen(toggle(chosen, k))}
                  >
                    {labelName(k)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              class="btn"
              disabled={!chosen.length}
              style={{ marginTop: ".6rem", opacity: chosen.length ? 1 : 0.5 }}
              onClick={() => props.onExcludeLabels(chosen)}
            >
              {chosen.length ? `Exclude ${chosen.length} selected` : "Exclude selected"}
            </button>
          </div>
          {details === null && (
            <div class="muted people-loading">Loading characters and staff…</div>
          )}
          {details && details !== "failed" && <People details={details} />}
        </div>
      </div>
      {playing && (
        <TrailerPlayer trailer={playing} title={props.title} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}

const SITE_NAMES: Record<Trailer["site"], string> = {
  youtube: "YouTube",
  dailymotion: "Dailymotion",
};

/**
 * The trailer's thumbnail under the cover. It plays the video in `TrailerPlayer` where the host
 * can embed it (the browser extension), and opens it on its site elsewhere (Seanime).
 */
function TrailerButton(props: { trailer: Trailer; onOpen: (trailer: Trailer) => void }) {
  const { trailer } = props;
  const site = SITE_NAMES[trailer.site];
  return (
    <button
      type="button"
      class="trailer"
      title={`Watch the trailer on ${site}`}
      aria-label={`Watch the trailer on ${site}`}
      style={trailer.thumbnail ? { backgroundImage: `url("${trailer.thumbnail}")` } : undefined}
      onClick={() => props.onOpen(trailer)}
    >
      <span class="tr-play" aria-hidden="true" />
      <span class="tr-tag">▶ Trailer · {site}</span>
    </button>
  );
}

/** The site's player parameters: start at once, and no unrelated videos at the end. */
function playerUrl(trailer: Trailer): string {
  const url = new URL(trailer.embedUrl);
  url.searchParams.set("autoplay", "1");
  if (trailer.site === "youtube") {
    url.searchParams.set("rel", "0");
    url.searchParams.set("playsinline", "1");
  }
  return url.href;
}

/** A large embedded player over the dialog, with a link to the video's own page. */
function TrailerPlayer(props: { trailer: Trailer; title: string; onClose: () => void }) {
  const { trailer } = props;
  const site = SITE_NAMES[trailer.site];
  return (
    <div class="player" role="dialog" aria-modal="true" aria-label={`Trailer: ${props.title}`}>
      <button
        type="button"
        class="player-scrim"
        tabIndex={-1}
        aria-label="Close the trailer"
        onClick={props.onClose}
      />
      <div class="player-box">
        <div class="player-frame">
          <iframe
            src={playerUrl(trailer)}
            title={`${props.title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerpolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div class="player-bar">
          <span class="player-title">{props.title}</span>
          <a class="btn" href={trailer.url} target="_blank" rel="noopener noreferrer">
            Open on {site} ↗
          </a>
          <button type="button" class="btn" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_NAMES: Record<string, string> = {
  MAIN: "Main",
  SUPPORTING: "Supporting",
  BACKGROUND: "Background",
};

function Avatar({ src, round, size }: { src: string | null; round?: boolean; size: number }) {
  const style = { width: `${size}px`, height: `${round ? size : Math.round(size * 1.33)}px` };
  return src ? (
    <img
      class={`avatar-img ${round ? "round" : ""}`}
      src={src}
      alt=""
      loading="lazy"
      style={style}
    />
  ) : (
    <span class={`avatar-img ph ${round ? "round" : ""}`} style={style} />
  );
}

/** Characters (with voice actors) and key staff, below the tags in a title's dialog. */
function People({ details }: { details: TitleDetails }) {
  return (
    <>
      {details.characters.length > 0 && (
        <div>
          <div class="label">Characters</div>
          <div class="people-grid">
            {details.characters.map((c) => (
              <div key={c.id} class="person">
                <Avatar src={c.image} size={44} />
                <div class="who">
                  <b>{c.name}</b>
                  <small>{ROLE_NAMES[c.role] ?? c.role}</small>
                  {c.voiceActor && (
                    <span class="va" title="Japanese voice actor">
                      <Avatar src={c.voiceActor.image} size={18} round />
                      {c.voiceActor.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {details.staff.length > 0 && (
        <div>
          <div class="label">Staff</div>
          <div class="people-grid">
            {details.staff.map((s) => (
              <div key={s.id} class="person">
                <Avatar src={s.image} size={38} round />
                <div class="who">
                  <b>{s.name}</b>
                  <small>{s.roles.join(", ")}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ name, value }: { name: string; value: string }) {
  return (
    <div class="metric">
      <span>{name}</span>
      <b>{value}</b>
    </div>
  );
}

/* Stats */

function StatsView(props: { session: Session; kind: MediaType; setKind: (k: MediaType) => void }) {
  const [taste, setTaste] = useState<Taste | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTaste(undefined);
    props.session.tasteFor(props.kind).then(setTaste, (e) => setError(errorText(e)));
  }, [props.session, props.kind]);

  const bars = (rows: [string, number][], colour: string) => {
    const top = Math.max(1e-9, ...rows.map(([, w]) => Math.abs(w)));
    return rows.map(([k, w]) => {
      const [kind, name] = splitLabel(k);
      return (
        <div key={k} class="barrow">
          <span>
            {name}
            <small>{kind}</small>
          </span>
          <div class="bar">
            <i style={{ width: `${(Math.abs(w) / top) * 100}%`, background: colour }} />
          </div>
          <span class="muted">{Math.abs(w).toFixed(2)}</span>
        </div>
      );
    });
  };

  return (
    <section class="view on">
      <div class="head">
        <div>
          <h1>Stats</h1>
          <div class="sub">
            {taste
              ? `Learned from your anime and manga lists together; showing what appears in your ${kindWord(props.kind)} list`
              : "What the recommendations learned from your lists"}
          </div>
        </div>
        <div class="tools">
          <Seg
            label="Anime or manga"
            value={props.kind}
            options={[
              ["ANIME", "Anime"],
              ["MANGA", "Manga"],
            ]}
            onChange={props.setKind}
          />
        </div>
      </div>
      {error && <div class="warn error">{error}</div>}
      {taste === undefined && !error && <LoadingOverlay busy={{ step: "Reading your list" }} />}
      {taste === null && (
        <div class="empty">
          <h2>No {kindWord(props.kind)} list yet</h2>
          <p>Sync your list from the For you page first.</p>
        </div>
      )}
      {taste && (
        <>
          <div class="stats">
            <Stat name="On your list" value={String(taste.onList)} />
            <Stat name="Scored" value={String(taste.scored)} />
            <Stat
              name="Your average"
              value={taste.mean !== null ? taste.mean.toFixed(1) : "—"}
              suffix=" / 10"
            />
            <Stat name="Learned from" value={String(taste.learnedFrom)} />
          </div>
          <div class="two">
            <div class="panel">
              <h2>You tend to enjoy</h2>
              {bars(taste.likes, "linear-gradient(90deg, var(--accent), #a99cff)")}
            </div>
            <div class="panel">
              <h2>You tend to avoid</h2>
              {bars(taste.dislikes, "linear-gradient(90deg, var(--accent-2), #ff9cc0)")}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ name, value, suffix }: { name: string; value: string; suffix?: string }) {
  return (
    <div class="stat">
      <span class="muted">{name}</span>
      <b>
        {value}
        {suffix && (
          <span class="muted" style="font-size:1rem">
            {suffix}
          </span>
        )}
      </b>
    </div>
  );
}

/* Settings */

function SettingsView(props: {
  session: Session;
  settings: Settings;
  saveSettings: (s: Settings) => Promise<void>;
  toast: (text: string) => void;
  startTour: () => void;
}) {
  const { session, settings } = props;
  const seanime = session.host.kind === "seanime";
  const set = (change: Partial<Settings>) => props.saveSettings({ ...settings, ...change });
  const languages: [TitleLanguage, string][] = [
    ["english", "English (Attack on Titan)"],
    ["romaji", "Romaji (Shingeki no Kyojin)"],
    ["native", "Native (進撃の巨人)"],
  ];
  return (
    <section class="view on">
      <div class="head">
        <div>
          <h1>Settings</h1>
          <div class="sub">
            {seanime
              ? "Uses the AniList account you're signed in with in Seanime"
              : `Signed in as ${session.user} · stored on this device`}
          </div>
        </div>
      </div>
      <div class="settings">
        <h2 class="section">Preferences</h2>
        <Setting name="Title language" hint="Falls back to another language when AniList has none">
          <select
            class="field"
            style="width:240px"
            aria-label="Title language"
            value={settings.titleLanguage}
            onChange={(e) =>
              set({ titleLanguage: (e.target as HTMLSelectElement).value as TitleLanguage })
            }
          >
            {languages.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </Setting>
        <Setting
          name="Show AniList ratings"
          hint="Score and users on cards, distribution in details"
        >
          <Switch
            label="Show AniList ratings"
            checked={settings.showRatings}
            onChange={(v) => set({ showRatings: v })}
          />
        </Setting>
        <Setting name="Include adult titles">
          <Switch
            label="Include adult titles"
            checked={settings.includeAdult}
            onChange={(v) => set({ includeAdult: v })}
          />
        </Setting>
        <Setting name="Picks per page" hint="Show more adds another page">
          <select
            class="field"
            style="width:110px"
            aria-label="Picks per page"
            value={settings.limit}
            onChange={(e) => set({ limit: Number((e.target as HTMLSelectElement).value) })}
          >
            {[20, 40, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Setting>

        {session.host.signOut && (
          <>
            <h2 class="section">Account</h2>
            <Setting name="AniList" hint={`Signed in as ${session.user}`}>
              <button
                type="button"
                class="btn"
                onClick={async () => {
                  await session.host.signOut?.();
                  location.reload();
                }}
              >
                Sign out
              </button>
            </Setting>
          </>
        )}

        <h2 class="section">Exclusions</h2>
        <Exclusions session={session} language={settings.titleLanguage} />

        <h2 class="section">Help</h2>
        <Setting name="Tour" hint="A quick look at each page">
          <button type="button" class="btn" onClick={props.startTour}>
            Start tour
          </button>
        </Setting>

        <h2 class="section">Data</h2>
        <Setting
          name="Clear all data"
          hint={
            seanime
              ? "Deletes this plugin's saved picks, settings and exclusions (your Seanime sign-in is untouched)"
              : "Deletes everything stored locally"
          }
        >
          <button
            type="button"
            class="btn"
            style="color:var(--bad)"
            onClick={async () => {
              if (!confirm("Delete all saved picks, settings and exclusions?")) return;
              await session.clear();
              props.toast("Cleared. Reloading…");
              setTimeout(() => location.reload(), 600);
            }}
          >
            Clear
          </button>
        </Setting>
      </div>
    </section>
  );
}

function Setting(props: { name: string; hint?: string; children?: ComponentChildren }) {
  return (
    <div class="setting">
      <div>
        {props.name}
        {props.hint && <small>{props.hint}</small>}
      </div>
      {props.children}
    </div>
  );
}

function Exclusions({ session, language }: { session: Session; language: TitleLanguage }) {
  const [ex, setEx] = useState<SavedExclusions | null>(null);
  const [titles, setTitles] = useState<Map<number, Media>>(new Map());
  const [lists, setLists] = useState<Record<MediaType, string[]>>({ ANIME: [], MANGA: [] });

  useEffect(() => {
    (async () => {
      const e = await session.exclusions();
      setEx(e);
      setTitles(await session.media([...e.titles, ...(e.notInterested ?? [])]));
      setLists({
        ANIME: await session.customListNames("ANIME"),
        MANGA: await session.customListNames("MANGA"),
      });
    })();
  }, [session]);

  if (!ex) return null;
  const change = async (fn: (e: SavedExclusions) => void) => setEx(await session.setExclusions(fn));
  const none = <span class="muted">Nothing yet.</span>;
  const dismissed = ex.notInterested ?? [];
  const hidden = ex.titles.filter((id) => !dismissed.includes(id));
  const name = (id: number) => {
    const m = titles.get(id);
    return m ? displayTitle(m, language) : `#${id}`;
  };
  return (
    <>
      <div class="panel">
        <h2>
          Not interested{" "}
          <span class="muted" style="font-weight:400;font-size:.8rem">
            hidden, and your picks lean away from them
          </span>
        </h2>
        <div class="chips" style="margin:0">
          {dismissed.length
            ? dismissed.map((id) => (
                <RemovablePill
                  key={id}
                  text={name(id)}
                  onRemove={() =>
                    change((e) => {
                      e.titles = e.titles.filter((x) => x !== id);
                      e.notInterested = (e.notInterested ?? []).filter((x) => x !== id);
                    })
                  }
                />
              ))
            : none}
        </div>
      </div>
      <div class="panel">
        <h2>
          Excluded titles{" "}
          <span class="muted" style="font-weight:400;font-size:.8rem">
            sequels follow
          </span>
        </h2>
        <div class="chips" style="margin:0">
          {hidden.length
            ? hidden.map((id) => (
                <RemovablePill
                  key={id}
                  text={name(id)}
                  onRemove={() => change((e) => (e.titles = e.titles.filter((x) => x !== id)))}
                />
              ))
            : none}
        </div>
      </div>
      <div class="panel">
        <h2>
          Blacklisted{" "}
          <span class="muted" style="font-weight:400;font-size:.8rem">
            always left out of every search; exclude from a title to leave it out of one search
          </span>
        </h2>
        <BlacklistAdder
          session={session}
          taken={new Set(ex.labels)}
          onAdd={async (key) => setEx(await session.blacklist([key]))}
        />
        <div class="chips" style="margin:.6rem 0 0">
          {ex.labels.length
            ? ex.labels.map((k) => (
                <RemovablePill
                  key={k}
                  text={labelName(k)}
                  title={labelTitle(k)}
                  onRemove={() => change((e) => (e.labels = e.labels.filter((x) => x !== k)))}
                />
              ))
            : none}
        </div>
      </div>
      <div class="panel">
        <h2>Excluded custom lists</h2>
        {TYPES.map((t) => (
          <div key={t} class="chips" style="margin:.2rem 0">
            <span class="muted" style="width:60px">
              {t === "ANIME" ? "Anime" : "Manga"}
            </span>
            {lists[t].length ? (
              lists[t].map((name) => {
                const on = ex.customLists[t].includes(name);
                return (
                  <button
                    type="button"
                    key={name}
                    class={`pill btnlike ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      change((e) => {
                        e.customLists[t] = toggle(e.customLists[t], name);
                      })
                    }
                  >
                    {name}
                  </button>
                );
              })
            ) : (
              <span class="muted">No custom lists</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function RemovablePill({
  text,
  title,
  onRemove,
}: {
  text: string;
  title?: string;
  onRemove: () => void;
}) {
  return (
    <button type="button" class="pill btnlike" title={`Remove ${title ?? text}`} onClick={onRemove}>
      {text} <span class="x">✕</span>
    </button>
  );
}

/** Everything that can be blacklisted, as label keys: genres, tags, countries and formats. */
function blacklistChoices(tags: string[]): string[] {
  const formats = [...new Set([...(FORMATS.ANIME ?? []), ...(FORMATS.MANGA ?? [])])];
  return [
    ...GENRES.map((g) => `genre:${g}`),
    ...tags.map((t) => `tag:${t}`),
    ...COUNTRIES.map(([c]) => `country:${c}`),
    ...formats.map((f) => `format:${f}`),
  ];
}

/** One search box over every genre, tag, country and format; studios by name. */
function BlacklistAdder(props: {
  session: Session;
  taken: Set<string>;
  onAdd: (key: string) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    props.session.tagNames().then(setTags);
  }, [props.session]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? blacklistChoices(tags)
        .filter((k) => !props.taken.has(k) && labelTitle(k).toLowerCase().includes(q))
        .slice(0, 40)
    : [];
  const studio = `studio:${query.trim()}`;
  const options = q && !props.taken.has(studio) ? [...matches, studio] : matches;
  const add = (key: string) => {
    props.onAdd(key);
    setQuery("");
  };
  return (
    <div class="tag-picker">
      <input
        class="field"
        aria-label="Blacklist a genre, tag, country, format or studio"
        placeholder="Add a genre, tag, country, format or studio…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && options[0]) {
            e.preventDefault();
            add(options[0]);
          }
        }}
      />
      {focused && options.length > 0 && (
        <div class="tag-menu" role="listbox">
          {options.map((k) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={k}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(k)}
            >
              <span class="muted">{LABEL_KINDS[splitLabel(k)[0]]}</span> {labelName(k)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
