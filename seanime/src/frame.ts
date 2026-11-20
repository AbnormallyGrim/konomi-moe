/** The page side: a `Host` that asks the plugin over Seanime's bridge (`window.webview`). */

import { fetchTransport, type Media, type Trailer } from "@konomi/engine";
import type { Host } from "@konomi/ui";
import { type Method, type Methods, REPLY, REQUEST, type Reply, SEANIME_USER } from "./protocol.ts";

/** What Seanime injects into the frame as `window.webview`. */
export interface Bridge {
  send(event: string, payload: unknown): void;
  on(event: string, callback: (payload: unknown) => void): () => void;
}

/** Where the crowd table is published, next to the manifest (set by scripts/build.ts). */
declare const __CROWD_URL__: string | undefined;

/** How long to wait for the plugin before giving up on a request. */
export const TIMEOUT_MS = 60_000;
/** How often the page asks how the plugin's first-run sync is getting on. */
export const SETUP_POLL_MS = 1000;

/** Calls plugin methods and resolves with their replies. */
export function rpc(bridge: Bridge, timeoutMs = TIMEOUT_MS) {
  let next = 1;
  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  bridge.on(REPLY, (payload) => {
    const reply = payload as Reply;
    const waiting = pending.get(reply?.id);
    if (!waiting) return;
    pending.delete(reply.id);
    clearTimeout(waiting.timer);
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(reply.error));
  });
  return function call<M extends Method>(
    method: M,
    ...args: Methods[M]["args"]
  ): Promise<Methods[M]["result"]> {
    const id = next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Seanime didn't answer (${method})`));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      bridge.send(REQUEST, { id, method, args });
    });
  };
}

/**
 * The Seanime host. AniList's public API is called straight from the frame (AniList allows
 * any origin); the list, storage, add-to-planning and navigation go through the plugin.
 */
export function seanimeHost(bridge: Bridge, timeoutMs = TIMEOUT_MS, pollMs = SETUP_POLL_MS): Host {
  const call = rpc(bridge, timeoutMs);
  return {
    kind: "seanime",
    transport: fetchTransport({}),
    // The store is per Seanime install; the name is only its key, never shown.
    user: async () => ({ name: SEANIME_USER }),
    // The plugin may already be syncing in the background (first run); wait it out, so the
    // page opens the store it saves instead of starting a second sync.
    waitForSetup: async (progress) => {
      for (;;) {
        const status = await call("setupStatus");
        if (!status.running) return;
        progress(status.step ?? "Setting up", status.done, status.total);
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    },
    list: (type) => call("list", type),
    loadStore: () => call("loadStore"),
    saveStore: async (json) => {
      await call("saveStore", json);
    },
    addToPlanning: async (media: Media) => {
      await call("addToPlanning", media.id, media.type);
    },
    openTitle: (media: Media) => {
      void call("openTitle", media.id, media.type);
    },
    openOnSite: async (media: Media) => {
      const url = media.siteUrl ?? `https://anilist.co/${media.type.toLowerCase()}/${media.id}`;
      await call("openOnSite", url, media.titles?.english ?? media.title);
    },
    openTrailer: async (media: Media, trailer: Trailer) => {
      await call("openTrailer", trailer.url, media.titles?.english ?? media.title);
    },
    // Fetched straight from the frame, like AniList (raw.githubusercontent.com allows any
    // origin); the browser's cache keeps it between visits.
    ...(typeof __CROWD_URL__ === "string" ? { crowdTable: () => fetchTable(__CROWD_URL__) } : {}),
  };
}

async function fetchTable(url: string): Promise<ArrayBuffer> {
  const reply = await fetch(url);
  if (!reply.ok) throw new Error(`the table didn't download (${reply.status})`);
  return reply.arrayBuffer();
}
