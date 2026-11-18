/** Titles, tags and custom lists the user never wants recommended. Mirrors exclusions.py. */

import { exclusionLabels, type Media, prequelIds, sequelIds } from "./models.ts";

/** Longest prequel or sequel chain followed. */
export const MAX_CHAIN = 30;

/** Looks titles up in the cache; missing IDs are left out. */
export type MediaLookup = (ids: Iterable<number>) => ReadonlyMap<number, Media>;

/** What to keep out of recommendations for one run. */
export interface Exclusions {
  /** Excluded titles with their sequels already followed. */
  mediaIds: Set<number>;
  /** `tag:`, `genre:`, `studio:`, `country:` and `format:` keys. */
  labels: Set<string>;
}

/** Excluded tag names, sorted, for AniList's `tag_not_in`. */
export function excludedTags(e: Exclusions): string[] {
  return byPrefix(e, "tag:");
}

/** Excluded genre names, sorted, for AniList's `genre_not_in`. */
export function excludedGenres(e: Exclusions): string[] {
  return byPrefix(e, "genre:");
}

function byPrefix(e: Exclusions, prefix: string): string[] {
  return [...e.labels]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort();
}

/** Whether a title is excluded: itself, by a label, or as a sequel of an excluded title. */
export function blocks(e: Exclusions, media: Media, lookup: MediaLookup): boolean {
  if (e.mediaIds.has(media.id)) return true;
  for (const label of exclusionLabels(media)) if (e.labels.has(label)) return true;
  for (const id of prequelChain(media, lookup)) if (e.mediaIds.has(id)) return true;
  return false;
}

/** Every cached same-type prequel of a title, followed link by link. */
export function prequelChain(media: Media, lookup: MediaLookup): Set<number> {
  const seen = new Set<number>();
  let frontier = new Set(prequelIds(media));
  for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
    for (const id of frontier) seen.add(id);
    const next = new Set<number>();
    for (const m of lookup(frontier).values())
      for (const p of prequelIds(m)) if (!seen.has(p)) next.add(p);
    frontier = next;
  }
  return seen;
}

/**
 * `start` plus all same-type sequels, followed link by link. `fetchMissing` (optional) loads
 * uncached titles into the cache before each step, so newly announced seasons are found.
 */
export async function sequelClosure(
  start: Iterable<number>,
  lookup: MediaLookup,
  fetchMissing?: (ids: Set<number>) => Promise<void>,
): Promise<Set<number>> {
  const seen = new Set(start);
  let frontier = new Set(seen);
  for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
    if (fetchMissing) await fetchMissing(frontier);
    const next = new Set<number>();
    for (const m of lookup(frontier).values())
      for (const s of sequelIds(m)) if (!seen.has(s)) next.add(s);
    for (const id of next) seen.add(id);
    frontier = next;
  }
  return seen;
}
