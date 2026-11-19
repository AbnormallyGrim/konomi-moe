import type { ListEntry, Media } from "./models.ts";
import { blendScore, HIDDEN_REASONS, type Profile, type Reason } from "./recommend.ts";

export type VerdictLevel = "great" | "good" | "mixed" | "nope" | "onlist" | "thin";

export interface Verdict {
  level: VerdictLevel;
  reasons: Reason[];
  against: Reason[];
  rank: number | null;
  pool: number;
  entry: ListEntry | null;
}

export const GREAT_SHARE = 0.1;
export const GOOD_SHARE = 1 / 3;
export const NOPE_BELOW = -0.5;
export const MIN_POOL = 10;

function reason(key: string): Reason {
  const at = key.indexOf(":");
  return { kind: key.slice(0, at), value: key.slice(at + 1) };
}

export function judge(
  profile: Profile | null,
  media: Media,
  poolScores: readonly number[],
  entry: ListEntry | null = null,
): Verdict {
  const empty = { reasons: [], against: [], rank: null, pool: poolScores.length, entry };
  if (entry) return { ...empty, level: "onlist" };
  if (!profile) return { ...empty, level: "thin" };

  const predicted = profile.model.predict([media])[0] ?? 0;
  const score = blendScore(profile, media, predicted);
  const contributions = profile.model.contributions(media);
  const lean = contributions.reduce((sum, [, c]) => sum + c, 0);
  const spoilers = new Set(media.tags.filter((t) => t.spoiler).map((t) => `tag:${t.name}`));
  const shown = contributions.filter(
    ([k]) => !spoilers.has(k) && !HIDDEN_REASONS.some((p) => k.startsWith(p)),
  );
  const reasons = shown
    .filter(([, c]) => c > 0)
    .slice(0, 3)
    .map(([k]) => reason(k));
  const against = shown
    .filter(([, c]) => c < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([k]) => reason(k));

  const rank = poolScores.filter((s) => s > score).length + 1;
  const total = poolScores.length;
  let level: VerdictLevel;
  if (lean < NOPE_BELOW && (total < MIN_POOL || rank > total * GOOD_SHARE)) level = "nope";
  else if (total < MIN_POOL) level = lean > 0 ? "good" : "mixed";
  else if (rank <= Math.max(1, Math.ceil(total * GREAT_SHARE))) level = "great";
  else if (rank <= Math.ceil(total * GOOD_SHARE)) level = "good";
  else level = "mixed";
  return { level, reasons, against, rank, pool: total, entry: null };
}
