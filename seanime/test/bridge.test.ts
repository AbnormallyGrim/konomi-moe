import type { Media, MediaType } from "@konomi/engine";
import { describe, expect, it } from "vitest";
import { type Bridge, seanimeHost } from "../src/frame.ts";
import { answer, handlers, STORE_KEY } from "../src/plugin.ts";
import { type Collection, REPLY, REQUEST, toHostList } from "../src/protocol.ts";

const anime: Collection = {
  MediaListCollection: {
    lists: [
      {
        name: "Completed",
        entries: [
          {
            status: "COMPLETED",
            score: 90,
            progress: 12,
            repeat: 1,
            updatedAt: 5,
            media: { id: 1 },
          },
          { status: "DROPPED", score: 0, progress: 1, media: { id: 2 } },
        ],
      },
      {
        name: "Rewatch later",
        isCustomList: true,
        entries: [{ status: "COMPLETED", media: { id: 1 } }],
      },
      { name: "Broken", entries: [{ status: "COMPLETED" }, { status: "WEIRD", media: { id: 9 } }] },
    ],
  },
};

/** A plugin with fake Seanime APIs, joined to the page's host by a fake channel. */
function connect(fail: Partial<Record<string, string>> = {}) {
  const storage = new Map<string, unknown>();
  const done = {
    planned: [] as [number, MediaType][],
    navigated: [] as unknown[],
    links: [] as [string, string][],
    trailers: [] as [string, string][],
  };
  const h = handlers({
    collection: (type) => (type === "ANIME" ? anime : null),
    addToPlanning: (id, type) => {
      if (fail.addToPlanning) throw new Error(fail.addToPlanning);
      done.planned.push([id, type]);
    },
    storageGet: (k) => storage.get(k),
    storageSet: (k, v) => storage.set(k, v),
    navigate: (path, params) => done.navigated.push([path, params]),
    showLink: (url, title) => done.links.push([url, title]),
    showTrailer: (url, title) => done.trailers.push([url, title]),
  });
  const listeners = new Map<string, ((p: unknown) => void)[]>();
  const copy = (v: unknown) => JSON.parse(JSON.stringify(v)); // the channel serialises
  const bridge: Bridge = {
    send(event, payload) {
      if (event !== REQUEST || fail.silent) return;
      const reply = answer(h, copy(payload));
      queueMicrotask(() => {
        for (const cb of listeners.get(REPLY) ?? []) cb(copy(reply));
      });
    },
    on(event, cb) {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
      return () => {};
    },
  };
  return { host: seanimeHost(bridge, 50), storage, done };
}

const media = (id: number, type: MediaType) => ({ id, type }) as Media;

describe("toHostList", () => {
  it("keeps every entry, maps custom lists, and skips broken ones", () => {
    const list = toHostList(anime);
    expect(list.entries.map((e) => [e.mediaId, e.status, e.score])).toEqual([
      [1, "COMPLETED", 90],
      [2, "DROPPED", 0],
      [1, "COMPLETED", 0],
    ]);
    expect(list.entries[0]).toMatchObject({ progress: 12, repeat: 1, updatedAt: 5 });
    expect(list.customLists).toEqual({ "Rewatch later": [1] });
    expect(toHostList(null)).toEqual({ entries: [], customLists: {} });
  });
});

describe("toHostList with wrapped values", () => {
  it("reads Go pointer fields that goja hands over as objects", () => {
    // goja wraps *string, *float64 and *bool fields; boxed primitives behave the same way.
    const W = (v: string | number | boolean) => Object(v) as unknown;
    const list = toHostList({
      MediaListCollection: {
        lists: [
          {
            name: W("Fav"),
            isCustomList: W(true),
            entries: [{ status: W("COMPLETED"), score: W(85), progress: W(3), media: { id: 4 } }],
          },
          {
            name: W("Planning"),
            isCustomList: W(false),
            entries: [{ status: W("PLANNING"), media: { id: 5 } }],
          },
        ],
      },
    });
    expect(list.entries.map((e) => [e.mediaId, e.status, e.score, e.progress])).toEqual([
      [4, "COMPLETED", 85, 3],
      [5, "PLANNING", 0, 0],
    ]);
    expect(list.customLists).toEqual({ Fav: [4] });
  });

  it("explains a list it can't read instead of returning it empty", () => {
    const h = handlers({
      collection: () => ({
        MediaListCollection: { lists: [{ entries: [{ status: { weird: 1 }, media: { id: 1 } }] }] },
      }),
    } as never);
    const reply = answer(h, { id: 1, method: "list", args: ["ANIME"] });
    expect(reply).toMatchObject({ ok: false });
    expect(reply && !reply.ok && reply.error).toContain("couldn't read your anime list");
  });
});

describe("Seanime host over the channel", () => {
  it("reads lists, saves and loads the store, adds to planning and opens titles", async () => {
    const { host, storage, done } = connect();
    expect((await host.list?.("ANIME"))?.customLists).toEqual({ "Rewatch later": [1] });
    expect((await host.list?.("MANGA"))?.entries).toEqual([]);

    expect(await host.loadStore()).toBeNull();
    await host.saveStore('{"media":[]}');
    expect(storage.get(STORE_KEY)).toBe('{"media":[]}');
    expect(await host.loadStore()).toBe('{"media":[]}');

    await host.addToPlanning?.(media(7, "MANGA"));
    expect(done.planned).toEqual([[7, "MANGA"]]);
    host.openTitle(media(1, "ANIME"));
    host.openTitle(media(7, "MANGA"));
    await new Promise((r) => setTimeout(r, 0));
    expect(done.navigated).toEqual([
      ["/entry", { id: "1" }],
      ["/manga/entry", { id: "7" }],
    ]);
  });

  it("shows an AniList link through Seanime's dialog, and nothing else", async () => {
    const { host, done } = connect();
    host.openOnSite?.({ ...media(7, "MANGA"), siteUrl: "https://anilist.co/manga/7", title: "T" });
    host.openOnSite?.({ ...media(8, "ANIME"), siteUrl: null, title: "U" });
    await new Promise((r) => setTimeout(r, 0));
    expect(done.links).toEqual([
      ["https://anilist.co/manga/7", "T"],
      ["https://anilist.co/anime/8", "U"],
    ]);
    const h = handlers({ showLink: () => {} } as never);
    expect(
      answer(h, { id: 1, method: "openOnSite", args: ["https://evil.example/", "x"] }),
    ).toEqual({ id: 1, ok: false, error: "only AniList links can be opened" });
  });

  it("shows a trailer link through its own dialog, and only trailer links", async () => {
    const { host, done } = connect();
    const url = "https://www.youtube.com/watch?v=tR8YH0G67Rk";
    await host.openTrailer?.(
      { ...media(1, "ANIME"), title: "T" },
      {
        site: "youtube",
        url,
        thumbnail: null,
      },
    );
    expect(done.trailers).toEqual([[url, "T"]]);
    const h = handlers({ showTrailer: () => {} } as never);
    for (const bad of ["https://anilist.co/anime/1", `${url}&list=x`, "https://evil.example/"])
      expect(answer(h, { id: 1, method: "openTrailer", args: [bad, "x"] })).toEqual({
        id: 1,
        ok: false,
        error: "only YouTube and Dailymotion trailers open",
      });
  });

  it("turns plugin errors into rejections, and gives up when Seanime is silent", async () => {
    await expect(
      connect({ addToPlanning: "AniList said no" }).host.addToPlanning?.(media(1, "ANIME")),
    ).rejects.toThrow("AniList said no");
    await expect(connect({ silent: "yes" }).host.loadStore()).rejects.toThrow("didn't answer");
  });

  it("answers unknown requests with an error and ignores junk", () => {
    const h = handlers({} as never);
    expect(answer(h, { id: 3, method: "nope", args: [] })).toEqual({
      id: 3,
      ok: false,
      error: "unknown request: nope",
    });
    expect(answer(h, "junk")).toBeNull();
  });
});
