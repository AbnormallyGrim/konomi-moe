/** Turns AniList responses into engine types. Mirrors lab/src/konomi/anilist/parse.py. */

import type { ListEntry, ListStatus, Media, MediaType, Relation, Tag } from "../models.ts";

// AniList's response shapes, as far as the engine reads them. Everything may be missing or null.
type Maybe<T> = T | null | undefined;

/** A `MediaFields` node as returned by AniList. */
export interface MediaNode {
  id: number;
  type: MediaType;
  format?: Maybe<string>;
  status?: Maybe<string>;
  isAdult?: Maybe<boolean>;
  siteUrl?: Maybe<string>;
  title?: Maybe<{ romaji?: Maybe<string>; english?: Maybe<string>; native?: Maybe<string> }>;
  countryOfOrigin?: Maybe<string>;
  coverImage?: Maybe<{ large?: Maybe<string> }>;
  episodes?: Maybe<number>;
  chapters?: Maybe<number>;
  startDate?: Maybe<{ year?: Maybe<number> }>;
  averageScore?: Maybe<number>;
  meanScore?: Maybe<number>;
  popularity?: Maybe<number>;
  favourites?: Maybe<number>;
  stats?: Maybe<{ scoreDistribution?: Maybe<{ score: number; amount: number }[]> }>;
  genres?: Maybe<string[]>;
  tags?: Maybe<{ name: string; rank?: Maybe<number>; isMediaSpoiler?: Maybe<boolean> }[]>;
  studios?: Maybe<{ nodes?: Maybe<{ name: string }[]> }>;
  relations?: Maybe<{
    edges?: Maybe<
      { relationType: string; node?: Maybe<{ id: number; type?: Maybe<MediaType> }> }[]
    >;
  }>;
  recommendations?: Maybe<{
    nodes?: Maybe<{ rating?: Maybe<number>; mediaRecommendation?: Maybe<{ id: number }> }[]>;
  }>;
}

/** A `MediaListCollection` response. */
export interface ListCollectionData {
  MediaListCollection?: Maybe<{
    hasNextChunk?: Maybe<boolean>;
    lists?: Maybe<
      {
        name?: Maybe<string>;
        isCustomList?: Maybe<boolean>;
        entries?: Maybe<
          {
            status: ListStatus;
            score?: Maybe<number>;
            progress?: Maybe<number>;
            repeat?: Maybe<number>;
            updatedAt?: Maybe<number>;
            media: MediaNode;
          }[]
        >;
      }[]
    >;
  }>;
}

/** One chunk of a user's list, with titles and their recommendations. */
export interface ListChunk {
  entries: ListEntry[];
  media: Media[];
  /** Recommended `[id, rating]` pairs per title on the list. */
  recommendations: Map<number, [number, number][]>;
  /** Custom list name → title IDs on it. */
  customLists: Map<string, Set<number>>;
  hasNext: boolean;
}

/** Parse a `MediaFields` node. */
export function parseMedia(node: MediaNode): Media {
  const title = node.title ?? {};
  const distribution = node.stats?.scoreDistribution ?? [];
  return {
    id: node.id,
    type: node.type,
    title: title.english || title.romaji || `#${node.id}`,
    format: node.format ?? null,
    status: node.status ?? null,
    isAdult: Boolean(node.isAdult),
    year: node.startDate?.year ?? null,
    episodes: node.episodes ?? null,
    chapters: node.chapters ?? null,
    averageScore: node.averageScore ?? null,
    meanScore: node.meanScore ?? null,
    popularity: node.popularity ?? null,
    favourites: node.favourites ?? null,
    scoreDistribution: distribution
      .map((d): [number, number] => [d.score, d.amount])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    siteUrl: node.siteUrl ?? null,
    coverUrl: node.coverImage?.large ?? null,
    genres: [...(node.genres ?? [])],
    tags: (node.tags ?? []).map(
      (t): Tag => ({ name: t.name, rank: t.rank ?? 0, spoiler: Boolean(t.isMediaSpoiler) }),
    ),
    studios: (node.studios?.nodes ?? []).map((s) => s.name),
    relations: (node.relations?.edges ?? []).flatMap((e): Relation[] =>
      e.node
        ? [{ relationType: e.relationType, mediaId: e.node.id, mediaType: e.node.type ?? null }]
        : [],
    ),
    titles: {
      romaji: title.romaji ?? null,
      english: title.english ?? null,
      native: title.native ?? null,
    },
    country: node.countryOfOrigin ?? null,
  };
}

/** Parse `[recommended id, rating]` pairs, skipping removed titles. */
export function parseRecommendations(node: MediaNode): [number, number][] {
  return (node.recommendations?.nodes ?? []).flatMap((n): [number, number][] =>
    n.mediaRecommendation ? [[n.mediaRecommendation.id, n.rating ?? 0]] : [],
  );
}

/** Parse a `MediaListCollection` response; custom lists can repeat titles, so each is kept once. */
export function parseListChunk(data: ListCollectionData): ListChunk {
  const collection = data.MediaListCollection ?? {};
  const chunk: ListChunk = {
    entries: [],
    media: [],
    recommendations: new Map(),
    customLists: new Map(),
    hasNext: Boolean(collection.hasNextChunk),
  };
  const seen = new Set<number>();
  for (const list of collection.lists ?? []) {
    const entries = list.entries ?? [];
    if (list.isCustomList) {
      const name = list.name ?? "";
      const ids = chunk.customLists.get(name) ?? new Set<number>();
      for (const e of entries) ids.add(e.media.id);
      chunk.customLists.set(name, ids);
    }
    for (const e of entries) {
      const node = e.media;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      chunk.entries.push({
        mediaId: node.id,
        status: e.status,
        score: Math.trunc(e.score ?? 0),
        progress: e.progress ?? 0,
        repeat: e.repeat ?? 0,
        updatedAt: e.updatedAt ?? 0,
      });
      chunk.media.push(parseMedia(node));
      chunk.recommendations.set(node.id, parseRecommendations(node));
    }
  }
  return chunk;
}
