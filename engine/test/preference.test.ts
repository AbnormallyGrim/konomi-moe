import { describe, expect, it } from "vitest";
import {
  communityWeight,
  examples,
  features,
  label,
  NotEnoughHistory,
  PreferenceModel,
  truth,
  userMean,
} from "../src/index.ts";
import { catalog, entry, makeMedia, seed } from "./helpers.ts";

const SHOW = makeMedia(1, [], [], { episodes: 24 });

describe("communityWeight", () => {
  it("uses the base weight for full lists and grows for short ones", () => {
    expect(communityWeight(325)).toBe(0.6);
    expect(communityWeight(150)).toBe(0.6);
    expect(communityWeight(46)).toBeCloseTo(1.96, 2);
    expect(communityWeight(10)).toBe(3);
    expect(communityWeight(0)).toBe(3);
  });
});

describe("label", () => {
  it("ignores planning", () => {
    expect(label(entry(1, "PLANNING"), SHOW, 70)).toBeNull();
  });

  it("is relative to the user's mean, with a rewatch bonus", () => {
    expect(label(entry(1, "COMPLETED", 90), SHOW, 70)).toEqual([2, 1]);
    expect(label(entry(1, "COMPLETED", 90, { repeat: 1 }), SHOW, 70)).toEqual([3, 1]);
    expect(label(entry(1, "CURRENT", 60), SHOW, 70)).toEqual([-1, 0.7]);
  });

  it("treats an unscored completion as a clear like", () => {
    expect(label(entry(1, "COMPLETED"), SHOW, 70)).toEqual([1, 0.7]);
  });

  it("penalises early drops more than late ones", () => {
    const early = label(entry(1, "DROPPED", 0, { progress: 1 }), SHOW, 70)?.[0] ?? 0;
    const late = label(entry(1, "DROPPED", 0, { progress: 22 }), SHOW, 70)?.[0] ?? 0;
    expect(early).toBeLessThan(late);
    expect(late).toBeLessThan(0);
  });

  it("uses a fair-go length when the length is unknown", () => {
    const manga = makeMedia(2, [], [], { type: "MANGA", episodes: null, chapters: null });
    expect(label(entry(2, "DROPPED", 0, { progress: 50 }), manga, 70)?.[0]).toBe(-1);
  });
});

describe("examples and truth", () => {
  it("computes the user mean and leaves unsure titles out of the answer key", () => {
    const { map } = catalog([makeMedia(1), makeMedia(2), makeMedia(3)]);
    const list = [entry(1, "COMPLETED", 80), entry(2, "PAUSED"), entry(3, "CURRENT", 60)];
    expect(userMean(list)).toBe(70);
    expect(examples(list, map).map((e) => e.media.id)).toEqual([1, 2, 3]);
    expect(truth(list, map).map((e) => e.media.id)).toEqual([1, 3]); // unscored paused left out
  });
});

describe("features", () => {
  it("lists genres, ranked tags, studios, format and decade in order", () => {
    const m = makeMedia(1, [["Iyashikei", 90]], ["Slice of Life"], {
      studios: ["Studio X"],
      format: "TV",
      year: 2017,
    });
    expect([...features(m)]).toEqual([
      ["genre:Slice of Life", 1],
      ["tag:Iyashikei", 0.9],
      ["studio:Studio X", 1],
      ["format:TV", 1],
      ["decade:2010s", 1],
    ]);
  });
});

describe("PreferenceModel", () => {
  it("needs enough history", () => {
    const { map } = catalog([SHOW]);
    expect(() => new PreferenceModel().fit(examples([entry(1, "COMPLETED", 80)], map))).toThrow(
      NotEnoughHistory,
    );
  });

  it("learns liked and disliked tags and explains predictions", () => {
    const { media, entries } = seed();
    const model = new PreferenceModel().fit(examples(entries, catalog(media).map));
    const weights = new Map(model.weights());
    expect(weights.get("tag:Iyashikei")).toBeGreaterThan(0);
    expect(weights.get("tag:Harem")).toBeLessThan(0);

    const cosy = makeMedia(100, ["Iyashikei"], ["Slice of Life"]);
    const harem = makeMedia(101, ["Harem"], ["Fantasy"]);
    const [good = 0, bad = 0] = model.predict([cosy, harem]);
    expect(good).toBeGreaterThan(bad);
    expect(["tag:Iyashikei", "genre:Slice of Life"]).toContain(model.contributions(cosy)[0]?.[0]);
  });
});
