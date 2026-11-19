import { describe, expect, it } from "vitest";
import {
  blocks,
  buildProfile,
  candidateSources,
  discoveryTags,
  type Exclusions,
  excludedGenres,
  excludedTags,
  type Media,
  rank,
  sequelClosure,
} from "../src/index.ts";
import { catalog, entry, makeMedia, rel, seed } from "./helpers.ts";

function setup(extra: Media[]) {
  const { media, entries } = seed();
  const all = catalog([...media, ...extra]);
  return { entries, ...all, profile: buildProfile(entries, all.map) };
}

describe("rank", () => {
  it("ranks fitting candidates first and filters listed, adult, prequel-less and unliked sources", () => {
    const { entries, map, lookup } = setup([
      makeMedia(20, ["Iyashikei"], ["Slice of Life"], { title: "Cosy Pick" }),
      makeMedia(21, ["Harem"], ["Fantasy"], { title: "Harem Pick" }),
      makeMedia(22, ["Iyashikei"], ["Slice of Life"], { isAdult: true }),
      makeMedia(23, ["Iyashikei"], [], { relations: [rel("PREQUEL", 999, null)] }),
      makeMedia(24, ["Found Family"], ["Slice of Life"], { title: "Backlog Pick" }),
      makeMedia(30, ["Iyashikei"], ["Slice of Life"]),
    ]);
    const profile = buildProfile([...entries, entry(24, "PLANNING")], map);
    const links: [number, number, number][] = [
      [1, 20, 5], [1, 21, 5], [1, 22, 5], [1, 23, 5], [1, 2, 5], [7, 30, 9],
    ]; // biome-ignore format: compact link table
    const recs = rank(profile, candidateSources(profile, links), map, { lookup });
    const titles = recs.map((r) => r.media.title);

    expect(titles[0]).toBe("Cosy Pick");
    expect(titles.indexOf("Cosy Pick")).toBeLessThan(titles.indexOf("Harem Pick"));
    const ids = new Set(recs.map((r) => r.media.id));
    for (const id of [2, 22, 23, 24, 30]) expect(ids.has(id)).toBe(false);
    const cosy = recs.find((r) => r.media.id === 20);
    expect(cosy?.reasons.length).toBeGreaterThan(0);
    expect(cosy?.sources).toEqual(["liked Test Show 1"]);
  });

  it("recommends a sequel only after a finished prequel", () => {
    const statuses = [
      "COMPLETED",
      "REPEATING",
      "PLANNING",
      "CURRENT",
      "PAUSED",
      "DROPPED",
    ] as const;
    const prequels = statuses.map((_, i) => makeMedia(40 + i, ["Iyashikei"], ["Slice of Life"]));
    const sequels = statuses.map((_, i) =>
      makeMedia(50 + i, ["Iyashikei"], ["Slice of Life"], { relations: [rel("PREQUEL", 40 + i)] }),
    );
    const { entries, map } = setup([...prequels, ...sequels]);
    const profile = buildProfile(
      [...entries, ...statuses.map((s, i) => entry(40 + i, s, 0, { progress: 1 }))],
      map,
    );
    const links: [number, number, number][] = statuses.map((_, i) => [1, 50 + i, 5]);
    const ids = new Set(
      rank(profile, candidateSources(profile, links), map).map((r) => r.media.id),
    );

    expect(ids).toEqual(new Set([50, 51])); // sequels of completed and rewatched seasons only
  });

  it("swaps a sequel of an unwatched season for its first unwatched season", () => {
    const show = (id: number, prequel?: number, title?: string) =>
      makeMedia(id, ["Iyashikei"], ["Slice of Life"], {
        relations: prequel ? [rel("PREQUEL", prequel)] : [],
        ...(title ? { title } : {}),
      });
    const { entries, map, lookup } = setup([
      show(60, undefined, "Season 1"),
      show(61, 60),
      show(62, 61), // season 3 of an unwatched season 1 → season 1
      show(70),
      show(71, 70, "Next Season"),
      show(72, 71), // season 3 after a finished season 1 → season 2
      show(81, 80), // season 1 not cached → dropped
      show(91, 90), // season 1 on the list, dropped → dropped
    ]);
    const profile = buildProfile(
      [...entries, entry(70, "COMPLETED", 80), entry(90, "DROPPED", 0, { progress: 1 })],
      map,
    );
    const links: [number, number, number][] = [
      [1, 62, 9], [1, 61, 5], [1, 72, 5], [1, 81, 5], [1, 91, 5],
    ]; // biome-ignore format: compact link table
    const recs = new Map(
      rank(profile, candidateSources(profile, links), map, { lookup }).map((r) => [r.media.id, r]),
    );

    expect(recs.has(60) && recs.has(71)).toBe(true);
    for (const id of [61, 62, 72, 81, 91]) expect(recs.has(id)).toBe(false);
    expect(recs.get(60)?.sources).toEqual(["liked Test Show 1"]);
  });

  it("adds only unfinished list titles when asked", () => {
    const statuses = [
      ["PLANNING", 24],
      ["CURRENT", 25],
      ["PAUSED", 26],
      ["COMPLETED", 27],
      ["DROPPED", 28],
    ] as const;
    const listed = statuses.map(([, id]) => makeMedia(id, ["Iyashikei"], ["Slice of Life"]));
    const { entries, map } = setup(listed);
    const profile = buildProfile(
      [...entries, ...statuses.map(([s, id]) => entry(id, s, 0, { progress: 1 }))],
      map,
    );

    expect(rank(profile, candidateSources(profile, []), map)).toEqual([]);
    const sources = candidateSources(profile, [], { includeListed: true });
    const shown = new Map(
      rank(profile, sources, map, { includeListed: true }).map((r) => [r.media.id, r.sources]),
    );
    expect(shown.get(24)).toEqual(["on your planning list"]);
    expect(shown.get(25)).toEqual(["in progress on your list"]);
    expect(shown.get(26)).toEqual(["paused on your list"]);
    expect(shown.has(27) || shown.has(28)).toBe(false);
  });

  it("applies exclusions by title, sequel chain and label", () => {
    const { entries, map, lookup } = setup([
      makeMedia(40, ["Iyashikei"], ["Slice of Life"], {
        title: "Excluded S1",
        relations: [rel("SEQUEL", 41)],
      }),
      makeMedia(41, ["Iyashikei"], ["Slice of Life"], {
        title: "Excluded S2",
        relations: [rel("PREQUEL", 40)],
      }),
      makeMedia(60, ["Iyashikei", "Gore"], ["Slice of Life"], { title: "Gory Pick" }),
      makeMedia(80, ["Iyashikei"], ["Slice of Life"], { title: "Kept Pick" }),
    ]);
    const profile = buildProfile([...entries, entry(40, "PLANNING"), entry(41, "PLANNING")], map);
    const exclusions: Exclusions = {
      mediaIds: new Set([40]),
      labels: new Set(["tag:Gore", "genre:Ecchi"]),
    };
    const sources = candidateSources(
      profile,
      [
        [1, 41, 5],
        [1, 60, 5],
        [1, 80, 5],
      ],
      { includeListed: true },
    );
    const titles = rank(profile, sources, map, { lookup, exclusions, includeListed: true }).map(
      (r) => r.media.title,
    );
    expect(titles).toContain("Kept Pick");
    for (const t of ["Excluded S1", "Excluded S2", "Gory Pick"]) expect(titles).not.toContain(t);
    expect(excludedTags(exclusions)).toEqual(["Gore"]);
    expect(excludedGenres(exclusions)).toEqual(["Ecchi"]);
  });
});

describe("exclusion chains", () => {
  it("follows sequels, fetching uncached links, and walks prequels", async () => {
    const s1 = makeMedia(40, [], [], { relations: [rel("SEQUEL", 41)] });
    const s2 = makeMedia(41, [], [], { relations: [rel("PREQUEL", 40), rel("SEQUEL", 42)] });
    const s3 = makeMedia(42, [], [], { relations: [rel("PREQUEL", 41)] });
    const cache = new Map([[40, s1]]);
    const lookup = (ids: Iterable<number>) =>
      new Map(
        [...ids].flatMap((id): [number, Media][] =>
          cache.has(id) ? [[id, cache.get(id) as Media]] : [],
        ),
      );
    const asked: number[][] = [];
    const fetchMissing = async (ids: Set<number>) => {
      asked.push([...ids].filter((id) => !cache.has(id)));
      for (const m of [s2, s3]) if (ids.has(m.id)) cache.set(m.id, m);
    };
    expect(await sequelClosure([40], lookup, fetchMissing)).toEqual(new Set([40, 41, 42]));
    expect(asked.filter((a) => a.length)).toEqual([[41], [42]]);
    expect(blocks({ mediaIds: new Set([40]), labels: new Set() }, s3, lookup)).toBe(true);
  });
});

describe("buildProfile", () => {
  it("learns from the other list but seeds only from its own, and leans on the community when short", () => {
    const { media, entries } = seed();
    const manga = [100, 101, 102, 103, 104, 105].map((id) =>
      makeMedia(id, ["Iyashikei"], [], { type: "MANGA", episodes: null }),
    );
    const mangaEntries = manga.map((m) => entry(m.id, "COMPLETED", 80));
    const profile = buildProfile(mangaEntries, catalog(manga).map, entries, catalog(media).map);
    expect(new Map(profile.model.weights()).get("tag:Harem")).toBeLessThan(0);
    expect(profile.likedIds).toEqual(new Set(manga.map((m) => m.id)));
    expect(profile.communityWeight).toBe(3);
    const { liked, disliked } = discoveryTags(profile.model, 1);
    expect(["Iyashikei", "Found Family"]).toContain(liked[0]);
    expect(["Harem", "Isekai"]).toContain(disliked[0]);
  });
});

describe("not interested", () => {
  it("trains dismissed titles as dislikes, unless a list already labels them", () => {
    const { media, entries } = seed(); // loves Found Family, drops Harem
    for (let i = 20; i < 26; i++) {
      // and finished a few others without scoring them, as lists do
      media.push(makeMedia(i, ["Sports"], ["Sports"]));
      entries.push(entry(i, "COMPLETED"));
    }
    const all = catalog(media).map;
    const dismissedTitle = makeMedia(500, ["Found Family"], ["Slice of Life"]);
    const plain = new Map(buildProfile(entries, all).model.weights());
    const withDismissed = new Map(
      buildProfile(entries, all, [], new Map(), [dismissedTitle]).model.weights(),
    );
    expect(withDismissed.get("tag:Found Family") ?? 0).toBeLessThan(
      plain.get("tag:Found Family") ?? 0,
    );
    const listedTitle = all.get(entries[0]?.mediaId ?? -1);
    if (!listedTitle) throw new Error("seed has no titles");
    const onList = new Map(
      buildProfile(entries, all, [], new Map(), [listedTitle]).model.weights(),
    );
    expect([...onList]).toEqual([...plain]);
  });
});
