import type { ListEntry, Media, MediaType } from "@konomi/engine";
import { describe, expect, it } from "vitest";
import { fakeClient, node } from "../../engine/test/fake-anilist.ts";
import type { Host, HostList } from "../src/host.ts";
import { cleanDescription, displayTitle, POOL, RANKING, Session } from "../src/session.ts";

const entry = (mediaId: number, status: ListEntry["status"], score = 0): ListEntry => ({
  mediaId,
  status,
  score,
  progress: status === "DROPPED" ? 1 : 0,
  repeat: 0,
  updatedAt: 0,
});

/** Six loved Iyashikei titles recommending new ones, and six early Harem drops. */
function world() {
  const loved = [1, 2, 3, 4, 5, 6].map((id) =>
    node(id, {
      recommendations: { nodes: [{ rating: 5, mediaRecommendation: { id: id + 100 } }] },
    }),
  );
  const dropped = [7, 8, 9, 10, 11, 12].map((id) =>
    node(id, {
      genres: ["Fantasy"],
      tags: [{ name: "Harem", rank: 80, isMediaSpoiler: false }],
    }),
  );
  const candidates = [101, 102, 103, 104, 105, 106].map((id) => node(id));
  const catalog = new Map([...loved, ...dropped, ...candidates].map((n) => [n.id, n]));
  const lists: Record<MediaType, HostList> = {
    ANIME: {
      entries: [
        ...[1, 2, 3, 4, 5, 6].map((id) => entry(id, "COMPLETED", 90)),
        ...[7, 8, 9, 10, 11, 12].map((id) => entry(id, "DROPPED")),
      ],
      customLists: { Example: [1] },
    },
    MANGA: { entries: [], customLists: {} },
  };
  return { catalog, lists };
}

/** A host with the list built in, recording what it was asked to do. */
function fakeHost(lists: Record<MediaType, HostList>) {
  const calls = { saves: 0, planned: [] as number[], listed: [] as MediaType[] };
  let saved: string | null = null;
  const host: Host = {
    kind: "seanime",
    transport: async () => {
      throw new Error("the session should use the injected client");
    },
    user: async () => ({ name: "Someone" }),
    async list(type) {
      calls.listed.push(type);
      return lists[type];
    },
    loadStore: async () => saved,
    async saveStore(json) {
      calls.saves++;
      saved = json;
    },
    async addToPlanning(media: Media) {
      calls.planned.push(media.id);
    },
    openTitle: () => {},
  };
  return { host, calls };
}

describe("Session", () => {
  it("syncs from the host, recommends, saves, and reopens with the same picks", async () => {
    const { catalog, lists } = world();
    const { host, calls } = fakeHost(lists);
    const { client, requests } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);

    expect(await session.lastSynced()).toBeNull();
    await session.sync();
    expect(calls.listed).toEqual(["ANIME", "MANGA"]);
    expect(requests.some((r) => r.kind === "list")).toBe(false); // never by username
    expect(await session.lastSynced()).not.toBeNull();
    expect(calls.saves).toBe(1);

    const picks = await session.recommend("ANIME");
    expect(picks?.recommendations.map((r) => r.media.id).sort()).toEqual([
      101, 102, 103, 104, 105, 106,
    ]);
    expect(await session.recommend("MANGA")).toBeNull(); // no manga list
    await session.save(true);

    const again = await Session.open(host, "Someone", client);
    expect((await again.picks("ANIME"))?.recommendations).toEqual(picks?.recommendations);
    expect(await again.customListNames("ANIME")).toEqual(["Example"]);
  });

  it("drops saved picks made by an earlier ranking, so an update shows at once", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const { client } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);
    await session.sync();
    const picks = await session.recommend("ANIME");
    expect(picks?.ranking).toBe(RANKING);
    const older = { ...picks, ranking: undefined };
    await session.store.setMeta("ui-picks:ANIME", JSON.stringify(older));
    expect(await session.picks("ANIME")).toBeNull();
  });

  it("loads the host's crowd table once, and says so when it can't", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    let asked = 0;
    host.crowdTable = async () => {
      asked++;
      throw new Error("offline");
    };
    const { client } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);
    await session.sync();
    const picks = await session.recommend("ANIME");
    expect(picks?.warnings[0]).toContain("picks from other people's lists unavailable: offline");
    expect(picks?.recommendations.length).toBeGreaterThan(0); // ranked the earlier way
    await session.recommend("MANGA");
    expect(asked).toBe(1); // manga never asks
  });

  it("clears everything, and a save still waiting doesn't bring the old data back", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const { client } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);
    await session.sync();
    await session.recommend("ANIME");
    void session.save(); // queued, not yet written
    await session.clear();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const after = await Session.open(host, "Someone", client);
    expect(await after.picks("ANIME")).toBeNull();
    expect(await after.lastSynced()).toBeNull();
  });

  it("keeps settings per type and exclusions without repeats", async () => {
    const { host } = fakeHost(world().lists);
    const session = await Session.open(host, "Someone", fakeClient({}).client);
    const s = await session.settings();
    s.filters.MANGA.formats = ["NOVEL"];
    s.limit = 40;
    await session.setSettings(s);
    const back = await session.settings();
    expect(back.limit).toBe(40);
    expect(back.filters.MANGA.formats).toEqual(["NOVEL"]);
    expect(back.filters.ANIME.formats).toEqual([]);

    await session.setExclusions((e) => e.titles.push(5, 5));
    const e = await session.setExclusions((e) => e.labels.push("tag:Harem", "tag:Harem"));
    expect(e.titles).toEqual([5]);
    expect(e.labels).toEqual(["tag:Harem"]);
  });

  it("adds to planning through the host and hides the title from the next run", async () => {
    const { catalog, lists } = world();
    const { host, calls } = fakeHost(lists);
    const session = await Session.open(host, "Someone", fakeClient({ catalog }).client);
    await session.sync();
    const synced = await session.lastSynced();
    const first = await session.recommend("ANIME");
    const top = first?.recommendations[0]?.media;
    if (!top) throw new Error("no picks");

    await session.addToPlanning(top);
    expect(calls.planned).toEqual([top.id]);
    expect(await session.lastSynced()).toBe(synced); // not a sync
    await expect(session.addToPlanning(top)).rejects.toThrow("already on your list");
    expect(calls.planned).toEqual([top.id]);
    const next = await session.recommend("ANIME");
    expect(next?.recommendations.map((r) => r.media.id)).not.toContain(top.id);
  });

  it("summarises preferences with the strongest likes and dislikes", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const session = await Session.open(host, "Someone", fakeClient({ catalog }).client);
    await session.sync();
    const preferences = await session.preferencesFor("ANIME");
    expect(preferences?.onList).toBe(12);
    expect(preferences?.likes.map(([k]) => k)).toContain("tag:Iyashikei");
    expect(preferences?.dislikes.map(([k]) => k)).toContain("tag:Harem");
    expect(preferences?.likedTags).toContain("Iyashikei");
    expect(await session.preferencesFor("MANGA")).toBeNull();
  });
});

describe("stats per list", () => {
  it("shows, for each list, the learned preferences that appear on it", async () => {
    const { catalog, lists } = world(); // anime: loves Iyashikei, drops Harem
    const manga = [301, 302, 303, 304, 305, 306].map((id) =>
      node(id, {
        type: "MANGA",
        genres: ["Sports"],
        tags: [{ name: "Rivalry", rank: 80, isMediaSpoiler: false }],
      }),
    );
    for (const n of manga) catalog.set(n.id, n);
    lists.MANGA = { entries: manga.map((n) => entry(n.id, "COMPLETED", 95)), customLists: {} };
    const { host } = fakeHost(lists);
    const session = await Session.open(host, "Someone", fakeClient({ catalog }).client);
    await session.sync();
    const keys = async (t: MediaType) =>
      (await session.preferencesFor(t))?.likes.map(([k]) => k) ?? [];
    const anime = await keys("ANIME");
    const mangaLikes = await keys("MANGA");
    expect(anime).toContain("tag:Iyashikei");
    expect(anime).not.toContain("tag:Rivalry"); // only on the manga list
    expect(mangaLikes).toContain("tag:Rivalry");
    expect(mangaLikes).not.toContain("tag:Iyashikei");
  });
});

describe("exclusions drop picks at once", () => {
  it("removes picks with an excluded tag or title from the saved picks, with no new run", async () => {
    const { catalog, lists } = world();
    // Two of the candidates carry a tag the user is about to exclude.
    for (const id of [101, 102])
      catalog.set(id, node(id, { tags: [{ name: "Gore", rank: 70, isMediaSpoiler: false }] }));
    const { host } = fakeHost(lists);
    const { client, requests } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);
    await session.sync();
    await session.recommend("ANIME");
    const before = requests.length;

    const { left, excluded, settings } = await session.excludeLabels("ANIME", ["tag:Gore"]);
    expect(excluded).toEqual(["tag:Gore"]);
    expect(left.ANIME?.recommendations.map((r) => r.media.id).sort()).toEqual([103, 104, 105, 106]);
    expect((await session.picks("ANIME"))?.recommendations).toHaveLength(4); // saved too
    // Excluded from this anime search only, not blacklisted.
    expect(settings.filters.ANIME.exclude).toEqual(["tag:Gore"]);
    expect((await session.settings()).filters.ANIME.exclude).toEqual(["tag:Gore"]);
    expect((await session.settings()).filters.MANGA.exclude).toEqual([]);
    expect((await session.exclusions()).labels).toEqual([]);

    const top = left.ANIME?.recommendations[0]?.media;
    if (!top) throw new Error("no picks");
    const after = await session.excludeTitle(top);
    expect(after.ANIME?.recommendations.map((r) => r.media.id)).not.toContain(top.id);
    expect(requests.length).toBe(before); // nothing fetched
  });
});

describe("search exclusions and the blacklist", () => {
  it("never excludes what the search filters by", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const session = await Session.open(host, "Someone", fakeClient({ catalog }).client);
    const s = await session.settings();
    await session.setSettings({
      ...s,
      filters: {
        ...s.filters,
        ANIME: { ...s.filters.ANIME, genres: ["Romance"], countries: ["KR"] },
      },
    });
    const { excluded, settings } = await session.excludeLabels("ANIME", [
      "genre:Romance",
      "country:KR",
      "tag:Gore",
    ]);
    expect(excluded).toEqual(["tag:Gore"]);
    expect(settings.filters.ANIME.exclude).toEqual(["tag:Gore"]);
  });

  it("blacklists for every search and drops matching picks of both types", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const { client } = fakeClient({ catalog });
    const session = await Session.open(host, "Someone", client);
    await session.sync();
    await session.recommend("ANIME");
    const before = (await session.picks("ANIME"))?.recommendations.length ?? 0;
    expect(before).toBeGreaterThan(0);
    // Every candidate in the world is a TV series.
    expect((await session.blacklist(["format:TV"])).labels).toEqual(["format:TV"]);
    expect((await session.picks("ANIME"))?.recommendations).toHaveLength(0);
    expect((await session.recommend("ANIME"))?.recommendations).toHaveLength(0);
  });
});

describe("not interested", () => {
  it("hides the title at once and trains on it as a dislike from the next run", async () => {
    const { catalog, lists } = world();
    const { host } = fakeHost(lists);
    const session = await Session.open(host, "Someone", fakeClient({ catalog }).client);
    await session.sync();
    const first = await session.recommend("ANIME");
    const top = first?.recommendations[0]?.media;
    if (!top) throw new Error("no picks");
    const before = (await session.preferencesFor("ANIME"))?.likes ?? [];

    const left = await session.notInterested(top);
    expect(left.ANIME?.recommendations.map((r) => r.media.id)).not.toContain(top.id);
    const ex = await session.exclusions();
    expect(ex.titles).toContain(top.id);
    expect(ex.notInterested).toEqual([top.id]);

    // The candidates share the user's liked tag, so dismissing one weakens it.
    await session.recommend("ANIME");
    const after = (await session.preferencesFor("ANIME"))?.likes ?? [];
    const weight = (rows: [string, number][]) =>
      rows.find(([k]) => k === "tag:Iyashikei")?.[1] ?? 0;
    expect(weight(after)).toBeLessThan(weight(before));
  });
});

describe("displayTitle", () => {
  const m = {
    title: "Attack on Titan",
    titles: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
  } as Media;
  it("uses the chosen language and falls back when AniList has none", () => {
    expect(displayTitle(m, "romaji")).toBe("Shingeki no Kyojin");
    expect(displayTitle(m, "native")).toBe("進撃の巨人");
    const noEnglish = { ...m, titles: { romaji: "Yuru Camp△", english: null, native: null } };
    expect(displayTitle(noEnglish as Media, "english")).toBe("Yuru Camp△");
    expect(displayTitle(noEnglish as Media, "native")).toBe("Yuru Camp△");
    expect(displayTitle({ title: "Old cache" } as Media, "native")).toBe("Old cache");
  });
});

describe("settings", () => {
  it("defaults to English titles, closed advanced filters and a 200-pick pool", async () => {
    const { host } = fakeHost(world().lists);
    const session = await Session.open(host, "Someone", fakeClient({}).client);
    const s = await session.settings();
    expect(s.titleLanguage).toBe("english");
    expect(s.advancedOpen).toBe(false);
    expect(s.filters.ANIME.countries).toEqual([]);
    expect(POOL).toBe(200);
  });
});

describe("title details", () => {
  it("fetches characters and staff once per title, with a clean description", async () => {
    const { host } = fakeHost(world().lists);
    const details = new Map([
      [
        7,
        {
          description: "Line one.<br><br>Line two.",
          characters: {
            edges: [{ role: "MAIN", node: { id: 1, name: { full: "Hero" }, image: null } }],
          },
          staff: { edges: [{ role: "Director", node: { id: 2, name: { full: "Dee" } } }] },
        },
      ],
    ]);
    const { client, requests } = fakeClient({ details });
    const session = await Session.open(host, "Someone", client);
    const d = await session.titleDetails(7);
    expect(d.description).toBe("Line one.\n\nLine two.");
    expect(d.characters.map((c) => c.name)).toEqual(["Hero"]);
    expect(d.staff.map((s) => [s.name, s.roles])).toEqual([["Dee", ["Director"]]]);
    await session.titleDetails(7);
    expect(requests.filter((r) => r.kind === "details")).toHaveLength(1);
  });
});

describe("cleanDescription", () => {
  it("turns AniList's line breaks into newlines and drops other tags", () => {
    expect(cleanDescription("One.<br><br>\n<br>Two <i>three</i>.")).toBe("One.\n\nTwo three.");
  });
});
