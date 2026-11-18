import { describe, expect, it } from "vitest";
import { fakeClient, node } from "../../engine/test/fake-anilist.ts";
import {
  BackgroundSetup,
  type GojaFetch,
  gojaTransport,
  prepareRuntime,
} from "../src/background.ts";
import { type Bridge, seanimeHost } from "../src/frame.ts";
import { answer, handlers, pluginHost, STORE_KEY } from "../src/plugin.ts";
import { type Collection, REPLY, REQUEST } from "../src/protocol.ts";

/** Six loved titles recommending new ones, as Seanime's raw collection. */
function world() {
  const loved = [1, 2, 3, 4, 5, 6].map((id) =>
    node(id, {
      recommendations: { nodes: [{ rating: 5, mediaRecommendation: { id: id + 100 } }] },
    }),
  );
  const dropped = [7, 8, 9].map((id) =>
    node(id, { genres: ["Fantasy"], tags: [{ name: "Harem", rank: 80, isMediaSpoiler: false }] }),
  );
  const candidates = [101, 102, 103, 104, 105, 106].map((id) => node(id));
  const catalog = new Map([...loved, ...dropped, ...candidates].map((n) => [n.id, n]));
  const anime: Collection = {
    MediaListCollection: {
      lists: [
        {
          name: "Completed",
          entries: [1, 2, 3, 4, 5, 6].map((id) => ({
            status: "COMPLETED",
            score: 90,
            media: { id },
          })),
        },
        {
          name: "Dropped",
          entries: [7, 8, 9].map((id) => ({ status: "DROPPED", progress: 1, media: { id } })),
        },
      ],
    },
  };
  return { catalog, anime };
}

/** A plugin with a background setup, the timer under the test's control. */
function plugin(opts: { saved?: string; anime?: Collection | null } = {}) {
  const w = world();
  const storage = new Map<string, unknown>();
  if (opts.saved) storage.set(STORE_KEY, opts.saved);
  const anime = opts.anime === undefined ? w.anime : opts.anime;
  const api = {
    collection: (type: string) => (type === "ANIME" ? anime : null),
    addToPlanning: () => {},
    storageGet: (k: string) => storage.get(k),
    storageSet: (k: string, v: unknown) => storage.set(k, v),
    navigate: () => {},
    showLink: () => {},
  };
  let setup: BackgroundSetup | null = null;
  const h = handlers(api, () => setup?.status() ?? { running: false });
  const timers: (() => void)[] = [];
  const logs: string[] = [];
  const { client, requests } = fakeClient({ catalog: w.catalog });
  setup = new BackgroundSetup({
    hasStore: () => h.loadStore() !== null,
    hasList: () => !!anime,
    host: pluginHost(h, async () => {
      throw new Error("the injected client should be used");
    }),
    later: (fn) => timers.push(fn),
    log: (m) => logs.push(m),
    client,
  });
  return { h, setup, storage, timers, logs, requests };
}

describe("background setup", () => {
  it("syncs and ranks on a first run, saving picks the page opens with", async () => {
    const p = plugin();
    p.setup.schedule();
    expect(p.timers).toHaveLength(1);
    p.timers[0]?.();
    expect(p.setup.status().running).toBe(true);
    await p.setup.finished;
    expect(p.setup.status()).toEqual({ running: false });
    expect(p.logs).toEqual(["background setup done"]);
    const store = JSON.parse(p.storage.get(STORE_KEY) as string);
    const meta = new Map(store.meta as [string, string][]);
    expect(meta.get("ui-synced-at")).toBeTruthy();
    const picks = JSON.parse(meta.get("ui-picks:ANIME") as string);
    expect(picks.recommendations.map((r: { media: { id: number } }) => r.media.id)).toContain(101);
  });

  it("does nothing once a store exists", () => {
    const p = plugin({ saved: "{}" });
    p.setup.schedule();
    expect(p.timers).toHaveLength(0);
  });

  it("is dropped if the page opens before it starts, so only the page syncs", async () => {
    const p = plugin();
    p.setup.schedule();
    expect(p.setup.status()).toEqual({ running: false });
    p.timers[0]?.();
    await p.setup.finished;
    expect(p.requests).toHaveLength(0);
    expect(p.storage.has(STORE_KEY)).toBe(false);
  });

  it("skips quietly when Seanime has no list yet", async () => {
    const p = plugin({ anime: null });
    p.setup.schedule();
    p.timers[0]?.();
    await p.setup.finished;
    expect(p.logs).toEqual(["background setup skipped: no list from Seanime yet"]);
    expect(p.storage.has(STORE_KEY)).toBe(false);
  });

  it("lets the page wait for it, showing its progress, then open the saved store", async () => {
    const p = plugin();
    const listeners: ((v: unknown) => void)[] = [];
    const copy = (v: unknown) => JSON.parse(JSON.stringify(v));
    const bridge: Bridge = {
      send(event, payload) {
        if (event !== REQUEST) return;
        const reply = answer(p.h, copy(payload));
        queueMicrotask(() => {
          for (const cb of listeners) cb(copy(reply));
        });
      },
      on(event, cb) {
        if (event === REPLY) listeners.push(cb);
        return () => {};
      },
    };
    const host = seanimeHost(bridge, 1000, 1);
    p.setup.schedule();
    p.timers[0]?.();
    const steps: string[] = [];
    await host.waitForSetup?.((step) => steps.push(step));
    expect(steps.length).toBeGreaterThan(0);
    expect(p.setup.status().running).toBe(false);
    expect(await host.loadStore()).toContain("ui-picks:ANIME");
  });
});

describe("goja shims", () => {
  it("reads Go-style headers case-insensitively and parses the body text", async () => {
    let sent: { url: string; body: string } | null = null;
    const fetch: GojaFetch = async (url, o) => {
      sent = { url, body: o.body };
      return {
        status: 200,
        headers: { "X-Ratelimit-Remaining": "29", "Retry-After": "3" },
        text: () => '{"data":{"ok":true}}',
      };
    };
    const res = await gojaTransport(fetch)({ query: "q", variables: { a: 1 } });
    expect(sent).toEqual({
      url: "https://graphql.anilist.co",
      body: '{"query":"q","variables":{"a":1}}',
    });
    expect(res.header("x-ratelimit-remaining")).toBe("29");
    expect(res.header("Retry-After")).toBe("3");
    expect(res.header("X-RateLimit-Reset")).toBeNull();
    expect(await res.json()).toEqual({ data: { ok: true } });
  });

  it("adds setTimeout and structuredClone over the plugin context", () => {
    const global: Record<string, unknown> = {};
    const delays: number[] = [];
    let cancelled = false;
    prepareRuntime((_fn, ms) => {
      delays.push(ms);
      return () => {
        cancelled = true;
      };
    }, global);
    const id = (global.setTimeout as (f: () => void, ms: number) => unknown)(() => {}, 1999.6);
    (global.clearTimeout as (id: unknown) => void)(id);
    expect(delays).toEqual([2000]);
    expect(cancelled).toBe(true);
    const clone = (global.structuredClone as (v: unknown) => unknown)({ a: [1] });
    expect(clone).toEqual({ a: [1] });
    expect(typeof (global.performance as { now: () => number }).now()).toBe("number");
  });
});
