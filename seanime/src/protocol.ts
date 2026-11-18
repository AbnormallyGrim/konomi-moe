/**
 * Messages between the page (the shared UI in Seanime's sandboxed frame) and the plugin
 * (Seanime's goja runtime). Seanime's channel only carries events, so each request has an ID
 * and the plugin answers with a reply event carrying the same ID.
 */

import type { ListEntry, ListStatus, MediaType } from "@konomi/engine";
import type { HostList } from "@konomi/ui";

export const REQUEST = "rpc";
export const REPLY = "rpc-reply";

/** Everything the page can ask the plugin, with its arguments and result. */
export interface Methods {
  list: { args: [type: MediaType]; result: HostList };
  loadStore: { args: []; result: string | null };
  saveStore: { args: [json: string]; result: null };
  addToPlanning: { args: [id: number, type: MediaType]; result: null };
  openTitle: { args: [id: number, type: MediaType]; result: null };
  openOnSite: { args: [url: string, title: string]; result: null };
  setupStatus: { args: []; result: SetupStatus };
}

/** The store's user key in Seanime: one store per install, so the name is never shown. */
export const SEANIME_USER = "seanime";

/** The plugin's first-run sync, which starts when Seanime does (see src/background.ts). */
export interface SetupStatus {
  running: boolean;
  step?: string | undefined;
  done?: number | undefined;
  total?: number | undefined;
}
export type Method = keyof Methods;

export interface Request<M extends Method = Method> {
  id: number;
  method: M;
  args: Methods[M]["args"];
}

export type Reply =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

/**
 * The parts of Seanime's collection objects that are read. Seanime hands plugins Go structs
 * whose fields are mostly pointers (`*MediaListStatus`, `*float64`, `*bool`, `*string`); in
 * goja those arrive as wrapped objects, not primitives, so every value is coerced.
 */
export interface Collection {
  MediaListCollection?: {
    lists?: {
      name?: unknown;
      isCustomList?: unknown;
      entries?: {
        status?: unknown;
        score?: unknown;
        progress?: unknown;
        repeat?: unknown;
        updatedAt?: unknown;
        media?: { id: unknown } | null;
      }[];
    }[];
  };
}

const STATUSES = new Set(["CURRENT", "PLANNING", "COMPLETED", "DROPPED", "PAUSED", "REPEATING"]);

/** A string from a primitive or a wrapped Go value; `null` when absent. */
export function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** A number from a primitive or a wrapped Go value; `0` when absent or not a number. */
export function num(v: unknown): number {
  const n = v === null || v === undefined ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** True only for `true` or a wrapped Go `true`. */
export function bool(v: unknown): boolean {
  return v !== null && v !== undefined && String(v) === "true";
}

/** How many entries the raw collection holds, before any are dropped. */
export function rawEntryCount(collection: Collection | null | undefined): number {
  let n = 0;
  for (const list of collection?.MediaListCollection?.lists ?? []) n += list.entries?.length ?? 0;
  return n;
}

/** A short description of a value's shape, for error messages about unexpected data. */
export function describe(v: unknown): string {
  return `${typeof v} ${Object.prototype.toString.call(v)} "${String(v)}"`;
}

/**
 * Seanime's raw collection as entries and custom lists. A title on a custom list also appears
 * in its status list; the engine keeps the first copy of each title.
 */
export function toHostList(collection: Collection | null | undefined): HostList {
  const entries: ListEntry[] = [];
  const customLists: Record<string, number[]> = {};
  for (const list of collection?.MediaListCollection?.lists ?? []) {
    const custom = bool(list.isCustomList);
    const name = str(list.name);
    for (const e of list.entries ?? []) {
      const status = str(e.status);
      const id = num(e.media?.id);
      if (!id || !status || !STATUSES.has(status)) continue;
      entries.push({
        mediaId: id,
        status: status as ListStatus,
        score: num(e.score),
        progress: num(e.progress),
        repeat: num(e.repeat),
        updatedAt: num(e.updatedAt),
      });
      if (custom && name) customLists[name] = [...(customLists[name] ?? []), id];
    }
  }
  return { entries, customLists };
}
