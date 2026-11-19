/**
 * What the shared UI needs from wherever it runs: the Seanime plugin, the browser extension,
 * or the dev page. Everything passes as plain objects, so a host can relay it over a message
 * channel.
 */

import type { ListEntry, Media, MediaType, Trailer, Transport } from "@konomi/engine";
import type { Session } from "./session.ts";

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
   * Signs in to AniList (the browser extension opens AniList's approval page). Resolves once
   * signed in. It may stay pending when the host can't see AniList's answer; the welcome screen
   * then takes the code AniList shows (`signInWithCode`).
   */
  signIn?(): Promise<HostUser>;
  /** Finishes signing in with the code AniList shows, pasted by the user. */
  signInWithCode?(code: string): Promise<HostUser>;
  /** Forgets the sign-in, so the welcome screen shows again. */
  signOut?(): Promise<void>;
  /**
   * Lets other parts of the host (the extension's popup and AniList badge) act on the open
   * page's session, so the page stays the only writer of the store while it's open. The host
   * calls `refresh` after a change, and the page redraws from the session. Returns a function
   * that stops serving.
   */
  serve?(session: Session, refresh: () => void): () => void;
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
  /** Opens a title's trailer in the browser; without it the page opens the link itself. */
  openTrailer?(media: Media, trailer: Trailer): Promise<void>;
  /**
   * Whether the page may play trailers in an embedded player. Seanime's sandboxed frame can't
   * (YouTube's frames stay black there), so it links out instead.
   */
  readonly embedsTrailers?: boolean;
}
