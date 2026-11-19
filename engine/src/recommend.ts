/** Builds a taste profile and ranks candidates with it. Mirrors the lab's recommend.py. */

import { blocks, type Exclusions, MAX_CHAIN, type MediaLookup } from "./exclusions.ts";
import { type ListEntry, type ListStatus, type Media, prequelIds } from "./models.ts";
import {
  communityWeight,
  examples,
  isLiked,
  MIN_EXAMPLES,
  NotEnoughHistory,
  notInterestedExamples,
  TasteModel,
} from "./taste.ts";

/** Sources shown for unfinished list titles, when list titles are included. */
export const UNFINISHED: ReadonlyMap<ListStatus, string> = new Map([
  ["PLANNING", "on your planning list"],
  ["CURRENT", "in progress on your list"],
  ["PAUSED", "paused on your list"],
]);
/**
 * A sequel is recommended only when every prequel is one of these: never after a planned,
 * in-progress, paused or dropped season.
 */
export const FINISHED: ReadonlySet<ListStatus> = new Set(["COMPLETED", "REPEATING"]);
/** Features that are true but uninformative as reasons. */
export const HIDDEN_REASONS = ["format:", "decade:"];

/** A feature that pushed a title up, such as tag `Iyashikei`. */
export interface Reason {
  kind: string;
  value: string;
}

/** A ranked title with the reasons behind it. */
export interface Recommendation {
  media: Media;
  score: number;
  reasons: Reason[];
  sources: string[];
}

/** A user's fitted taste model and the inputs it was trained on. */
export interface Profile {
  model: TasteModel;
  entries: ListEntry[];
  media: ReadonlyMap<number, Media>;
  likedIds: Set<number>;
  communityWeight: number;
}

/**
 * Fit a taste model on a list, plus the user's list of the other type (anime ↔ manga), which
 * shares genres and tags. Only the list's own liked titles seed candidates.
 */
export function buildProfile(
  entries: ListEntry[],
  media: ReadonlyMap<number, Media>,
  otherEntries: ListEntry[] = [],
  otherMedia: ReadonlyMap<number, Media> = new Map(),
  notInterested: Media[] = [],
): Profile {
  const own = examples(entries, media);
  if (own.length < MIN_EXAMPLES) {
    throw new NotEnoughHistory(`need at least ${MIN_EXAMPLES} rated titles, got ${own.length}`);
  }
  // Dismissed titles train as dislikes, unless a list already says what the user thinks.
  const listed = new Set([...entries, ...otherEntries].map((e) => e.mediaId));
  const unique = [...new Map(notInterested.map((m) => [m.id, m])).values()];
  const dismissed = unique.filter((m) => !listed.has(m.id)).sort((a, b) => a.id - b.id);
  const model = new TasteModel().fit([
    ...own,
    ...examples(otherEntries, otherMedia),
    ...notInterestedExamples(dismissed),
  ]);
  const likedIds = new Set(own.filter(isLiked).map((ex) => ex.media.id));
  return { model, entries, media, likedIds, communityWeight: communityWeight(own.length) };
}

/** The `n` most liked and `n` most disliked tags, for targeted searches. */
export function discoveryTags(model: TasteModel, n = 3): { liked: string[]; disliked: string[] } {
  const tags = model
    .weights()
    .filter(([k]) => k.startsWith("tag:"))
    .map(([k, w]): [string, number] => [k.slice(4), w]);
  return {
    liked: tags
      .filter(([, w]) => w > 0)
      .slice(0, n)
      .map(([t]) => t),
    disliked: tags
      .filter(([, w]) => w < 0)
      .reverse()
      .slice(0, n)
      .map(([t]) => t),
  };
}

/** Options for `candidateSources`. */
export interface SourceOptions {
  /** `[id, source]` pairs from searches. */
  extra?: [number, string][];
  /** Also rank unfinished list titles (planning, in progress, paused). */
  includeListed?: boolean;
}

/**
 * Why each candidate is considered: recommended from a liked title (`links` are cached
 * `[fromId, toId, rating]` recommendations, highest rating first), found by a search, or
 * unfinished on the list.
 */
export function candidateSources(
  profile: Profile,
  links: [number, number, number][],
  options: SourceOptions = {},
): Map<number, string[]> {
  const sources = new Map<number, string[]>();
  const add = (id: number, source: string) => sources.set(id, [...(sources.get(id) ?? []), source]);
  // Strongest recommendation first, so the card's first source is the best one.
  const ordered = [...links].sort((a, b) => b[2] - a[2] || a[0] - b[0]);
  for (const [from, to, rating] of ordered) {
    const liked = profile.media.get(from);
    if (rating > 0 && liked && profile.likedIds.has(from)) add(to, `liked ${liked.title}`);
  }
  for (const [id, source] of options.extra ?? []) add(id, source);
  if (options.includeListed) {
    for (const e of profile.entries) {
      const source = UNFINISHED.get(e.status);
      if (source) add(e.mediaId, source);
    }
  }
  return sources;
}

/**
 * The title to recommend in place of `media`: itself when every prequel is finished, else its
 * first unwatched season, found by walking back through prequels not on the list. `null` when a
 * prequel is on the list unfinished (planned, in progress, paused or dropped) or the chain
 * can't be followed through the cache.
 */
export function seriesStart(
  media: Media,
  statuses: ReadonlyMap<number, ListStatus>,
  lookup: MediaLookup,
): number | null {
  let current = media;
  const seen = new Set([media.id]);
  for (let i = 0; i < MAX_CHAIN; i++) {
    const prequels = prequelIds(current);
    if (prequels.every((p) => FINISHED.has(statuses.get(p) as ListStatus))) return current.id;
    if (prequels.some((p) => statuses.has(p) && !FINISHED.has(statuses.get(p) as ListStatus)))
      return null;
    const unlisted = prequels.filter((p) => !statuses.has(p) && !seen.has(p)).sort((a, b) => a - b);
    const next = unlisted.length ? lookup(unlisted.slice(0, 1)).values().next().value : undefined;
    if (!next) return null;
    current = next;
    seen.add(current.id);
  }
  return null;
}

/**
 * `sources` with each sequel moved to `seriesStart`, its sources joining that title's; sequels
 * with no title to recommend are dropped. Uncached and listed candidates are kept as they are;
 * ranking judges them by their own prequels.
 */
export function seriesStarts(
  sources: ReadonlyMap<number, string[]>,
  statuses: ReadonlyMap<number, ListStatus>,
  lookup: MediaLookup,
): Map<number, string[]> {
  const media = lookup(sources.keys());
  const moved = new Map<number, string[]>();
  for (const [id, found] of sources) {
    const m = media.get(id);
    const target = !m || statuses.has(id) ? id : seriesStart(m, statuses, lookup);
    if (target === null) continue;
    const into = moved.get(target) ?? [];
    for (const s of found) if (!into.includes(s)) into.push(s);
    moved.set(target, into);
  }
  return moved;
}

/** Options for `rank`. */
export interface RankOptions {
  limit?: number;
  includeAdult?: boolean;
  exclusions?: Exclusions;
  /** Cache lookup, for following excluded titles' sequel chains and sequels' prequels. */
  lookup?: MediaLookup;
  /** Extra filter, such as the user's filters. */
  accept?: (m: Media) => boolean;
  includeListed?: boolean;
}

/** Rank the candidates in `sources` whose details are in `media`; best first. */
export function rank(
  profile: Profile,
  sources: ReadonlyMap<number, string[]>,
  media: ReadonlyMap<number, Media>,
  options: RankOptions = {},
): Recommendation[] {
  const statuses = new Map(profile.entries.map((e) => [e.mediaId, e.status]));
  const lookup = options.lookup ?? (() => new Map());
  const find: MediaLookup = (ids) => {
    const found = new Map<number, Media>();
    const rest: number[] = [];
    for (const id of ids) {
      const m = media.get(id);
      if (m) found.set(id, m);
      else rest.push(id);
    }
    for (const [id, m] of lookup(rest)) found.set(id, m);
    return found;
  };
  const moved = seriesStarts(sources, statuses, find);
  const candidates: Media[] = [];
  for (const id of moved.keys()) {
    const m = find([id]).get(id);
    if (!m) continue;
    const status = statuses.get(m.id);
    const listedOk =
      status === undefined || (Boolean(options.includeListed) && UNFINISHED.has(status));
    if (
      listedOk &&
      (options.includeAdult || !m.isAdult) &&
      prequelIds(m).every((p) => FINISHED.has(statuses.get(p) as ListStatus)) &&
      !(options.exclusions && blocks(options.exclusions, m, lookup)) &&
      (!options.accept || options.accept(m))
    ) {
      candidates.push(m);
    }
  }

  const predicted = profile.model.predict(candidates);
  const ranked = candidates.map((m, i): Recommendation => {
    const community = ((m.averageScore ?? 70) - 70) / 10;
    const spoilers = new Set(m.tags.filter((t) => t.spoiler).map((t) => `tag:${t.name}`));
    const reasons = profile.model
      .contributions(m)
      .filter(([k, c]) => c > 0 && !spoilers.has(k) && !HIDDEN_REASONS.some((p) => k.startsWith(p)))
      .slice(0, 3)
      .map(([k]): Reason => {
        const at = k.indexOf(":");
        return { kind: k.slice(0, at), value: k.slice(at + 1) };
      });
    return {
      media: m,
      score: (predicted[i] ?? 0) + profile.communityWeight * community,
      reasons,
      sources: moved.get(m.id) ?? [],
    };
  });
  return ranked.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20);
}
