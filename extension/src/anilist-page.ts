/** AniList title pages: /anime/<id>/… and /manga/<id>/…. */

export function titleFromPath(path: string): { id: number; type: "ANIME" | "MANGA" } | null {
  const m = /^\/(anime|manga)\/(\d+)(?:\/|$)/.exec(path);
  if (!m) return null;
  return { id: Number(m[2]), type: m[1] === "manga" ? "MANGA" : "ANIME" };
}
