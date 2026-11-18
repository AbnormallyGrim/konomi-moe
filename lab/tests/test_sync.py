import json

import httpx

from konomi.anilist import AniListClient
from konomi.models import MediaType
from konomi.sync import sync_list
from tests.test_parse import media_node


def entry(id, status="COMPLETED", score=80):
    node = media_node(id)
    node["recommendations"] = {"nodes": [{"rating": 5, "mediaRecommendation": {"id": id + 100}}]}
    return {"status": status, "score": score, "progress": 1, "repeat": 0, "media": node}


def test_sync_reads_all_chunks_and_fetches_only_liked_recommendations(store):
    chunks = {
        1: [entry(1), entry(2)],
        2: [entry(3, "DROPPED", 0)],
    }
    requests = []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body["variables"])
        if "MediaListCollection" in body["query"]:
            n = body["variables"]["chunk"]
            data = {"hasNextChunk": n < 2, "lists": [{"entries": chunks[n]}]}
            return httpx.Response(200, json={"data": {"MediaListCollection": data}})
        ids = body["variables"]["ids"]
        media = [media_node(i) for i in ids]
        return httpx.Response(200, json={"data": {"Page": {"media": media}}})

    client = AniListClient(
        requests_per_minute=60, transport=httpx.MockTransport(handler), sleep=lambda s: None
    )
    result = sync_list(client, store, "someone", MediaType.ANIME)

    assert result.entries == 3
    assert sorted(requests[-1]["ids"]) == [101, 102]  # not 103: title 3 was dropped
    assert result.candidates_fetched == 2
    assert set(store.get_media([101, 102, 103])) == {101, 102}

    sync_list(client, store, "someone", MediaType.ANIME)
    assert "ids" not in requests[-1]  # cached candidates are not fetched again


def test_sync_keeps_a_title_once_when_it_repeats_in_another_chunk(store):
    chunks = {
        1: [entry(1)],
        2: [entry(2), entry(1)],  # title 1 again, as from a custom list in a later chunk
    }

    def handler(request):
        body = json.loads(request.content)
        if "MediaListCollection" in body["query"]:
            n = body["variables"]["chunk"]
            data = {"hasNextChunk": n < 2, "lists": [{"entries": chunks[n]}]}
            return httpx.Response(200, json={"data": {"MediaListCollection": data}})
        return httpx.Response(200, json={"data": {"Page": {"media": []}}})

    client = AniListClient(
        requests_per_minute=60, transport=httpx.MockTransport(handler), sleep=lambda s: None
    )
    assert sync_list(client, store, "someone", MediaType.ANIME).entries == 2
    assert sorted(e.media_id for e in store.list_entries("someone", MediaType.ANIME)) == [1, 2]
