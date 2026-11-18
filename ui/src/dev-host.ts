/**
 * A host for running the UI in a normal browser tab during development: AniList's public API,
 * lists read by username (so they must be public), and the store in IndexedDB. It can't change
 * the user's list, so there's no add-to-planning.
 */

import { fetchTransport, type Media } from "@konomi/engine";
import type { Host, HostUser } from "./host.ts";

const DB = "app-dev";
const STORE = "kv";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kv<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export function devHost(): Host {
  const fromUrl = new URLSearchParams(location.search).get("user");
  return {
    kind: "dev",
    transport: fetchTransport({}),
    async user(): Promise<HostUser | null> {
      const name = fromUrl ?? (await kv<string | undefined>("readonly", (s) => s.get("user")));
      return name ? { name } : null;
    },
    async setUser(name) {
      await kv("readwrite", (s) => s.put(name, "user"));
    },
    async loadStore() {
      return (await kv<string | undefined>("readonly", (s) => s.get("store"))) ?? null;
    },
    async saveStore(json) {
      await kv("readwrite", (s) => s.put(json, "store"));
    },
    openTitle(media: Media) {
      if (media.siteUrl) window.open(media.siteUrl, "_blank", "noopener");
    },
  };
}
