import { describe, expect, it } from "vitest";
import {
  blocksSeen,
  filterAccepts,
  filterQueryVariables,
  filtersActive,
  listedVersions,
  type Media,
  mainGenres,
  makeFilters,
  scoreAccepts,
  seenAdaptations,
  Themes,
} from "../src/index.ts";
import { catalog, entry, makeMedia, rel } from "./helpers.ts";

const THEMES = new Themes({
  Heterosexual: "Theme-Romance",
  "Love Triangle": "Theme-Romance",
  Swordplay: "Theme-Action",
  School: "Setting-Scene",
});

const romcom = () =>
  makeMedia(
    1,
    [
      ["Love Triangle", 92],
      ["School", 95],
    ],
    ["Comedy", "Romance"],
  );
const actionWithRomance = () =>
  makeMedia(
    2,
    [
      ["Swordplay", 90],
      ["Heterosexual", 75],
      ["Virtual World", 98],
    ],
    ["Action", "Adventure", "Romance"],
  );

describe("main theme with a supporting genre", () => {
  it("needs the plot-driving genre to be main and the supporting one only listed", () => {
    const romcomManga = makeMedia(7, [["Love Triangle", 85]], ["Comedy", "Romance"]);
    const f = makeFilters({ genres: ["Romance", "Comedy"], mainTheme: true });
    expect(mainGenres(f)).toEqual(["Romance"]);
    expect(filterAccepts(f, romcomManga, THEMES)).toBe(true);
    expect(filterAccepts(f, actionWithRomance(), THEMES)).toBe(false);
    const onlyComedy = makeFilters({ genres: ["Comedy"], mainTheme: true });
    expect(mainGenres(onlyComedy)).toEqual(["Comedy"]);
    expect(filterAccepts(onlyComedy, romcomManga, THEMES)).toBe(false);
  });
});

describe("country filter", () => {
  it("keeps chosen countries, passes titles cached before countries were fetched", () => {
    const f = makeFilters({ countries: ["KR", "CN"] });
    const at = (country: string | null | undefined): Media => {
      const m: Media = makeMedia(1);
      if (country !== undefined) m.country = country;
      return m;
    };
    expect(filterAccepts(f, at("KR"), THEMES)).toBe(true);
    expect(filterAccepts(f, at("JP"), THEMES)).toBe(false);
    expect(filterAccepts(f, at(null), THEMES)).toBe(false);
    expect(filterAccepts(f, at(undefined), THEMES)).toBe(true);
    expect(filtersActive(f)).toBe(true);
    expect(filterQueryVariables(makeFilters({ countries: ["KR"] })).countryOfOrigin).toBe("KR");
    expect(filterQueryVariables(f).countryOfOrigin).toBeUndefined(); // searched one at a time
  });
});

describe("minimum score", () => {
  it("keeps titles scored at least the minimum, leaves out unscored ones, and searches a point lower", () => {
    const f = makeFilters({ minScore: 75 });
    const scored = (averageScore: number | null) => makeMedia(1, [], [], { averageScore });
    expect(scoreAccepts(f, scored(75))).toBe(true);
    expect(scoreAccepts(f, scored(74))).toBe(false);
    expect(scoreAccepts(f, scored(null))).toBe(false);
    expect(scoreAccepts(makeFilters(), scored(null))).toBe(true);
    expect(filtersActive(f)).toBe(false); // alone it would only fetch AniList's top-scored titles
    expect(filterQueryVariables(f).averageScoreGreater).toBe(74);
    expect(filterQueryVariables(makeFilters()).averageScoreGreater).toBeUndefined();
  });
});

describe("Themes", () => {
  it("doesn't count Heterosexual as romance evidence (Re:Zero's light novel)", () => {
    const rezero = makeMedia(
      9,
      [
        ["Heterosexual", 80],
        ["Swordplay", 78],
      ],
      ["Action", "Romance"],
    );
    expect(THEMES.strength(rezero, "Romance")).toBe(50);
    expect(THEMES.isMain(rezero, "Romance")).toBe(false);
    expect(THEMES.isMain(rezero, "Action")).toBe(true);
  });

  it("measures strength from ranked tags and listed genres", () => {
    expect(THEMES.strength(romcom(), "Romance")).toBe(92);
    expect(THEMES.strength(romcom(), "Comedy")).toBe(50);
    expect(THEMES.strength(romcom(), "Action")).toBe(0);
    expect(THEMES.strength(actionWithRomance(), "Adventure")).toBe(98);
  });

  it("needs a main theme to beat plot rivals, but not comedy", () => {
    expect(THEMES.isMain(romcom(), "Romance")).toBe(true);
    expect(THEMES.isMain(actionWithRomance(), "Romance")).toBe(false);
    expect(THEMES.isMain(actionWithRomance(), "Adventure")).toBe(true);
    expect(
      THEMES.isMain(makeMedia(3, [["Heterosexual", 40]], ["Comedy", "Romance"]), "Romance"),
    ).toBe(true);
    expect(
      THEMES.isMain(makeMedia(8, [["Heterosexual", 55]], ["Action", "Romance"]), "Romance"),
    ).toBe(false);
    expect(THEMES.summary(actionWithRomance()).map((t) => t.genre)).toEqual([
      "Adventure",
      "Action",
      "Romance",
    ]);
  });
});

describe("filters", () => {
  it("accepts by genre, main theme, tag rank, format, year and status", () => {
    const f = makeFilters({ genres: ["Romance"], mainTheme: true });
    expect(filterAccepts(f, romcom(), THEMES)).toBe(true);
    expect(filterAccepts(f, actionWithRomance(), THEMES)).toBe(false);
    expect(filterAccepts(makeFilters({ genres: ["Romance"] }), actionWithRomance(), THEMES)).toBe(
      true,
    );

    const tagged = makeFilters({ tags: ["Love Triangle"], minTagRank: 70 });
    const subplot = makeMedia(6, [["Love Triangle", 61]], ["Action", "Romance"]);
    expect(filterAccepts(tagged, romcom(), THEMES)).toBe(true);
    expect(filterAccepts(tagged, subplot, THEMES)).toBe(false);
    expect(filterAccepts(makeFilters({ tags: ["Love Triangle"] }), subplot, THEMES)).toBe(true);

    const movie = makeMedia(4, ["Heterosexual"], ["Romance"], {
      format: "MOVIE",
      year: 2015,
      status: "FINISHED",
    });
    const all = makeFilters({
      formats: ["MOVIE"],
      yearFrom: 2010,
      yearTo: 2020,
      statuses: ["FINISHED", "RELEASING"],
    });
    expect(filterAccepts(all, movie, THEMES)).toBe(true);
    expect(filterAccepts(makeFilters({ statuses: ["RELEASING"] }), movie, THEMES)).toBe(false);
    expect(filterAccepts(makeFilters({ formats: ["TV"] }), movie, THEMES)).toBe(false);
    expect(filterAccepts(makeFilters({ yearFrom: 2016 }), movie, THEMES)).toBe(false);
    expect(filterAccepts(makeFilters({ yearTo: 2014 }), makeMedia(5), THEMES)).toBe(false);
    expect(filtersActive(makeFilters())).toBe(false);
    expect(filtersActive(makeFilters({ mainTheme: true, minTagRank: 50 }))).toBe(false);
    expect(filtersActive(makeFilters({ statuses: ["HIATUS"] }))).toBe(true);
  });

  it("reads saved finished-only filters as the Finished status", () => {
    expect(makeFilters({ finishedOnly: true }).statuses).toEqual(["FINISHED"]);
    expect(makeFilters({ finishedOnly: false }).statuses).toEqual([]);
    expect("finishedOnly" in makeFilters({ finishedOnly: true })).toBe(false);
  });

  it("turns filters into AniList search variables", () => {
    const f = makeFilters({
      genres: ["Romance"],
      tags: ["Heterosexual"],
      minTagRank: 70,
      formats: ["MANGA"],
      yearFrom: 2010,
      yearTo: 2020,
      statuses: ["FINISHED"],
    });
    expect(filterQueryVariables(f)).toEqual({
      genreIn: ["Romance"],
      tagIn: ["Heterosexual"],
      minimumTagRank: 70,
      formatIn: ["MANGA"],
      startGreater: 20100000,
      startLesser: 20201231,
      statusIn: ["FINISHED"],
    });
    expect(filterQueryVariables(makeFilters())).toEqual({});
    // With no minimum, rank 1 is still sent: AniList would otherwise drop tags ranked under 18.
    expect(filterQueryVariables(makeFilters({ tags: ["Iyashikei"] }))).toEqual({
      tagIn: ["Iyashikei"],
      minimumTagRank: 1,
    });
  });
});

describe("seenAdaptations", () => {
  it("works from either side, follows a source novel, and counts watching but not planning", () => {
    const manga = (id: number, relations = [] as ReturnType<typeof rel>[], format = "MANGA") =>
      makeMedia(id, [], [], { type: "MANGA", episodes: null, format, relations });
    const novel = manga(110, [rel("ADAPTATION", 111, "MANGA")], "NOVEL");
    const { lookup } = catalog([
      makeMedia(1, [], [], { relations: [rel("SOURCE", 100, "MANGA")] }),
      makeMedia(2, [], [], { relations: [rel("ADAPTATION", 110, "MANGA")] }),
      makeMedia(3, [], [], { relations: [rel("SOURCE", 101, "MANGA")] }),
      makeMedia(4, [], [], { relations: [rel("SOURCE", 105, "MANGA")] }),
      novel,
    ]);
    const anime = [
      entry(1, "COMPLETED"),
      entry(2, "DROPPED", 0, { progress: 5 }),
      entry(3, "CURRENT"),
      entry(4, "PLANNING"),
    ];
    const seen = seenAdaptations(anime, "MANGA", lookup);

    expect(blocksSeen(seen, manga(100))).toBe(true);
    expect(blocksSeen(seen, manga(102, [rel("ADAPTATION", 1)]))).toBe(true);
    expect(blocksSeen(seen, manga(103, [rel("ALTERNATIVE", 2)]))).toBe(true);
    expect(blocksSeen(seen, novel)).toBe(true);
    expect(blocksSeen(seen, manga(111))).toBe(true);
    expect(blocksSeen(seen, manga(101))).toBe(true); // still being watched counts too
    expect(blocksSeen(seen, manga(105))).toBe(false); // planning to watch doesn't
    expect(blocksSeen(seen, manga(104, [rel("SEQUEL", 1)]))).toBe(false);
  });
});

describe("listedVersions", () => {
  it("covers every format of a listed story, any status, but not sequels", () => {
    const { lookup } = catalog([
      makeMedia(1, [], [], {
        type: "MANGA",
        episodes: null,
        relations: [rel("SOURCE", 2, "MANGA")],
      }),
      makeMedia(3),
    ]);
    const novel = makeMedia(2, [], [], { type: "MANGA", episodes: null, format: "NOVEL" });
    const manga = listedVersions([entry(1, "PLANNING")], "MANGA", lookup);
    expect(blocksSeen(manga, novel)).toBe(true);
    const anime = listedVersions([entry(3, "CURRENT")], "ANIME", lookup);
    const recap = makeMedia(4, [], [], { format: "MOVIE", relations: [rel("SUMMARY", 3)] });
    const sequel = makeMedia(5, [], [], { relations: [rel("PREQUEL", 3)] });
    expect(blocksSeen(anime, recap)).toBe(true); // from the recap's own link
    expect(blocksSeen(anime, sequel)).toBe(false); // a sequel is new story
  });
});
