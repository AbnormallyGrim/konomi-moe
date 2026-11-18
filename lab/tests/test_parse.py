from konomi.anilist.parse import parse_list_chunk
from konomi.models import ListStatus, MediaType


def media_node(id, **kw):
    return {
        "id": id,
        "type": "ANIME",
        "format": "TV",
        "isAdult": False,
        "title": {"romaji": f"Tesuto {id}", "english": kw.get("english")},
        "episodes": 12,
        "startDate": {"year": 2015},
        "averageScore": 75,
        "genres": ["Drama"],
        "tags": [{"name": "Found Family", "rank": 90, "isMediaSpoiler": False}],
        "studios": {"nodes": [{"name": "Studio Example"}]},
        "relations": {"edges": [{"relationType": "PREQUEL", "node": {"id": 99, "type": "ANIME"}}]},
        "recommendations": {
            "nodes": [
                {"rating": 12, "mediaRecommendation": {"id": 7}},
                {"rating": 3, "mediaRecommendation": None},
            ]
        },
    }


def test_parses_entries_and_dedupes_custom_lists():
    entry = {"status": "COMPLETED", "score": 85, "progress": 12, "repeat": 1, "updatedAt": 5}
    data = {
        "MediaListCollection": {
            "hasNextChunk": True,
            "lists": [
                {"entries": [{**entry, "media": media_node(1, english="Example One")}]},
                {"entries": [{**entry, "media": media_node(1)}]},
            ],
        }
    }
    chunk = parse_list_chunk(data)
    assert chunk.has_next
    assert len(chunk.entries) == 1
    e, m = chunk.entries[0], chunk.media[0]
    assert (e.status, e.score, e.repeat) == (ListStatus.COMPLETED, 85, 1)
    assert m.title == "Example One"
    assert m.type is MediaType.ANIME
    assert m.studios == ["Studio Example"]
    assert m.prequel_ids() == [99]
    assert chunk.recommendations[1] == [(7, 12)]


def test_parses_ratings_and_distribution_and_caches_them(store):
    from konomi.anilist.parse import parse_media

    node = media_node(5)
    node.update(meanScore=78, popularity=12345, favourites=67)
    node["stats"] = {"scoreDistribution": [{"score": 20, "amount": 3}, {"score": 10, "amount": 1}]}
    m = parse_media(node)
    assert (m.average_score, m.mean_score, m.favourites) == (75, 78, 67)
    assert m.score_distribution == [(10, 1), (20, 3)]
    store.upsert_media([m])
    assert store.get_media([5])[5] == m  # tuples survive the JSON round trip

    assert parse_media(media_node(6)).score_distribution == []  # fetched, but none
