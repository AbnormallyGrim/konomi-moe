"""A made-up AniList world and the lab's results on it, for the engine's parity test.

`make_engine_fixtures.py` writes `world()` and `expected(world())` to the engine's fixtures;
`tests/test_engine_fixtures.py` checks that file still matches what the lab produces.
"""

from __future__ import annotations

import json
import random
from dataclasses import asdict
from typing import Any

from konomi import exclusions
from konomi.filters import Filters
from konomi.models import ListEntry, ListStatus, Media, MediaType, Relation, Tag
from konomi.pipeline import RunOptions, run
from konomi.store import Store

USER = "parity-user"
GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Mystery", "Romance",
          "Sci-Fi", "Slice of Life", "Supernatural"]  # fmt: skip
TAGS = {
    "Iyashikei": "Theme-Slice of Life",
    "Cute Girls Doing Cute Things": "Theme-Slice of Life",
    "Food": "Theme-Slice of Life",
    "Heterosexual": "Theme-Romance",
    "Love Triangle": "Theme-Romance",
    "Male Protagonist": "Cast-Main Cast",
    "Female Protagonist": "Cast-Main Cast",
    "School": "Setting-Scene",
    "Rural": "Setting-Scene",
    "Space": "Setting-Universe",
    "Robots": "Theme-Sci-Fi-Mecha",
    "Time Manipulation": "Theme-Sci-Fi",
    "Swordplay": "Theme-Action",
    "Magic": "Theme-Fantasy",
    "Demons": "Theme-Fantasy",
    "Detective": "Theme-Other",
    "Tragedy": "Theme-Drama",
    "Coming of Age": "Theme-Drama",
    "Gore": "Theme-Other",
    "Isekai": "Theme-Fantasy",
    "Travel": "Theme-Other",
    "Parody": "Theme-Comedy",
}
STUDIOS = ["Studio Alpha", "Studio Beta", "Studio Gamma", "Studio Delta", "Studio Epsilon"]
ANIME_FORMATS = ["TV", "TV", "TV", "MOVIE", "OVA", "ONA", "TV_SHORT"]
MANGA_FORMATS = ["MANGA", "MANGA", "MANGA", "ONE_SHOT", "NOVEL"]
ANIME_LISTED = range(1, 121)
ANIME_CANDIDATES = range(121, 241)
MANGA_LISTED = range(1001, 1061)
MANGA_CANDIDATES = range(1061, 1121)

# Scenarios the engine must rank the same way; `filters` uses the engine's field names.
SCENARIOS: list[dict[str, Any]] = [
    {"name": "anime, defaults", "type": "ANIME", "filters": {}},
    {"name": "manga, defaults", "type": "MANGA", "filters": {}},
    {"name": "anime, adult titles allowed", "type": "ANIME", "includeAdult": True, "filters": {}},
    {
        "name": "anime, main theme Slice of Life, unfinished list titles, no seen adaptations",
        "type": "ANIME",
        "filters": {
            "genres": ["Slice of Life"],
            "mainTheme": True,
            "hideListed": False,
            "hideSeenAdaptations": True,
        },
    },
    {
        "name": "anime, tag, formats, years and finished only",
        "type": "ANIME",
        "filters": {
            "tags": ["Iyashikei"],
            "formats": ["TV", "MOVIE"],
            "yearFrom": 2000,
            "finishedOnly": True,
        },
    },
    {
        "name": "manga, no seen adaptations",
        "type": "MANGA",
        "filters": {"hideSeenAdaptations": True},
    },
]
LIMIT = 30


def world(seed: int = 7) -> dict[str, Any]:
    """Titles, a user's two lists with hidden tastes, links, custom lists and exclusions."""
    rng = random.Random(seed)
    taste = {t: rng.uniform(-1.5, 1.5) for t in TAGS} | {g: rng.uniform(-1, 1) for g in GENRES}
    media: dict[int, Media] = {}
    for ids, kind in (
        (range(1, 241), MediaType.ANIME),
        (range(1001, 1121), MediaType.MANGA),
    ):
        for i in ids:
            media[i] = _title(rng, i, kind)

    # Sequel chains among candidates and list titles, and anime ↔ manga adaptations.
    for a in [*range(1, 120, 9), *range(121, 240, 7), *range(1061, 1120, 8)]:
        _link(media, a, a + 1, "SEQUEL", "PREQUEL")
    for n, a in enumerate(range(1, 121, 4)):
        m = 1001 + (n * 3) % 120
        _link(media, a, m, "ADAPTATION", "SOURCE")
    for n, m in enumerate(range(1061, 1121, 6)):  # manga candidates of listed anime
        _link(media, m, 3 + n * 11, "ADAPTATION", "SOURCE")
    for n, a in enumerate(range(122, 241, 6)):  # anime candidates of listed manga
        _link(media, a, 1002 + n * 3, "SOURCE", "ADAPTATION")
    # Same-type versions of listed titles: remakes, light novels of manga, a recap film.
    for a, b in ((5, 130), (17, 150), (29, 170), (41, 190)):
        _link(media, a, b, "ALTERNATIVE", "ALTERNATIVE")
    for a, b in ((1003, 1070), (1015, 1090), (1027, 1110)):
        _link(media, a, b, "SOURCE", "ADAPTATION")
    _link(media, 200, 53, "SUMMARY", "COMPILATION")

    def score(m: Media) -> float:
        tags = sum(taste[t.name] * t.rank / 100 for t in m.tags)
        return tags + sum(taste[g] for g in m.genres) + rng.gauss(0, 0.6)

    lists = {
        "ANIME": _list(rng, [media[i] for i in rng.sample(ANIME_LISTED, 95)], score),
        "MANGA": _list(rng, [media[i] for i in rng.sample(MANGA_LISTED, 45)], score),
    }
    links: dict[int, list[tuple[int, int]]] = {}
    for listed, pool in ((ANIME_LISTED, ANIME_CANDIDATES), (MANGA_LISTED, MANGA_CANDIDATES)):
        for i in listed:
            picks = rng.sample(pool, 4) + rng.sample(listed, 1)
            links[i] = [(p, rng.choice([0, 1, 3, 8, 20, 45])) for p in picks]

    # Make the same-type versions above real candidates, so hiding them is tested.
    for listed, extra in (
        (ANIME_LISTED, (130, 150, 170, 190, 200)),
        (MANGA_LISTED, (1070, 1090, 1110)),
    ):
        for i in list(listed)[:30]:
            links[i] = links[i] + [(v, 45) for v in extra]

    anime_ids = {e.media_id for e in lists["ANIME"]}
    return {
        "user": USER,
        "media": [_camel(m) for m in media.values()],
        "lists": {t: [_entry(e) for e in es] for t, es in lists.items()},
        "links": {str(k): [list(v) for v in vs] for k, vs in links.items()},
        "customLists": {
            "ANIME": {"Rewatch later": sorted(rng.sample(sorted(anime_ids), 3))},
            "MANGA": {"Reread": sorted(rng.sample(sorted(e.media_id for e in lists["MANGA"]), 2))},
        },
        "exclusions": {
            "titles": [128, 1065],  # 128 has a sequel, which must go too
            "labels": ["tag:Gore", "genre:Supernatural"],
            "customLists": {"ANIME": ["Rewatch later"], "MANGA": []},
            # Dismissed candidates, trained on as dislikes.
            "notInterested": [*ANIME_CANDIDATES[:3], *MANGA_CANDIDATES[:2]],
        },
        "tagCategories": TAGS,
    }


def expected(w: dict[str, Any]) -> dict[str, Any]:
    """The lab's offline run of every scenario on a world."""
    store = load(w)
    out = []
    for s in SCENARIOS:
        kind = MediaType(s["type"])
        options = RunOptions(
            limit=LIMIT,
            discover=False,
            include_adult=s.get("includeAdult", False),
            filters=_filters(s["filters"]),
        )
        result = run(store, None, w["user"], kind, options)
        p = result.profile
        out.append(
            {
                "name": s["name"],
                "weights": {k: float(v) for k, v in p.model.weights()},
                "communityWeight": p.community_weight,
                "likedIds": sorted(p.liked_ids),
                "warnings": result.warnings,
                "recommendations": [
                    {
                        "id": r.media.id,
                        "score": r.score,
                        "reasons": [f"{x.kind}:{x.value}" for x in r.reasons],
                        "sources": r.sources,
                    }
                    for r in result.recommendations
                ],
            }
        )
    store.close()
    return {"limit": LIMIT, "scenarios": SCENARIOS, "results": out}


def load(w: dict[str, Any]) -> Store:
    """An in-memory lab store holding a world."""
    store = Store(":memory:")
    store.upsert_media(_media(m) for m in w["media"])
    for t, entries in w["lists"].items():
        store.replace_list(w["user"], MediaType(t), [_list_entry(e) for e in entries])
        store.replace_custom_lists(
            w["user"], MediaType(t), {k: set(v) for k, v in w["customLists"][t].items()}
        )
    store.replace_recommendations({int(k): [tuple(v) for v in vs] for k, vs in w["links"].items()})
    ex = w["exclusions"]
    store.set_exclusions(w["user"], exclusions.TITLE, [str(i) for i in ex["titles"]])
    store.set_exclusions(w["user"], exclusions.LABEL, ex["labels"])
    store.set_exclusions(
        w["user"], exclusions.NOT_INTERESTED, [str(i) for i in ex["notInterested"]]
    )
    for t, names in ex["customLists"].items():
        store.set_exclusions(w["user"], exclusions.CUSTOM_LIST, names, MediaType(t))
    store.set_meta("tag_categories", json.dumps({"at": 0, "categories": w["tagCategories"]}))
    return store


def _title(rng: random.Random, i: int, kind: MediaType) -> Media:
    anime = kind is MediaType.ANIME
    tags = rng.sample(sorted(TAGS), rng.randint(2, 6))
    votes = [rng.randint(0, 400) for _ in range(10)]
    return Media(
        id=i,
        type=kind,
        title=f"Parity {'Show' if anime else 'Book'} {i}",
        format=rng.choice(ANIME_FORMATS if anime else MANGA_FORMATS),
        status=rng.choice(["FINISHED"] * 5 + ["RELEASING", "HIATUS"]),
        is_adult=rng.random() < 0.1,
        year=rng.randint(1995, 2025) if rng.random() > 0.05 else None,
        episodes=rng.choice([1, 12, 13, 24, 26, 50]) if anime else None,
        chapters=None if anime else rng.choice([None, 1, 20, 60, 150]),
        average_score=rng.randint(45, 92) if rng.random() > 0.1 else None,
        mean_score=rng.randint(45, 92),
        popularity=rng.randint(100, 500_000),
        favourites=rng.randint(0, 20_000),
        score_distribution=[(10 * (n + 1), v) for n, v in enumerate(votes)],
        site_url=f"https://anilist.co/{kind.value.lower()}/{i}",
        cover_url=None,
        genres=rng.sample(GENRES, rng.randint(1, 3)),
        tags=[Tag(t, rng.randint(20, 100), rng.random() < 0.1) for t in tags],
        studios=rng.sample(STUDIOS, 1) if anime else [],
    )


def _link(media: dict[int, Media], a: int, b: int, forward: str, back: str) -> None:
    media[a].relations.append(Relation(forward, b, media[b].type))
    media[b].relations.append(Relation(back, a, media[a].type))


def _list(rng: random.Random, titles: list[Media], score) -> list[ListEntry]:
    """Entries whose scores follow the hidden taste, with every status represented."""
    out = []
    for m in titles:
        s = score(m)
        length = m.episodes or m.chapters or 0
        if s < -1.2 and rng.random() < 0.6:
            status, progress = ListStatus.DROPPED, rng.randint(0, max(length // 3, 1))
        else:
            status = rng.choice(
                [ListStatus.COMPLETED] * 6
                + [ListStatus.CURRENT, ListStatus.PAUSED, ListStatus.PLANNING, ListStatus.REPEATING]
            )
            progress = length if status is ListStatus.COMPLETED else rng.randint(0, length)
        scored = status is not ListStatus.PLANNING and rng.random() > 0.2
        points = max(10, min(100, round(65 + 12 * s))) if scored else 0
        repeat = rng.choice([0, 0, 0, 1, 2]) if status is ListStatus.COMPLETED else 0
        out.append(ListEntry(m.id, status, points, progress, repeat, rng.randint(1, 10**9)))
    return out


def _filters(f: dict[str, Any]) -> Filters:
    return Filters(
        genres=tuple(f.get("genres", ())),
        tags=tuple(f.get("tags", ())),
        main_theme=f.get("mainTheme", False),
        formats=tuple(f.get("formats", ())),
        year_from=f.get("yearFrom"),
        year_to=f.get("yearTo"),
        finished_only=f.get("finishedOnly", False),
        hide_listed=f.get("hideListed", True),
        hide_seen_adaptations=f.get("hideSeenAdaptations", False),
    )


def _camel(m: Media) -> dict[str, Any]:
    d = asdict(m)
    return {
        "id": m.id,
        "type": m.type.value,
        "title": m.title,
        "format": m.format,
        "status": m.status,
        "isAdult": m.is_adult,
        "year": m.year,
        "episodes": m.episodes,
        "chapters": m.chapters,
        "averageScore": m.average_score,
        "meanScore": m.mean_score,
        "popularity": m.popularity,
        "favourites": m.favourites,
        "scoreDistribution": [list(p) for p in m.score_distribution or []],
        "siteUrl": m.site_url,
        "coverUrl": m.cover_url,
        "genres": m.genres,
        "tags": d["tags"],
        "studios": m.studios,
        "relations": [
            {"relationType": r.relation_type, "mediaId": r.media_id, "mediaType": r.media_type}
            for r in m.relations
        ],
    }


def _media(d: dict[str, Any]) -> Media:
    return Media(
        id=d["id"],
        type=MediaType(d["type"]),
        title=d["title"],
        format=d["format"],
        status=d["status"],
        is_adult=d["isAdult"],
        year=d["year"],
        episodes=d["episodes"],
        chapters=d["chapters"],
        average_score=d["averageScore"],
        mean_score=d["meanScore"],
        popularity=d["popularity"],
        favourites=d["favourites"],
        score_distribution=[tuple(p) for p in d["scoreDistribution"]],
        site_url=d["siteUrl"],
        cover_url=d["coverUrl"],
        genres=d["genres"],
        tags=[Tag(**t) for t in d["tags"]],
        studios=d["studios"],
        relations=[
            Relation(r["relationType"], r["mediaId"], MediaType(r["mediaType"]))
            for r in d["relations"]
        ],
    )


def _entry(e: ListEntry) -> dict[str, Any]:
    return {
        "mediaId": e.media_id,
        "status": e.status.value,
        "score": e.score,
        "progress": e.progress,
        "repeat": e.repeat,
        "updatedAt": e.updated_at,
    }


def _list_entry(d: dict[str, Any]) -> ListEntry:
    return ListEntry(
        d["mediaId"], ListStatus(d["status"]), d["score"], d["progress"], d["repeat"],
        d["updatedAt"],
    )  # fmt: skip
