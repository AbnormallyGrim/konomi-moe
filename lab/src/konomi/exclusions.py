"""Titles, tags and custom lists the user never wants recommended."""

from __future__ import annotations

from dataclasses import dataclass, field

from konomi.anilist import AniListClient
from konomi.models import Media, MediaType
from konomi.store import Store
from konomi.sync import fetch_media

TITLE = "title"
LABEL = "label"
CUSTOM_LIST = "custom_list"
# Titles dismissed as "not interested": hidden like TITLE, and also trained on as dislikes.
NOT_INTERESTED = "not_interested"
MAX_CHAIN = 30


@dataclass
class Exclusions:
    """What to keep out of recommendations for one run."""

    media_ids: set[int] = field(default_factory=set)
    labels: set[str] = field(default_factory=set)

    @property
    def tags(self) -> list[str]:
        """Excluded tag names."""
        return sorted(k.removeprefix("tag:") for k in self.labels if k.startswith("tag:"))

    @property
    def genres(self) -> list[str]:
        """Excluded genre names."""
        return sorted(k.removeprefix("genre:") for k in self.labels if k.startswith("genre:"))

    def blocks(self, media: Media, store: Store) -> bool:
        """Whether a title is excluded, itself or as a sequel of an excluded title."""
        if media.id in self.media_ids or media.labels() & self.labels:
            return True
        return bool(_prequel_chain(media, store) & self.media_ids)


def roots(store: Store, user: str, media_type: MediaType) -> set[int]:
    """Excluded titles plus every title on the excluded custom lists."""
    ids = {int(v) for v in store.exclusions(user, TITLE)}
    lists = store.custom_lists(user, media_type)
    for name in store.exclusions(user, CUSTOM_LIST, media_type):
        ids |= lists.get(name, set())
    return ids


def load(
    store: Store, user: str, media_type: MediaType, client: AniListClient | None = None
) -> Exclusions:
    """The user's exclusions, with sequels followed; a client fetches uncached links."""
    return Exclusions(
        media_ids=sequel_closure(store, roots(store, user, media_type), client),
        labels=store.exclusions(user, LABEL),
    )


def sequel_closure(store: Store, start: set[int], client: AniListClient | None = None) -> set[int]:
    """`start` plus all same-type sequels, followed link by link."""
    seen, frontier = set(start), set(start)
    for _ in range(MAX_CHAIN):
        if not frontier:
            break
        if client:
            fetch_media(client, store, frontier)
        nxt = {s for m in store.get_media(frontier).values() for s in m.sequel_ids()} - seen
        seen |= nxt
        frontier = nxt
    return seen


def _prequel_chain(media: Media, store: Store) -> set[int]:
    """Every cached same-type prequel of a title, followed link by link."""
    seen: set[int] = set()
    frontier = set(media.prequel_ids())
    for _ in range(MAX_CHAIN):
        if not frontier:
            break
        seen |= frontier
        nxt = {p for m in store.get_media(frontier).values() for p in m.prequel_ids()}
        frontier = nxt - seen
    return seen
