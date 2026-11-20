/** Fetches from AniList into the store, only as much as is needed. Mirrors the lab's sync.py. */

import { chunk, PAGES_PER_REQUEST } from "./anilist/batch.ts";
import type { AniListClient } from "./anilist/client.ts";
import {
  type ListCollectionData,
  type MediaNode,
  parseListChunk,
  parseMedia,
  parseRecommendations,
} from "./anilist/parse.ts";
import * as q from "./anilist/queries.ts";
import type { ListEntry, Media, MediaType } from "./models.ts";
import type { Progress } from "./pipeline.ts";
import { examples, isLiked } from "./preference.ts";
import type { Store } from "./store.ts";

/** Entries fetched per list request (AniList's maximum). */
export const PER_CHUNK = 500;
/** Titles fetched per details request. */
export const PAGE_SIZE = 50;
/** How long cached title details stay fresh. */
export const MEDIA_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

type PageData = { Page: { media: MediaNode[] } };

/** What a list sync fetched. */
export interface SyncResult {
  entries: number;
  candidatesFetched: number;
}

/** Sync a user's list, then cache details of titles recommended from ones they liked. */
export async function syncList(
  client: AniListClient,
  store: Store,
  user: string,
  type: MediaType,
  progress: Progress = () => {},
): Promise<SyncResult> {
  const entries: ListEntry[] = [];
  const media: Media[] = [];
  const links = new Map<number, [number, number][]>();
  const custom = new Map<string, Set<number>>();
  const seen = new Set<number>();
  for (let chunkNo = 1; ; chunkNo++) {
    progress(`Reading your ${type.toLowerCase()} list`);
    const data = await client.query<ListCollectionData>(q.USER_LIST, {
      userName: user,
      type,
      chunk: chunkNo,
      perChunk: PER_CHUNK,
    });
    const chunk = parseListChunk(data);
    // A title on a custom list can also arrive in another chunk; keep the first.
    for (const [i, e] of chunk.entries.entries()) {
      if (seen.has(e.mediaId)) continue;
      seen.add(e.mediaId);
      entries.push(e);
      const m = chunk.media[i];
      if (m) media.push(m);
    }
    for (const [id, to] of chunk.recommendations) links.set(id, to);
    for (const [name, ids] of chunk.customLists)
      custom.set(name, new Set([...(custom.get(name) ?? []), ...ids]));
    if (!chunk.hasNext) break;
  }

  await store.putMedia(media);
  await store.putList(user, type, entries);
  await store.putRecommendations(links);
  await store.putCustomLists(user, type, custom);

  const byId = new Map(media.map((m) => [m.id, m]));
  const fetched = await fetchCandidates(client, store, entries, byId, links, progress);
  return { entries: entries.length, candidatesFetched: fetched };
}

/**
 * Sync a list the host already has, such as Seanime's copy of the user's collection (which
 * includes private lists and needs no token). Entries and custom lists are stored as given;
 * list titles that are missing, stale or have no recommendation links yet are fetched with
 * their links, then details of titles recommended from liked ones, as in `syncList`.
 */
export async function syncEntries(
  client: AniListClient,
  store: Store,
  user: string,
  type: MediaType,
  given: ListEntry[],
  customLists: ReadonlyMap<string, Set<number>> = new Map(),
  progress: Progress = () => {},
  maxAgeMs = MEDIA_MAX_AGE_MS,
): Promise<SyncResult> {
  const seen = new Set<number>();
  const entries = given.filter((e) => !seen.has(e.mediaId) && Boolean(seen.add(e.mediaId)));
  await store.putList(user, type, entries);
  await store.putCustomLists(user, type, customLists);

  const ids = entries.map((e) => e.mediaId);
  const linked = new Set((await store.recommendationsFrom(ids)).map(([from]) => from));
  // A title with no recommendations at all is refetched each sync; there are few of those.
  const todo = new Set([
    ...(await store.missingOrStale(ids, maxAgeMs)),
    ...ids.filter((id) => !linked.has(id)),
  ]);
  const order = ids.filter((id) => todo.has(id));
  const what = `Fetching details of your ${type === "ANIME" ? "anime" : "manga"} list`;
  await fetchByIds(
    client,
    q.MEDIA_WITH_RECS_BY_IDS,
    order,
    async (nodes) => {
      await store.putMedia(nodes.map(parseMedia));
      await store.putRecommendations(new Map(nodes.map((n) => [n.id, parseRecommendations(n)])));
    },
    (done, total) => progress(what, done, total),
  );

  const byId = await store.getMedia(ids);
  const links = new Map<number, [number, number][]>();
  for (const [from, to, rating] of await store.recommendationsFrom(ids))
    links.set(from, [...(links.get(from) ?? []), [to, rating]]);
  const fetched = await fetchCandidates(client, store, entries, byId, links, progress);
  return { entries: entries.length, candidatesFetched: fetched };
}

/** Fetch details of titles recommended from liked list titles that aren't cached yet. */
async function fetchCandidates(
  client: AniListClient,
  store: Store,
  entries: ListEntry[],
  byId: ReadonlyMap<number, Media>,
  links: ReadonlyMap<number, [number, number][]>,
  progress: Progress,
): Promise<number> {
  const liked = new Set(
    examples(entries, byId)
      .filter(isLiked)
      .map((ex) => ex.media.id),
  );
  const wanted = new Set<number>();
  for (const [from, to] of links)
    if (liked.has(from)) for (const [id] of to) if (!byId.has(id)) wanted.add(id);
  return fetchMedia(client, store, wanted, MEDIA_MAX_AGE_MS, (done, total) =>
    progress("Fetching recommended titles", done, total),
  );
}

/** Fetch details for IDs missing or older than `maxAgeMs` in the store; returns how many. */
export async function fetchMedia(
  client: AniListClient,
  store: Store,
  ids: Iterable<number>,
  maxAgeMs = MEDIA_MAX_AGE_MS,
  onBatch: (done: number, total: number) => void = () => {},
): Promise<number> {
  const todo = await store.missingOrStale(ids, maxAgeMs);
  await fetchByIds(
    client,
    q.MEDIA_BY_IDS,
    todo,
    async (nodes) => store.putMedia(nodes.map(parseMedia)),
    onBatch,
  );
  return todo.length;
}

/**
 * Fetch titles by ID: pages of 50, up to `PAGES_PER_REQUEST` pages per request, with requests
 * overlapping (the client still starts them no faster than the rate limit). `onReply` stores
 * each request's titles; `onProgress` counts finished requests.
 */
async function fetchByIds(
  client: AniListClient,
  query: string,
  ids: readonly number[],
  onReply: (nodes: MediaNode[]) => Promise<void>,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const requests = chunk(chunk(ids, PAGE_SIZE), PAGES_PER_REQUEST);
  if (!requests.length) return;
  let done = 0;
  onProgress(0, requests.length);
  await Promise.all(
    requests.map(async (pages) => {
      const replies = await client.queryMany<PageData>(
        query,
        pages.map((batch) => ({ ids: batch, page: 1, perPage: PAGE_SIZE })),
      );
      await onReply(replies.flatMap((r) => r.Page.media));
      onProgress(++done, requests.length);
    }),
  );
}

/**
 * Top-scored titles matching AniList search `variables` (see `queries.DISCOVER`), cached.
 * List filters such as `tagIn` and `genreIn` require all their values.
 */
export async function discover(
  client: AniListClient,
  store: Store,
  type: MediaType,
  variables: Record<string, unknown>,
  perPage = PAGE_SIZE,
  pages = 1,
  firstPage = 1,
): Promise<Media[]> {
  const found: Media[] = [];
  for (let page = firstPage; page < firstPage + pages; page++) {
    const [batch = []] = await discoverMany(client, store, type, [{ variables, perPage, page }]);
    found.push(...batch);
    if (batch.length < perPage) break;
  }
  return found;
}

/** One AniList search: its filters (see `queries.DISCOVER`), page size and page. */
export interface Search {
  variables: Record<string, unknown>;
  perPage?: number;
  page?: number;
}

/**
 * Several searches (or pages of one) at once, `PAGES_PER_REQUEST` per request, cached.
 * Returns each search's titles in order.
 */
export async function discoverMany(
  client: AniListClient,
  store: Store,
  type: MediaType,
  searches: readonly Search[],
): Promise<Media[][]> {
  const runs = searches.map((s) => ({
    type,
    page: s.page ?? 1,
    perPage: s.perPage ?? PAGE_SIZE,
    ...Object.fromEntries(Object.entries(s.variables).filter(([, v]) => isSet(v))),
  }));
  const replies = await Promise.all(
    chunk(runs, PAGES_PER_REQUEST).map((group) => client.queryMany<PageData>(q.DISCOVER, group)),
  );
  const found = replies.flat().map((r) => r.Page.media.map(parseMedia));
  await store.putMedia(found.flat());
  return found;
}

function isSet(v: unknown): boolean {
  return Array.isArray(v)
    ? v.length > 0
    : v !== null && v !== undefined && v !== false && v !== 0 && v !== "";
}
