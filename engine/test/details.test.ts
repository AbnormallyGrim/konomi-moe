import { describe, expect, it } from "vitest";
import { KEY_STAFF_ROLES, parseDetails } from "../src/index.ts";

describe("parseDetails", () => {
  it("keeps characters with voice actors, and key staff once with all their roles", () => {
    const pic = (n: number) => ({ medium: `https://example.invalid/${n}.jpg` });
    const d = parseDetails({
      description: "A made-up story.",
      characters: {
        edges: [
          {
            role: "MAIN",
            node: { id: 1, name: { full: "Hero" }, image: pic(1) },
            voiceActors: [{ id: 9, name: { full: "Voice" }, image: pic(9) }],
          },
          { role: "SUPPORTING", node: { id: 2, name: { full: "Friend" }, image: null } },
          { role: "MAIN", node: null },
        ],
      },
      staff: {
        edges: [
          { role: "Director (eps 1-12)", node: { id: 20, name: { full: "Dee" }, image: pic(20) } },
          { role: "Series Composition", node: { id: 20, name: { full: "Dee" }, image: pic(20) } },
          { role: "Unit Director", node: { id: 21, name: { full: "Unit" }, image: null } },
          { role: "Music", node: { id: 22, name: { full: "Composer" }, image: null } },
        ],
      },
    });
    expect(d.description).toBe("A made-up story.");
    expect(d.characters.map((c) => [c.name, c.role, c.voiceActor?.name ?? null])).toEqual([
      ["Hero", "MAIN", "Voice"],
      ["Friend", "SUPPORTING", null],
    ]);
    expect(d.staff.map((s) => [s.name, s.roles])).toEqual([
      ["Dee", ["Director", "Series Composition"]],
      ["Composer", ["Music"]],
    ]);
    expect(KEY_STAFF_ROLES.has("Unit Director")).toBe(false);
  });

  it("copes with a title that has none of them", () => {
    expect(parseDetails({})).toEqual({ description: "", characters: [], staff: [] });
  });
});
