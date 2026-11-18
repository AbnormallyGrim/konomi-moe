"""Plain data types shared across the app."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class MediaType(StrEnum):
    """AniList media type."""

    ANIME = "ANIME"
    MANGA = "MANGA"

    @property
    def other(self) -> MediaType:
        """Anime for manga and manga for anime."""
        return MediaType.MANGA if self is MediaType.ANIME else MediaType.ANIME


class ListStatus(StrEnum):
    """Status of an entry on a user's list."""

    CURRENT = "CURRENT"
    PLANNING = "PLANNING"
    COMPLETED = "COMPLETED"
    DROPPED = "DROPPED"
    PAUSED = "PAUSED"
    REPEATING = "REPEATING"


@dataclass
class Tag:
    """A tag on a title, with AniList's relevance rank (0-100)."""

    name: str
    rank: int
    spoiler: bool = False


@dataclass
class Relation:
    """A link from one title to another, such as `PREQUEL`."""

    relation_type: str
    media_id: int
    media_type: MediaType | None


@dataclass
class Media:
    """An anime or manga title with the fields the model uses."""

    id: int
    type: MediaType
    title: str
    format: str | None = None
    status: str | None = None
    is_adult: bool = False
    year: int | None = None
    episodes: int | None = None
    chapters: int | None = None
    average_score: int | None = None
    mean_score: int | None = None
    popularity: int | None = None
    favourites: int | None = None
    score_distribution: list[tuple[int, int]] | None = None  # (score, users); None: not fetched
    site_url: str | None = None
    cover_url: str | None = None
    genres: list[str] = field(default_factory=list)
    tags: list[Tag] = field(default_factory=list)
    studios: list[str] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)

    @property
    def length(self) -> int | None:
        """Episode or chapter count, if known."""
        return self.episodes if self.type is MediaType.ANIME else self.chapters

    def prequel_ids(self) -> list[int]:
        """IDs of same-type prequels."""
        return [
            r.media_id
            for r in self.relations
            if r.relation_type == "PREQUEL" and r.media_type in (None, self.type)
        ]

    def sequel_ids(self) -> list[int]:
        """IDs of same-type sequels."""
        return [
            r.media_id
            for r in self.relations
            if r.relation_type == "SEQUEL" and r.media_type in (None, self.type)
        ]

    def labels(self) -> set[str]:
        """Genres, tags and main studios as `genre:`, `tag:` and `studio:` keys."""
        return (
            {f"genre:{g}" for g in self.genres}
            | {f"tag:{t.name}" for t in self.tags}
            | {f"studio:{s}" for s in self.studios}
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialise for the cache."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Media:
        """Deserialise from the cache."""
        data = dict(data)
        data["type"] = MediaType(data["type"])
        data["tags"] = [Tag(**t) for t in data.get("tags", [])]
        if data.get("score_distribution") is not None:
            data["score_distribution"] = [tuple(p) for p in data["score_distribution"]]
        data["relations"] = [
            Relation(
                r["relation_type"],
                r["media_id"],
                MediaType(r["media_type"]) if r.get("media_type") else None,
            )
            for r in data.get("relations", [])
        ]
        return cls(**data)


@dataclass
class ListEntry:
    """One title on a user's list. `score` is 0-100, with 0 meaning unscored."""

    media_id: int
    status: ListStatus
    score: int = 0
    progress: int = 0
    repeat: int = 0
    updated_at: int = 0
