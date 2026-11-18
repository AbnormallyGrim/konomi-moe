import { describe, expect, it } from "vitest";
import {
  AniListClient,
  AniListError,
  batchQuery,
  fetchTransport,
  queries,
  type Transport,
} from "../src/index.ts";

/** A fake clock whose sleeps just advance time, recording each wait. */
function fakeTime() {
  const t = { now: 0, slept: [] as number[] };
  return {
    t,
    now: () => t.now,
    sleep: async (ms: number) => {
      t.slept.push(ms);
      t.now += ms;
    },
    epochSeconds: () => 1_000_000 + t.now / 1000,
  };
}

/** A transport answering from a queue of `[status, body, headers]` responses. */
function queued(responses: [number, unknown, Record<string, string>?][]) {
  const calls: unknown[] = [];
  const transport: Transport = async (body) => {
    calls.push(body);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    const [status, json, headers = {}] = next;
    if (status === 0) throw new TypeError("network down");
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { status, header: (n) => lower[n.toLowerCase()] ?? null, json: async () => json };
  };
  return { transport, calls };
}

const ok = (data: unknown): [number, unknown] => [200, { data }];

function client(transport: Transport, time: ReturnType<typeof fakeTime>, rpm = 60, maxRetries = 5) {
  return new AniListClient(transport, {
    requestsPerMinute: rpm,
    maxRetries,
    sleep: time.sleep,
    now: time.now,
    epochSeconds: time.epochSeconds,
  });
}

describe("AniListClient", () => {
  it("spaces requests by the rate limit", async () => {
    const time = fakeTime();
    const { transport } = queued([ok({}), ok({}), ok({})]);
    const c = client(transport, time, 30);
    for (let i = 0; i < 3; i++) await c.query("{ x }");
    expect(time.t.slept).toEqual([2000, 2000]);
  });

  it("retries a 429 after Retry-After", async () => {
    const time = fakeTime();
    const { transport, calls } = queued([[429, {}, { "Retry-After": "7" }], ok({ a: 1 })]);
    expect(await client(transport, time).query("{ a }")).toEqual({ a: 1 });
    expect(calls).toHaveLength(2);
    expect(time.t.slept).toEqual([7000]);
  });

  it("retries server and network errors, then gives up", async () => {
    const time = fakeTime();
    const { transport, calls } = queued([
      [502, {}],
      [0, null],
      [502, {}],
    ]);
    const error = await client(transport, time, 60, 2)
      .query("{ a }")
      .catch((e) => e);
    expect(error).toBeInstanceOf(AniListError);
    expect(error.status).toBe(502);
    expect(calls).toHaveLength(3);
  });

  it("throws GraphQL errors without retrying", async () => {
    const time = fakeTime();
    const { transport, calls } = queued([
      [404, { data: null, errors: [{ message: "User not found" }] }],
    ]);
    await expect(client(transport, time).query("{ a }")).rejects.toThrow("User not found");
    expect(calls).toHaveLength(1);
  });

  it("waits for the rate-limit reset when none remain", async () => {
    const time = fakeTime();
    const reset = String(1_000_000 + 30);
    const { transport } = queued([
      [200, { data: {} }, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": reset }],
      ok({}),
    ]);
    const c = client(transport, time);
    await c.query("{ a }");
    await c.query("{ a }");
    expect(time.t.slept).toEqual([30_000]);
  });

  it("starts requests sent together one interval apart", async () => {
    // Real time with a 100 ms interval: the fake clock can't model requests waiting together.
    const { transport, calls } = queued([ok({ a: 1 }), ok({ a: 2 }), ok({ a: 3 })]);
    const starts: number[] = [];
    const timed: Transport = (body) => {
      starts.push(performance.now());
      return transport(body);
    };
    const c = new AniListClient(timed, { requestsPerMinute: 600 });
    const got = await Promise.all([c.query("{ a }"), c.query("{ a }"), c.query("{ a }")]);
    expect(got).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(calls).toHaveLength(3);
    const [s0 = 0, s1 = 0, s2 = 0] = starts;
    expect(s1 - s0).toBeGreaterThanOrEqual(95);
    expect(s2 - s1).toBeGreaterThanOrEqual(95);
    expect(s2 - s0).toBeLessThan(400);
  });

  it("holds waiting requests during a back-off", async () => {
    const time = fakeTime();
    const { transport } = queued([[429, {}, { "Retry-After": "10" }], ok({}), ok({})]);
    const c = client(transport, time, 60);
    await Promise.all([c.query("{ a }"), c.query("{ b }")]);
    // The second waited its 1 s slot, then the 10 s back-off; the retry came after it.
    expect(time.t.now).toBeGreaterThanOrEqual(10_000);
  });

  it("runs a query several times in one request with aliases", async () => {
    const time = fakeTime();
    const { transport, calls } = queued([
      ok({ q0: { media: [{ id: 1 }] }, q1: { media: [{ id: 2 }] } }),
    ]);
    const c = client(transport, time);
    const got = await c.queryMany(queries.MEDIA_BY_IDS, [
      { ids: [1], page: 1, perPage: 50 },
      { ids: [2], page: 1, perPage: 50 },
    ]);
    expect(got).toEqual([{ Page: { media: [{ id: 1 }] } }, { Page: { media: [{ id: 2 }] } }]);
    expect(calls).toEqual([
      {
        query: batchQuery(queries.MEDIA_BY_IDS, 2),
        variables: { ids_0: [1], page_0: 1, perPage_0: 50, ids_1: [2], page_1: 1, perPage_1: 50 },
      },
    ]);
    // One run is the plain query.
    const single = queued([ok({ Page: { media: [] } })]);
    await client(single.transport, time).queryMany(queries.MEDIA_BY_IDS, [{ ids: [3] }]);
    expect((single.calls[0] as { query: string }).query).toBe(queries.MEDIA_BY_IDS);
  });

  it("sends variables through the transport", async () => {
    const time = fakeTime();
    const { transport, calls } = queued([ok({})]);
    await client(transport, time).query("query ($id: Int) { x }", { id: 5 });
    expect(calls).toEqual([{ query: "query ($id: Int) { x }", variables: { id: 5 } }]);
  });
});

describe("batchQuery", () => {
  it("aliases each run and suffixes its variables, keeping the fragments once", () => {
    const q = batchQuery(queries.MEDIA_BY_IDS, 2);
    expect(q).toContain("query ($ids_0: [Int], $page_0: Int, $perPage_0: Int, $ids_1: [Int]");
    expect(q).toContain("q0: Page(page: $page_0, perPage: $perPage_0)");
    expect(q).toContain("q1: Page(page: $page_1, perPage: $perPage_1)");
    expect(q).toContain("media(id_in: $ids_1)");
    expect(q.match(/fragment MediaFields/g)).toHaveLength(1);
    expect(batchQuery(queries.DISCOVER, 3)).toContain("$countryOfOrigin_2: CountryCode");
  });
});

describe("fetchTransport", () => {
  it("posts JSON with the token and exposes status and headers", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "X-RateLimit-Remaining": "89" },
      });
    }) as unknown as typeof fetch;
    const res = await fetchTransport({ token: "fake-token", fetch: fakeFetch })({
      query: "{ a }",
      variables: {},
    });
    expect(res.status).toBe(200);
    expect(res.header("x-ratelimit-remaining")).toBe("89");
    expect(await res.json()).toEqual({ data: { ok: true } });
    const call = seen[0];
    if (!call) throw new Error("fetch was not called");
    expect(call.url).toBe("https://graphql.anilist.co");
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    expect(JSON.parse(call.init.body as string)).toEqual({ query: "{ a }", variables: {} });
  });
});
