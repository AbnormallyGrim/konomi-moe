"""How strongly a title is about each genre, and whether a genre is its main theme."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from konomi.anilist import AniListClient
from konomi.models import Media
from konomi.store import Store

GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo",
    "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
    "Sports", "Supernatural", "Thriller",
]  # fmt: skip

# AniList tag categories that evidence each genre…
GENRE_CATEGORIES = {
    "Action": {"Theme-Action", "Theme-Other-Organisations"},
    "Comedy": {"Theme-Comedy"},
    "Drama": {"Theme-Drama"},
    "Fantasy": {"Theme-Fantasy"},
    "Mecha": {"Theme-Sci-Fi-Mecha"},
    "Music": {"Theme-Arts-Music"},
    "Romance": {"Theme-Romance"},
    "Sci-Fi": {"Theme-Sci-Fi", "Theme-Sci-Fi-Mecha"},
    "Slice of Life": {"Theme-Slice of Life"},
    "Sports": {"Theme-Game-Sport"},
}
# …plus single tags, mostly for genres without a category of their own.
GENRE_TAGS = {
    "Action": {"Super Power", "War", "Death Game", "Survival", "Kaiju"},
    "Adventure": {"Travel", "Dungeon", "Isekai", "Virtual World", "Lost Civilization"},
    "Ecchi": {"Nudity"},
    "Fantasy": {"Urban Fantasy", "Demons", "Gods", "Vampire", "Reincarnation", "Dungeon"},
    "Horror": {"Body Horror", "Cosmic Horror", "Zombie", "Gore", "Survival"},
    "Mahou Shoujo": {"Henshin", "Magic"},
    "Mecha": {"Robots"},
    "Mystery": {"Detective", "Conspiracy", "Crime"},
    "Psychological": {"Psychosexual", "Philosophy"},
    "Sci-Fi": {"Robots", "Aliens", "Space", "Cyborg", "Post-Apocalyptic", "Cyberpunk"},
    "Supernatural": {"Demons", "Ghost", "Youkai", "Super Power", "Curses", "Exorcism"},
    "Thriller": {"Conspiracy", "Crime", "Death Game"},
}
# Tags in a genre's category that say nothing about how central the genre is: "Heterosexual"
# only says relationships exist (Re:Zero's light novel ranks it 80, which made Romance its main
# theme), so it's never evidence.
NOT_EVIDENCE = {"Heterosexual"}
# Genres that drive a plot and so compete for "main theme". Comedy, Drama, Slice of Life and
# the like sit alongside a main theme (a romcom is still a romance) and never compete.
RIVALS = {
    "Action", "Adventure", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Mystery",
    "Psychological", "Romance", "Sci-Fi", "Sports", "Supernatural", "Thriller",
}  # fmt: skip
MAIN_MIN = 60  # a main theme needs evidence ranked at least this high
GENRE_ONLY = 50  # strength of a listed genre with no ranked tag behind it
TAG_MAIN_MIN = 70  # a tag counts as a main theme from this rank
CATEGORIES_MAX_AGE = 30 * 24 * 3600


@dataclass
class Theme:
    """A genre's strength (0-100) in a title, and whether it's the main theme."""

    genre: str
    strength: int
    main: bool


class Themes:
    """Judges themes from genres and ranked tags, given AniList's tag categories."""

    def __init__(self, tag_categories: dict[str, str]) -> None:
        self._tags = {
            g: (
                {n for n, c in tag_categories.items() if c in GENRE_CATEGORIES.get(g, ())}
                | GENRE_TAGS.get(g, set())
            )
            - NOT_EVIDENCE
            for g in GENRES
        }

    def strength(self, media: Media, genre: str) -> int:
        """Rank of the strongest tag evidencing `genre`; a listed genre is at least 50."""
        best = max((t.rank for t in media.tags if t.name in self._tags.get(genre, ())), default=0)
        return max(best, GENRE_ONLY) if genre in media.genres else best

    def is_main(self, media: Media, genre: str) -> bool:
        """Listed, and either the only plot-driving genre listed, or ranked at least 60 and at
        least as strong as every rival genre listed."""
        if genre not in media.genres:
            return False
        own = self.strength(media, genre)
        rivals = [self.strength(media, g) for g in media.genres if g != genre and g in RIVALS]
        return not rivals or (own >= MAIN_MIN and all(r <= own for r in rivals))

    def summary(self, media: Media) -> list[Theme]:
        """The title's genres, strongest first."""
        themes = [Theme(g, self.strength(media, g), self.is_main(media, g)) for g in media.genres]
        return sorted(themes, key=lambda t: t.strength, reverse=True)


def tag_categories(store: Store, client: AniListClient | None = None) -> dict[str, str]:
    """AniList's tag → category map, cached for 30 days; fetched only with a client."""
    cached = store.get_meta("tag_categories")
    if cached:
        saved = json.loads(cached)
        if not client or time.time() - saved["at"] < CATEGORIES_MAX_AGE:
            return saved["categories"]
    if not client:
        return {}
    tags = client.query("{ MediaTagCollection { name category } }")["MediaTagCollection"]
    categories = {t["name"]: t["category"] for t in tags}
    store.set_meta("tag_categories", json.dumps({"at": time.time(), "categories": categories}))
    return categories
