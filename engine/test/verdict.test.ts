import { describe, expect, it } from "vitest";
import { buildProfile, judge } from "../src/index.ts";
import { entry, makeMedia, seed } from "./helpers.ts";

function profile() {
  const { media, entries } = seed();
  return buildProfile(entries, new Map(media.map((m) => [m.id, m])));
}

/** Candidate scores spread from -1 down to -5.35 (the seed list's model centres near -1.9). */
const POOL = Array.from({ length: 30 }, (_, i) => -1 - i * 0.15);

describe("judge", () => {
  it("calls a title with the user's loved tags a great match, with reasons", () => {
    const v = judge(
      profile(),
      makeMedia(50, ["Iyashikei", "Found Family"], ["Slice of Life"]),
      POOL,
    );
    expect(v.level).toBe("great");
    expect(v.rank).toBe(1);
    expect(v.reasons.map((r) => r.value)).toContain("Iyashikei");
    expect(v.against).toEqual([]);
  });

  it("calls a title built on dropped tags not your usual, with what counts against it", () => {
    const v = judge(profile(), makeMedia(51, ["Harem", "Isekai"], ["Fantasy"]), POOL);
    expect(v.level).toBe("nope");
    expect(v.against.map((r) => r.value)).toContain("Fantasy");
  });

  it("places a neutral title by rank among the candidates", () => {
    const p = profile();
    const neutral = makeMedia(52, ["Space"], ["Sci-Fi"]);
    expect(
      judge(
        p,
        neutral,
        POOL.map((s) => s + 1.5),
      ).level,
    ).toBe("mixed");
    expect(
      judge(
        p,
        neutral,
        POOL.map((s) => s - 10),
      ).level,
    ).toBe("great");
  });

  it("says when a title is on the list, or there's too little history", () => {
    const e = entry(3, "COMPLETED", 90);
    expect(judge(profile(), makeMedia(3), POOL, e)).toMatchObject({ level: "onlist", entry: e });
    expect(judge(null, makeMedia(53), POOL).level).toBe("thin");
  });

  it("hides spoiler tags from the reasons", () => {
    const m = makeMedia(54, ["Found Family"], ["Slice of Life"]);
    m.tags.push({ name: "Iyashikei", rank: 90, spoiler: true });
    expect(judge(profile(), m, POOL).reasons.map((r) => r.value)).not.toContain("Iyashikei");
  });
});
