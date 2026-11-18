/**
 * The first-run sync, run by the plugin when Seanime starts, so the user's picks are usually
 * ready before they open the page. If they open it while it runs, the page shows its loader
 * with this job's progress (see `waitForSetup` in src/frame.ts) and opens the store it saves.
 *
 * It runs in Seanime's goja runtime, which isn't a browser: `fetch` and `setTimeout` live on
 * the plugin context, there's no `structuredClone` or `performance`, and responses aren't `Response` objects.
 * `prepareRuntime` and `gojaTransport` bridge that. Anything that goes wrong only ends the
 * job; the page then syncs itself as before.
 */

import { type AniListClient, API_URL, type Progress, type Transport } from "@konomi/engine";
import type { Host } from "@konomi/ui";
import { Session, TYPES } from "@konomi/ui/session";
import { SEANIME_USER, type SetupStatus } from "./protocol.ts";

/** Wait after Seanime starts, so the job doesn't compete with Seanime's own startup. */
export const SETUP_DELAY_MS = 5000;

/** What Seanime's `ctx.fetch` returns (internal/goja/goja_bindings/fetch.go). */
export interface GojaResponse {
  status: number;
  /** One value per header, keyed as Go writes them (`X-Ratelimit-Remaining`). */
  headers?: Record<string, string>;
  text(): string;
}
export type GojaFetch = (
  url: string,
  options: { method: string; headers: Record<string, string>; body: string },
) => Promise<GojaResponse>;

/** An engine transport over Seanime's `ctx.fetch` (graphql.anilist.co is on its allow list). */
export function gojaTransport(fetch: GojaFetch): Transport {
  return async (body) => {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const headers = res.headers ?? {};
    return {
      status: res.status,
      header: (name) => {
        const canonical = name
          .toLowerCase()
          .replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase());
        const direct = headers[canonical];
        if (direct !== undefined && direct !== null) return String(direct);
        const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
        return key === undefined ? null : String(headers[key]);
      },
      // Parsed here rather than with res.json(), which hands back wrapped Go maps and slices.
      json: async () => JSON.parse(res.text()),
    };
  };
}

/** Seanime's timer: cancels through the returned function; the delay must be a whole number. */
type ContextTimer = (fn: () => void, delay: number) => () => void;

/** Give goja the browser globals the engine and `Session` use, where they're missing. */
export function prepareRuntime(
  setTimer: ContextTimer,
  global: Record<string, unknown> = globalThis as never,
) {
  if (typeof global.setTimeout !== "function") {
    global.setTimeout = (fn: () => void, ms?: number) =>
      setTimer(fn, Math.max(0, Math.round(Number(ms) || 0)));
    global.clearTimeout = (cancel: unknown) => {
      if (typeof cancel === "function") cancel();
    };
  }
  // The AniList client's clock; goja has no `performance`. Date.now is fine for spacing requests.
  if (typeof (global.performance as { now?: unknown } | undefined)?.now !== "function")
    global.performance = { now: () => Date.now() };
  if (typeof global.structuredClone !== "function")
    // Only plain data is cloned (settings, exclusions).
    global.structuredClone = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
}

export interface SetupDeps {
  /** Whether a store was ever saved; only a first run is synced in the background. */
  hasStore(): boolean;
  /** Whether Seanime has any list entries to learn from. */
  hasList(): boolean;
  /** The page's `Host`, answered by the plugin itself. */
  host: Host;
  later(fn: () => void, ms: number): void;
  log(message: string): void;
  /** Replaces the client over `host.transport`; for tests. */
  client?: AniListClient;
}

export class BackgroundSetup {
  private state: "off" | "waiting" | "running" = "off";
  private progress: Omit<SetupStatus, "running"> = {};
  /** Settles when a started job ends; for tests. */
  finished: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SetupDeps) {}

  /** Queue the job if this is a first run. */
  schedule(delayMs = SETUP_DELAY_MS): void {
    if (this.deps.hasStore()) return;
    this.state = "waiting";
    this.deps.later(() => {
      this.finished = this.run();
    }, delayMs);
  }

  /**
   * Answer the page. A job still waiting to start is dropped: the page is open, and its own
   * first sync shows the loader as before, without two syncs racing.
   */
  status(): SetupStatus {
    if (this.state === "waiting") this.state = "off";
    return this.state === "running" ? { running: true, ...this.progress } : { running: false };
  }

  private async run(): Promise<void> {
    if (this.state !== "waiting") return;
    try {
      if (!this.deps.hasList()) {
        this.deps.log("background setup skipped: no list from Seanime yet");
        return;
      }
      this.state = "running";
      const report: Progress = (step, done, total) => {
        this.progress = { step, done, total };
      };
      report("Getting ready");
      const session = await Session.open(this.deps.host, SEANIME_USER, this.deps.client);
      await session.sync(report);
      for (const type of TYPES) {
        report("Finding your picks");
        await session.recommend(type, report);
      }
      await session.save(true);
      this.deps.log("background setup done");
    } catch (e) {
      this.deps.log(`background setup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.state = "off";
      this.progress = {};
    }
  }
}
