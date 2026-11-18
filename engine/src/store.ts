/**
 * Storage the engine needs, as an async interface each host implements (IndexedDB in the
 * browser extension, Seanime's plugin storage in the plugin). `MemoryStore` is a reference
 * implementation that can be saved and restored as JSON.
 */

import type { ListEntry, Media, MediaType } from "./models.ts";

/** Exclusions as saved: excluded title roots (sequels are followed at run time), labels and custom lists. */
export interface SavedExclusions {
  titles: number[];
  /** `tag:`, `genre:` and `studio:` keys. */
  labels: string[];
  /** Excluded custom list names, per media type. */
  customLists: Record<MediaType, string[]>;
  /**
   * Titles dismissed as "not interested": the UI hides them like `titles`, and runs train on
   * them as dislikes. Absent in stores saved before it existed.
   */
  notInterested?: number[];
}

/** Everything the engine reads and writes. Usernames are case-insensitive. */
export interface Store {
  getMedia(ids: Iterable<number>): Promise<Map<number, Media>>;
  putMedia(items: Media[]): Promise<void>;
  /** IDs not cached, or cached longer than `maxAgeMs` ago. */
  missingOrStale(ids: Iterable<number>, maxAgeMs: number): Promise<number[]>;

  getList(user: string, type: MediaType): Promise<ListEntry[]>;
  /** Replace a user's list for one type and record the sync time. */
  putList(user: string, type: MediaType, entries: ListEntry[]): Promise<void>;
  /** When the list was last synced (ms since the epoch), or `null`. */
  lastSynced(user: string, type: MediaType): Promise<number | null>;

  /** Replace the outgoing recommendation links (`[toId, rating]`) of each given title. */
  putRecommendations(links: ReadonlyMap<number, [number, number][]>): Promise<void>;
  /** `[fromId, toId, rating]` links leaving the given titles. */
  recommendationsFrom(ids: Iterable<number>): Promise<[number, number, number][]>;

  getCustomLists(user: string, type: MediaType): Promise<Map<string, Set<number>>>;
  putCustomLists(
    user: string,
    type: MediaType,
    lists: ReadonlyMap<string, Set<number>>,
  ): Promise<void>;

  getExclusions(user: string): Promise<SavedExclusions>;
  putExclusions(user: string, exclusions: SavedExclusions): Promise<void>;

  /** A setting or cached value. */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

/** No exclusions. */
export function emptyExclusions(): SavedExclusions {
  return { titles: [], labels: [], customLists: { ANIME: [], MANGA: [] }, notInterested: [] };
}

/** `MemoryStore` contents as plain JSON. */
export interface MemoryStoreData {
  media: [number, { media: Media; fetchedAt: number }][];
  lists: [string, { entries: ListEntry[]; syncedAt: number }][];
  links: [number, [number, number][]][];
  customLists: [string, [string, number[]][]][];
  exclusions: [string, SavedExclusions][];
  meta: [string, string][];
}

/** An in-memory `Store`; `toJSON` and `fromJSON` save and restore it. */
export class MemoryStore implements Store {
  private media = new Map<number, { media: Media; fetchedAt: number }>();
  private lists = new Map<string, { entries: ListEntry[]; syncedAt: number }>();
  private links = new Map<number, [number, number][]>();
  private customLists = new Map<string, Map<string, Set<number>>>();
  private exclusions = new Map<string, SavedExclusions>();
  private meta = new Map<string, string>();
  private readonly now: () => number;

  /** `now` is the clock in ms since the epoch; replaceable in tests. */
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async getMedia(ids: Iterable<number>): Promise<Map<number, Media>> {
    const out = new Map<number, Media>();
    for (const id of ids) {
      const hit = this.media.get(id);
      if (hit) out.set(id, hit.media);
    }
    return out;
  }

  async putMedia(items: Media[]): Promise<void> {
    const at = this.now();
    for (const m of items) this.media.set(m.id, { media: m, fetchedAt: at });
  }

  async missingOrStale(ids: Iterable<number>, maxAgeMs: number): Promise<number[]> {
    const cutoff = this.now() - maxAgeMs;
    return [...new Set(ids)]
      .filter((id) => (this.media.get(id)?.fetchedAt ?? -Infinity) < cutoff)
      .sort((a, b) => a - b);
  }

  async getList(user: string, type: MediaType): Promise<ListEntry[]> {
    return [...(this.lists.get(listKey(user, type))?.entries ?? [])];
  }

  async putList(user: string, type: MediaType, entries: ListEntry[]): Promise<void> {
    this.lists.set(listKey(user, type), { entries: [...entries], syncedAt: this.now() });
  }

  async lastSynced(user: string, type: MediaType): Promise<number | null> {
    return this.lists.get(listKey(user, type))?.syncedAt ?? null;
  }

  async putRecommendations(links: ReadonlyMap<number, [number, number][]>): Promise<void> {
    for (const [from, to] of links) this.links.set(from, [...to]);
  }

  async recommendationsFrom(ids: Iterable<number>): Promise<[number, number, number][]> {
    return [...new Set(ids)].flatMap((from) =>
      (this.links.get(from) ?? []).map(([to, r]): [number, number, number] => [from, to, r]),
    );
  }

  async getCustomLists(user: string, type: MediaType): Promise<Map<string, Set<number>>> {
    const saved = this.customLists.get(listKey(user, type)) ?? new Map();
    return new Map([...saved].map(([name, ids]) => [name, new Set(ids)]));
  }

  async putCustomLists(
    user: string,
    type: MediaType,
    lists: ReadonlyMap<string, Set<number>>,
  ): Promise<void> {
    this.customLists.set(
      listKey(user, type),
      new Map([...lists].map(([name, ids]) => [name, new Set(ids)])),
    );
  }

  async getExclusions(user: string): Promise<SavedExclusions> {
    return structuredClone(this.exclusions.get(user.toLowerCase()) ?? emptyExclusions());
  }

  async putExclusions(user: string, exclusions: SavedExclusions): Promise<void> {
    this.exclusions.set(user.toLowerCase(), structuredClone(exclusions));
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  /** Everything as plain JSON, for saving. */
  toJSON(): MemoryStoreData {
    return {
      media: [...this.media],
      lists: [...this.lists],
      links: [...this.links],
      customLists: [...this.customLists].map(([k, lists]) => [
        k,
        [...lists].map(([n, ids]) => [n, [...ids]]),
      ]),
      exclusions: [...this.exclusions],
      meta: [...this.meta],
    };
  }

  /** Restore a store saved with `toJSON`. */
  static fromJSON(data: MemoryStoreData, now: () => number = Date.now): MemoryStore {
    const s = new MemoryStore(now);
    s.media = new Map(data.media);
    s.lists = new Map(data.lists);
    s.links = new Map(data.links);
    s.customLists = new Map(
      data.customLists.map(([k, lists]) => [
        k,
        new Map(lists.map(([n, ids]) => [n, new Set(ids)])),
      ]),
    );
    s.exclusions = new Map(data.exclusions);
    s.meta = new Map(data.meta);
    return s;
  }
}

function listKey(user: string, type: MediaType): string {
  return `${user.toLowerCase()}:${type}`;
}
