"""Filters chosen before a run, such as "romance manga, finished, from 2010"."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from konomi.models import ListStatus, Media, MediaType
from konomi.offline import OfflineAnime
from konomi.store import Store
from konomi.themes import RIVALS, TAG_MAIN_MIN, Themes

FORMATS = {
    MediaType.ANIME: ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"],
    MediaType.MANGA: ["MANGA", "NOVEL", "ONE_SHOT"],
}
# The offline database's types, as AniList formats.
OFFLINE_FORMATS = {"TV": {"TV", "TV_SHORT"}, "MOVIE": {"MOVIE"}, "OVA": {"OVA"},
                   "ONA": {"ONA"}, "SPECIAL": {"SPECIAL", "MUSIC"}}  # fmt: skip


@dataclass(frozen=True)
class Filters:
    """Every set field must match; an empty filter lets everything through."""

    genres: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    main_theme: bool = False
    formats: tuple[str, ...] = ()
    year_from: int | None = None
    year_to: int | None = None
    finished_only: bool = False
    hide_listed: bool = True
    hide_seen_adaptations: bool = False

    @property
    def active(self) -> bool:
        """Whether any title filter is set; `main_theme` alone and the list-based flags don't
        count, since AniList's search can't apply them."""
        return bool(
            self.genres
            or self.tags
            or self.formats
            or self.year_from
            or self.year_to
            or self.finished_only
        )

    def accepts(self, m: Media, themes: Themes) -> bool:
        """Whether a title passes; with `main_theme`, genres must be main themes (see
        `main_genres`) and tags ranked at least 70."""
        min_rank = TAG_MAIN_MIN if self.main_theme else 1
        ranks = {t.name: t.rank for t in m.tags}
        return (
            all(g in m.genres for g in self.genres)
            and all(ranks.get(t, 0) >= min_rank for t in self.tags)
            and not (self.main_theme and not all(themes.is_main(m, g) for g in self.main_genres))
            and (not self.formats or m.format in self.formats)
            and self._year_ok(m.year)
            and (not self.finished_only or m.status == "FINISHED")
        )

    @property
    def main_genres(self) -> tuple[str, ...]:
        """The chosen genres that must be the main theme. Supporting genres (Comedy, Drama,
        Slice of Life…) sit alongside a plot-driving one, so with one of those chosen they need
        only be listed: Romance + Comedy means romcoms. Comedy rarely has strong tag evidence,
        so requiring it as the main theme too left 16 of 300 romcom manga."""
        rivals = tuple(g for g in self.genres if g in RIVALS)
        return rivals or self.genres

    def accepts_offline(self, a: OfflineAnime) -> bool:
        """Rough check on an offline database entry, before fetching it from AniList."""
        names = set(a.tags)
        formats = OFFLINE_FORMATS.get(a.format, set())
        return (
            all(x.lower() in names for x in (*self.genres, *self.tags))
            and (not self.formats or bool(formats & set(self.formats)))
            and self._year_ok(a.year)
            and (not self.finished_only or a.status == "FINISHED")
        )

    def query_variables(self) -> dict[str, Any]:
        """The parts AniList's search can do itself."""
        v: dict[str, Any] = {}
        if self.genres:
            v["genreIn"] = list(self.genres)
        if self.tags:
            v["tagIn"] = list(self.tags)
            if self.main_theme:
                v["minimumTagRank"] = TAG_MAIN_MIN
        if self.formats:
            v["formatIn"] = list(self.formats)
        if self.year_from:
            v["startGreater"] = self.year_from * 10000
        if self.year_to:
            v["startLesser"] = self.year_to * 10000 + 1231
        if self.finished_only:
            v["statusIn"] = ["FINISHED"]
        return v

    def _year_ok(self, year: int | None) -> bool:
        if not (self.year_from or self.year_to):
            return True
        if year is None:
            return False
        return (self.year_from or year) <= year <= (self.year_to or year)


# Links between versions of the same story in another format: anime ↔ manga ↔ light novel
# (AniList uses ADAPTATION/SOURCE or ALTERNATIVE), remakes (ALTERNATIVE), and recap or
# compilation films (SUMMARY, COMPILATION/CONTAINS). Sequels, side stories and spin-offs are
# new story, so they're not versions.
VERSIONS = {"ADAPTATION", "SOURCE", "ALTERNATIVE", "SUMMARY", "COMPILATION", "CONTAINS"}
CROSS_MEDIA = VERSIONS  # the old name
# Statuses that count as "already watched or read": being on it or having paused it counts
# too ("I don't want to see this recommended"), planning to doesn't.
SEEN = {
    ListStatus.COMPLETED, ListStatus.REPEATING, ListStatus.DROPPED,
    ListStatus.CURRENT, ListStatus.PAUSED,
}  # fmt: skip


@dataclass
class SeenAdaptations:
    """Titles from the user's list (watched or read in the other type, or anything on the
    same type's list), and the versions of the same story they link to."""

    seen: set[int]
    linked: set[int]

    def blocks(self, m: Media) -> bool:
        """Whether a title is another version of a seen title, judged from either side's
        links."""
        return m.id in self.linked or any(
            r.relation_type in VERSIONS and r.media_id in self.seen for r in m.relations
        )


def seen_adaptations(store: Store, user: str, media_type: MediaType) -> SeenAdaptations | None:
    """Versions of the user's seen titles from the other type; `None` if that list isn't
    synced. Follows one more same-type hop, so watching an anime also covers the manga made
    from the same light novel (novels count as manga on AniList)."""
    other = media_type.other
    if store.last_synced(user, other) is None:
        return None
    seen = {e.media_id for e in store.list_entries(user, other) if e.status in SEEN}
    return _with_versions(store, seen, media_type)


def listed_versions(store: Store, user: str, media_type: MediaType) -> SeenAdaptations:
    """Other versions of anything on the user's list of `media_type`, any status: the light
    novel of a manga they're reading, the recap film of a series they watched."""
    listed = {e.media_id for e in store.list_entries(user, media_type)}
    return _with_versions(store, listed, media_type)


def _with_versions(store: Store, ids: set[int], media_type: MediaType) -> SeenAdaptations:
    """`ids` and the versions they link to, plus one more same-type hop."""
    linked = _versions(store, ids, media_type)
    linked |= _versions(store, linked, media_type)
    return SeenAdaptations(ids, linked - ids)


def _versions(store: Store, ids: set[int], media_type: MediaType) -> set[int]:
    """Cached cross-version links from `ids` to titles of `media_type`."""
    return {
        r.media_id
        for m in store.get_media(ids).values()
        for r in m.relations
        if r.relation_type in VERSIONS and r.media_type in (None, media_type)
    }
