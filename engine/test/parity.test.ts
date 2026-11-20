import { describe, expect, it } from "vitest";
import {
  type Filters,
  type ListEntry,
  type Media,
  type MediaType,
  MemoryStore,
  makeFilters,
  makeRunOptions,
  parseCrowd,
  run,
} from "../src/index.ts";
import crowdFixture from "./fixtures/crowd.json";
import fixture from "./fixtures/parity.json";

interface Scenario {
  name: string;
  type: MediaType;
  includeAdult?: boolean;
  filters: Partial<Filters>;
  /** Runs with the made-up crowd table (fixtures/crowd.bin). */
  crowd?: boolean;
}

interface Expected {
  name: string;
  weights: Record<string, number>;
  communityWeight: number;
  likedIds: number[];
  warnings: string[];
  recommendations: { id: number; score: number; reasons: string[]; sources: string[] }[];
}

interface World {
  user: string;
  media: Media[];
  lists: Record<MediaType, ListEntry[]>;
  links: Record<string, [number, number][]>;
  customLists: Record<MediaType, Record<string, number[]>>;
  exclusions: {
    titles: number[];
    labels: string[];
    customLists: Record<MediaType, string[]>;
    notInterested: number[];
  };
  tagCategories: Record<string, string>;
}

// The lab's results on a made-up world (lab/scripts/parity_world.py). The lab fits with an
// iterative solver, so numbers agree to about 1e-4; titles closer than TOLERANCE may swap.
const { world, scenarios, results, limit } = fixture as unknown as {
  world: World;
  scenarios: Scenario[];
  results: Expected[];
  limit: number;
};
const TOLERANCE = 1e-3;
// The made-up crowd table the lab ran its crowd scenarios with (base64 of the table file).
const crowdTable = parseCrowd(
  Uint8Array.from(atob(crowdFixture.table), (c) => c.charCodeAt(0)).buffer,
);

async function load(w: World): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.putMedia(w.media);
  for (const type of ["ANIME", "MANGA"] as const) {
    await store.putList(w.user, type, w.lists[type]);
    const lists = Object.entries(w.customLists[type]).map(([k, v]): [string, Set<number>] => [
      k,
      new Set(v),
    ]);
    await store.putCustomLists(w.user, type, new Map(lists));
  }
  await store.putRecommendations(new Map(Object.entries(w.links).map(([k, v]) => [Number(k), v])));
  await store.putExclusions(w.user, w.exclusions);
  await store.setMeta("tag_categories", JSON.stringify({ at: 0, categories: w.tagCategories }));
  return store;
}

describe("the engine ranks like the lab", () => {
  for (const [i, s] of scenarios.entries()) {
    const want = results[i] as Expected;
    it(s.name, async () => {
      const options = makeRunOptions({
        limit,
        discover: false,
        includeAdult: s.includeAdult ?? false,
        filters: makeFilters(s.filters),
        crowd: s.crowd ? crowdTable : null,
      });
      const got = await run(await load(world), null, world.user, s.type, options);

      expect(got.warnings).toEqual(want.warnings);
      expect([...got.profile.likedIds].sort((a, b) => a - b)).toEqual(want.likedIds);
      expect(got.profile.communityWeight).toBeCloseTo(want.communityWeight, 12);
      const weights = new Map(got.profile.model.weights());
      expect([...weights.keys()].sort()).toEqual(Object.keys(want.weights).sort());
      for (const [k, v] of Object.entries(want.weights)) {
        expect(Math.abs((weights.get(k) ?? Number.NaN) - v), k).toBeLessThan(TOLERANCE);
      }

      const recs = got.recommendations;
      expect(recs).toHaveLength(want.recommendations.length);
      for (const [n, w] of want.recommendations.entries()) {
        const r = recs[n];
        expect(Math.abs((r?.score ?? Number.NaN) - w.score), `score #${n + 1}`).toBeLessThan(
          TOLERANCE,
        );
        // Same title in the same place, unless a near-tie let two swap.
        const tied = want.recommendations.filter((x) => Math.abs(x.score - w.score) < TOLERANCE);
        expect(
          tied.map((x) => x.id),
          `title #${n + 1}`,
        ).toContain(r?.media.id);
        const same = want.recommendations.find((x) => x.id === r?.media.id);
        expect(r?.reasons.map((x) => `${x.kind}:${x.value}`)).toEqual(same?.reasons);
        expect(r?.sources).toEqual(same?.sources);
      }
    });
  }
});
