"""Gathers candidates and ranks them with the user's taste model."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from konomi.exclusions import Exclusions
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
) -> list[Recommendation]:
    """Rank candidates: recommendations of liked titles and cached `(id, source)` extras.
    Titles on the list are left out, unless `include_listed` adds the unfinished ones."""
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

    media = store.get_media(sources)
    candidates = [
        m
        for m in media.values()
        if (m.id not in statuses or (include_listed and statuses[m.id] in UNFINISHED))
        and (include_adult or not m.is_adult)
        and all(p in statuses for p in m.prequel_ids())
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
