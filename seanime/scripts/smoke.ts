/**
 * Runs the built payload the way Seanime does: evaluate the script, check there's a global
 * `init`, call it with stub `$ui`/`$anilist`/`$storage`, then send one request through the
 * registered webview. Catches bundling mistakes the unit tests can't (node scripts/smoke.ts).
 * Pass a manifest path to check another build (`node scripts/smoke.ts release/konomi-moe.json`);
 * a manifest with payloadURI loads its code from the file of that name beside it.
 */

import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, process.argv[2] ?? "dist/konomi-moe.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
// Like Seanime: a payloadURI is fetched at install and stored as the payload. Here the file is
// read from beside the manifest, so the release is checked before it's pushed.
if (!manifest.payload && manifest.payloadURI) {
  const file = basename(new URL(manifest.payloadURI).pathname);
  manifest.payload = await readFile(join(dirname(manifestPath), file), "utf8");
}
if (!manifest.payload) throw new Error("manifest has neither payload nor payloadURI");
// Seanime's manifest checks (internal/extension_repo/utils.go), so a bad build fails here.
for (const field of [
  "id",
  "name",
  "version",
  "language",
  "type",
  "author",
  "manifestURI",
  "semverConstraint",
])
  if (!manifest[field]) throw new Error(`manifest is missing ${field}`);
if (!/^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(manifest.id) || manifest.id.length > 40)
  throw new Error("invalid manifest id");
if (manifest.name.length > 50 || manifest.author.length > 25)
  throw new Error("name or author too long");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("version isn't x.y.z");
if (manifest.type !== "plugin" || manifest.plugin?.version !== "1")
  throw new Error("bad plugin manifest");
console.log("manifest checks: ok");
/** The plugin's dialogs by title: what each renders, and whether it was opened. */
const modals = new Map<string, { render: (() => unknown[]) | null; opened: boolean }>();
const handlers = new Map<string, (p: unknown) => void>();
const sent: unknown[] = [];
let options: unknown;
let content = "";
const store = new Map<string, unknown>();
const logs: string[] = [];
const queried: string[] = [];
/** Six titles on the anime list, so the background first sync has enough to learn from. */
const animeList = {
  MediaListCollection: {
    lists: [
      {
        name: "Completed",
        entries: [1, 2, 3, 4, 5, 6].map((id) => ({
          status: "COMPLETED",
          score: id % 2 ? 90 : 40,
          media: { id },
        })),
      },
    ],
  },
};
/** A made-up AniList title, the shape the engine parses. */
const title = (id: number) => ({
  id,
  type: "ANIME",
  format: "TV",
  title: { romaji: `Tesuto ${id}`, english: null },
  averageScore: 70,
  coverImage: { large: `https://example.invalid/${id}.jpg` },
  stats: { scoreDistribution: [] },
  genres: [id % 2 ? "Comedy" : "Drama"],
  tags: [],
  relations: { edges: [] },
  recommendations: { nodes: [{ rating: 5, mediaRecommendation: { id: id + 100 } }] },
});
/** Seanime's goja globals, stubbed. No setTimeout or structuredClone, like goja. */
const globals = (register: (fn: unknown) => void) => ({
  console: { log: (m: unknown) => logs.push(String(m)) },
  $ui: { register },
  $anilist: {
    getRawAnimeCollection: () => animeList,
    getRawMangaCollection: () => ({ MediaListCollection: { lists: [] } }),
  },
  $storage: { get: (k: string) => store.get(k), set: (k: string, v: unknown) => store.set(k, v) },
});
const ctx = {
  newWebview: (o: unknown) => {
    options = o;
    return {
      channel: {
        on: (e: string, cb: (p: unknown) => void) => handlers.set(e, cb),
        send: (_e: string, p: unknown) => sent.push(p),
      },
      setContent: (f: () => string) => {
        content = f();
      },
    };
  },
  screen: { navigateTo: () => {} },
  // Seanime's timer and fetch (Go-style headers, text body). Timers fire at once to keep it quick.
  setTimeout: (fn: () => void, delay: number) => {
    if (!Number.isInteger(delay)) throw new Error("delay must be a whole number, as in Seanime");
    const t = setTimeout(fn, 0);
    return () => clearTimeout(t);
  },
  fetch: async (url: string, o: { body: string }) => {
    const { query, variables } = JSON.parse(o.body) as {
      query: string;
      variables: Record<string, unknown>;
    };
    queried.push(url);
    const page = (ids: unknown) => ({
      pageInfo: { hasNextPage: false },
      media: ((ids as number[] | undefined) ?? []).map(title),
    });
    // Batched requests alias each run q<i> and suffix its variables _<i>.
    const runs = Object.keys(variables).filter((k) => /^page_\d+$/.test(k)).length;
    const data = query.includes("MediaTagCollection")
      ? { MediaTagCollection: [] }
      : runs
        ? Object.fromEntries(
            Array.from({ length: runs }, (_, i) => [`q${i}`, page(variables[`ids_${i}`])]),
          )
        : { Page: page(variables.ids) };
    return {
      status: 200,
      headers: { "X-Ratelimit-Remaining": "29" },
      text: () => JSON.stringify({ data }),
    };
  },
  newModal: (opts: { title: string }) => {
    const state = { render: null as (() => unknown[]) | null, opened: false };
    modals.set(opts.title, state);
    const m = {
      render: (fn: () => unknown[]) => {
        state.render = fn;
      },
      open: () => {
        state.opened = true;
      },
      close: () => {},
      update: () => {},
    };
    const component =
      (kind: string) =>
      (...args: unknown[]) => ({ kind, args });
    return new Proxy(m, {
      get: (t, k) => (k in t ? t[k as keyof typeof t] : component(String(k))),
    });
  },
};
// Like Seanime: the loader runtime evaluates the payload and calls init(); register() gets the
// callback as text and runs it in a separate runtime that shares nothing with the loader.
let callbackSource = "";
const loader = vm.createContext(
  globals((fn) => {
    callbackSource = String(fn);
  }),
);
vm.runInContext(manifest.payload, loader);
if (typeof loader.init !== "function") throw new Error("no global init()");
vm.runInContext("init();", loader);
if (!callbackSource) throw new Error("init() didn't call $ui.register");
const ui = vm.createContext({ ...globals(() => {}), __ctx: ctx });
vm.runInContext(
  `(function(ctx) { return (${callbackSource}).call(undefined, ctx); }).call(undefined, __ctx)`,
  ui,
);
handlers.get("rpc")?.({ id: 1, method: "list", args: ["ANIME"] });
console.log("sidebar:", (options as { sidebar?: { label: string } })?.sidebar?.label);
console.log("page html:", content.length, "chars, has <head>:", content.includes("<head>"));
console.log("reply:", JSON.stringify(sent[0]));
handlers.get("rpc")?.({
  id: 2,
  method: "openOnSite",
  args: ["https://anilist.co/anime/1", "Test"],
});
if (!(sent.at(-1) as { ok?: boolean })?.ok) throw new Error("the AniList request failed");
/** Whether the dialog with this title was opened and shows `link`. */
const opensWith = (title: string, link: string) => {
  const m = modals.get(title);
  return Boolean(m?.opened && JSON.stringify(m.render?.() ?? null).includes(link));
};
if (!opensWith("Open on AniList", "https://anilist.co/anime/1"))
  throw new Error("the AniList dialog didn't open with the link");
console.log("AniList dialog: opens with the link");
const trailer = "https://www.youtube.com/watch?v=tR8YH0G67Rk";
handlers.get("rpc")?.({ id: 3, method: "openTrailer", args: [trailer, "Test"] });
if (!(sent.at(-1) as { ok?: boolean })?.ok) throw new Error("the trailer request failed");
if (!opensWith("Watch the trailer", trailer))
  throw new Error("the trailer dialog didn't open with the link");
console.log("trailer dialog: opens with the link");

// The background first sync runs inside the same runtime, after its start delay.
const deadline = Date.now() + 10_000;
while (!logs.some((l) => l.includes("background setup")) && Date.now() < deadline)
  await new Promise((r) => setTimeout(r, 20));
const outcome = logs.find((l) => l.includes("background setup")) ?? "never ran";
console.log("background setup:", outcome, `(${queried.length} AniList requests)`);
if (queried.length > 8) throw new Error("the first sync should batch its requests");
if (!outcome.includes("background setup done")) throw new Error("the background setup failed");
if (typeof store.get("store") !== "string") throw new Error("the background setup saved nothing");
