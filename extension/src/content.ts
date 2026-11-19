/**
 * The opt-in badge on AniList title pages: a verdict in words under AniList's "Add to List"
 * button, opening to the reasons and actions (design/mock/extension.html, section 2). It lives in
 * a shadow root so AniList's styles and ours don't mix. AniList is a single-page app, so the
 * address is watched and the badge follows it.
 */

import type { Reason, VerdictLevel } from "@konomi/engine";
import { titleFromPath } from "./anilist-page.ts";
import { api } from "./browser.ts";
import { send } from "./messages.ts";
import type { TitleVerdict } from "./verdicts.ts";

const HOST_ID = "konomi-moe-badge";
/** Where AniList keeps the cover and its buttons; the badge goes right under the buttons. */
const ANCHOR = ".cover-wrap-inner .actions";

const LEVELS: Record<VerdictLevel, { label: string; colour: string }> = {
  great: { label: "Great match for you", colour: "#4ade80" },
  good: { label: "Good match", colour: "#a3e635" },
  mixed: { label: "Mixed for you", colour: "#facc15" },
  nope: { label: "Not your usual", colour: "#f87171" },
  onlist: { label: "On your list", colour: "#8a9bb0" },
  thin: { label: "Not enough to go on", colour: "#8a9bb0" },
};

const STATUS_WORDS: Record<string, string> = {
  CURRENT: "In progress",
  PLANNING: "Planning",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
  PAUSED: "Paused",
  REPEATING: "Rewatching",
};

/** The line under the verdict. */
export function subline(v: TitleVerdict): string {
  if (v.state === "setup") return v.reason;
  const { verdict } = v;
  switch (verdict.level) {
    case "great":
      return verdict.rank ? `Would be #${verdict.rank} in your picks` : "Right up your street";
    case "good":
      return "In the top third of your picks";
    case "mixed":
      return "Some things you like, some you don't";
    case "nope":
      return "Leans on things you tend to drop";
    case "onlist": {
      const e = verdict.entry;
      const status = e ? (STATUS_WORDS[e.status] ?? e.status) : "";
      return e && e.score > 0 ? `${status} · you scored it ${e.score / 10}` : status;
    }
    case "thin":
      return "Score a few more titles first";
  }
}

const reasonText = (r: Reason) => r.value;

const CSS = `
:host { all: initial; display: block; margin-top: 12px; font: 600 12.5px/1.35 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; position: relative; z-index: 5; }
.chip { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; background: #fff; border: 1px solid #dfe6ee; color: #3c4f63; box-shadow: 0 2px 8px rgba(49,54,68,.08); cursor: pointer; text-align: left; font: inherit; }
.dark .chip { background: #1a2638; border-color: #24344b; color: #c8d1dc; }
.chip img { width: 18px; height: 18px; flex: none; border-radius: 4px; }
.v { flex: 1; min-width: 0; }
.v small { display: block; font-weight: 500; color: #8a9bb0; font-size: 11px; }
.lvl { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.card { display: none; position: absolute; top: calc(100% + 6px); left: 0; width: 290px; box-sizing: border-box; background: #fff; color: #3c4f63; border: 1px solid #dfe6ee; border-radius: 8px; box-shadow: 0 18px 40px rgba(49,54,68,.22); padding: 12px; font-weight: 500; }
.dark .card { background: #1a2638; border-color: #24344b; color: #c8d1dc; }
.open .card { display: block; }
h4 { margin: 0 0 4px; font-size: 13px; }
.muted { color: #8a9bb0; font-size: 11px; }
.rs { display: flex; flex-wrap: wrap; gap: 4px; margin: 7px 0 10px; }
.rs span { padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #edf1f5; }
.dark .rs span { background: #24344b; }
.rs span.neg { background: #fde8ec; color: #c43554; }
.dark .rs span.neg { background: #3a1f2a; color: #ff8fa7; }
.ft { display: flex; gap: 6px; border-top: 1px solid #dfe6ee; padding-top: 9px; }
.dark .ft { border-color: #24344b; }
.ft button { flex: 1; min-height: 28px; border-radius: 5px; border: 1px solid #dfe6ee; background: transparent; color: inherit; font: 600 11.5px Inter, system-ui, sans-serif; cursor: pointer; padding: 3px 6px; }
.dark .ft button { border-color: #24344b; }
.ft button.p { background: #8b7bff; border-color: #8b7bff; color: #fff; }
.ft button:disabled { opacity: .6; cursor: default; }
.note { margin-top: 8px; font-size: 11px; color: #8a9bb0; }
.note.bad { color: #e05a73; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) if (c) node.append(c);
  return node;
}

/** AniList's dark and contrast themes darken the page background. */
function darkPage(): boolean {
  const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
  const [r = 255, g = 255, b = 255] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function render(root: ShadowRoot, v: TitleVerdict, id: number, type: "ANIME" | "MANGA"): void {
  const icon = el("img", { src: api().runtime.getURL("icon-32.png"), alt: "" });
  const level = v.state === "ready" ? LEVELS[v.verdict.level] : null;
  const label = level?.label ?? "Konomi.moe";
  const wrap = el("div", { class: darkPage() ? "dark" : "" });
  const chip = el(
    "button",
    { class: "chip", type: "button", title: "Konomi.moe" },
    icon,
    el("span", { class: "v" }, label, el("small", {}, subline(v))),
    level && el("span", { class: "lvl", style: `background:${level.colour}` } as never),
  );
  wrap.append(chip);
  const note = el("div", { class: "note" });

  if (v.state === "setup") {
    chip.onclick = () => void send("openApp", {});
  } else {
    const r = v.verdict;
    const act = async (button: HTMLButtonElement, kind: "addToPlanning" | "notInterested") => {
      for (const b of wrap.querySelectorAll("button")) b.disabled = b !== chip;
      note.className = "note";
      note.textContent = kind === "addToPlanning" ? "Adding…" : "Hiding…";
      try {
        note.textContent = await send("action", { action: { kind, id, type } });
        if (kind === "addToPlanning") note.textContent += " (reload to see it on AniList)";
        button.textContent = "✓ Done";
      } catch (e) {
        note.className = "note bad";
        note.textContent = e instanceof Error ? e.message : String(e);
        for (const b of wrap.querySelectorAll("button")) b.disabled = false;
      }
    };
    const plan = el("button", { type: "button", class: "p", textContent: "Add to planning" });
    plan.onclick = () => void act(plan, "addToPlanning");
    const nope = el("button", { type: "button", textContent: "Not interested" });
    nope.onclick = () => void act(nope, "notInterested");
    const open = el("button", { type: "button", textContent: "Open Konomi.moe" });
    open.onclick = () => void send("openApp", {});
    const judged = r.level !== "onlist" && r.level !== "thin";
    const card = el(
      "div",
      { class: "card" },
      el("h4", {}, label),
      el("div", { class: "muted" }, "Konomi.moe · from your AniList scores, drops and rewatches"),
      judged &&
        el(
          "div",
          { class: "rs" },
          ...r.reasons.map((x) => el("span", {}, `+ ${reasonText(x)}`)),
          ...r.against.map((x) => el("span", { class: "neg" }, `− ${reasonText(x)}`)),
        ),
      el("div", { class: "ft" }, v.canPlan ? plan : null, judged ? nope : null, open),
      note,
    );
    wrap.append(card);
    chip.onclick = () => wrap.classList.toggle("open");
    document.addEventListener("click", (e) => {
      if (!e.composedPath().includes(root.host)) wrap.classList.remove("open");
    });
  }
  root.replaceChildren(el("style", { textContent: CSS }), wrap);
}

/** The title on screen and its verdict, once it has arrived. */
let current: { key: string; verdict: TitleVerdict | null } = { key: "", verdict: null };

/**
 * Runs on every tick: asks for a verdict when the title changes, and (re)places the badge
 * whenever AniList has drawn its buttons but the badge isn't there, since AniList redraws the
 * header on navigation.
 */
function update(): void {
  const title = titleFromPath(location.pathname);
  const key = title ? `${title.type}:${title.id}` : "";
  if (key !== current.key) {
    document.getElementById(HOST_ID)?.remove();
    const mine = { key, verdict: null as TitleVerdict | null };
    current = mine;
    if (!title) return;
    send("verdict", title)
      .catch(
        (e: unknown): TitleVerdict => ({
          state: "setup",
          reason: e instanceof Error ? e.message : "Couldn't judge this title",
        }),
      )
      .then((v) => {
        mine.verdict = v;
        if (current === mine) update();
      });
    return;
  }
  if (!title || !current.verdict || document.getElementById(HOST_ID)) return;
  const anchor = document.querySelector(ANCHOR);
  if (!anchor) return;
  const host = el("div", { id: HOST_ID });
  render(host.attachShadow({ mode: "open" }), current.verdict, title.id, title.type);
  anchor.after(host);
}

if (typeof document !== "undefined" && typeof location !== "undefined") {
  update();
  setInterval(update, 500);
}
