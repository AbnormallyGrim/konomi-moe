/**
 * The toolbar popup (design/mock/extension.html, section 1): a quick glance, not the app. Your
 * top picks, a verdict for the AniList title you're looking at, and a button to the full app.
 * It reads the store directly; changes go through the background, which hands them to the app
 * tab when that's open (see channel.ts).
 */

import type { MediaType, Recommendation } from "@konomi/engine";
import { displayTitle, type Picks, Session, type Settings } from "@konomi/ui/session";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { titleFromPath } from "./anilist-page.ts";
import { loadAuth } from "./auth.ts";
import { api } from "./browser.ts";
import { extensionHost } from "./host.ts";
import { send } from "./messages.ts";
import { ANILIST_PAGES, getPrefs, type Prefs, setPrefs } from "./prefs.ts";
import { type TitleVerdict, verdictFor } from "./verdicts.ts";
import "@konomi/ui/styles.css";
import "./popup.css";

const NAME = "Konomi.moe";
const SHOWN = 5;

const LEVEL_WORDS: Record<string, [string, string]> = {
  great: ["Great match", "var(--good)"],
  good: ["Good match", "#a3e635"],
  mixed: ["Mixed", "var(--ok)"],
  nope: ["Not your usual", "var(--bad)"],
  onlist: ["On your list", "var(--muted)"],
  thin: ["Not enough to go on", "var(--muted)"],
};

function ago(at: number | null): string {
  if (!at) return "never";
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function openApp() {
  void api().runtime.openOptionsPage();
  window.close();
}

function Logo({ size }: { size: number }) {
  return <img class="pp-logo" src="icon-48.png" alt="" width={size} height={size} />;
}

const ICONS = {
  gear: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  back: "M15 18l-6-6 6-6",
};
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      {d === ICONS.gear && <circle cx="12" cy="12" r="3" />}
      <path d={d} />
    </svg>
  );
}

interface Loaded {
  session: Session;
  settings: Settings;
  picks: Record<MediaType, Picks | null>;
  synced: number | null;
  here: { id: number; type: MediaType } | null;
}

function Popup() {
  const [state, setState] = useState<Loaded | "signedout" | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const auth = await loadAuth();
      if (!auth) return setState("signedout");
      const session = await Session.open(extensionHost(auth, { page: false }), auth.name);
      const [tab] = await api().tabs.query({ active: true, currentWindow: true });
      let here = null;
      if (tab?.url) {
        const url = new URL(tab.url);
        if (url.hostname === "anilist.co") here = titleFromPath(url.pathname);
      }
      setState({
        session,
        settings: await session.settings(),
        picks: { ANIME: await session.picks("ANIME"), MANGA: await session.picks("MANGA") },
        synced: await session.lastSynced(),
        here,
      });
      void send("seen", {}).catch(() => {});
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error)
    return (
      <Frame title={NAME}>
        <div class="pp-body">
          <p class="pp-error">{error}</p>
        </div>
      </Frame>
    );
  if (!state) return <Frame title={NAME} />;
  if (view === "settings")
    return (
      <Frame
        title="Settings"
        left={
          <button type="button" class="iconbtn" title="Back" onClick={() => setView("main")}>
            <Icon d={ICONS.back} />
          </button>
        }
      >
        <PrefsView />
        <Foot synced={state === "signedout" ? null : state.synced} />
      </Frame>
    );
  const gear = (
    <button type="button" class="iconbtn" title="Settings" onClick={() => setView("settings")}>
      <Icon d={ICONS.gear} />
    </button>
  );
  if (state === "signedout")
    return (
      <Frame title={NAME} right={gear}>
        <div class="pp-body">
          <div class="pp-empty">
            <Logo size={52} />
            <h3>Picks from your own list</h3>
            <p class="muted">
              Sign in with AniList to get picks learned from your list. Everything stays in this
              browser.
            </p>
            <button type="button" class="btn primary wide" onClick={openApp}>
              Sign in with AniList
            </button>
          </div>
        </div>
      </Frame>
    );
  return (
    <Frame title={NAME} right={gear}>
      <div class="pp-body">
        {state.here && <Here loaded={state} here={state.here} />}
        <TopPicks loaded={state} />
      </div>
      <Foot synced={state.synced} />
    </Frame>
  );
}

function Frame(props: {
  title: string;
  left?: preact.ComponentChildren;
  right?: preact.ComponentChildren;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="pp">
      <div class="pp-head">
        {props.left ?? <Logo size={24} />}
        <b>{props.title}</b>
        <span class="sp" />
        {props.right}
      </div>
      {props.children ?? (
        <div class="pp-body pp-loading">
          <span class="spinner" />
        </div>
      )}
    </div>
  );
}

function Foot({ synced }: { synced: number | null }) {
  return (
    <div class="pp-foot">
      <span class="pp-sync">
        <i />
        Synced {ago(synced)}
      </span>
      <button type="button" class="btn primary" onClick={openApp}>
        Open {NAME} ↗
      </button>
    </div>
  );
}

/** The AniList title in the current tab, with its verdict. */
function Here({ loaded, here }: { loaded: Loaded; here: { id: number; type: MediaType } }) {
  const [v, setV] = useState<TitleVerdict | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    verdictFor(loaded.session, here.id).then(setV, (e: unknown) =>
      setV({ state: "setup", reason: e instanceof Error ? e.message : String(e) }),
    );
  }, [loaded, here]);
  if (!v)
    return (
      <div class="here">
        <div class="here-cover" />
        <div>
          <span class="k">This page</span>
          <span class="muted">Judging…</span>
        </div>
      </div>
    );
  if (v.state === "setup")
    return (
      <div class="here">
        <div class="here-cover" />
        <div>
          <span class="k">This page</span>
          <span class="muted">{v.reason}</span>
        </div>
      </div>
    );
  const [word, colour] = LEVEL_WORDS[v.verdict.level] ?? ["", ""];
  const why = v.verdict.reasons.map((r) => r.value).join(", ");
  const act = async (kind: "addToPlanning" | "notInterested") => {
    setBusy(true);
    try {
      setNote(await send("action", { action: { kind, id: here.id, type: here.type } }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const judged = v.verdict.level !== "onlist" && v.verdict.level !== "thin";
  return (
    <div class="here">
      {v.coverUrl ? <img src={v.coverUrl} alt="" /> : <div class="here-cover" />}
      <div>
        <span class="k">This page</span>
        <b>{v.title}</b>
        <div class="why">
          <span style={{ color: colour }}>●</span> {word}
          {why && judged ? ` · ${why}` : ""}
        </div>
      </div>
      {judged && !note && (
        <div class="acts">
          {v.canPlan && (
            <button
              type="button"
              class="btn primary"
              disabled={busy}
              onClick={() => act("addToPlanning")}
            >
              ＋ Planning
            </button>
          )}
          <button type="button" class="btn" disabled={busy} onClick={() => act("notInterested")}>
            Not interested
          </button>
        </div>
      )}
      {note && <div class="here-note">{note}</div>}
    </div>
  );
}

function TopPicks({ loaded }: { loaded: Loaded }) {
  const first: MediaType = loaded.here?.type ?? "ANIME";
  const [kind, setKind] = useState<MediaType>(first);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const recs = (loaded.picks[kind]?.recommendations ?? [])
    .filter((r) => !gone.has(r.media.id) && r.media.id !== loaded.here?.id)
    .slice(0, SHOWN);
  const canPlan = Boolean(loaded.session.host.addToPlanning);
  const plan = async (r: Recommendation) => {
    try {
      setNote(
        await send("action", { action: { kind: "addToPlanning", id: r.media.id, type: kind } }),
      );
      setGone(new Set([...gone, r.media.id]));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <div class="seg">
        {(["ANIME", "MANGA"] as const).map((t) => (
          <button
            type="button"
            key={t}
            class={kind === t ? "on" : ""}
            aria-pressed={kind === t}
            onClick={() => setKind(t)}
          >
            {t === "ANIME" ? "Anime" : "Manga"}
          </button>
        ))}
      </div>
      <div>
        <div class="label pp-label">Your top picks</div>
        {recs.length === 0 && (
          <p class="muted pp-none">
            No {kind === "ANIME" ? "anime" : "manga"} picks yet.{" "}
            <button type="button" class="linklike" onClick={openApp}>
              Open {NAME}
            </button>{" "}
            to get some.
          </p>
        )}
        {recs.map((r, i) => {
          const m = r.media;
          const title = displayTitle(m, loaded.settings.titleLanguage);
          const url = m.siteUrl ?? `https://anilist.co/${m.type.toLowerCase()}/${m.id}`;
          return (
            <div class="pick" key={m.id}>
              <span class="n">{i + 1}</span>
              {m.coverUrl ? <img src={m.coverUrl} alt="" /> : <span class="pick-cover" />}
              <a href={url} target="_blank" rel="noopener noreferrer" title={`${title} on AniList`}>
                <b>{title}</b>
                <small>
                  {[m.format?.replace("_", " "), m.year, r.reasons[0]?.value]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </a>
              {canPlan && (
                <button
                  type="button"
                  class="plus"
                  title="Add to planning"
                  aria-label={`Add ${title} to planning`}
                  onClick={() => plan(r)}
                >
                  ＋
                </button>
              )}
            </div>
          );
        })}
        {note && <div class="here-note">{note}</div>}
      </div>
    </>
  );
}

function PrefsView() {
  const [prefs, setLocal] = useState<Prefs | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    getPrefs().then(setLocal);
  }, []);
  if (!prefs) return <div class="pp-body" />;
  const set = async (change: Partial<Prefs>) => setLocal(await setPrefs(change));
  return (
    <div class="pp-body pp-set">
      <Toggle
        name="Match badge on AniList pages"
        hint={'Shows a verdict under "Add to List"'}
        checked={prefs.badge}
        onChange={(on) => {
          if (!on) return void set({ badge: false });
          // Asked here, in the click: browsers only show the prompt for a user's action.
          api()
            .permissions.request({ origins: [ANILIST_PAGES] })
            .then(
              (granted) => {
                if (granted) void set({ badge: true });
                else setNote("The badge needs access to anilist.co pages.");
              },
              (e: unknown) => setNote(e instanceof Error ? e.message : String(e)),
            );
        }}
      />
      <div class="perm">
        Turning the badge on asks your browser to let {NAME} read anilist.co pages. It only reads
        the title's ID from the address.
      </div>
      <Toggle
        name="New-picks count on the icon"
        hint="After each daily sync"
        checked={prefs.count}
        onChange={(on) => void set({ count: on })}
      />
      <Toggle
        name="Sync in the background"
        hint="Once a day while the browser is open"
        checked={prefs.backgroundSync}
        onChange={(on) => void set({ backgroundSync: on })}
      />
      {note && <p class="pp-error">{note}</p>}
      <div class="muted pp-more">Everything else lives in the full app's Settings.</div>
    </div>
  );
}

function Toggle(props: {
  name: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label class="setting">
      <div>
        {props.name}
        <small>{props.hint}</small>
      </div>
      <span class="switch">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
        />
        <span />
      </span>
    </label>
  );
}

render(<Popup />, document.getElementById("app") ?? document.body);
