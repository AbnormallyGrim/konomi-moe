/** Filters chosen before a run, such as "romance manga, finished, from 2010". Mirrors filters.py. */

import type { ListEntry, ListStatus, Media, MediaType } from "./models.ts";
import { RIVALS, type Themes } from "./themes.ts";

/** AniList formats per media type. */
export const FORMATS: Readonly<Record<MediaType, readonly string[]>> = {
  ANIME: ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"],
  MANGA: ["MANGA", "NOVEL", "ONE_SHOT"],
};

/** AniList release statuses per media type: only manga goes on hiatus (checked 2026-11-18). */
export const STATUSES: Readonly<Record<MediaType, readonly string[]>> = {
  ANIME: ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED"],
  MANGA: ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "HIATUS", "CANCELLED"],
};

/** Every set field must match; an empty filter lets everything through. */
export interface Filters {
  genres: string[];
  tags: string[];
  /** The chosen genres must be the title's main theme (see `Themes.isMain`). */
  mainTheme: boolean;
  /** Chosen tags must be ranked at least this high on the title (0-100); 0 means any rank. */
  minTagRank: number;
  formats: string[];
  yearFrom: number | null;
  yearTo: number | null;
  /** Release statuses (AniList's, see `STATUSES`); empty means any. */
  statuses: string[];
  /** Leave out titles on the user's list (on by default). */
  hideListed: boolean;
  /** Leave out other versions of titles the user finished or dropped in the other type. */
  hideSeenAdaptations: boolean;
  /**
   * Lowest AniList average score (0-100, as the cards show it); 0 means any. Titles without a
   * score yet are left out while it's set.
   */
  minScore: number;
  /** Countries of origin (AniList codes such as JP, KR, CN, TW); empty means any. */
  countries: string[];
  /**
   * Excluded for this search only (`genre:`, `tag:`, `studio:`, `country:`, `format:` keys),
   * on top of the saved exclusions. Anything the filters ask for is never excluded.
   */
  exclude: string[];
}

/**
 * Filters with defaults for anything not given. Saved filters from before statuses keep their
 * meaning: `finishedOnly` becomes the Finished status.
 */
export function makeFilters(given: Partial<Filters> & { finishedOnly?: boolean } = {}): Filters {
  const { finishedOnly, ...rest } = given;
  return {
    genres: [],
    tags: [],
    mainTheme: false,
    minTagRank: 0,
    formats: [],
    yearFrom: null,
    yearTo: null,
    statuses: finishedOnly ? ["FINISHED"] : [],
    hideListed: true,
    hideSeenAdaptations: false,
    minScore: 0,
    countries: [],
    exclude: [],
    ...rest,
  };
}

/** The labels these filters ask for, as exclusion keys; those can't also be excluded. */
export function requiredLabels(f: Filters): Set<string> {
  return new Set([
    ...f.genres.map((g) => `genre:${g}`),
    ...f.tags.map((t) => `tag:${t}`),
    ...f.countries.map((c) => `country:${c}`),
    ...f.formats.map((x) => `format:${x}`),
  ]);
}

/**
 * Whether any title filter is set; `mainTheme`, `minTagRank`, `minScore` and the list-based flags
 * alone don't count. A minimum score alone would make the filter search return AniList's
 * top-scored titles, which says nothing about the user's preferences.
 */
export function filtersActive(f: Filters): boolean {
  return Boolean(
    f.genres.length ||
      f.tags.length ||
      f.formats.length ||
      f.yearFrom ||
      f.yearTo ||
      f.statuses.length ||
      f.countries.length,
  );
}

/** Whether a title passes; with `mainTheme`, genres must be main themes. */
export function filterAccepts(f: Filters, m: Media, themes: Themes): boolean {
  const minRank = Math.max(1, f.minTagRank);
  const ranks = new Map(m.tags.map((t) => [t.name, t.rank]));
  return (
    f.genres.every((g) => m.genres.includes(g)) &&
    f.tags.every((t) => (ranks.get(t) ?? 0) >= minRank) &&
    !(f.mainTheme && !mainGenres(f).every((g) => themes.isMain(m, g))) &&
    (f.formats.length === 0 || (m.format !== null && f.formats.includes(m.format))) &&
    yearOk(f, m.year) &&
    (f.statuses.length === 0 || (m.status !== null && f.statuses.includes(m.status))) &&
    countryOk(f, m)
  );
}

/** Whether a title meets the minimum score; applied to every candidate, filters active or not. */
export function scoreAccepts(f: Filters, m: Media): boolean {
  return !f.minScore || (m.averageScore !== null && m.averageScore >= f.minScore);
}

/**
 * The chosen genres that must be the main theme. Supporting genres (Comedy, Drama, Slice of
 * Life…) sit alongside a plot-driving one, so with one of those chosen they need only be
 * listed: Romance + Comedy means romcoms. Comedy rarely has strong tag evidence, so requiring
 * it as the main theme too left 16 of 300 romcom manga.
 */
export function mainGenres(f: Filters): string[] {
  const rivals = f.genres.filter((g) => RIVALS.has(g));
  return rivals.length ? rivals : f.genres;
}

/** The parts AniList's search can do itself, as `queries.DISCOVER` variables. */
export function filterQueryVariables(f: Filters): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if (f.genres.length) v.genreIn = [...f.genres];
  if (f.tags.length) {
    v.tagIn = [...f.tags];
    // Always sent: left out, AniList only counts tags ranked 18 or more.
    v.minimumTagRank = Math.max(1, f.minTagRank);
  }
  if (f.formats.length) v.formatIn = [...f.formats];
  if (f.yearFrom) v.startGreater = f.yearFrom * 10000;
  if (f.yearTo) v.startLesser = f.yearTo * 10000 + 1231;
  if (f.statuses.length) v.statusIn = [...f.statuses];
  // AniList compares unrounded scores, so "greater than 84" returns titles shown as 84%. One
  // point lower never misses a title; scoreAccepts then checks the score as shown.
  if (f.minScore) v.averageScoreGreater = f.minScore - 1;
  // AniList takes one country per search; with several, the pipeline searches each in turn.
  if (f.countries.length === 1) v.countryOfOrigin = f.countries[0];
  return v;
}

/** Titles cached before countries were fetched (`undefined`) pass, so old caches aren't emptied. */
function countryOk(f: Filters, m: Media): boolean {
  if (!f.countries.length || m.country === undefined) return true;
  return m.country !== null && f.countries.includes(m.country);
}

function yearOk(f: Filters, year: number | null): boolean {
  if (!(f.yearFrom || f.yearTo)) return true;
  if (year === null) return false;
  return (f.yearFrom || year) <= year && year <= (f.yearTo || year);
}

/**
 * Links between versions of the same story in another format: anime ↔ manga ↔ light novel
 * (AniList uses ADAPTATION/SOURCE or ALTERNATIVE), remakes (ALTERNATIVE), and recap or
 * compilation films (SUMMARY, COMPILATION/CONTAINS). Sequels, side stories and spin-offs are
 * new story, so they're not versions.
 */
export const VERSIONS: ReadonlySet<string> = new Set([
  "ADAPTATION",
  "SOURCE",
  "ALTERNATIVE",
  "SUMMARY",
  "COMPILATION",
  "CONTAINS",
]);
/** The old name of `VERSIONS`. */
export const CROSS_MEDIA = VERSIONS;
/**
 * Statuses that count as "already watched or read": being on it or having paused it counts
 * too ("I don't want to see this recommended"), planning to doesn't.
 */
export const SEEN: ReadonlySet<ListStatus> = new Set([
  "COMPLETED",
  "REPEATING",
  "DROPPED",
  "CURRENT",
  "PAUSED",
]);

/**
 * Titles from the user's list (watched or read in the other type, or anything on the same
 * type's list), and the versions of the same story they link to.
 */
export interface SeenAdaptations {
  seen: Set<number>;
  linked: Set<number>;
}

/**
 * Versions of the user's seen titles from the other type (`otherEntries`), for recommending
 * `mediaType`. Follows one more same-type hop, so watching an anime also covers the manga made
 * from the same light novel (novels count as manga). `getMedia` looks titles up in the cache.
 */
export function seenAdaptations(
  otherEntries: ListEntry[],
  mediaType: MediaType,
  getMedia: (ids: Iterable<number>) => ReadonlyMap<number, Media>,
): SeenAdaptations {
  const seen = new Set(otherEntries.filter((e) => SEEN.has(e.status)).map((e) => e.mediaId));
  return withVersions(seen, mediaType, getMedia);
}

/**
 * Other versions of anything on the user's list of `mediaType` (`entries`), any status: the
 * light novel of a manga they're reading, the recap film of a series they watched.
 */
export function listedVersions(
  entries: ListEntry[],
  mediaType: MediaType,
  getMedia: (ids: Iterable<number>) => ReadonlyMap<number, Media>,
): SeenAdaptations {
  return withVersions(new Set(entries.map((e) => e.mediaId)), mediaType, getMedia);
}

/** `ids` and the versions they link to, plus one more same-type hop. */
function withVersions(
  seen: Set<number>,
  mediaType: MediaType,
  getMedia: (ids: Iterable<number>) => ReadonlyMap<number, Media>,
): SeenAdaptations {
  const versions = (ids: Set<number>) =>
    new Set(
      [...getMedia(ids).values()].flatMap((m) =>
        m.relations
          .filter(
            (r) =>
              VERSIONS.has(r.relationType) && (r.mediaType === null || r.mediaType === mediaType),
          )
          .map((r) => r.mediaId),
      ),
    );
  const linked = versions(seen);
  for (const id of versions(linked)) linked.add(id);
  for (const id of seen) linked.delete(id);
  return { seen, linked };
}

/** Whether a title is another version of a seen title, judged from either side's links. */
export function blocksSeen(s: SeenAdaptations, m: Media): boolean {
  return (
    s.linked.has(m.id) ||
    m.relations.some((r) => VERSIONS.has(r.relationType) && s.seen.has(r.mediaId))
  );
}
