/** Builds a preference profile and ranks candidates with it. Mirrors the lab's recommend.py. */

import { type CrowdPicks, ORDER_WEIGHT } from "./crowd.ts";
import { blocks, type Exclusions, MAX_CHAIN, type MediaLookup } from "./exclusions.ts";
import { type ListEntry, type ListStatus, type Media, prequelIds, sequelIds } from "./models.ts";
import {
  communityWeight,
  examples,
  isLiked,
  MIN_EXAMPLES,
  NotEnoughHistory,
  notInterestedExamples,
  PreferenceModel,
} from "./preference.ts";

/** Sources shown for unfinished list titles, when list titles are included. */
export const UNFINISHED: ReadonlyMap<ListStatus, string> = new Map([
  ["PLANNING", "on your planning list"],
  ["CURRENT", "in progress on your list"],
  ["PAUSED", "paused on your list"],
]);
/**
 * A sequel is recommended only when every main prequel is one of these: never after a planned,
 * in-progress, paused or dropped season.
 */
export const FINISHED: ReadonlySet<ListStatus> = new Set(["COMPLETED", "REPEATING"]);
/**
 * Add-ons that AniList often lists as a series' prequel by story order: an OVA set before season 1
 * but released after it ("Attack on Titan: No Regrets"). They never hold a series back and are
 * never where it starts; one set before a main title stands in for that title until it's
 * finished. (Measured on 20,000 users' lists: 5.5% of liked picks sat behind such an add-on.)
 */
export const MINOR_FORMATS: ReadonlySet<string> = new Set(["SPECIAL", "OVA", "MUSIC"]);

/** A special, OVA or music video (see `MINOR_FORMATS`). */
export function isMinor(m: Media): boolean {
  return m.format !== null && MINOR_FORMATS.has(m.format);
}

/**
 * The same-type prequels that must be finished before `media`: for a main title, the main titles
 * behind it, reached through any specials, OVAs or music videos in between (an uncached prequel
 * counts: its format is unknown); for a special, OVA or music video itself, its own prequels, as
 * for any title (an OVA series' part 1 still comes before part 2).
 */
export function mainPrequels(media: Media, lookup: MediaLookup): number[] {
  if (isMinor(media)) return [...new Set(prequelIds(media))].sort((a, b) => a - b);
  const found = new Set<number>();
  const seen = new Set([media.id]);
  let frontier = new Set(prequelIds(media));
  for (let i = 0; i < MAX_CHAIN; i++) {
    for (const id of seen) frontier.delete(id);
    if (!frontier.size) break;
    for (const id of frontier) seen.add(id);
    const cached = lookup(frontier);
    const next = new Set<number>();
    for (const p of frontier) {
      const m = cached.get(p);
      if (m && isMinor(m)) for (const q of prequelIds(m)) next.add(q);
      else found.add(p);
    }
    frontier = next;
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * For a special, OVA or music video set before a main title (its sequel, maybe through other
 * add-ons): that title, the lowest ID if several. `null` for anything else, or when the sequels
 * aren't cached.
 */
export function mainSuccessor(media: Media, lookup: MediaLookup): Media | null {
  if (!isMinor(media)) return null;
  const seen = new Set([media.id]);
  let frontier = new Set(sequelIds(media));
  for (let i = 0; i < MAX_CHAIN; i++) {
    for (const id of seen) frontier.delete(id);
    if (!frontier.size) return null;
    for (const id of frontier) seen.add(id);
    const cached = [...lookup(frontier).values()];
    const mains = cached.filter((m) => !isMinor(m)).sort((a, b) => a.id - b.id);
    if (mains[0]) return mains[0];
    frontier = new Set(cached.flatMap((m) => sequelIds(m)));
  }
  return null;
}

/**
 * Whether `media` can be recommended now: every main prequel finished and, for an add-on set
 * before a main title, that title finished too.
 */
export function unlocked(
  media: Media,
  statuses: ReadonlyMap<number, ListStatus>,
  lookup: MediaLookup,
): boolean {
  const successor = mainSuccessor(media, lookup);
  if (successor && !FINISHED.has(statuses.get(successor.id) as ListStatus)) return false;
  return mainPrequels(media, lookup).every((p) => FINISHED.has(statuses.get(p) as ListStatus));
}
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

/** A user's fitted preference model and the inputs it was trained on. */
export interface Profile {
  model: PreferenceModel;
  entries: ListEntry[];
  media: ReadonlyMap<number, Media>;
  likedIds: Set<number>;
  communityWeight: number;
}

/**
 * Fit a preference model on a list, plus the user's list of the other type (anime ↔ manga), which
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
  const model = new PreferenceModel().fit([
    ...own,
    ...examples(otherEntries, otherMedia),
    ...notInterestedExamples(dismissed),
  ]);
  const likedIds = new Set(own.filter(isLiked).map((ex) => ex.media.id));
  return { model, entries, media, likedIds, communityWeight: communityWeight(own.length) };
}

/** The `n` most liked and `n` most disliked tags, for targeted searches. */
export function discoveryTags(
  model: PreferenceModel,
  n = 3,
): { liked: string[]; disliked: string[] } {
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
  /** The crowd's picks (anime), added first so their card says who liked them. */
  crowd?: CrowdPicks | null;
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
  for (const [root] of options.crowd?.picks ?? []) {
    const by = profile.media.get(options.crowd?.because.get(root) ?? -1);
    add(root, by ? `fans of ${by.title} liked it too` : "liked by people with lists like yours");
  }
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
 * The title to recommend in place of `media`: itself when it's unlocked, else its first unwatched
 * main season, found by walking back through main prequels not on the list (an add-on of an
 * unwatched series walks to that series first). `null` when a main prequel is on the list
 * unfinished (planned, in progress, paused or dropped) or the chain can't be followed through
 * the cache.
 */
export function seriesStart(
  media: Media,
  statuses: ReadonlyMap<number, ListStatus>,
  lookup: MediaLookup,
): number | null {
  let current = media;
  const seen = new Set([media.id]);
  for (let i = 0; i < MAX_CHAIN; i++) {
    const successor = mainSuccessor(current, lookup);
    if (successor && !FINISHED.has(statuses.get(successor.id) as ListStatus)) {
      if (statuses.has(successor.id) || seen.has(successor.id)) return null;
      current = successor;
      seen.add(current.id);
      continue;
    }
    const prequels = mainPrequels(current, lookup);
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
  /**
   * The crowd's picks (anime). The list is then built the way the comparison chose: the crowd's
   * best series starts take `limit` − `limit` / 4 places, the preference model's best titles from
   * the crowd's fresh year on take the rest (new releases it can't know), other candidates fill
   * any places left, and all are ordered by the preference score + `ORDER_WEIGHT` × the crowd's
   * signed score.
   */
  crowd?: CrowdPicks | null;
}

export function blendScore(profile: Profile, m: Media, predicted: number): number {
  const community = ((m.averageScore ?? 70) - 70) / 10;
  return predicted + profile.communityWeight * community;
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
  // Where each crowd pick ended up (moved to its series start, as the app shows sequels).
  const crowdRank = new Map<number, number>();
  options.crowd?.picks.forEach(([root], i) => {
    for (const target of seriesStarts(new Map([[root, ["crowd"]]]), statuses, find).keys())
      if (!crowdRank.has(target)) crowdRank.set(target, i);
  });
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
      unlocked(m, statuses, find) &&
      !(options.exclusions && blocks(options.exclusions, m, lookup)) &&
      (!options.accept || options.accept(m))
    ) {
      candidates.push(m);
    }
  }

  const predicted = profile.model.predict(candidates);
  const ranked = candidates.map((m, i): Recommendation => {
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
      score: blendScore(profile, m, predicted[i] ?? 0),
      reasons,
      sources: moved.get(m.id) ?? [],
    };
  });
  const limit = options.limit ?? 20;
  if (!options.crowd) return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
  return withCrowd(ranked, options.crowd, crowdRank, limit);
}

/** The list as `RankOptions.crowd` describes it. Ties go to the lower AniList ID. */
function withCrowd(
  ranked: Recommendation[],
  crowd: CrowdPicks,
  crowdRank: ReadonlyMap<number, number>,
  limit: number,
): Recommendation[] {
  const preference = new Map(ranked.map((r) => [r.media.id, r.score]));
  for (const r of ranked) r.score += ORDER_WEIGHT * (crowd.order.get(r.media.id) ?? 0);
  const fresh = (r: Recommendation) => (r.media.year ?? 0) >= crowd.freshYear;
  const freshPlaces = Math.floor(limit / 4);
  const rankOf = (r: Recommendation) => crowdRank.get(r.media.id) ?? 0;
  const picked = ranked
    .filter((r) => crowdRank.has(r.media.id) && !fresh(r))
    .sort((a, b) => rankOf(a) - rankOf(b) || a.media.id - b.media.id)
    .slice(0, limit - freshPlaces);
  const chosen = new Set(picked.map((r) => r.media.id));
  const pref = (r: Recommendation) => preference.get(r.media.id) ?? 0;
  const added = ranked
    .filter((r) => fresh(r) && !chosen.has(r.media.id))
    .sort((a, b) => pref(b) - pref(a) || a.media.id - b.media.id)
    .slice(0, freshPlaces);
  for (const r of added) chosen.add(r.media.id);
  const rest = ranked
    .filter((r) => !chosen.has(r.media.id))
    .sort((a, b) => b.score - a.score || a.media.id - b.media.id)
    .slice(0, limit - chosen.size);
  return [...picked, ...added, ...rest].sort(
    (a, b) => b.score - a.score || a.media.id - b.media.id,
  );
}
