/**
 * Plain data types shared across the engine. They're plain objects (no classes) so they can be
 * stored as JSON and passed through a host's message channel unchanged.
 */

/** AniList media type. */
export type MediaType = "ANIME" | "MANGA";

/** Status of an entry on a user's list. */
export type ListStatus = "CURRENT" | "PLANNING" | "COMPLETED" | "DROPPED" | "PAUSED" | "REPEATING";

/** A tag on a title, with AniList's relevance rank (0-100). */
export interface Tag {
  name: string;
  rank: number;
  spoiler: boolean;
}

/** A link from one title to another, such as `PREQUEL`. */
export interface Relation {
  relationType: string;
  mediaId: number;
  mediaType: MediaType | null;
}

/** An anime or manga title with the fields the engine uses. */
export interface Media {
  id: number;
  type: MediaType;
  title: string;
  format: string | null;
  status: string | null;
  isAdult: boolean;
  year: number | null;
  episodes: number | null;
  chapters: number | null;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  /** `[score, users]` pairs, lowest score first; `null` when not fetched. */
  scoreDistribution: [number, number][] | null;
  siteUrl: string | null;
  coverUrl: string | null;
  genres: string[];
  tags: Tag[];
  studios: string[];
  relations: Relation[];
  /** Every title language AniList has; absent on titles cached before it was fetched. */
  titles?: Titles;
  /** AniList's country code (JP, KR, CN, TW…); `undefined` when not fetched yet. */
  country?: string | null;
}

/** A title in each language AniList has. */
export interface Titles {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

/** One title on a user's list. `score` is 0-100, with 0 meaning unscored. */
export interface ListEntry {
  mediaId: number;
  status: ListStatus;
  score: number;
  progress: number;
  repeat: number;
  updatedAt: number;
}

/** Anime for manga and manga for anime. */
export function otherType(type: MediaType): MediaType {
  return type === "ANIME" ? "MANGA" : "ANIME";
}

/** Episode or chapter count, if known. */
export function mediaLength(m: Media): number | null {
  return m.type === "ANIME" ? m.episodes : m.chapters;
}

function linked(m: Media, relationType: string): number[] {
  return m.relations
    .filter(
      (r) => r.relationType === relationType && (r.mediaType === null || r.mediaType === m.type),
    )
    .map((r) => r.mediaId);
}

/** IDs of same-type prequels. */
export function prequelIds(m: Media): number[] {
  return linked(m, "PREQUEL");
}

/** IDs of same-type sequels. */
export function sequelIds(m: Media): number[] {
  return linked(m, "SEQUEL");
}

/** Genres, tags and main studios as `genre:`, `tag:` and `studio:` keys. */
export function mediaLabels(m: Media): Set<string> {
  return new Set([
    ...m.genres.map((g) => `genre:${g}`),
    ...m.tags.map((t) => `tag:${t.name}`),
    ...m.studios.map((s) => `studio:${s}`),
  ]);
}

/**
 * Everything a title can be excluded by: its `mediaLabels` plus `country:` and `format:` keys,
 * so whatever can be filtered by can also be excluded. (Kept apart from `mediaLabels`, which
 * the taste model doesn't use for these.)
 */
export function exclusionLabels(m: Media): Set<string> {
  const labels = mediaLabels(m);
  if (m.country) labels.add(`country:${m.country}`);
  if (m.format) labels.add(`format:${m.format}`);
  return labels;
}
