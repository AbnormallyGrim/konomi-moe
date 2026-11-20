"""Gathers candidates and ranks them with the user's preference model."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from konomi.crowd import ORDER_WEIGHT, CrowdPicks
from konomi.exclusions import MAX_CHAIN, Exclusions
from konomi.models import ListEntry, ListStatus, Media
from konomi.preference import (
    COMMUNITY_WEIGHT,
    MIN_EXAMPLES,
    NotEnoughHistory,
    PreferenceModel,
    community_weight,
    examples,
    not_interested_examples,
)
from konomi.store import Store

UNFINISHED = {
    ListStatus.PLANNING: "on your planning list",
    ListStatus.CURRENT: "in progress on your list",
    ListStatus.PAUSED: "paused on your list",
}
# A sequel is recommended only when every main prequel is one of these: never after a planned,
# in-progress, paused or dropped season.
FINISHED = {ListStatus.COMPLETED, ListStatus.REPEATING}
# Add-ons that AniList often lists as a series' prequel by story order: an OVA set before season 1
# but released after it ("Attack on Titan: No Regrets"). They never hold a series back and are
# never where it starts; one set before a main title stands in for that title until it's finished.
# (Measured on 20,000 users' lists: 5.5% of liked picks sat behind such an add-on.)
MINOR_FORMATS = {"SPECIAL", "OVA", "MUSIC"}
HIDDEN_REASONS = ("format:", "decade:")  # true but uninformative as reasons


@dataclass
class Reason:
    """A feature that pushed a title up, such as tag `Iyashikei`."""

    kind: str
    value: str

    def __str__(self) -> str:
        return f"{self.value} ({self.kind})"


@dataclass
class Recommendation:
    """A ranked title with the reasons behind it."""

    media: Media
    score: float
    reasons: list[Reason] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


@dataclass
class Profile:
    """A user's fitted preference model and the inputs it was trained on."""

    model: PreferenceModel
    entries: list[ListEntry]
    media: dict[int, Media]
    liked_ids: set[int]
    community_weight: float = COMMUNITY_WEIGHT


def build_profile(
    store: Store,
    entries: list[ListEntry],
    other_entries: list[ListEntry] | None = None,
    not_interested: Iterable[int] = (),
) -> Profile:
    """Fit a preference model on a user's list, plus their list of the other type (anime ↔ manga),
    which shares genres and tags, plus titles they dismissed as "not interested" (ignored when
    on either list). Only the list's own liked titles seed candidates."""
    media = store.get_media(e.media_id for e in entries)
    own = examples(entries, media)
    other = (
        examples(other_entries, store.get_media(e.media_id for e in other_entries))
        if other_entries
        else []
    )
    if len(own) < MIN_EXAMPLES:
        raise NotEnoughHistory(f"need at least {MIN_EXAMPLES} rated titles, got {len(own)}")
    listed = {e.media_id for e in entries} | {e.media_id for e in other_entries or []}
    dismissed = store.get_media(i for i in not_interested if i not in listed)
    dismissed_examples = not_interested_examples([dismissed[i] for i in sorted(dismissed)])
    model = PreferenceModel().fit(own + other + dismissed_examples)
    liked = {ex.media.id for ex in own if ex.liked}
    return Profile(model, entries, media, liked, community_weight(len(own)))


Lookup = Callable[[Iterable[int]], dict[int, Media]]


def is_minor(media: Media) -> bool:
    """A special, OVA or music video (see `MINOR_FORMATS`)."""
    return media.format in MINOR_FORMATS


def load_prequels(
    store: Store, ids: Iterable[int], fetch: Callable[[set[int]], object] | None = None
) -> None:
    """Follow the titles' same-type prequels link by link, and the sequels of specials, OVAs and
    music videos (to find the series they belong to), `fetch`ing uncached ones first."""
    seen = set(ids)
    frontier = set(seen)
    for _ in range(MAX_CHAIN):
        nxt = {
            p
            for m in store.get_media(frontier).values()
            for p in m.prequel_ids() + (m.sequel_ids() if is_minor(m) else [])
        } - seen
        if not nxt:
            break
        if fetch:
            fetch(nxt)
        seen |= nxt
        frontier = nxt


def main_prequels(media: Media, lookup: Lookup) -> list[int]:
    """The same-type prequels that must be finished before `media`: for a main title, the main
    titles behind it, reached through any specials, OVAs or music videos in between (an uncached
    prequel counts: its format is unknown); for a special, OVA or music video itself, its own
    prequels, as for any title (an OVA series' part 1 still comes before part 2)."""
    if is_minor(media):
        return sorted(set(media.prequel_ids()))
    found: set[int] = set()
    seen = {media.id}
    frontier = set(media.prequel_ids())
    for _ in range(MAX_CHAIN):
        frontier -= seen
        if not frontier:
            break
        seen |= frontier
        cached = lookup(frontier)
        nxt: set[int] = set()
        for p in frontier:
            m = cached.get(p)
            if m is not None and is_minor(m):
                nxt.update(m.prequel_ids())
            else:
                found.add(p)
        frontier = nxt
    return sorted(found)


def main_successor(media: Media, lookup: Lookup) -> Media | None:
    """For a special, OVA or music video set before a main title (its sequel, maybe through
    other add-ons): that title, the lowest ID if several. None for anything else, or when the
    sequels aren't cached."""
    if not is_minor(media):
        return None
    seen = {media.id}
    frontier = set(media.sequel_ids())
    for _ in range(MAX_CHAIN):
        frontier -= seen
        if not frontier:
            return None
        seen |= frontier
        cached = lookup(frontier)
        mains = sorted((m for m in cached.values() if not is_minor(m)), key=lambda m: m.id)
        if mains:
            return mains[0]
        frontier = {s for m in cached.values() for s in m.sequel_ids()}
    return None


def unlocked(media: Media, statuses: dict[int, ListStatus], lookup: Lookup) -> bool:
    """Whether `media` can be recommended now: every main prequel finished and, for an add-on set
    before a main title, that title finished too."""
    successor = main_successor(media, lookup)
    if successor is not None and statuses.get(successor.id) not in FINISHED:
        return False
    return all(statuses.get(p) in FINISHED for p in main_prequels(media, lookup))


def series_start(media: Media, statuses: dict[int, ListStatus], lookup: Lookup) -> int | None:
    """The title to recommend in place of `media`: itself when it's unlocked, else its first
    unwatched main season, found by walking back through main prequels not on the list (an
    add-on of an unwatched series walks to that series first). None when a main prequel is on
    the list unfinished (planned, in progress, paused or dropped) or the chain can't be followed
    through the cache."""
    current, seen = media, {media.id}
    for _ in range(MAX_CHAIN):
        successor = main_successor(current, lookup)
        if successor is not None and statuses.get(successor.id) not in FINISHED:
            if successor.id in statuses or successor.id in seen:
                return None
            current = successor
            seen.add(current.id)
            continue
        prequels = main_prequels(current, lookup)
        if all(statuses.get(p) in FINISHED for p in prequels):
            return current.id
        if any(p in statuses and statuses[p] not in FINISHED for p in prequels):
            return None
        unlisted = sorted(p for p in prequels if p not in statuses and p not in seen)
        found = lookup(unlisted[:1]) if unlisted else {}
        if not found:
            return None
        current = next(iter(found.values()))
        seen.add(current.id)
    return None


def series_starts(
    sources: dict[int, list[str]],
    statuses: dict[int, ListStatus],
    lookup: Callable[[Iterable[int]], dict[int, Media]],
) -> dict[int, list[str]]:
    """`sources` with each sequel moved to `series_start`, its sources joining that title's;
    sequels with no title to recommend are dropped. Uncached and listed candidates are kept as
    they are; ranking judges them by their own prequels."""
    media = lookup(sources)
    moved: dict[int, list[str]] = defaultdict(list)
    for media_id, found in sources.items():
        keep = media_id not in media or media_id in statuses
        target = media_id if keep else series_start(media[media_id], statuses, lookup)
        if target is not None:
            moved[target] += [s for s in found if s not in moved[target]]
    return moved


def discovery_tags(model: PreferenceModel, n: int = 3) -> tuple[list[str], list[str]]:
    """The `n` most liked and `n` most disliked tags, for targeted searches."""
    tags = [(k.removeprefix("tag:"), w) for k, w in model.weights() if k.startswith("tag:")]
    liked = [t for t, w in tags if w > 0][:n]
    disliked = [t for t, w in reversed(tags) if w < 0][:n]
    return liked, disliked


def recommend(
    store: Store,
    profile: Profile,
    extra: list[tuple[int, str]] | None = None,
    limit: int = 20,
    include_adult: bool = False,
    exclusions: Exclusions | None = None,
    accept: Callable[[Media], bool] | None = None,
    include_listed: bool = False,
    fetch: Callable[[set[int]], object] | None = None,
    crowd: CrowdPicks | None = None,
) -> list[Recommendation]:
    """Rank candidates: recommendations of liked titles and cached `(id, source)` extras.
    Titles on the list are left out, unless `include_listed` adds the unfinished ones.
    A sequel of an unwatched season is swapped for the series' first unwatched main season,
    and a special, OVA or music video set before an unwatched series for that series; `fetch`
    (optional) caches the uncached prequels and add-on sequels that needs.

    With `crowd` (anime), the list is built the way the comparison chose: the crowd's best
    series starts take `limit` − `limit` // 4 places, the preference model's best titles from
    the crowd's fresh year on take the rest (new releases it can't know), other candidates
    fill any places left, and everything is ordered by the preference score + `ORDER_WEIGHT` ×
    the crowd's signed score."""
    statuses = {e.media_id: e.status for e in profile.entries}
    sources: dict[int, list[str]] = defaultdict(list)
    if crowd:
        roots = [r for r, _, _ in crowd.picks]
        uncached = set(roots) - set(store.get_media(roots))
        if uncached and fetch:
            fetch(uncached)
        for root in roots:
            by = profile.media.get(crowd.because.get(root, -1))
            sources[root].append(
                f"fans of {by.title} liked it too"
                if by
                else "liked by people with lists like yours"
            )

    links = store.recommendations_from(profile.liked_ids)
    # Strongest recommendation first, so the card's first source is the best one.
    for from_id, to_id, rating in sorted(links, key=lambda x: (-x[2], x[0])):
        if rating > 0 and from_id in profile.media:
            sources[to_id].append(f"liked {profile.media[from_id].title}")
    for media_id, source in extra or []:
        sources[media_id].append(source)
    if include_listed:
        for media_id, status in statuses.items():
            if status in UNFINISHED:
                sources[media_id].append(UNFINISHED[status])

    load_prequels(store, sources, fetch)
    crowd_rank: dict[int, int] = {}  # where each crowd pick ended up (moved to its start)
    for i, (root, _, _) in enumerate(crowd.picks if crowd else []):
        for target in series_starts({root: ["crowd"]}, statuses, store.get_media):
            crowd_rank.setdefault(target, i)
    sources = series_starts(sources, statuses, store.get_media)
    media = store.get_media(sources)
    candidates = [
        m
        for m in media.values()
        if (m.id not in statuses or (include_listed and statuses[m.id] in UNFINISHED))
        and (include_adult or not m.is_adult)
        and unlocked(m, statuses, store.get_media)
        and not (exclusions and exclusions.blocks(m, store))
        and (accept is None or accept(m))
    ]

    predicted = profile.model.predict(candidates)
    ranked = []
    for m, pred in zip(candidates, predicted, strict=True):
        community = ((m.average_score or 70) - 70) / 10
        spoilers = {f"tag:{t.name}" for t in m.tags if t.spoiler}
        reasons = [
            _reason(k)
            for k, c in profile.model.contributions(m)
            if c > 0 and k not in spoilers and not k.startswith(HIDDEN_REASONS)
        ][:3]
        ranked.append(
            Recommendation(
                m, float(pred + profile.community_weight * community), reasons, sources[m.id]
            )
        )
    if crowd is None:
        ranked.sort(key=lambda r: r.score, reverse=True)
        return ranked[:limit]
    return _with_crowd(ranked, crowd, crowd_rank, limit)


def _with_crowd(
    ranked: list[Recommendation], crowd: CrowdPicks, crowd_rank: dict[int, int], limit: int
) -> list[Recommendation]:
    """The list as `recommend` describes it with `crowd`. Ties go to the lower AniList ID."""
    preference = {r.media.id: r.score for r in ranked}
    for r in ranked:
        r.score = preference[r.media.id] + ORDER_WEIGHT * crowd.order.get(r.media.id, 0.0)

    def fresh(r: Recommendation) -> bool:
        return (r.media.year or 0) >= crowd.fresh_year

    fresh_places = limit // 4
    picked = sorted(
        (r for r in ranked if r.media.id in crowd_rank and not fresh(r)),
        key=lambda r: (crowd_rank[r.media.id], r.media.id),
    )[: limit - fresh_places]
    chosen = {r.media.id for r in picked}
    new = sorted(
        (r for r in ranked if fresh(r) and r.media.id not in chosen),
        key=lambda r: (-preference[r.media.id], r.media.id),
    )[:fresh_places]
    chosen |= {r.media.id for r in new}
    rest = sorted(
        (r for r in ranked if r.media.id not in chosen), key=lambda r: (-r.score, r.media.id)
    )[: limit - len(chosen)]
    return sorted(picked + new + rest, key=lambda r: (-r.score, r.media.id))


def _reason(feature: str) -> Reason:
    kind, _, value = feature.partition(":")
    return Reason(kind, value)
