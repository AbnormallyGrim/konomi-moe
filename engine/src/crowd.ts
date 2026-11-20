/**
 * Picks learned from other people's lists ("the crowd"), for anime. Mirrors the lab's crowd.py.
 *
 * The table (`engine/assets/crowd.bin`) holds two title-to-title tables trained on 1.18M people's
 * public anime lists, and nothing about any of them:
 * - liked: "people who liked this title also liked…". A user's liked titles' rows are summed,
 *   and each series start takes the best score in its chain (a predicted season 2 counts for
 *   season 1). The best series starts are the crowd's picks.
 * - signed: the same, with disliked titles counting against. It nudges the final order.
 *
 * Titles first aired from the table's fresh year on are newer than the lists it learned from, so
 * they're left to the preference model (`rank` keeps places for them).
 */

import type { ListEntry } from "./models.ts";

export const CROWD_VERSION = 1;
/** Liked titles the table must know before its picks are trusted. */
export const MIN_LIKED = 3;
/** Crowd picks offered to ranking at least (filters may drop some). */
export const CROWD_CANDIDATES = 60;
/** The list is built page by page: 15 crowd picks and 5 new releases each. */
export const PAGE = 20;

/**
 * Crowd picks to offer for a list of `limit` titles: three quarters of it, plus room for titles
 * filters or the series rules drop.
 */
export function candidatesFor(limit: number): number {
  return Math.max(CROWD_CANDIDATES, Math.ceil((limit * 3) / 4) + 20);
}
/** × the standardised signed score, added to the preference score. */
export const ORDER_WEIGHT = 0.5;

interface Links {
  scales: Float32Array;
  neighbours: Uint16Array;
  weights: Int16Array;
}

/** The decoded table; positions index `ids`. */
export interface CrowdTable {
  ids: Int32Array;
  /** Series start's AniList ID per title, −1 when it has none to show. */
  roots: Int32Array;
  /** First aired (0: unknown). */
  years: Uint16Array;
  flags: Uint8Array;
  freshYear: number;
  k: number;
  liked: Links;
  signed: Links;
  position: Map<number, number>;
}

/** Decode the table file (layout: the private lab's `bench/export.py`). */
export function parseCrowd(buffer: ArrayBuffer): CrowdTable {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== "KCRW") throw new Error("not a crowd table");
  const version = view.getUint32(4, true);
  if (version !== CROWD_VERSION)
    throw new Error(`crowd table version ${version}, expected ${CROWD_VERSION}`);
  const n = view.getUint32(8, true);
  const k = view.getUint32(12, true);
  const freshYear = view.getUint32(16, true);
  let offset = 32;
  const take = <T>(make: (o: number) => T, bytes: number): T => {
    const arr = make(offset);
    offset += bytes;
    offset += (4 - (offset % 4)) % 4;
    return arr;
  };
  const ids = take((o) => new Int32Array(buffer, o, n), 4 * n);
  const roots = take((o) => new Int32Array(buffer, o, n), 4 * n);
  const years = take((o) => new Uint16Array(buffer, o, n), 2 * n);
  const flags = take((o) => new Uint8Array(buffer, o, n), n);
  const links = (): Links => ({
    scales: take((o) => new Float32Array(buffer, o, n), 4 * n),
    neighbours: take((o) => new Uint16Array(buffer, o, n * k), 2 * n * k),
    weights: take((o) => new Int16Array(buffer, o, n * k), 2 * n * k),
  });
  const liked = links();
  const signed = links();
  const position = new Map<number, number>();
  ids.forEach((id, p) => {
    position.set(id, p);
  });
  return { ids, roots, years, flags, freshYear, k, liked, signed, position };
}

/** Adds `sign` × title p's links into `into`, slot by slot (the lab adds in the same order). */
function addRow(into: Float64Array, links: Links, p: number, k: number, sign: number): void {
  const scale = links.scales[p] ?? 0;
  for (let s = p * k; s < (p + 1) * k; s++) {
    const w = ((links.weights[s] ?? 0) * scale) / 32767;
    const j = links.neighbours[s] ?? 0;
    into[j] = (into[j] ?? 0) + sign * w;
  }
}

/**
 * The scored titles at or above the user's average score (liked), and those at least one
 * standard deviation, and a point out of 10, below it (disliked): how the table learned what
 * people liked.
 */
export function likedAndDisliked(entries: readonly ListEntry[]): {
  liked: number[];
  disliked: number[];
} {
  const scored = entries.filter((e) => e.score > 0).map((e) => [e.mediaId, e.score / 10] as const);
  if (!scored.length) return { liked: [], disliked: [] };
  let total = 0;
  for (const [, s] of scored) total += s;
  const mean = total / scored.length;
  let squares = 0;
  for (const [, s] of scored) squares += (s - mean) ** 2;
  const spread = (squares / scored.length) ** 0.5;
  return {
    liked: scored.filter(([, s]) => s >= mean).map(([id]) => id),
    disliked: scored.filter(([, s]) => s <= mean - Math.max(1, spread)).map(([id]) => id),
  };
}

/** One user's crowd picks: series starts, best first, and the ordering nudge. */
export interface CrowdPicks {
  /** `[series start's ID, its best score, best title's ID]`, best first. */
  picks: [number, number, number][];
  /** AniList ID → standardised signed score, for titles the table knows. */
  order: Map<number, number>;
  freshYear: number;
  /** Series start's ID → the liked title that pulled it up most. */
  because: Map<number, number>;
}

/**
 * The crowd's view of a user's list, or `null` when the table knows too few of their liked
 * titles to be trusted (then ranking works as before).
 */
export function crowdPicks(
  table: CrowdTable,
  entries: readonly ListEntry[],
  count = CROWD_CANDIDATES,
): CrowdPicks | null {
  const { liked, disliked } = likedAndDisliked(entries);
  const positions = (ids: number[]) =>
    ids
      .map((id) => table.position.get(id))
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
  const likedPos = positions(liked).filter((p) => ((table.flags[p] ?? 0) & 1) !== 0);
  if (likedPos.length < MIN_LIKED) return null;
  const dislikedPos = positions(disliked);

  const n = table.ids.length;
  const score = new Float64Array(n);
  for (const p of likedPos) addRow(score, table.liked, p, table.k, 1);
  const signed = new Float64Array(n);
  for (const p of likedPos) addRow(signed, table.signed, p, table.k, 1);
  for (const p of dislikedPos) addRow(signed, table.signed, p, table.k, -1);

  const known: number[] = [];
  for (let p = 0; p < n; p++) if (((table.flags[p] ?? 0) & 2) !== 0) known.push(p);
  let total = 0;
  for (const p of known) total += signed[p] ?? 0;
  const mean = known.length ? total / known.length : 0;
  let squares = 0;
  for (const p of known) squares += ((signed[p] ?? 0) - mean) ** 2;
  const sd = (known.length ? (squares / known.length) ** 0.5 : 0) || 1;
  const order = new Map<number, number>();
  for (const p of known) order.set(table.ids[p] ?? 0, ((signed[p] ?? 0) - mean) / sd);

  // Each series start takes the best score in its chain; new releases are left out.
  const best = new Map<number, [number, number]>();
  for (let p = 0; p < n; p++) {
    const root = table.roots[p] ?? -1;
    if (((table.flags[p] ?? 0) & 1) === 0 || root < 0 || (table.years[p] ?? 0) >= table.freshYear)
      continue;
    const s = score[p] ?? 0;
    const held = best.get(root);
    if (!held || s > held[0]) best.set(root, [s, table.ids[p] ?? 0]);
  }
  const onList = new Set(entries.map((e) => e.mediaId));
  const picks = [...best.entries()]
    .sort((a, b) => b[1][0] - a[1][0] || a[0] - b[0])
    .filter(([root]) => !onList.has(root))
    .slice(0, count)
    .map(([root, [s, title]]): [number, number, number] => [root, s, title]);

  const because = new Map<number, number>();
  for (const [root, , title] of picks) {
    const target = table.position.get(title) ?? -1;
    let top: number | null = null;
    let strongest = 0;
    for (const p of likedPos) {
      const scale = table.liked.scales[p] ?? 0;
      let hit: number | null = null;
      for (let s = p * table.k; s < (p + 1) * table.k; s++) {
        if (table.liked.neighbours[s] !== target) continue;
        const w = ((table.liked.weights[s] ?? 0) * scale) / 32767;
        hit = hit === null ? w : Math.max(hit, w);
      }
      if (hit !== null && hit > strongest) {
        top = table.ids[p] ?? null;
        strongest = hit;
      }
    }
    if (top !== null) because.set(root, top);
  }
  return { picks, order, freshYear: table.freshYear, because };
}
