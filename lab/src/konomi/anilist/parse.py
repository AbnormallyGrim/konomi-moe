"""Turns AniList responses into app types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from konomi.models import ListEntry, ListStatus, Media, MediaType, Relation, Tag


@dataclass
class ListChunk:
    """One chunk of a user's list, with titles and their recommendations."""

    entries: list[ListEntry] = field(default_factory=list)
    media: list[Media] = field(default_factory=list)
    recommendations: dict[int, list[tuple[int, int]]] = field(default_factory=dict)
    custom_lists: dict[str, set[int]] = field(default_factory=dict)
    has_next: bool = False


def parse_media(node: dict[str, Any]) -> Media:
    """Parse a `MediaFields` node."""
    title = node.get("title") or {}
    edges = (node.get("relations") or {}).get("edges") or []
    return Media(
        id=node["id"],
        type=MediaType(node["type"]),
        title=title.get("english") or title.get("romaji") or f"#{node['id']}",
        format=node.get("format"),
        status=node.get("status"),
        is_adult=bool(node.get("isAdult")),
        year=(node.get("startDate") or {}).get("year"),
        episodes=node.get("episodes"),
        chapters=node.get("chapters"),
        average_score=node.get("averageScore"),
        mean_score=node.get("meanScore"),
        popularity=node.get("popularity"),
        favourites=node.get("favourites"),
        score_distribution=sorted(
            (d["score"], d["amount"])
            for d in ((node.get("stats") or {}).get("scoreDistribution") or [])
        ),
        site_url=node.get("siteUrl"),
        cover_url=(node.get("coverImage") or {}).get("large"),
        genres=list(node.get("genres") or []),
        tags=[
            Tag(t["name"], t.get("rank") or 0, bool(t.get("isMediaSpoiler")))
            for t in node.get("tags") or []
        ],
        studios=[s["name"] for s in (node.get("studios") or {}).get("nodes") or []],
        relations=[
            Relation(
                e["relationType"],
                e["node"]["id"],
                MediaType(e["node"]["type"]) if e["node"].get("type") else None,
            )
            for e in edges
            if e.get("node")
        ],
    )


def parse_recommendations(node: dict[str, Any]) -> list[tuple[int, int]]:
    """Parse `(recommended id, rating)` pairs, skipping removed titles."""
    nodes = (node.get("recommendations") or {}).get("nodes") or []
    return [
        (n["mediaRecommendation"]["id"], n.get("rating") or 0)
        for n in nodes
        if n.get("mediaRecommendation")
    ]


def parse_list_chunk(data: dict[str, Any]) -> ListChunk:
    """Parse a `MediaListCollection` response; custom lists can repeat titles."""
    collection = data.get("MediaListCollection") or {}
    chunk = ListChunk(has_next=bool(collection.get("hasNextChunk")))
    seen: set[int] = set()
    for lst in collection.get("lists") or []:
        entries = lst.get("entries") or []
        if lst.get("isCustomList"):
            name = lst.get("name") or ""
            chunk.custom_lists.setdefault(name, set()).update(e["media"]["id"] for e in entries)
        for e in entries:
            node = e["media"]
            if node["id"] in seen:
                continue
            seen.add(node["id"])
            chunk.entries.append(
                ListEntry(
                    media_id=node["id"],
                    status=ListStatus(e["status"]),
                    score=int(e.get("score") or 0),
                    progress=e.get("progress") or 0,
                    repeat=e.get("repeat") or 0,
                    updated_at=e.get("updatedAt") or 0,
                )
            )
            chunk.media.append(parse_media(node))
            chunk.recommendations[node["id"]] = parse_recommendations(node)
    return chunk
