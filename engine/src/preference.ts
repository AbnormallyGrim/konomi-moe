/** Learns a user's preferences from their list: labels, features and the model. Mirrors the lab's preference.py. */

import { type ListEntry, type Media, mediaLength } from "./models.ts";
import { fitRidge, predictRow, type RidgeFit, type SparseRow } from "./ridge.ts";

/** Assumed average score (0-100) when the user hasn't scored anything. */
export const DEFAULT_MEAN = 70;
/** Fewest usable entries a list needs before the model can learn from it. */
export const MIN_EXAMPLES = 5;
/** How much the community score counts in ranking, for a list of `FULL_LIST` titles or more. */
export const COMMUNITY_WEIGHT = 0.6;
/** Labelled titles at which a list gets the base community weight. */
export const FULL_LIST = 150;
/** Upper bound on the community weight, reached by very short lists. */
export const MAX_COMMUNITY_WEIGHT = 3.0;

/**
 * How much the community score counts in ranking: more for short lists, which teach the model
 * less (0.6 × 150 / labelled, between 0.6 and 3).
 */
export function communityWeight(labelled: number): number {
  const scale = FULL_LIST / Math.max(labelled, 1);
  return Math.min(MAX_COMMUNITY_WEIGHT, COMMUNITY_WEIGHT * Math.max(1, scale));
}

/** A training example: how much the user liked a title, relative to their average. */
export interface Example {
  media: Media;
  target: number;
  weight: number;
  /** The user gave it a score, so the target is exact. */
  scored: boolean;
}

/** At or above the user's average; such titles seed candidate gathering. */
export function isLiked(ex: Example): boolean {
  return ex.target >= 0;
}

/** How entries become `[target, weight]` pairs; `null` leaves that kind out of training. */
export interface Labels {
  rewatchBonus: number;
  /** Weight for titles that are scored but still being watched or paused. */
  tentativeWeight: number;
  rewatched: [number, number];
  completed: [number, number];
  dropBase: number;
  /** Extra penalty for dropping early. */
  dropSlope: number;
  paused: [number, number] | null;
  current: [number, number] | null;
  /**
   * A recommendation dismissed as "not interested": a dislike of the premise, about as strong
   * as dropping a title halfway but weighted lower, since the user never tried it. Targets are
   * relative to the list, so it must sit well below a typical list's average. Untuned.
   */
  notInterested: [number, number];
}

/** The labels tuned in the lab. */
export const DEFAULT_LABELS: Readonly<Labels> = {
  rewatchBonus: 1.0,
  tentativeWeight: 0.7,
  rewatched: [1.5, 0.8],
  completed: [1.0, 0.7],
  dropBase: -1.0,
  dropSlope: 3.0,
  paused: [-0.5, 0.3],
  current: [0.5, 0.3],
  notInterested: [-2.0, 0.6],
};

/** Average of the user's non-zero scores (0-100). */
export function userMean(entries: ListEntry[]): number {
  const scores = entries.filter((e) => e.score > 0).map((e) => e.score);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : DEFAULT_MEAN;
}

/** `[target, weight]` for an entry, or `null` if it says nothing about preferences. */
export function label(
  entry: ListEntry,
  media: Media,
  mean: number,
  labels: Labels = DEFAULT_LABELS,
): [number, number] | null {
  const rewatched = entry.repeat > 0 || entry.status === "REPEATING";
  if (entry.status === "PLANNING") return null;

  if (entry.score > 0) {
    let target = (entry.score - mean) / 10;
    if (rewatched) target += labels.rewatchBonus;
    const tentative = entry.status === "CURRENT" || entry.status === "PAUSED";
    return [target, tentative ? labels.tentativeWeight : 1.0];
  }
  if (rewatched) return labels.rewatched;
  if (entry.status === "COMPLETED") return labels.completed;
  if (entry.status === "DROPPED") {
    const early = 1.0 - progressFraction(entry, media);
    return [labels.dropBase - labels.dropSlope * early, 1.0];
  }
  if (entry.status === "PAUSED") return labels.paused;
  return labels.current;
}

function progressFraction(entry: ListEntry, media: Media): number {
  const length = mediaLength(media);
  if (length) return Math.min(entry.progress / length, 1.0);
  // Unknown length (often ongoing): treat 12 episodes or 50 chapters as "gave it a fair go".
  const fairGo = media.type === "ANIME" ? 12 : 50;
  return Math.min(entry.progress / fairGo, 1.0);
}

/** Training examples for every entry with known details and a usable label. */
export function examples(
  entries: ListEntry[],
  media: ReadonlyMap<number, Media>,
  labels: Labels = DEFAULT_LABELS,
): Example[] {
  const mean = userMean(entries);
  const out: Example[] = [];
  for (const e of entries) {
    const m = media.get(e.mediaId);
    const labelled = m ? label(e, m, mean, labels) : null;
    if (m && labelled)
      out.push({ media: m, target: labelled[0], weight: labelled[1], scored: e.score > 0 });
  }
  return out;
}

/** Training examples for titles the user dismissed as "not interested". */
export function notInterestedExamples(media: Media[], labels: Labels = DEFAULT_LABELS): Example[] {
  const [target, weight] = labels.notInterested;
  return media.map((m) => ({ media: m, target, weight, scored: false }));
}

/**
 * A fixed answer key for evaluation: scores, unscored completions, rewatches and drops, with
 * the default labels. Unscored paused and in-progress titles are left out.
 */
export function truth(entries: ListEntry[], media: ReadonlyMap<number, Media>): Example[] {
  const sure = entries.filter(
    (e) => e.score > 0 || (e.status !== "PAUSED" && e.status !== "CURRENT"),
  );
  return examples(sure, media, DEFAULT_LABELS);
}

/** Sparse features of a title, in a fixed order: genres, tags, studios, format, decade. */
export function features(media: Media): Map<string, number> {
  const f = new Map<string, number>();
  for (const g of media.genres) f.set(`genre:${g}`, 1.0);
  for (const t of media.tags) f.set(`tag:${t.name}`, t.rank / 100);
  for (const s of media.studios) f.set(`studio:${s}`, 1.0);
  if (media.format) f.set(`format:${media.format}`, 1.0);
  if (media.year) f.set(`decade:${Math.floor(media.year / 10) * 10}s`, 1.0);
  return f;
}

/** The list has too few usable entries to learn from. */
export class NotEnoughHistory extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotEnoughHistory";
  }
}

/** Ridge regression from title features to how much the user likes it. */
export class PreferenceModel {
  readonly alpha: number;
  readonly minFeatureCount: number;
  private vocabulary = new Map<string, number>();
  private names: string[] = [];
  private fit_: RidgeFit | null = null;

  constructor(alpha = 10.0, minFeatureCount = 1) {
    this.alpha = alpha;
    this.minFeatureCount = minFeatureCount;
  }

  /** Fit on examples; features seen on fewer than `minFeatureCount` titles are dropped. */
  fit(train: Example[]): this {
    if (train.length < MIN_EXAMPLES) {
      throw new NotEnoughHistory(`need at least ${MIN_EXAMPLES} rated titles, got ${train.length}`);
    }
    const dicts = train.map((ex) => features(ex.media));
    const counts = new Map<string, number>();
    for (const d of dicts) for (const k of d.keys()) counts.set(k, (counts.get(k) ?? 0) + 1);
    // Sorted names, like scikit-learn's DictVectorizer, so weights tie-break the same way.
    this.names = [...counts]
      .filter(([, c]) => c >= this.minFeatureCount)
      .map(([k]) => k)
      .sort(byCodePoint);
    this.vocabulary = new Map(this.names.map((k, i) => [k, i]));
    this.fit_ = fitRidge(
      dicts.map((d) => this.row(d)),
      train.map((ex) => ex.target),
      train.map((ex) => ex.weight),
      this.alpha,
      this.names.length,
    );
    return this;
  }

  /** Predicted liking for each title (points out of 10, relative to the user's mean). */
  predict(items: Media[]): number[] {
    const fit = this.fitted();
    return items.map((m) => predictRow(fit, this.row(features(m))));
  }

  /** Each known feature's contribution to a title's prediction, largest first. */
  contributions(media: Media): [string, number][] {
    const fit = this.fitted();
    const out: [string, number][] = [];
    for (const [k, v] of features(media)) {
      const i = this.vocabulary.get(k);
      if (i !== undefined) out.push([k, v * (fit.coef[i] ?? 0)]);
    }
    return out.sort((a, b) => b[1] - a[1]);
  }

  /** All feature weights, most liked first. */
  weights(): [string, number][] {
    const fit = this.fitted();
    return this.names
      .map((k, i): [string, number] => [k, fit.coef[i] ?? 0])
      .sort((a, b) => b[1] - a[1]);
  }

  private row(f: Map<string, number>): SparseRow {
    const row: SparseRow = { indices: [], values: [] };
    for (const [k, v] of f) {
      const i = this.vocabulary.get(k);
      if (i !== undefined) {
        row.indices.push(i);
        row.values.push(v);
      }
    }
    return row;
  }

  private fitted(): RidgeFit {
    if (!this.fit_) throw new Error("PreferenceModel used before fit()");
    return this.fit_;
  }
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
