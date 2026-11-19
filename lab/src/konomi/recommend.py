"""Gathers candidates and ranks them with the user's taste model."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from konomi.exclusions import MAX_CHAIN, Exclusions
from konomi.models import ListEntry, ListStatus, Media
from konomi.store import Store
from konomi.taste import (
    COMMUNITY_WEIGHT,
    MIN_EXAMPLES,
    NotEnoughHistory,
    TasteModel,
    community_weight,
    examples,
    not_interested_examples,
)

UNFINISHED = {
    ListStatus.PLANNING: "on your planning list",
    ListStatus.CURRENT: "in progress on your list",
    ListStatus.PAUSED: "paused on your list",
}
# A sequel is recommended only when every prequel is one of these: never after a planned,
# in-progress, paused or dropped season.
FINISHED = {ListStatus.COMPLETED, ListStatus.REPEATING}
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
    """A user's fitted taste model and the inputs it was trained on."""

    model: TasteModel
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
    """Fit a taste model on a user's list, plus their list of the other type (anime ↔ manga),
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
    model = TasteModel().fit(own + other + dismissed_examples)
    liked = {ex.media.id for ex in own if ex.liked}
    return Profile(model, entries, media, liked, community_weight(len(own)))


def load_prequels(
    store: Store, ids: Iterable[int], fetch: Callable[[set[int]], object] | None = None
) -> None:
    """Follow the titles' same-type prequels link by link, `fetch`ing uncached ones first."""
    seen = set(ids)
    frontier = set(seen)
    for _ in range(MAX_CHAIN):
        nxt = {p for m in store.get_media(frontier).values() for p in m.prequel_ids()} - seen
        if not nxt:
            break
        if fetch:
            fetch(nxt)
        seen |= nxt
        frontier = nxt


def series_start(
    media: Media,
    statuses: dict[int, ListStatus],
    lookup: Callable[[Iterable[int]], dict[int, Media]],
) -> int | None:
    """The title to recommend in place of `media`: itself when every prequel is finished,
    else its first unwatched season, found by walking back through prequels not on the list.
    None when a prequel is on the list unfinished (planned, in progress, paused or dropped)
    or the chain can't be followed through the cache."""
    current, seen = media, {media.id}
    for _ in range(MAX_CHAIN):
        prequels = current.prequel_ids()
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


def discovery_tags(model: TasteModel, n: int = 3) -> tuple[list[str], list[str]]:
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
) -> list[Recommendation]:
    """Rank candidates: recommendations of liked titles and cached `(id, source)` extras.
    Titles on the list are left out, unless `include_listed` adds the unfinished ones.
    A sequel of an unwatched season is swapped for the series' first unwatched season;
    `fetch` (optional) caches the uncached prequels that needs."""
    statuses = {e.media_id: e.status for e in profile.entries}
    sources: dict[int, list[str]] = defaultdict(list)

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
    sources = series_starts(sources, statuses, store.get_media)
    media = store.get_media(sources)
    candidates = [
        m
        for m in media.values()
        if (m.id not in statuses or (include_listed and statuses[m.id] in UNFINISHED))
        and (include_adult or not m.is_adult)
        and all(statuses.get(p) in FINISHED for p in m.prequel_ids())
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
    ranked.sort(key=lambda r: r.score, reverse=True)
    return ranked[:limit]


def _reason(feature: str) -> Reason:
    kind, _, value = feature.partition(":")
    return Reason(kind, value)
