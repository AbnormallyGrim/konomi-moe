"""Picks learned from other people's lists ("the crowd"), for anime.

The table (`engine/assets/crowd.bin`, written by the private lab's `konomi bench export`) holds
two title-to-title tables trained on 1.18M people's public anime lists, and nothing about any
of them:
- **liked:** "people who liked this title also liked…". A user's liked titles' rows are summed,
  and each series start takes the best score in its chain (a predicted season 2 counts for
  season 1). The best series starts are the crowd's picks.
- **signed:** the same, with disliked titles counting against. It nudges the final order.

Titles first aired from the table's "fresh year" on are newer than the lists it learned from,
so they're left to the preference model (`recommend` keeps slots for them). In a comparison on
198k held-out users, picks this way found 2.5× as many titles people went on to like as
today's candidate gathering, and ordering by preference + ½ the signed score ranked what they
enjoyed better too. Mirrors the engine's crowd.ts.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from konomi.models import ListEntry

# konomi-moe/lab/src/konomi/crowd.py → konomi-moe/engine/assets/crowd.bin
TABLE = Path(__file__).resolve().parents[3] / "engine" / "assets" / "crowd.bin"
MAGIC = b"KCRW"
VERSION = 1
MIN_LIKED = 3  # liked titles the table must know before its picks are trusted
CANDIDATES = 60  # crowd picks offered to ranking at least (filters may drop some)
PAGE = 20  # the list is built page by page: 15 crowd picks and 5 new releases each
ORDER_WEIGHT = 0.5  # × the standardised signed score, added to the preference score


@dataclass
class CrowdTable:
    """The decoded table. Positions index `ids`; `neighbours[p]` / `weights[p]` are title p's
    links (unused slots have weight 0)."""

    ids: np.ndarray
    roots: np.ndarray  # series start's AniList ID per title, −1 when it has none to show
    years: np.ndarray  # first aired (0: unknown)
    liked_row: np.ndarray  # bool: has a row in the liked table
    signed_known: np.ndarray  # bool: the signed table knows it
    fresh_year: int
    liked_neighbours: np.ndarray
    liked_weights: np.ndarray
    signed_neighbours: np.ndarray
    signed_weights: np.ndarray

    def __post_init__(self) -> None:
        self.position = {int(i): p for p, i in enumerate(self.ids)}


def parse(data: bytes) -> CrowdTable:
    """Decode the table file (layout: the private lab's `bench/export.py`)."""
    if data[:4] != MAGIC:
        raise ValueError("not a crowd table")
    version, n, k, fresh_year = struct.unpack_from("<4I", data, 4)
    if version != VERSION:
        raise ValueError(f"crowd table version {version}, expected {VERSION}")
    offset = 32

    def take(dtype: str, count: int) -> np.ndarray:
        nonlocal offset
        arr = np.frombuffer(data, dtype=dtype, count=count, offset=offset)
        offset += arr.nbytes
        offset += -offset % 4
        return arr

    ids = take("<i4", n).astype(np.int64)
    roots = take("<i4", n).astype(np.int64)
    years = take("<u2", n).astype(np.int64)
    flags = take("u1", n)
    tables = []
    for _ in range(2):
        scales = take("<f4", n).astype(np.float64)
        neighbours = take("<u2", n * k).astype(np.int64).reshape(n, k)
        q = take("<i2", n * k).astype(np.float64).reshape(n, k)
        tables.append((neighbours, q * scales[:, None] / 32767))
    return CrowdTable(
        ids=ids,
        roots=roots,
        years=years,
        liked_row=(flags & 1).astype(bool),
        signed_known=(flags & 2).astype(bool),
        fresh_year=int(fresh_year),
        liked_neighbours=tables[0][0],
        liked_weights=tables[0][1],
        signed_neighbours=tables[1][0],
        signed_weights=tables[1][1],
    )


_LOADED: dict[Path, CrowdTable] = {}


def load(path: str | Path | None = None) -> CrowdTable | None:
    """The table at `path` (default `TABLE`; cached), or None when there's no file."""
    path = Path(path if path is not None else TABLE)
    if path not in _LOADED:
        if not path.exists():
            return None
        _LOADED[path] = parse(path.read_bytes())
    return _LOADED[path]


def liked_and_disliked(entries: list[ListEntry]) -> tuple[list[int], list[int]]:
    """The scored titles at or above the user's average score (liked), and those at least one
    standard deviation, and a point out of 10, below it (disliked): how the table learned what
    people liked."""
    scored = [(e.media_id, e.score / 10) for e in entries if e.score > 0]
    if not scored:
        return [], []
    # Plain left-to-right sums, as the engine computes them, so both draw the same line.
    mean = sum(s for _, s in scored) / len(scored)
    spread = (sum((s - mean) ** 2 for _, s in scored) / len(scored)) ** 0.5
    liked = [i for i, s in scored if s >= mean]
    disliked = [i for i, s in scored if s <= mean - max(1.0, spread)]
    return liked, disliked


@dataclass
class CrowdPicks:
    """One user's crowd picks: series starts, best first, and the ordering nudge."""

    picks: list[tuple[int, float, int]]  # (series start's ID, its best score, best title's ID)
    order: dict[int, float]  # AniList ID → standardised signed score (titles the table knows)
    fresh_year: int
    because: dict[int, int]  # series start's ID → the liked title that pulled it up most


def candidates_for(limit: int) -> int:
    """Crowd picks to offer for a list of `limit` titles: three quarters of it, plus room for
    titles filters or the series rules drop."""
    return max(CANDIDATES, -(-limit * 3 // 4) + 20)


def picks(
    table: CrowdTable, entries: list[ListEntry], count: int = CANDIDATES
) -> CrowdPicks | None:
    """The crowd's view of a user's list, or None when the table knows too few of their liked
    titles to be trusted (then ranking works as before)."""
    liked, disliked = liked_and_disliked(entries)
    liked_pos = sorted(table.position[i] for i in liked if i in table.position)
    liked_pos = [p for p in liked_pos if table.liked_row[p]]
    if len(liked_pos) < MIN_LIKED:
        return None
    disliked_pos = sorted(table.position[i] for i in disliked if i in table.position)

    n = len(table.ids)
    score = np.zeros(n)
    for p in liked_pos:
        np.add.at(score, table.liked_neighbours[p], table.liked_weights[p])
    signed = np.zeros(n)
    for p in liked_pos:
        np.add.at(signed, table.signed_neighbours[p], table.signed_weights[p])
    for p in disliked_pos:
        np.add.at(signed, table.signed_neighbours[p], -table.signed_weights[p])

    known = np.flatnonzero(table.signed_known)
    values = [float(signed[p]) for p in known]
    mean = sum(values) / len(values) if values else 0.0
    sd = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5 if values else 0.0
    sd = sd or 1.0
    order = {int(table.ids[p]): (v - mean) / sd for p, v in zip(known, values, strict=True)}

    # Each series start takes the best score in its chain; new releases are left out.
    best: dict[int, tuple[float, int]] = {}
    pickable = table.liked_row & (table.roots >= 0) & (table.years < table.fresh_year)
    for p in np.flatnonzero(pickable):
        root, s = int(table.roots[p]), float(score[p])
        if root not in best or s > best[root][0]:
            best[root] = (s, int(table.ids[p]))
    ranked = sorted(best.items(), key=lambda kv: (-kv[1][0], kv[0]))
    on_list = {e.media_id for e in entries}
    chosen = [(r, s, t) for r, (s, t) in ranked if r not in on_list][:count]

    because: dict[int, int] = {}
    for root, _, title in chosen:
        target = table.position[title]
        top, strongest = None, 0.0
        for p in liked_pos:
            hit = table.liked_weights[p][table.liked_neighbours[p] == target]
            if len(hit) and hit.max() > strongest:
                top, strongest = int(table.ids[p]), float(hit.max())
        if top is not None:
            because[root] = top
    return CrowdPicks(chosen, order, table.fresh_year, because)


def encode(
    ids: list[int],
    roots: list[int],
    years: list[int],
    liked: np.ndarray,
    signed: np.ndarray,
    k: int,
    fresh_year: int,
    liked_known: list[bool] | None = None,
    signed_known: list[bool] | None = None,
) -> bytes:
    """A table file from dense title × title weights (rows: from, columns: to), each row cut
    to its `k` largest weights by size. For tests and the engine's fixtures; the real table is
    written by the private lab's `konomi bench export`, in this same layout."""
    n = len(ids)
    liked_known = [True] * n if liked_known is None else liked_known
    signed_known = [True] * n if signed_known is None else signed_known
    flags = np.array(liked_known, dtype=np.uint8) | (np.array(signed_known, dtype=np.uint8) << 1)
    out = bytearray(MAGIC + struct.pack("<7I", VERSION, n, k, fresh_year, 0, 0, 0))

    def put(arr: np.ndarray) -> None:
        out.extend(arr.tobytes())
        out.extend(b"\0" * (-len(out) % 4))

    put(np.array(ids, dtype="<i4"))
    put(np.array(roots, dtype="<i4"))
    put(np.array(years, dtype="<u2"))
    put(flags)
    for w in (np.asarray(liked, dtype=np.float64), np.asarray(signed, dtype=np.float64)):
        keep = np.argsort(-np.abs(w), axis=1, kind="stable")[:, :k]
        rows = np.arange(n)[:, None]
        vals = w[rows, keep]
        scales = np.abs(vals).max(axis=1).astype(np.float32)
        safe = np.where(scales > 0, scales.astype(np.float64), 1.0)[:, None]
        q = np.round(vals / safe * 32767).astype("<i2")
        neighbours = np.where(vals != 0, keep, 0).astype("<u2")
        put(scales.astype("<f4"))
        put(neighbours)
        put(np.where(vals != 0, q, 0).astype("<i2"))
    return bytes(out)
