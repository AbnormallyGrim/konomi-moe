import { describe, expect, it } from "vitest";
import {
  type MediaNode,
  mediaLabels,
  parseListChunk,
  parseMedia,
  prequelIds,
  sequelIds,
} from "../src/index.ts";

/** A made-up `MediaFields` node, like the Python lab's tests use. */
function mediaNode(id: number, english: string | null = null): MediaNode {
  return {
    id,
    type: "ANIME",
    format: "TV",
    isAdult: false,
    title: { romaji: `Tesuto ${id}`, english },
    episodes: 12,
    startDate: { year: 2015 },
    averageScore: 75,
    genres: ["Drama"],
    tags: [{ name: "Found Family", rank: 90, isMediaSpoiler: false }],
    studios: { nodes: [{ name: "Studio Example" }] },
    relations: {
      edges: [
        { relationType: "PREQUEL", node: { id: 99, type: "ANIME" } },
        { relationType: "SEQUEL", node: { id: 100, type: "ANIME" } },
        { relationType: "ADAPTATION", node: { id: 200, type: "MANGA" } },
      ],
    },
    recommendations: {
      nodes: [
        { rating: 12, mediaRecommendation: { id: 7 } },
        { rating: 3, mediaRecommendation: null },
      ],
    },
  };
}

describe("parseListChunk", () => {
  it("parses entries and keeps each title once across custom lists", () => {
    const entry = {
      status: "COMPLETED" as const,
      score: 85,
      progress: 12,
      repeat: 1,
      updatedAt: 5,
    };
    const chunk = parseListChunk({
      MediaListCollection: {
        hasNextChunk: true,
        lists: [
          {
            name: "Completed",
            isCustomList: false,
            entries: [{ ...entry, media: mediaNode(1, "Example One") }],
          },
          { name: "Example", isCustomList: true, entries: [{ ...entry, media: mediaNode(1) }] },
        ],
      },
    });
    expect(chunk.hasNext).toBe(true);
    expect(chunk.entries).toEqual([
      { mediaId: 1, status: "COMPLETED", score: 85, progress: 12, repeat: 1, updatedAt: 5 },
    ]);
    const [m] = chunk.media;
    expect(m?.title).toBe("Example One");
    expect(m?.studios).toEqual(["Studio Example"]);
    expect(chunk.recommendations.get(1)).toEqual([[7, 12]]);
    expect(chunk.customLists.get("Example")).toEqual(new Set([1]));
  });

  it("copes with an empty collection", () => {
    const chunk = parseListChunk({ MediaListCollection: null });
    expect(chunk.entries).toEqual([]);
    expect(chunk.hasNext).toBe(false);
  });
});

describe("parseMedia", () => {
  it("reads ratings and sorts the score distribution", () => {
    const node: MediaNode = {
      ...mediaNode(5),
      meanScore: 78,
      popularity: 12345,
      favourites: 67,
      coverImage: { large: "https://example.invalid/cover.jpg" },
      stats: {
        scoreDistribution: [
          { score: 20, amount: 3 },
          { score: 10, amount: 1 },
        ],
      },
    };
    const m = parseMedia(node);
    expect([m.averageScore, m.meanScore, m.favourites]).toEqual([75, 78, 67]);
    expect(m.scoreDistribution).toEqual([
      [10, 1],
      [20, 3],
    ]);
    expect(m.coverUrl).toBe("https://example.invalid/cover.jpg");
    expect(parseMedia(mediaNode(6)).scoreDistribution).toEqual([]); // fetched, but none
  });

  it("falls back to the romaji title, then the ID", () => {
    expect(parseMedia(mediaNode(5)).title).toBe("Tesuto 5");
    expect(parseMedia({ id: 8, type: "MANGA" }).title).toBe("#8");
  });

  it("feeds the relation and label helpers", () => {
    const m = parseMedia(mediaNode(1));
    expect(prequelIds(m)).toEqual([99]);
    expect(sequelIds(m)).toEqual([100]);
    expect(mediaLabels(m)).toEqual(
      new Set(["genre:Drama", "tag:Found Family", "studio:Studio Example"]),
    );
  });

  it("reads every title language and the country of origin", () => {
    const m = parseMedia({
      ...mediaNode(1),
      title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
      countryOfOrigin: "JP",
    });
    expect(m.title).toBe("Attack on Titan");
    expect(m.titles).toEqual({
      romaji: "Shingeki no Kyojin",
      english: "Attack on Titan",
      native: "進撃の巨人",
    });
    expect(m.country).toBe("JP");
  });

  it("matches the shape the Python lab produces, plus the engine's display fields", () => {
    expect(Object.keys(parseMedia(mediaNode(1))).sort()).toEqual(
      [
        // Engine only: title languages and country, for display and the country filter.
        "country",
        "titles",
        "averageScore",
        "chapters",
        "coverUrl",
        "episodes",
        "favourites",
        "format",
        "genres",
        "id",
        "isAdult",
        "meanScore",
        "popularity",
        "relations",
        "scoreDistribution",
        "siteUrl",
        "status",
        "studios",
        "tags",
        "title",
        "type",
        "year",
      ].sort(),
    );
  });
});
