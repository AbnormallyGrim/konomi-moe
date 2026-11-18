/** Made-up test data, mirroring the lab's tests/conftest.py. */

import type { ListEntry, ListStatus, Media, MediaType, Relation } from "../src/index.ts";

/** A fake title; `tags` are names (rank 80) or `[name, rank]` pairs. */
export function makeMedia(
  id: number,
  tags: (string | [string, number])[] = [],
  genres: string[] = [],
  extra: Partial<Media> & { type?: MediaType } = {},
): Media {
  return {
    id,
    type: "ANIME",
    title: `Test Show ${id}`,
    format: null,
    status: null,
    isAdult: false,
    year: null,
    episodes: 12,
    chapters: null,
    averageScore: null,
    meanScore: null,
    popularity: null,
    favourites: null,
    scoreDistribution: null,
    siteUrl: null,
    coverUrl: null,
    genres,
    tags: tags.map((t) =>
      typeof t === "string"
        ? { name: t, rank: 80, spoiler: false }
        : { name: t[0], rank: t[1], spoiler: false },
    ),
    studios: [],
    relations: [],
    ...extra,
  };
}

/** A list entry with defaults. */
export function entry(
  mediaId: number,
  status: ListStatus,
  score = 0,
  more: Partial<ListEntry> = {},
): ListEntry {
  return { mediaId, status, score, progress: 0, repeat: 0, updatedAt: 0, ...more };
}

/** A relation to another title. */
export function rel(
  relationType: string,
  mediaId: number,
  mediaType: MediaType | null = "ANIME",
): Relation {
  return { relationType, mediaId, mediaType };
}

/** A media map and lookup over a set of titles. */
export function catalog(items: Media[]) {
  const map = new Map(items.map((m) => [m.id, m]));
  const lookup = (ids: Iterable<number>) =>
    new Map(
      [...ids].flatMap((id): [number, Media][] =>
        map.has(id) ? [[id, map.get(id) as Media]] : [],
      ),
    );
  return { map, lookup };
}

/** Six loved Iyashikei titles and six early-dropped Harem titles, like the lab's `seed`. */
export function seed(): { media: Media[]; entries: ListEntry[] } {
  const media: Media[] = [];
  const entries: ListEntry[] = [];
  for (let i = 1; i <= 6; i++) {
    media.push(makeMedia(i, ["Iyashikei", "Found Family"], ["Slice of Life"]));
    entries.push(entry(i, "COMPLETED", 90));
  }
  for (let i = 7; i <= 12; i++) {
    media.push(makeMedia(i, ["Harem", "Isekai"], ["Fantasy"]));
    entries.push(entry(i, "DROPPED", 0, { progress: 1 }));
  }
  return { media, entries };
}
