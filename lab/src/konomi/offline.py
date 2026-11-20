"""Anime candidates from the openly licensed anime-offline-database."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import IO, Any

from konomi.anilist import AniListClient
from konomi.preference import PreferenceModel
from konomi.store import Store
from konomi.sync import fetch_media

ANILIST_ID = re.compile(r"^https://anilist\.co/anime/(\d+)$")
TAG_WEIGHT = 0.6  # the database has no tag ranks; roughly an average AniList rank
COMMUNITY_WEIGHT = 0.3


@dataclass
class OfflineAnime:
    """An entry from the offline database that has an AniList ID."""

    anilist_id: int
    title: str
    format: str
    status: str
    year: int | None = None
    score: float | None = None
    tags: list[str] = field(default_factory=list)
    studios: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialise for the cache."""
        return asdict(self)


def read_offline_db(path: str | Path) -> tuple[str | None, Iterator[OfflineAnime]]:
    """Dataset date and entries of a `.jsonl` or `.jsonl.zst` file; entries need AniList IDs."""
    f = _open(Path(path))
    meta = json.loads(f.readline())

    def entries() -> Iterator[OfflineAnime]:
        with f:
            for line in f:
                if anime := parse_entry(json.loads(line)):
                    yield anime

    return meta.get("lastUpdate"), entries()


def parse_entry(e: dict[str, Any]) -> OfflineAnime | None:
    """Parse one database entry, or `None` without an AniList source."""
    ids = [int(m[1]) for s in e.get("sources", []) if (m := ANILIST_ID.match(s))]
    if not ids:
        return None
    score = (e.get("score") or {}).get("arithmeticMean")
    return OfflineAnime(
        anilist_id=ids[0],
        title=e.get("title", ""),
        format=e.get("type", "UNKNOWN"),
        status=e.get("status", "UNKNOWN"),
        year=(e.get("animeSeason") or {}).get("year"),
        score=score,
        tags=[t.lower() for t in e.get("tags", [])],
        studios=[s.lower() for s in e.get("studios", [])],
    )


def _open(path: Path) -> IO[str]:
    if path.suffix == ".zst":
        try:
            from compression import zstd  # Python 3.14+
        except ImportError as e:
            raise RuntimeError("reading .zst needs Python 3.14+; decompress it first") from e
        return zstd.open(path, "rt", encoding="utf-8")
    return path.open(encoding="utf-8")


def prescore(weights: dict[str, float], anime: OfflineAnime) -> float:
    """Rough fit from database tags, matched case-insensitively to lowercased model weights."""
    total = 0.0
    for t in anime.tags:
        total += weights.get(f"genre:{t}", 0.0) + TAG_WEIGHT * weights.get(f"tag:{t}", 0.0)
    for s in anime.studios:
        total += weights.get(f"studio:{s}", 0.0)
    total += weights.get(f"format:{anime.format.lower()}", 0.0)
    if anime.year:
        total += weights.get(f"decade:{anime.year // 10 * 10}s", 0.0)
    if anime.score:
        total += COMMUNITY_WEIGHT * (anime.score - 7)
    return total


def top_ids(
    store: Store,
    model: PreferenceModel,
    exclude: set[int],
    n: int,
    include_adult: bool = False,
    exclude_labels: set[str] | None = None,
    accept: Callable[[OfflineAnime], bool] | None = None,
) -> list[int]:
    """AniList IDs of the `n` best-fitting released database entries, skipping excluded IDs and
    entries with an excluded tag, genre or studio (matched by name)."""
    weights = {name.lower(): coef for name, coef in model.weights()}
    banned = {k.split(":", 1)[-1].lower() for k in exclude_labels or ()}
    scored = [
        (prescore(weights, a), a.anilist_id)
        for a in store.offline_anime()
        if a.anilist_id not in exclude
        and a.status in ("FINISHED", "ONGOING")
        and (include_adult or "hentai" not in a.tags)
        and not banned & {*a.tags, *a.studios}
        and (accept is None or accept(a))
    ]
    scored.sort(reverse=True)
    return [i for _, i in scored[:n]]


def offline_candidates(
    store: Store,
    model: PreferenceModel,
    exclude: set[int],
    n: int,
    client: AniListClient | None = None,
    include_adult: bool = False,
    exclude_labels: set[str] | None = None,
    accept: Callable[[OfflineAnime], bool] | None = None,
) -> list[int]:
    """Top database picks; with a client, missing AniList details are fetched first."""
    ids = top_ids(store, model, exclude, n, include_adult, exclude_labels, accept)
    if client:
        fetch_media(client, store, set(ids))
    return ids
