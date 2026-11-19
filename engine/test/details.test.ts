import { describe, expect, it } from "vitest";
import { KEY_STAFF_ROLES, parseDetails, parseTrailer } from "../src/index.ts";

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
    expect(parseDetails({})).toEqual({ description: "", trailer: null, characters: [], staff: [] });
  });

  it("links YouTube and Dailymotion trailers and refuses anything else", () => {
    expect(parseTrailer({ id: "tR8YH0G67Rk", site: "youtube", thumbnail: null })).toEqual({
      site: "youtube",
      url: "https://www.youtube.com/watch?v=tR8YH0G67Rk",
      thumbnail: "https://i.ytimg.com/vi/tR8YH0G67Rk/hqdefault.jpg",
    });
    expect(
      parseTrailer({ id: "x8abc", site: "dailymotion", thumbnail: "https://s2.dmcdn.net/x.jpg" }),
    ).toEqual({
      site: "dailymotion",
      url: "https://www.dailymotion.com/video/x8abc",
      thumbnail: "https://s2.dmcdn.net/x.jpg",
    });
    expect(parseTrailer({ id: "abc", site: "vimeo" })).toBeNull();
    expect(parseTrailer({ id: "a?b=c", site: "youtube" })).toBeNull();
    expect(parseTrailer({ id: "abc", site: "youtube", thumbnail: "javascript:x" })?.thumbnail).toBe(
      "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    );
    expect(parseTrailer(null)).toBeNull();
    expect(parseDetails({}).trailer).toBeNull();
  });
});
