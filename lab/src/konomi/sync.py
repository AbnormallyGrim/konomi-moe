"""Fetches data from AniList into the local cache, only as much as is needed."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from konomi.anilist import AniListClient
from konomi.anilist import queries as q
from konomi.anilist.parse import parse_list_chunk, parse_media
from konomi.models import Media, MediaType
from konomi.store import Store
from konomi.taste import examples

PER_CHUNK = 500
PAGE_SIZE = 50
MEDIA_MAX_AGE = 30 * 24 * 3600


@dataclass
class SyncResult:
    """What a list sync fetched."""

    entries: int
    candidates_fetched: int


def sync_list(client: AniListClient, store: Store, user: str, media_type: MediaType) -> SyncResult:
    """Sync a user's list, then cache details of titles recommended from ones they liked."""
    entries, media, recs = [], [], {}
    custom: dict[str, set[int]] = {}
    seen: set[int] = set()
    chunk_no = 1
    while True:
        data = client.query(
            q.USER_LIST,
            {"userName": user, "type": media_type.value, "chunk": chunk_no, "perChunk": PER_CHUNK},
        )
        chunk = parse_list_chunk(data)
        # A title on a custom list can also arrive in another chunk; keep the first.
        for e, m in zip(chunk.entries, chunk.media, strict=True):
            if e.media_id not in seen:
                seen.add(e.media_id)
                entries.append(e)
                media.append(m)
        recs.update(chunk.recommendations)
        for name, ids in chunk.custom_lists.items():
            custom.setdefault(name, set()).update(ids)
        if not chunk.has_next:
            break
        chunk_no += 1

    store.upsert_media(media)
    store.replace_list(user, media_type, entries)
    store.replace_recommendations(recs)
    store.replace_custom_lists(user, media_type, custom)

    by_id = {m.id: m for m in media}
    liked = {ex.media.id for ex in examples(entries, by_id) if ex.liked}
    wanted = {to_id for from_id, links in recs.items() if from_id in liked for to_id, _ in links}
    fetched = fetch_media(client, store, wanted - by_id.keys())
    return SyncResult(entries=len(entries), candidates_fetched=fetched)


def fetch_media(
    client: AniListClient, store: Store, ids: set[int], max_age: float = MEDIA_MAX_AGE
) -> int:
    """Fetch details for IDs missing or older than `max_age` seconds in the cache; returns how
    many."""
    todo = store.missing_or_stale(ids, max_age)
    for i in range(0, len(todo), PAGE_SIZE):
        batch = todo[i : i + PAGE_SIZE]
        data = client.query(q.MEDIA_BY_IDS, {"ids": batch, "page": 1, "perPage": PAGE_SIZE})
        store.upsert_media(parse_media(n) for n in data["Page"]["media"])
    return len(todo)


def discover(
    client: AniListClient,
    store: Store,
    media_type: MediaType,
    variables: dict[str, Any],
    per_page: int = PAGE_SIZE,
    pages: int = 1,
) -> list[Media]:
    """Top-scored titles matching AniList search `variables` (see `queries.DISCOVER`), cached.
    List filters such as `tagIn` and `genreIn` require all their values."""
    found: list[Media] = []
    for page in range(1, pages + 1):
        data = client.query(
            q.DISCOVER,
            {
                "type": media_type.value,
                "page": page,
                "perPage": per_page,
                **{k: v for k, v in variables.items() if v},
            },
        )
        batch = [parse_media(n) for n in data["Page"]["media"]]
        found += batch
        if len(batch) < per_page:
            break
    store.upsert_media(found)
    return found
