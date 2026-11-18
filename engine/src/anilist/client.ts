/** AniList GraphQL client: spaces requests out and retries on 429, 5xx and network errors. */

import { batchQuery, batchVariables } from "./batch.ts";

/** AniList's GraphQL endpoint. */
export const API_URL = "https://graphql.anilist.co";

/** AniList returned an error or couldn't be reached. */
export class AniListError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AniListError";
    this.status = status;
  }
}

/** What a transport returns for one GraphQL request. */
export interface TransportResponse {
  status: number;
  /** Looks up a response header, case-insensitively; `null` if absent. */
  header(name: string): string | null;
  /** The parsed JSON body. */
  json(): Promise<unknown>;
}

/**
 * Sends one GraphQL request body and returns the raw response. The browser extension uses
 * `fetchTransport`; the Seanime plugin will relay through Seanime's own AniList client.
 */
export type Transport = (body: {
  query: string;
  variables: Record<string, unknown>;
}) => Promise<TransportResponse>;

/** A transport over `fetch`, with an optional bearer token. */
export function fetchTransport(
  options: { token?: string; fetch?: typeof fetch; url?: string } = {},
): Transport {
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  return async (body) => {
    const res = await doFetch(options.url ?? API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, header: (n) => res.headers.get(n), json: () => res.json() };
  };
}

/** Options for `AniListClient`. */
export interface ClientOptions {
  /** Maximum requests per minute (default 30). */
  requestsPerMinute?: number;
  /** Retries after a 429, a 5xx or a network error (default 5). */
  maxRetries?: number;
  /** Waits; replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Monotonic clock in ms; replaceable in tests. */
  now?: () => number;
  /** Wall-clock seconds since the epoch, for `X-RateLimit-Reset`; replaceable in tests. */
  epochSeconds?: () => number;
}

/** Runs GraphQL queries through a transport, respecting AniList's rate limits. */
export class AniListClient {
  private readonly transport: Transport;
  private readonly interval: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly epochSeconds: () => number;
  private nextAllowed = 0;
  /** No request starts before this (after a 429, a 5xx, or no requests left). */
  private blockedUntil = 0;

  constructor(transport: Transport, options: ClientOptions = {}) {
    this.transport = transport;
    this.interval = 60_000 / (options.requestsPerMinute ?? 30);
    this.maxRetries = options.maxRetries ?? 5;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => performance.now());
    this.epochSeconds = options.epochSeconds ?? (() => Date.now() / 1000);
  }

  /** Runs a query and returns its `data`. GraphQL errors are thrown without retrying. */
  async query<T = Record<string, unknown>>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const last = attempt === this.maxRetries;
      await this.waitTurn();
      let res: TransportResponse;
      try {
        res = await this.transport({ query, variables });
      } catch (e) {
        if (last) throw new AniListError(`could not reach AniList: ${String(e)}`);
        this.backOff(2 ** attempt * 1000);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        if (last) throw new AniListError(`AniList returned ${res.status}`, res.status);
        this.backOff(retryAfterMs(res) ?? 2 ** attempt * 1000);
        continue;
      }

      this.respectRemaining(res);
      const body = (await res.json()) as { data?: T; errors?: { message?: string }[] };
      if (body.errors?.length) {
        const message = body.errors.map((e) => e.message ?? "unknown error").join("; ");
        throw new AniListError(message, res.status);
      }
      if (res.status !== 200 || body.data === undefined) {
        throw new AniListError(`AniList returned ${res.status}`, res.status);
      }
      return body.data;
    }
  }

  /**
   * Runs `query` once per entry of `runs` in a single request (GraphQL aliases), returning
   * each run's `data` in order. One run is sent as the plain query.
   */
  async queryMany<T = Record<string, unknown>>(
    query: string,
    runs: Record<string, unknown>[],
  ): Promise<T[]> {
    if (runs.length === 0) return [];
    if (runs.length === 1) return [await this.query<T>(query, runs[0])];
    const data = await this.query<Record<string, T[keyof T]>>(
      batchQuery(query, runs.length),
      batchVariables(runs),
    );
    // Each run's single root field comes back under its alias, q<i>.
    const root = rootField(query);
    return runs.map((_, i) => ({ [root]: data[`q${i}`] }) as T);
  }

  /**
   * Waits for this request's slot. The slot is taken before waiting, so requests sent at the
   * same time still start `interval` apart, and the next request can go out while this one is
   * still being answered.
   */
  private async waitTurn(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextAllowed, this.blockedUntil);
    this.nextAllowed = slot + this.interval;
    if (slot > now) await this.sleep(slot - now);
    // A back-off that started while this request waited still applies.
    for (let t = this.now(); t < this.blockedUntil; t = this.now())
      await this.sleep(this.blockedUntil - t);
  }

  private backOff(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
    this.nextAllowed = Math.max(this.nextAllowed, this.blockedUntil);
  }

  private respectRemaining(res: TransportResponse): void {
    const remaining = res.header("X-RateLimit-Remaining");
    const reset = Number(res.header("X-RateLimit-Reset"));
    if (remaining === "0" && Number.isFinite(reset) && reset > 0) {
      this.backOff(Math.max(0, reset - this.epochSeconds()) * 1000);
    }
  }
}

/** The name of a query's first root field (`Page`, `Media`…). */
function rootField(query: string): string {
  const body = query.indexOf("{", query.indexOf(")"));
  const m = /^\s*(\w+)/.exec(query.slice(body + 1));
  if (!m?.[1]) throw new Error("query has no root field");
  return m[1];
}

function retryAfterMs(res: TransportResponse): number | null {
  const value = Number(res.header("Retry-After"));
  return res.header("Retry-After") !== null && Number.isFinite(value) ? value * 1000 : null;
}
