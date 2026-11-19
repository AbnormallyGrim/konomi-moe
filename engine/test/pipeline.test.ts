import { describe, expect, it } from "vitest";
import {
  FILTER_PAGES,
  type Filters,
  fetchMedia,
  loadExclusions,
  MemoryStore,
  makeFilters,
  makeRunOptions,
  NoSyncedList,
  run,
  syncEntries,
  syncList,
  tagCategories,
} from "../src/index.ts";
import { fakeClient, listEntry, node } from "./fake-anilist.ts";
import { entry, makeMedia, rel } from "./helpers.ts";

/** A made-up user: six loved Iyashikei titles, each recommending a new one, and six early drops. */
function user() {
  const loved = [1, 2, 3, 4, 5, 6].map((id) =>
    node(id, {
      recommendations: { nodes: [{ rating: 5, mediaRecommendation: { id: id + 100 } }] },
    }),
  );
  const dropped = [7, 8, 9, 10, 11, 12].map((id) =>
    node(id, {
      genres: ["Fantasy"],
      tags: [{ name: "Harem", rank: 80, isMediaSpoiler: false }],
      recommendations: { nodes: [{ rating: 5, mediaRecommendation: { id: id + 200 } }] },
    }),
  );
  const catalog = new Map(
    [
      ...[101, 102, 103, 104, 105, 106].map((id) => node(id)),
      ...[207, 208].map((id) => node(id)),
    ].map((n) => [n.id, n]),
  );
  return {
    lists: {
      ANIME: [
        [
          {
            name: "Completed",
            entries: loved.slice(0, 4).map((m) => listEntry(m, "COMPLETED", 90)),
          },
        ],
        [
          { name: "Completed", entries: loved.slice(4).map((m) => listEntry(m, "COMPLETED", 90)) },
          { name: "Dropped", entries: dropped.map((m) => listEntry(m, "DROPPED", 0, 1)) },
          {
            name: "Example",
            isCustomList: true,
            entries: [listEntry(loved[0] as (typeof loved)[0], "COMPLETED", 90)],
          },
        ],
      ],
    },
    catalog,
  };
}

describe("syncList", () => {
  it("reads every chunk, stores the list, and fetches only titles recommended from liked ones", async () => {
    const store = new MemoryStore();
    const { client, requests } = fakeClient(user());
    const result = await syncList(client, store, "Someone", "ANIME");

    expect(result).toEqual({ entries: 12, candidatesFetched: 6 });
    expect(requests.filter((r) => r.kind === "list").map((r) => r.variables.chunk)).toEqual([1, 2]);
    const fetched = requests.find((r) => r.kind === "media")?.variables.ids;
    expect(fetched).toEqual([101, 102, 103, 104, 105, 106]); // not 207+: those came from drops
    expect((await store.getList("someone", "ANIME")).length).toBe(12);
    expect(await store.getCustomLists("SOMEONE", "ANIME")).toEqual(
      new Map([["Example", new Set([1])]]),
    );
    expect(await store.lastSynced("someone", "ANIME")).not.toBeNull();

    await syncList(client, store, "someone", "ANIME");
    expect(requests.filter((r) => r.kind === "media")).toHaveLength(1); // cached, not refetched
  });
});

describe("syncEntries", () => {
  it("stores the host's entries, fetches list titles with their links, then candidates", async () => {
    const fake = user();
    const listNodes = fake.lists.ANIME.flat().flatMap((l) =>
      (l.entries as ReturnType<typeof listEntry>[]).map((e) => e.media),
    );
    const plain = node(13); // no recommendations at all
    const catalog = new Map([
      ...fake.catalog,
      ...[...listNodes, plain].map((n) => [n.id, n] as const),
    ]);
    const entries = [
      ...[1, 2, 3, 4, 5, 6].map((id) => entry(id, "COMPLETED", 90)),
      ...[7, 8, 9, 10, 11, 12].map((id) => entry(id, "DROPPED", 0, { progress: 1 })),
      entry(13, "PLANNING", 0),
      entry(1, "COMPLETED", 90), // repeated, as a custom list title can be
    ];
    const store = new MemoryStore();
    const { client, requests } = fakeClient({ catalog });
    const custom = new Map([["Example", new Set([1])]]);
    const result = await syncEntries(client, store, "Someone", "ANIME", entries, custom);

    expect(result).toEqual({ entries: 13, candidatesFetched: 6 });
    expect(requests.map((r) => r.kind)).toEqual(["media+recs", "media"]);
    expect(requests[1]?.variables.ids).toEqual([101, 102, 103, 104, 105, 106]);
    expect((await store.getList("someone", "ANIME")).length).toBe(13);
    expect(await store.getCustomLists("someone", "ANIME")).toEqual(custom);
    expect(await store.recommendationsFrom([1])).toEqual([[1, 101, 5]]);

    await syncEntries(client, store, "someone", "ANIME", entries, custom);
    expect(requests.slice(2).map((r) => [r.kind, r.variables.ids])).toEqual([["media+recs", [13]]]);
  });
});

describe("fetchMedia", () => {
  it("skips fresh titles and refetches stale ones", async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    const { client, requests } = fakeClient({
      catalog: new Map([
        [1, node(1)],
        [2, node(2)],
      ]),
    });
    expect(await fetchMedia(client, store, [1, 2])).toBe(2);
    expect(await fetchMedia(client, store, [1, 2])).toBe(0);
    now += 31 * 24 * 3600 * 1000;
    expect(await fetchMedia(client, store, [1])).toBe(1);
    expect(requests).toHaveLength(2);
  });

  it("fetches 500 titles per request, in pages of 50", async () => {
    const store = new MemoryStore();
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    const { client, requests, counts } = fakeClient({
      catalog: new Map(ids.map((id) => [id, node(id)])),
    });
    const progress: [number, number][] = [];
    expect(await fetchMedia(client, store, ids, undefined, (d, t) => progress.push([d, t]))).toBe(
      1200,
    );
    expect(counts.http).toBe(3);
    expect(requests).toHaveLength(24);
    expect((await store.getMedia(ids)).size).toBe(1200);
    expect(progress[0]).toEqual([0, 3]);
    expect(progress.at(-1)).toEqual([3, 3]);
  });
});

describe("MemoryStore", () => {
  it("survives a JSON round trip", async () => {
    const store = new MemoryStore();
    await store.putMedia([makeMedia(1, ["Iyashikei"])]);
    await store.putList("someone", "MANGA", [
      { mediaId: 1, status: "PLANNING", score: 0, progress: 0, repeat: 0, updatedAt: 0 },
    ]);
    await store.putCustomLists("someone", "MANGA", new Map([["Example", new Set([1])]]));
    await store.putExclusions("someone", {
      titles: [5],
      labels: ["tag:Gore"],
      customLists: { ANIME: [], MANGA: ["Example"] },
    });
    await store.putRecommendations(new Map([[1, [[2, 9]]]]));
    await store.setMeta("k", "v");

    const copy = MemoryStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));
    expect(await copy.getMedia([1])).toEqual(await store.getMedia([1]));
    expect(await copy.getList("someone", "MANGA")).toHaveLength(1);
    expect(await copy.getCustomLists("someone", "MANGA")).toEqual(
      new Map([["Example", new Set([1])]]),
    );
    expect((await copy.getExclusions("someone")).labels).toEqual(["tag:Gore"]);
    expect(await copy.recommendationsFrom([1])).toEqual([[1, 2, 9]]);
    expect(await copy.getMeta("k")).toBe("v");
  });
});

describe("tagCategories and loadExclusions", () => {
  it("caches tag categories and follows excluded titles and custom lists down their sequels", async () => {
    const store = new MemoryStore();
    const s2 = node(41, {
      relations: { edges: [{ relationType: "SEQUEL", node: { id: 42, type: "ANIME" } }] },
    });
    const { client, requests } = fakeClient({
      tags: [{ name: "Heterosexual", category: "Theme-Romance" }],
      catalog: new Map([
        [41, s2],
        [42, node(42)],
      ]),
    });
    expect(await tagCategories(store, null)).toEqual({});
    expect(await tagCategories(store, client)).toEqual({ Heterosexual: "Theme-Romance" });
    expect(await tagCategories(store, null)).toEqual({ Heterosexual: "Theme-Romance" });
    expect(requests.filter((r) => r.kind === "tags")).toHaveLength(1);

    await store.putMedia([makeMedia(40, [], [], { relations: [rel("SEQUEL", 41)] })]);
    await store.putCustomLists("someone", "ANIME", new Map([["Rewatch later", new Set([70])]]));
    await store.putExclusions("someone", {
      titles: [40],
      labels: ["tag:Gore"],
      customLists: { ANIME: ["Rewatch later"], MANGA: [] },
    });
    const excluded = await loadExclusions(store, "someone", "ANIME", new Map(), client);
    expect(excluded.mediaIds).toEqual(new Set([40, 41, 42, 70]));
    expect(excluded.labels).toEqual(new Set(["tag:Gore"]));
  });
});

describe("run", () => {
  it("fetches an unwatched first season and recommends it instead of its sequel", async () => {
    const store = new MemoryStore();
    const fake = user();
    fake.catalog.set(
      101,
      node(101, {
        relations: { edges: [{ relationType: "PREQUEL", node: { id: 300, type: "ANIME" } }] },
      }),
    );
    fake.catalog.set(300, node(300));
    const { client } = fakeClient(fake);
    await syncList(client, store, "someone", "ANIME");
    const result = await run(store, client, "someone", "ANIME");
    const recs = new Map(result.recommendations.map((r) => [r.media.id, r]));

    expect(recs.has(101)).toBe(false);
    expect(recs.get(300)?.sources).toEqual(["liked Tesuto 1"]);
  });

  it("pages filter searches until enough pass, one search per chosen country", async () => {
    const store = new MemoryStore();
    let next = 5000;
    const { client, requests, counts } = fakeClient({
      ...user(),
      // Full pages of titles from nowhere in particular, so none pass the country filter.
      discover: () => Array.from({ length: 50 }, () => node(next++)),
    });
    await syncList(client, store, "someone", "ANIME");
    const filters = makeFilters({ countries: ["KR", "CN"] });
    const before = { runs: requests.length, http: counts.http };
    await run(store, client, "someone", "ANIME", makeRunOptions({ filters }));
    const searches = requests.filter((r) => r.kind === "discover" && !r.variables.tagIn);
    expect(searches).toHaveLength(2 * FILTER_PAGES);
    for (const country of ["KR", "CN"])
      expect(
        searches
          .filter((r) => r.variables.countryOfOrigin === country)
          .map((r) => r.variables.page),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    // Tag searches and both first pages in one request, the other ten pages in a second; the
    // rest is tag categories and covers.
    const discoverRuns = requests.slice(before.runs).filter((r) => r.kind === "discover").length;
    expect(discoverRuns).toBeGreaterThan(2 * FILTER_PAGES);
    expect(counts.http - before.http).toBeLessThanOrEqual(4);
  });

  it("leaves out this search's exclusions, formats and countries too, but never what it filters by", async () => {
    const store = new MemoryStore();
    const fake = user();
    fake.catalog.set(103, node(103, { format: "MOVIE" }));
    fake.catalog.set(104, node(104, { countryOfOrigin: "KR" }));
    await syncList(fakeClient(fake).client, store, "someone", "ANIME");
    const ids = async (filters: Partial<Filters>) =>
      (
        await run(
          store,
          null,
          "someone",
          "ANIME",
          makeRunOptions({ filters: makeFilters(filters) }),
        )
      ).recommendations.map((r) => r.media.id);
    const all = await ids({});
    expect(all).toEqual(expect.arrayContaining([103, 104]));
    const without = await ids({ exclude: ["format:MOVIE", "country:KR"] });
    expect(without).not.toContain(103);
    expect(without).not.toContain(104);
    expect(without.length).toBe(all.length - 2);
    // Filtering by Slice of Life while excluding it: the filter wins.
    expect(await ids({ genres: ["Slice of Life"], exclude: ["genre:Slice of Life"] })).toEqual(
      await ids({ genres: ["Slice of Life"] }),
    );
  });

  it("explains when there's nothing synced", async () => {
    await expect(run(new MemoryStore(), null, "someone", "ANIME")).rejects.toThrow(NoSyncedList);
  });

  it("ranks offline from the store alone", async () => {
    const store = new MemoryStore();
    await syncList(fakeClient(user()).client, store, "someone", "ANIME");
    const result = await run(store, null, "someone", "ANIME", makeRunOptions({ discover: false }));
    const ids = result.recommendations.map((r) => r.media.id);
    expect(ids.length).toBe(6);
    expect(ids.every((id) => id > 100 && id < 200)).toBe(true);
    expect(result.recommendations[0]?.sources[0]).toMatch(/^liked Tesuto/);
  });

  it("leaves out candidates below the minimum score and asks AniList for scored titles only", async () => {
    const store = new MemoryStore();
    const fake = user();
    for (const [id, averageScore] of [
      [101, 90],
      [102, 70],
      [103, null],
    ] as const)
      fake.catalog.set(id, node(id, { averageScore }));
    const { client } = fakeClient(fake);
    await syncList(client, store, "someone", "ANIME");
    const filters = makeFilters({ minScore: 80 });
    const offline = await run(
      store,
      null,
      "someone",
      "ANIME",
      makeRunOptions({ discover: false, filters }),
    );
    const ids = offline.recommendations.map((r) => r.media.id);
    expect(ids).toContain(101);
    expect(ids).not.toContain(102); // 70%
    expect(ids).not.toContain(103); // no score yet
    expect(ids).not.toContain(104); // the fake's default 75%

    const searched = fakeClient({ ...fake, discover: () => [] });
    await run(store, searched.client, "someone", "ANIME", makeRunOptions({ filters }));
    const searches = searched.requests.filter((r) => r.kind === "discover");
    expect(searches.length).toBeGreaterThan(0);
    for (const r of searches) expect(r.variables.averageScoreGreater).toBe(79);
  });

  it("searches per liked tag and by filters, honours exclusions, and warns about unsynced lists", async () => {
    const store = new MemoryStore();
    const fake = user();
    const { client } = fakeClient(fake);
    await syncList(client, store, "someone", "ANIME");
    await store.putExclusions("someone", {
      titles: [101],
      labels: [],
      customLists: { ANIME: [], MANGA: [] },
    });

    const searched = fakeClient({
      ...fake,
      tags: [],
      discover: (v) => (v.perPage === 30 ? [node(300)] : [node(301)]),
    });
    const filters = makeFilters({ genres: ["Slice of Life"], hideSeenAdaptations: true });
    const result = await run(
      store,
      searched.client,
      "someone",
      "ANIME",
      makeRunOptions({ filters }),
    );

    const searches = searched.requests.filter((r) => r.kind === "discover");
    const perTag = searches.filter((r) => r.variables.perPage === 30);
    expect(perTag.length).toBeGreaterThanOrEqual(1);
    for (const r of perTag) {
      expect((r.variables.tagIn as string[]).length).toBe(1);
      expect(r.variables.genreIn).toEqual(["Slice of Life"]);
    }
    expect(searches.filter((r) => r.variables.perPage === 50).map((r) => r.variables.page)).toEqual(
      [1],
    );
    const ids = new Set(result.recommendations.map((r) => r.media.id));
    expect(ids.has(300) && ids.has(301)).toBe(true);
    expect(ids.has(101)).toBe(false); // excluded
    expect(result.warnings).toEqual([
      "sync your manga list to hide titles you've finished as manga",
    ]);
  });
});
