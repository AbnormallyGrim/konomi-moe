"""SQLite cache of lists, titles and recommendation links."""

from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterable
from pathlib import Path
from typing import TYPE_CHECKING

from konomi.models import ListEntry, ListStatus, Media, MediaType

if TYPE_CHECKING:
    from konomi.offline import OfflineAnime

SCHEMA = """
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    fetched_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS list_entries (
    user TEXT NOT NULL,
    media_type TEXT NOT NULL,
    media_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    score INTEGER NOT NULL,
    progress INTEGER NOT NULL,
    repeat INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user, media_id)
);
CREATE TABLE IF NOT EXISTS recommendations (
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_id)
);
CREATE TABLE IF NOT EXISTS offline_anime (
    anilist_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_lists (
    user TEXT NOT NULL,
    media_type TEXT NOT NULL,
    name TEXT NOT NULL,
    media_id INTEGER NOT NULL,
    PRIMARY KEY (user, media_type, name, media_id)
);
CREATE TABLE IF NOT EXISTS exclusions (
    user TEXT NOT NULL,
    kind TEXT NOT NULL,
    media_type TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user, kind, media_type, value)
);
CREATE TABLE IF NOT EXISTS list_syncs (
    user TEXT NOT NULL,
    media_type TEXT NOT NULL,
    synced_at REAL NOT NULL,
    PRIMARY KEY (user, media_type)
);
"""


class Store:
    """Local cache; usernames are stored lowercase."""

    def __init__(self, path: str | Path) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path)
        self._db.executescript(SCHEMA)

    def close(self) -> None:
        """Close the database."""
        self._db.close()

    def upsert_media(self, items: Iterable[Media]) -> None:
        """Insert or refresh titles."""
        now = time.time()
        with self._db:
            self._db.executemany(
                "INSERT OR REPLACE INTO media (id, type, data, fetched_at) VALUES (?, ?, ?, ?)",
                [(m.id, m.type.value, json.dumps(m.to_dict()), now) for m in items],
            )

    def get_media(self, ids: Iterable[int]) -> dict[int, Media]:
        """Cached titles by ID; missing IDs are left out."""
        ids = list(set(ids))
        out: dict[int, Media] = {}
        for batch in _batches(ids, 500):
            marks = ",".join("?" * len(batch))
            rows = self._db.execute(f"SELECT data FROM media WHERE id IN ({marks})", batch)
            for (data,) in rows:
                m = Media.from_dict(json.loads(data))
                out[m.id] = m
        return out

    def missing_or_stale(self, ids: Iterable[int], max_age_seconds: float) -> list[int]:
        """IDs not cached, or cached longer ago than `max_age_seconds`."""
        ids = list(set(ids))
        cutoff = time.time() - max_age_seconds
        fresh: set[int] = set()
        for batch in _batches(ids, 500):
            marks = ",".join("?" * len(batch))
            rows = self._db.execute(
                f"SELECT id FROM media WHERE id IN ({marks}) AND fetched_at >= ?", [*batch, cutoff]
            )
            fresh.update(r[0] for r in rows)
        return sorted(set(ids) - fresh)

    def replace_list(self, user: str, media_type: MediaType, entries: list[ListEntry]) -> None:
        """Replace a user's list for one media type, so removed titles disappear."""
        user = user.lower()
        with self._db:
            self._db.execute(
                "DELETE FROM list_entries WHERE user = ? AND media_type = ?",
                (user, media_type.value),
            )
            self._db.executemany(
                "INSERT INTO list_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        user,
                        media_type.value,
                        e.media_id,
                        e.status.value,
                        e.score,
                        e.progress,
                        e.repeat,
                        e.updated_at,
                    )
                    for e in entries
                ],
            )
            self._db.execute(
                "INSERT OR REPLACE INTO list_syncs VALUES (?, ?, ?)",
                (user, media_type.value, time.time()),
            )

    def upsert_entry(self, user: str, media_type: MediaType, entry: ListEntry) -> None:
        """Add or replace one list entry, such as a title just added on AniList."""
        e = entry
        with self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO list_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user.lower(),
                    media_type.value,
                    e.media_id,
                    e.status.value,
                    e.score,
                    e.progress,
                    e.repeat,
                    e.updated_at,
                ),
            )

    def list_entries(self, user: str, media_type: MediaType) -> list[ListEntry]:
        """A user's cached list for one media type."""
        rows = self._db.execute(
            "SELECT media_id, status, score, progress, repeat, updated_at FROM list_entries "
            "WHERE user = ? AND media_type = ?",
            (user.lower(), media_type.value),
        )
        return [ListEntry(r[0], ListStatus(r[1]), r[2], r[3], r[4], r[5]) for r in rows]

    def last_synced(self, user: str, media_type: MediaType) -> float | None:
        """Unix time of the last list sync, if any."""
        row = self._db.execute(
            "SELECT synced_at FROM list_syncs WHERE user = ? AND media_type = ?",
            (user.lower(), media_type.value),
        ).fetchone()
        return row[0] if row else None

    def all_media(self, media_type: MediaType) -> list[Media]:
        """Every cached title of one type."""
        rows = self._db.execute("SELECT data FROM media WHERE type = ?", (media_type.value,))
        return [Media.from_dict(json.loads(d)) for (d,) in rows]

    def replace_custom_lists(
        self, user: str, media_type: MediaType, lists: dict[str, set[int]]
    ) -> None:
        """Replace a user's custom list membership for one media type."""
        user = user.lower()
        with self._db:
            self._db.execute(
                "DELETE FROM custom_lists WHERE user = ? AND media_type = ?",
                (user, media_type.value),
            )
            self._db.executemany(
                "INSERT INTO custom_lists VALUES (?, ?, ?, ?)",
                [(user, media_type.value, n, i) for n, ids in lists.items() for i in ids],
            )

    def custom_lists(self, user: str, media_type: MediaType) -> dict[str, set[int]]:
        """A user's custom lists for one media type, by name."""
        out: dict[str, set[int]] = {}
        rows = self._db.execute(
            "SELECT name, media_id FROM custom_lists WHERE user = ? AND media_type = ?",
            (user.lower(), media_type.value),
        )
        for name, media_id in rows:
            out.setdefault(name, set()).add(media_id)
        return out

    def exclusions(self, user: str, kind: str, media_type: MediaType | None = None) -> set[str]:
        """Excluded values of one kind; `media_type` scopes kinds that need it (custom lists)."""
        rows = self._db.execute(
            "SELECT value FROM exclusions WHERE user = ? AND kind = ? AND media_type = ?",
            (user.lower(), kind, media_type.value if media_type else ""),
        )
        return {r[0] for r in rows}

    def set_exclusions(
        self, user: str, kind: str, values: Iterable[str], media_type: MediaType | None = None
    ) -> None:
        """Replace the excluded values of one kind."""
        user, scope = user.lower(), media_type.value if media_type else ""
        with self._db:
            self._db.execute(
                "DELETE FROM exclusions WHERE user = ? AND kind = ? AND media_type = ?",
                (user, kind, scope),
            )
            self._db.executemany(
                "INSERT OR IGNORE INTO exclusions VALUES (?, ?, ?, ?)",
                [(user, kind, scope, v) for v in values],
            )

    def get_meta(self, key: str) -> str | None:
        """A stored setting or cached value."""
        row = self._db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def set_meta(self, key: str, value: str) -> None:
        """Store a setting or cached value."""
        with self._db:
            self._db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, value))

    def synced_users(self) -> list[str]:
        """Users with a synced list, most recently synced first."""
        rows = self._db.execute(
            "SELECT user FROM list_syncs GROUP BY user ORDER BY max(synced_at) DESC"
        )
        return [r[0] for r in rows]

    def replace_recommendations(self, recs: dict[int, list[tuple[int, int]]]) -> None:
        """Replace the outgoing recommendation links of each given title."""
        with self._db:
            for from_id, links in recs.items():
                self._db.execute("DELETE FROM recommendations WHERE from_id = ?", (from_id,))
                self._db.executemany(
                    "INSERT OR REPLACE INTO recommendations VALUES (?, ?, ?)",
                    [(from_id, to_id, rating) for to_id, rating in links],
                )

    def recommendations_from(self, ids: Iterable[int]) -> list[tuple[int, int, int]]:
        """`(from_id, to_id, rating)` links leaving the given titles."""
        ids = list(set(ids))
        out: list[tuple[int, int, int]] = []
        for batch in _batches(ids, 500):
            marks = ",".join("?" * len(batch))
            out.extend(
                self._db.execute(
                    "SELECT from_id, to_id, rating FROM recommendations "
                    f"WHERE from_id IN ({marks})",
                    batch,
                )
            )
        return out

    def replace_offline_anime(self, last_update: str | None, items: Iterable[OfflineAnime]) -> int:
        """Replace the imported offline database; returns how many entries were stored."""
        with self._db:
            self._db.execute("DELETE FROM offline_anime")
            self._db.executemany(
                "INSERT OR REPLACE INTO offline_anime VALUES (?, ?)",
                ((a.anilist_id, json.dumps(a.to_dict())) for a in items),
            )
            self._db.execute(
                "INSERT OR REPLACE INTO meta VALUES ('offline_db_date', ?)", (last_update or "",)
            )
        return self._db.execute("SELECT count(*) FROM offline_anime").fetchone()[0]

    def offline_anime(self) -> Iterable[OfflineAnime]:
        """All imported offline database entries."""
        from konomi.offline import OfflineAnime

        for (data,) in self._db.execute("SELECT data FROM offline_anime"):
            yield OfflineAnime(**json.loads(data))

    def offline_info(self) -> tuple[str | None, int]:
        """Date and size of the imported offline database (`None, 0` if not imported)."""
        count = self._db.execute("SELECT count(*) FROM offline_anime").fetchone()[0]
        row = self._db.execute("SELECT value FROM meta WHERE key = 'offline_db_date'").fetchone()
        return (row[0] or None) if row else None, count


def _batches(items: list[int], size: int) -> Iterable[list[int]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]
