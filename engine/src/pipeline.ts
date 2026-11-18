/** One recommendation run, as every host performs it. Mirrors the lab's pipeline.py. */

import { type AniListClient, AniListError } from "./anilist/client.ts";
import * as q from "./anilist/queries.ts";
import {
  type Exclusions,
  excludedGenres,
  excludedTags,
  MAX_CHAIN,
  type MediaLookup,
  sequelClosure,
} from "./exclusions.ts";
import {
  blocksSeen,
  type Filters,
  filterAccepts,
  filterQueryVariables,
  filtersActive,
  listedVersions,
  makeFilters,
  requiredLabels,
  type SeenAdaptations,
  seenAdaptations,
} from "./filters.ts";
import { type ListEntry, type Media, type MediaType, otherType, prequelIds } from "./models.ts";
import {
  buildProfile,
  candidateSources,
  discoveryTags,
  type Profile,
  type Recommendation,
  rank,
} from "./recommend.ts";
import type { Store } from "./store.ts";
import { discoverMany, fetchMedia, type Search } from "./sync.ts";
import { Themes } from "./themes.ts";

/** Pages of 50 searched per filter search; it stops early once enough titles pass. */
export const FILTER_PAGES = 6;

/** Reports a step, with how far through it is when that's known. */
export type Progress = (step: string, done?: number, total?: number) => void;

/** How long the tag → category map stays cached. */
export const CATEGORIES_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/** Settings for a run. */
export interface RunOptions {
  limit: number;
  /** Search AniList for more candidates and fetch missing details; off uses only the store. */
  discover: boolean;
  includeAdult: boolean;
  filters: Filters;
}

/** Ranked picks, the profile behind them, and any steps that failed. */
export interface RunResult {
  recommendations: Recommendation[];
  profile: Profile;
  warnings: string[];
}

/** The user has no synced list for this media type. */
export class NoSyncedList extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSyncedList";
  }
}

/** Run options with defaults for anything not given. */
export function makeRunOptions(given: Partial<RunOptions> = {}): RunOptions {
  return { limit: 20, discover: true, includeAdult: false, filters: makeFilters(), ...given };
}

/** Fit the user's model, gather candidates and rank them; `client = null` stays offline. */
export async function run(
  store: Store,
  client: AniListClient | null,
  user: string,
  type: MediaType,
  options: RunOptions = makeRunOptions(),
  progress: Progress = () => {},
): Promise<RunResult> {
  const entries = await store.getList(user, type);
  if (!entries.length) throw new NoSyncedList(`no synced ${type.toLowerCase()} list for ${user}`);
  const otherEntries = await store.getList(user, otherType(type));
  const cache = new Map<number, Media>();
  await load(
    store,
    cache,
    [...entries, ...otherEntries].map((e) => e.mediaId),
  );
  const dismissedIds = (await store.getExclusions(user)).notInterested ?? [];
  await load(store, cache, dismissedIds);
  const dismissed = dismissedIds.flatMap((id) => {
    const m = cache.get(id);
    return m ? [m] : [];
  });
  const profile = buildProfile(entries, cache, otherEntries, cache, dismissed);
  const online = options.discover ? client : null;
  const onList = new Set(entries.map((e) => e.mediaId));
  const { filters } = options;
  const extra: [number, string][] = [];
  const warnings: string[] = [];

  let excluded: Exclusions;
  try {
    excluded = await loadExclusions(store, user, type, cache, online);
  } catch (e) {
    if (!(e instanceof AniListError)) throw e;
    warnings.push(`sequels of excluded titles may be missed: ${e.message}`);
    excluded = await loadExclusions(store, user, type, cache, null);
  }

  // This search's exclusions join the saved ones; whatever the filters ask for wins, so a
  // filter and an exclusion of the same thing never leave nothing to find.
  const required = requiredLabels(filters);
  excluded = {
    ...excluded,
    labels: new Set(
      [...excluded.labels, ...(filters.exclude ?? [])].filter((k) => !required.has(k)),
    ),
  };

  let themes: Themes;
  try {
    themes = new Themes(await tagCategories(store, online));
  } catch (e) {
    if (!(e instanceof AniListError)) throw e;
    warnings.push(`main themes judged without tag categories: ${e.message}`);
    themes = new Themes(await tagCategories(store, null));
  }

  try {
    const { liked, disliked } = discoveryTags(profile.model);
    const banned = excludedTags(excluded);
    const base = {
      tagNotIn: [...new Set([...disliked, ...banned])].sort(),
      genreNotIn: excludedGenres(excluded),
      idNotIn: [...new Set([...onList, ...excluded.mediaIds])].sort((a, b) => a - b),
      ...filterQueryVariables(filters),
    };
    if (online) {
      const tags = liked.filter((t) => !banned.includes(t));
      // One search per tag, because AniList's tag_in needs all its tags.
      const tagSearches: Search[] = tags.map((tag) => ({
        variables: { ...base, tagIn: [tag, ...filters.tags] },
        perPage: 30,
      }));
      // An explicit filter search shouldn't silently skip titles with tags the model thinks
      // the user dislikes (ranking weighs those); only excluded tags stay out. AniList
      // searches one country at a time.
      const asked = { ...base, tagNotIn: [...banned].sort() };
      const filterSearches = !filtersActive(filters)
        ? []
        : filters.countries.length > 1
          ? filters.countries.map((c) => ({ ...asked, countryOfOrigin: c }))
          : [asked];
      // The tag searches and every filter search's first page go out in one request.
      progress(tagSearches.length ? "Searching AniList by your top tags" : "Searching AniList");
      const first = await discoverMany(online, store, type, [
        ...tagSearches,
        ...filterSearches.map((variables) => ({ variables, perPage: 50, page: 1 })),
      ]);
      for (const [i, tag] of tags.entries())
        for (const m of first[i] ?? []) extra.push([m.id, `top-scored with ${tag}`]);
      const forFilters = (found: Media[]) => {
        for (const m of found) extra.push([m.id, "top-scored for your filters"]);
        return found.filter((m) => filterAccepts(filters, m, themes)).length;
      };
      // Rare combinations (two main themes, say) pass few titles per page, so a search whose
      // first page was full and passed too few gets its remaining pages, all in one request.
      const more = filterSearches.flatMap((variables, j) => {
        const found = first[tags.length + j] ?? [];
        const passed = forFilters(found);
        if (found.length < 50 || passed >= options.limit) return [];
        return Array.from({ length: FILTER_PAGES - 1 }, (_, k) => ({
          variables,
          perPage: 50,
          page: k + 2,
        }));
      });
      if (more.length) {
        progress("Searching AniList with your filters");
        for (const found of await discoverMany(online, store, type, more)) forFilters(found);
      }
    }
  } catch (e) {
    if (!(e instanceof AniListError)) throw e;
    warnings.push(`some candidates skipped: ${e.message}`);
  }

  progress("Ranking");
  const links = await store.recommendationsFrom(profile.likedIds);
  const sources = candidateSources(profile, links, { extra, includeListed: !filters.hideListed });
  await load(store, cache, sources.keys());
  await loadPrequelChains(store, cache, sources.keys());

  let seen: SeenAdaptations | null = null;
  if (filters.hideSeenAdaptations) {
    if ((await store.lastSynced(user, otherType(type))) === null) {
      const other = otherType(type).toLowerCase();
      warnings.push(`sync your ${other} list to hide titles you've finished as ${other}`);
    } else {
      seen = await loadSeenAdaptations(store, cache, otherEntries, type);
    }
  }

  // Hiding list titles also hides their other versions (light novel of a listed manga…).
  const listed = filters.hideListed ? await loadListedVersions(store, cache, entries, type) : null;

  const active = filtersActive(filters);
  const accept = (m: Media) =>
    (!active || filterAccepts(filters, m, themes)) &&
    !(seen && blocksSeen(seen, m)) &&
    !(listed && blocksSeen(listed, m));
  let recs = rank(profile, sources, cache, {
    limit: options.limit,
    includeAdult: options.includeAdult,
    exclusions: excluded,
    lookup: lookupIn(cache),
    accept,
    includeListed: !filters.hideListed,
  });
  if (online) recs = await fillDetails(online, store, recs, warnings);
  return { recommendations: recs, profile, warnings };
}

/** The user's exclusions, with sequels followed; a client fetches uncached links. */
export async function loadExclusions(
  store: Store,
  user: string,
  type: MediaType,
  cache: Map<number, Media>,
  client: AniListClient | null,
): Promise<Exclusions> {
  const saved = await store.getExclusions(user);
  const roots = new Set(saved.titles);
  const lists = await store.getCustomLists(user, type);
  for (const name of saved.customLists[type]) for (const id of lists.get(name) ?? []) roots.add(id);
  const fetchMissing = async (ids: Set<number>) => {
    if (client) await fetchMedia(client, store, ids);
    await load(store, cache, ids, true);
  };
  return {
    mediaIds: await sequelClosure(roots, lookupIn(cache), fetchMissing),
    labels: new Set(saved.labels),
  };
}

/** AniList's tag → category map, cached for 30 days; fetched only with a client. */
export async function tagCategories(
  store: Store,
  client: AniListClient | null,
): Promise<Record<string, string>> {
  const cached = await store.getMeta("tag_categories");
  if (cached) {
    const saved = JSON.parse(cached) as { at: number; categories: Record<string, string> };
    if (!client || Date.now() - saved.at < CATEGORIES_MAX_AGE_MS) return saved.categories;
  }
  if (!client) return {};
  const data = await client.query<{ MediaTagCollection: { name: string; category: string }[] }>(
    q.TAG_COLLECTION,
  );
  const categories = Object.fromEntries(data.MediaTagCollection.map((t) => [t.name, t.category]));
  await store.setMeta("tag_categories", JSON.stringify({ at: Date.now(), categories }));
  return categories;
}

/** Refetch shown titles cached before covers or score distributions were stored. */
async function fillDetails(
  client: AniListClient,
  store: Store,
  recs: Recommendation[],
  warnings: string[],
): Promise<Recommendation[]> {
  const missing = recs
    .filter((r) => !r.media.coverUrl || r.media.scoreDistribution === null)
    .map((r) => r.media.id);
  if (!missing.length) return recs;
  try {
    await fetchMedia(client, store, missing, 0);
  } catch (e) {
    if (!(e instanceof AniListError)) throw e;
    warnings.push(`some covers and ratings skipped: ${e.message}`);
    return recs;
  }
  const fresh = await store.getMedia(missing);
  return recs.map((r) => ({ ...r, media: fresh.get(r.media.id) ?? r.media }));
}

/** Load titles into `cache` from the store (`refresh` reloads ones already there). */
async function load(
  store: Store,
  cache: Map<number, Media>,
  ids: Iterable<number>,
  refresh = false,
): Promise<void> {
  const todo = [...ids].filter((id) => refresh || !cache.has(id));
  for (const [id, m] of await store.getMedia(todo)) cache.set(id, m);
}

/** Load each candidate's cached prequels, link by link, so excluded series can be traced. */
async function loadPrequelChains(
  store: Store,
  cache: Map<number, Media>,
  start: Iterable<number>,
): Promise<void> {
  let frontier = new Set(start);
  for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
    const next = new Set<number>();
    for (const id of frontier) {
      const m = cache.get(id);
      if (m) for (const p of prequelIds(m)) if (!cache.has(p)) next.add(p);
    }
    await load(store, cache, next);
    frontier = new Set([...next].filter((id) => cache.has(id)));
  }
}

/** Seen titles of the other type and two hops of their versions, loaded, then judged. */
async function loadSeenAdaptations(
  store: Store,
  cache: Map<number, Media>,
  otherEntries: Parameters<typeof seenAdaptations>[0],
  type: MediaType,
): Promise<SeenAdaptations> {
  const first = seenAdaptations(otherEntries, type, lookupIn(cache));
  await load(store, cache, first.linked);
  return seenAdaptations(otherEntries, type, lookupIn(cache));
}

async function loadListedVersions(
  store: Store,
  cache: Map<number, Media>,
  entries: ListEntry[],
  type: MediaType,
): Promise<SeenAdaptations> {
  const first = listedVersions(entries, type, lookupIn(cache));
  await load(store, cache, first.linked);
  return listedVersions(entries, type, lookupIn(cache));
}

function lookupIn(cache: ReadonlyMap<number, Media>): MediaLookup {
  return (ids) =>
    new Map(
      [...ids].flatMap((id): [number, Media][] =>
        cache.has(id) ? [[id, cache.get(id) as Media]] : [],
      ),
    );
}
