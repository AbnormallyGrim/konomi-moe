/**
 * What the shared UI needs from wherever it runs: the Seanime plugin, the browser extension,
 * or the dev page. Everything passes as plain objects, so a host can relay it over a message
 * channel.
 */

import type { ListEntry, Media, MediaType, Transport } from "@konomi/engine";

/** The signed-in user. */
export interface HostUser {
  name: string;
  avatarUrl?: string | null;
}

/** A user's list as the host has it, with custom list names mapped to title IDs. */
export interface HostList {
  entries: ListEntry[];
  customLists: Record<string, number[]>;
}

export interface Host {
  readonly kind: "dev" | "seanime" | "extension";
  /** Sends AniList's public queries (titles, searches, tags). */
  readonly transport: Transport;
  /** The signed-in user, or `null` when there's none yet (the dev page asks for a username). */
  user(): Promise<HostUser | null>;
  /** Remembers a username typed on the welcome screen (hosts without a sign-in). */
  setUser?(name: string): Promise<void>;
  /**
   * The user's list for one type, when the host has it (Seanime does, private lists included).
   * Without this, lists are read from AniList by username, which needs a public list.
   */
  list?(type: MediaType): Promise<HostList>;
  /**
   * Resolves once the host's own background sync (if any) is done, reporting its progress
   * meanwhile. The Seanime plugin runs the first sync when Seanime starts, before the page opens.
   */
  waitForSetup?(progress: (step: string, done?: number, total?: number) => void): Promise<void>;
  /** The saved engine store as JSON, or `null` on first run. */
  loadStore(): Promise<string | null>;
  saveStore(json: string): Promise<void>;
  /** Puts a title on the user's planning list; absent when the host can't change the list. */
  addToPlanning?(media: Media): Promise<void>;
  /** Shows a title: Seanime's own page in the plugin, AniList elsewhere. */
  openTitle(media: Media): void;
  /**
   * Opens a title on its list site (AniList) in the browser. Without it the page opens the link
   * itself; Seanime's sandboxed frame can't, so the plugin shows a Seanime dialog with the link.
   */
  openOnSite?(media: Media): Promise<void>;
}
