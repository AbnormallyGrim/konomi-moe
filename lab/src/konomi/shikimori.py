"""Collect public anime and manga lists from Shikimori into a local dataset, for experiments and
for training "people like you" title vectors. Nothing here is shipped: the database stays in
`data/` (git-ignored), and the app would only ever ship vectors trained from it.

Why Shikimori: its terms allow fetching data through the API (unlike AniList's, MyAnimeList's
or Kitsu's), and its title IDs are MyAnimeList's, which map to AniList. Its API rules, checked
2026-11-17 (https://shikimori.io/api/doc): use the API rather than parse the site, at most
5 requests a second and 90 a minute, and send the OAuth application's name as the User-Agent.

Privacy: users are sampled at random by ID and stored under an anonymous number. Their IDs are
kept only as salted hashes (so a stopped run can resume), and nicknames are never stored. Lists
come from v1's `/api/users/{id}/anime_rates` and `manga_rates`, which refuse (403) lists their
owners made private. v2's `/api/v2/user_rates?user_id=` would return both lists in one request,
but it doesn't check list privacy (its index reads `UserRate.where(user_id:)` and guests may
read any UserRate; v1 checks `:access_list`), so it isn't used.

Each entry keeps `created_at` (when it was added to the list) as well as `updated_at`, because
evaluation holds out what each user started last, and `updated_at` moves on every score edit.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import numpy as np

BASE_URL = "https://shikimori.io"
APP_NAME = "konomi-moe"
MAX_RPM = 90  # Shikimori's limit; the default stays under it
DEFAULT_RPM = 80
PER_LIST = 5000  # the API's largest page; longer lists come back with one extra row, then page 2
# A 403 normally means a private list, which is rare (2 of 81 random IDs on 2026-11-18). Many in
# a row more likely means Shikimori is refusing us, so stop rather than mark real users private.
REFUSED_IN_A_ROW = 15

# Shikimori list statuses as AniList's.
STATUS = {
    "planned": "PLANNING",
    "watching": "CURRENT",
    "rewatching": "REPEATING",
    "completed": "COMPLETED",
    "on_hold": "PAUSED",
    "dropped": "DROPPED",
}

SCHEMA = """
create table if not exists meta (key text primary key, value text not null);
-- One row per sampled ID, so a run can resume; `who` is a salted hash, never the ID itself.
create table if not exists attempts (
  who text primary key,
  result text not null,          -- ok, empty, missing, private
  user integer,                  -- anonymous number when result = ok
  entries integer not null default 0,
  at integer not null,
  started integer not null default 0,  -- entries other than PLANNING (what the target counts)
  dated integer not null default 0     -- 1 once stored with created_at (0: collected before)
);
create table if not exists entries (
  user integer not null,         -- anonymous number
  kind text not null,            -- ANIME or MANGA
  mal_id integer not null,       -- Shikimori's ID, which is MyAnimeList's
  status text not null,          -- AniList's status names
  score integer not null,        -- 0-100 like AniList's POINT_100; 0 = not scored
  progress integer not null,     -- episodes or chapters
  repeat integer not null,
  updated_at integer,            -- unix seconds; moves on every edit
  created_at integer,            -- unix seconds; when the title was added to the list
  primary key (user, kind, mal_id)
);
create index if not exists attempts_user on attempts (user);
"""

# Columns added after the first datasets were collected (2026-11-18), for upgrading them.
ADDED_COLUMNS = {
    "attempts": [
        ("started", "integer not null default 0"),
        ("dated", "integer not null default 0"),
    ],
    "entries": [("created_at", "integer")],
}


class ShikimoriError(Exception):
    """The API kept failing; the run can be resumed later."""


class Refused(ShikimoriError):
    """Every recent request was refused (403): probably blocked, not private lists."""


@dataclass
class Progress:
    """What a run has done so far."""

    users: int  # users who started at least `min_entries` titles (what the target counts)
    stored: int  # users with any list entries
    attempts: int  # IDs tried
    entries: int
    requests: int
    undated: int = 0  # stored before dates were kept; refetched first, in sample order


class Collector:
    """Samples Shikimori users at random and stores their public lists."""

    def __init__(
        self,
        db_path: str | Path,
        *,
        app_name: str = APP_NAME,
        contact: str | None = None,
        requests_per_minute: float = DEFAULT_RPM,
        seed: int = 1,
        min_entries: int = 10,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        max_retries: int = 8,
    ) -> None:
        if requests_per_minute > MAX_RPM:
            raise ValueError(f"Shikimori allows at most {MAX_RPM} requests a minute")
        self.db = sqlite3.connect(db_path)
        self.db.executescript(SCHEMA)
        _upgrade(self.db)
        # Shikimori asks for the app name as the User-Agent, and no browser imitation.
        self._http = httpx.Client(
            base_url=BASE_URL,
            timeout=60,
            headers={"User-Agent": user_agent(app_name, contact), "Accept": "application/json"},
            transport=transport,
            follow_redirects=True,
        )
        self._interval = 60.0 / requests_per_minute
        self._sleep = sleep
        self._clock = clock
        self._next = 0.0
        self._max_retries = max_retries
        self.min_entries = min_entries
        self._counts: list[int] | None = None
        self.requests = 0
        self.salt = self._meta("salt") or self._set_meta("salt", secrets.token_hex(16))
        self.seed = int(self._meta("seed") or self._set_meta("seed", str(seed)))

    def close(self) -> None:
        self._http.close()
        self.db.close()

    def __enter__(self) -> Collector:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # Sampling

    def max_user_id(self) -> int:
        """The newest user's ID, fixed at the first run so the sample order never changes."""
        known = self._meta("max_user_id")
        if known:
            return int(known)
        newest = self._get("/api/users", {"page": 1, "limit": 1})
        if not newest:
            raise ShikimoriError("couldn't read the newest user's ID")
        return int(self._set_meta("max_user_id", str(newest[0]["id"])))

    def order(self) -> np.ndarray:
        """Every user ID in a fixed random order (from the stored seed)."""
        return np.random.default_rng(self.seed).permutation(self.max_user_id()) + 1

    def progress(self) -> Progress:
        if self._counts is None:  # count once, then keep running totals (counting gets slow)
            users, stored, attempts, undated = self.db.execute(
                "select count(case when started >= ? then 1 end), count(user), count(*),"
                " count(case when result = 'ok' and dated = 0 then 1 end) from attempts",
                (self.min_entries,),
            ).fetchone()
            entries = self.db.execute("select count(*) from entries").fetchone()[0]
            self._counts = [users, stored, attempts, entries, undated]
        users, stored, attempts, entries, undated = self._counts
        return Progress(users, stored, attempts, entries, self.requests, undated)

    def run(
        self,
        target_users: int | None = None,
        report: Callable[[Progress], None] = lambda p: None,
        should_stop: Callable[[], bool] = lambda: False,
    ) -> str:
        """Collect until stopped, until `target_users` users who started at least `min_entries`
        titles are stored (no target: no limit), or until IDs run out. Smaller lists are stored
        too, but don't count. Users stored before dates were kept are fetched again as the
        sample order reaches them, which is first. `should_stop` is checked between users, so a
        stop always leaves whole users behind. Returns "stopped", "target" or "exhausted"."""
        if target_users is not None and self.progress().users >= target_users:
            return "target"
        tried = {row[0] for row in self.db.execute("select who from attempts")}
        undated = {
            row[0]
            for row in self.db.execute("select who from attempts where result = 'ok' and dated = 0")
        }
        refused: list[str] = []
        for user_id in self.order():
            if should_stop():
                return "stopped"
            who = self._hash(int(user_id))
            if who in tried and who not in undated:
                continue
            result = self._collect(int(user_id), who)
            undated.discard(who)
            refused = [*refused, who] if result == "private" else []
            if len(refused) >= REFUSED_IN_A_ROW:
                # Those probably weren't private: forget them so a later run retries them.
                with self.db:
                    self.db.executemany(
                        "delete from attempts where who = ?", [(w,) for w in refused]
                    )
                self._counts = None
                raise Refused(
                    f"Shikimori refused {len(refused)} requests in a row, so it's probably "
                    "blocking this connection rather than seeing private lists. Stopped; "
                    "nothing was lost. Try again later, at a lower --rpm, or with --contact."
                )
            progress = self.progress()
            report(progress)
            if target_users is not None and progress.users >= target_users:
                return "target"
        return "exhausted"

    # One user

    def _collect(self, user_id: int, who: str) -> str:
        """Fetch one user's lists and store them, replacing what an earlier run stored for them
        (a user stored before dates were kept). A user whose list has since gone private or
        whose account is gone loses what was stored."""
        result, lists = self._fetch(user_id)
        before = self.db.execute(
            "select user, entries, started, dated from attempts where who = ?", (who,)
        ).fetchone()
        old_user, old_count, old_started, old_dated = before or (None, 0, 0, 1)
        with self.db:  # one transaction per user, so stopping never leaves half a user
            user, count, started = None, 0, 0
            if old_user is not None:
                self.db.execute("delete from entries where user = ?", (old_user,))
            if result == "ok":
                user = (
                    old_user
                    or (
                        self.db.execute(
                            "select coalesce(max(user), 0) + 1 from attempts"
                        ).fetchone()
                    )[0]
                )
                rows = [row for kind, items in lists.items() for row in _rows(user, kind, items)]
                self.db.executemany(
                    "insert or ignore into entries (user, kind, mal_id, status, score, progress,"
                    " repeat, updated_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    rows,
                )
                count = len(rows)
                started = sum(row[3] != "PLANNING" for row in rows)
            self.db.execute(
                "insert or replace into attempts (who, result, user, entries, at, started, dated)"
                " values (?, ?, ?, ?, ?, ?, 1)",
                (who, result, user, count, int(time.time()), started),
            )
        if self._counts is not None:  # only once the user is saved
            self._counts[0] += (started >= self.min_entries) - (old_started >= self.min_entries)
            self._counts[1] += (user is not None) - (old_user is not None)
            self._counts[2] += before is None
            self._counts[3] += count - old_count
            self._counts[4] -= before is not None and old_user is not None and not old_dated
        return result

    def _fetch(self, user_id: int) -> tuple[str, dict[str, list[dict[str, Any]]]]:
        """One user's lists by kind, and "ok", "empty", "missing" or "private"."""
        lists: dict[str, list[dict[str, Any]]] = {}
        for kind, path in (("ANIME", "anime_rates"), ("MANGA", "manga_rates")):
            items: list[dict[str, Any]] = []
            page = 1
            while True:
                data = self._get(f"/api/users/{user_id}/{path}", {"limit": PER_LIST, "page": page})
                if data is None:
                    return "missing", {}
                if data == "private":
                    return "private", {}
                items += data[:PER_LIST]
                if len(data) <= PER_LIST:  # one row past the limit means there's another page
                    break
                page += 1
            lists[kind] = items
            # Empty accounts are common, so don't spend a second request on them. This skips
            # the rare manga-only user.
            if kind == "ANIME" and not items:
                break
        return ("ok" if any(lists.values()) else "empty"), lists

    # HTTP

    def _get(self, path: str, params: dict[str, Any]) -> Any:
        """JSON from the API; None for a missing user, "private" for a hidden list."""
        backoff = 5.0
        for _ in range(self._max_retries):
            self._wait_turn()
            try:
                resp = self._http.get(path, params=params)
            except httpx.HTTPError:
                self._sleep(backoff)
                backoff = min(backoff * 2, 300)
                continue
            self.requests += 1
            if resp.status_code == 404:
                return None
            if resp.status_code == 403:
                return "private"
            if resp.status_code == 429:
                self._sleep(_retry_after(resp, backoff))
                backoff = min(backoff * 2, 300)
                continue
            if resp.status_code >= 500:
                self._sleep(backoff)
                backoff = min(backoff * 2, 300)
                continue
            if resp.status_code >= 400:  # not something waiting fixes; stop cleanly, resumable
                raise ShikimoriError(f"Shikimori answered {resp.status_code} for {path}")
            try:
                return resp.json()
            except ValueError:  # e.g. a maintenance page instead of JSON: wait and try again
                self._sleep(backoff)
                backoff = min(backoff * 2, 300)
        raise ShikimoriError(f"giving up on {path} after {self._max_retries} tries")

    def _wait_turn(self) -> None:
        now = self._clock()
        if now < self._next:
            self._sleep(self._next - now)
            now = self._next
        self._next = now + self._interval

    # Storage helpers

    def _hash(self, user_id: int) -> str:
        return hashlib.sha256(f"{self.salt}:{user_id}".encode()).hexdigest()[:24]

    def _meta(self, key: str) -> str | None:
        row = self.db.execute("select value from meta where key = ?", (key,)).fetchone()
        return row[0] if row else None

    def _set_meta(self, key: str, value: str) -> str:
        with self.db:
            self.db.execute("insert or replace into meta values (?, ?)", (key, value))
        return value


def _upgrade(db: sqlite3.Connection) -> None:
    """Add columns that datasets collected before 2026-11-18 lack. Their users keep `dated` 0,
    so the next run fetches them again (with dates), and `started` is counted from what's
    stored so the target is right straight away."""
    for table, columns in ADDED_COLUMNS.items():
        have = {row[1] for row in db.execute(f"pragma table_info({table})")}
        missing = [(name, kind) for name, kind in columns if name not in have]
        if not missing:
            continue
        with db:
            for name, kind in missing:
                db.execute(f"alter table {table} add column {name} {kind}")
            if table == "attempts" and any(name == "started" for name, _ in missing):
                db.execute(
                    "update attempts set started = (select count(*) from entries"
                    " where entries.user = attempts.user and status != 'PLANNING')"
                    " where user is not null"
                )


def user_agent(app_name: str, contact: str | None = None) -> str:
    """The app name Shikimori asks for, plus an optional way to reach the person running it."""
    return f"{app_name} (+{contact})" if contact else app_name


def _rows(user: int, kind: str, items: list[dict[str, Any]]) -> list[tuple]:
    """List entries as table rows; entries for removed titles or unknown statuses are skipped."""
    key = "anime" if kind == "ANIME" else "manga"
    out = []
    for e in items:
        title = e.get(key) or {}
        status = STATUS.get(e.get("status") or "")
        if not title.get("id") or not status:
            continue
        progress = e.get("episodes") if kind == "ANIME" else e.get("chapters")
        out.append(
            (
                user,
                kind,
                int(title["id"]),
                status,
                int(e.get("score") or 0) * 10,
                int(progress or 0),
                int(e.get("rewatches") or 0),
                _seconds(e.get("updated_at")),
                _seconds(e.get("created_at")),
            )
        )
    return out


def _seconds(stamp: str | None) -> int | None:
    if not stamp:
        return None
    try:
        return int(datetime.fromisoformat(stamp).timestamp())
    except ValueError:
        return None


def _retry_after(resp: httpx.Response, default: float) -> float:
    try:
        return max(1.0, float(resp.headers.get("Retry-After", default)))
    except ValueError:
        return default


def summary(db_path: str | Path, min_entries: int = 10) -> dict[str, Any]:
    """Counts for a collected dataset. Read-only, so it's safe while a run is writing, and it
    works on datasets collected before dates were kept."""
    db = sqlite3.connect(db_path)
    try:
        results = dict(db.execute("select result, count(*) from attempts group by result"))
        big = db.execute(
            "select count(*) from (select user from entries where status != 'PLANNING'"
            " group by user having count(*) >= ?)",
            (min_entries,),
        ).fetchone()[0]
        kinds = dict(db.execute("select kind, count(*) from entries group by kind"))
        titles = dict(db.execute("select kind, count(distinct mal_id) from entries group by kind"))
        out = {
            f"users who started {min_entries}+ titles": big,
            "attempts": results,
            "entries": kinds,
            "titles": titles,
        }
        has = {
            table: {row[1] for row in db.execute(f"pragma table_info({table})")}
            for table in ADDED_COLUMNS
        }
        dated = (
            db.execute("select count(*) from entries where created_at is not null").fetchone()[0]
            if "created_at" in has["entries"]
            else 0
        )
        undated = (
            db.execute("select count(*) from attempts where result = 'ok' and dated = 0")
            if "dated" in has["attempts"]
            else db.execute("select count(*) from attempts where result = 'ok'")
        ).fetchone()[0]
        out["entries with the date added"] = dated
        if undated:
            out["users to fetch again for dates"] = undated
        return out
    finally:
        db.close()


__all__ = ["Collector", "Progress", "Refused", "ShikimoriError", "summary", "user_agent"]
