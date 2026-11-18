/** A fake AniList for pipeline tests: answers by query kind and records every request. */

import {
  AniListClient,
  batchQuery,
  type MediaNode,
  queries,
  type Transport,
  unbatchVariables,
} from "../src/index.ts";

/** A made-up `MediaFields` node. */
export function node(id: number, extra: Partial<MediaNode> = {}): MediaNode {
  return {
    id,
    type: "ANIME",
    format: "TV",
    title: { romaji: `Tesuto ${id}`, english: null },
    episodes: 12,
    averageScore: 75,
    coverImage: { large: `https://example.invalid/${id}.jpg` },
    stats: { scoreDistribution: [{ score: 80, amount: 10 }] },
    genres: ["Slice of Life"],
    tags: [{ name: "Iyashikei", rank: 80, isMediaSpoiler: false }],
    relations: { edges: [] },
    ...extra,
  };
}

/** A list entry node for `USER_LIST`. */
export function listEntry(media: MediaNode, status = "COMPLETED", score = 0, progress = 0) {
  return { status, score, progress, repeat: 0, updatedAt: 0, media };
}

export interface FakeAniList {
  /** `USER_LIST` chunks per media type. */
  lists?: Partial<
    Record<"ANIME" | "MANGA", { name?: string; isCustomList?: boolean; entries: unknown[] }[][]>
  >;
  /** Titles answerable by `MEDIA_BY_IDS` and `MEDIA_WITH_RECS_BY_IDS`. */
  catalog?: Map<number, MediaNode>;
  /** `DISCOVER` results, given the request variables. */
  discover?: (variables: Record<string, unknown>) => MediaNode[];
  /** `TAG_COLLECTION` result. */
  tags?: { name: string; category: string }[];
  /** `MEDIA_DETAILS` replies by title ID. */
  details?: Map<number, unknown>;
}

/** Queries the fake can answer as a batch (several aliased runs in one request). */
const BATCHABLE = [queries.MEDIA_BY_IDS, queries.MEDIA_WITH_RECS_BY_IDS, queries.DISCOVER];

/**
 * A client over a fake AniList, plus what it received: `requests` has one entry per query run
 * (a batched request counts each of its runs), `http` counts actual requests.
 */
export function fakeClient(fake: FakeAniList) {
  const requests: { kind: string; variables: Record<string, unknown> }[] = [];
  const counts = { http: 0 };
  const answer = (query: string, variables: Record<string, unknown>) => {
    let data: Record<string, unknown>;
    let kind: string;
    if (query === queries.USER_LIST) {
      kind = "list";
      const chunks = fake.lists?.[variables.type as "ANIME" | "MANGA"] ?? [];
      const n = variables.chunk as number;
      data = {
        MediaListCollection: { hasNextChunk: n < chunks.length, lists: chunks[n - 1] ?? [] },
      };
    } else if (query === queries.MEDIA_BY_IDS || query === queries.MEDIA_WITH_RECS_BY_IDS) {
      kind = query === queries.MEDIA_BY_IDS ? "media" : "media+recs";
      const ids = variables.ids as number[];
      data = {
        Page: { media: ids.flatMap((id) => (fake.catalog?.has(id) ? [fake.catalog.get(id)] : [])) },
      };
    } else if (query === queries.DISCOVER) {
      kind = "discover";
      data = { Page: { media: fake.discover?.(variables) ?? [] } };
    } else if (query === queries.MEDIA_DETAILS) {
      kind = "details";
      data = { Media: fake.details?.get(variables.id as number) ?? { description: "" } };
    } else if (query === queries.TAG_COLLECTION) {
      kind = "tags";
      data = { MediaTagCollection: fake.tags ?? [] };
    } else {
      throw new Error(`unexpected query: ${query.slice(0, 40)}`);
    }
    requests.push({ kind, variables });
    return data;
  };
  const transport: Transport = async ({ query, variables }) => {
    counts.http++;
    let data: Record<string, unknown>;
    const runs = unbatchVariables(variables);
    const base = runs.length
      ? BATCHABLE.find((b) => batchQuery(b, runs.length) === query)
      : undefined;
    if (base) {
      data = {};
      runs.forEach((vars, i) => {
        // Unset variables arrive as absent, like AniList treats them.
        data[`q${i}`] = Object.values(answer(base, vars))[0];
      });
    } else {
      data = answer(query, variables);
    }
    return { status: 200, header: () => null, json: async () => ({ data }) };
  };
  const client = new AniListClient(transport, { requestsPerMinute: 6000, sleep: async () => {} });
  return { client, requests, counts, transport };
}
