import json

import httpx

from konomi.anilist import AniListClient
from konomi.filters import Filters
from konomi.models import MediaType
from konomi.pipeline import RunOptions, run
from tests.test_parse import media_node
from tests.test_recommend import seed


def test_filtered_run_searches_per_tag_and_by_filters(store):
    entries = seed(store)
    store.replace_list("someone", MediaType.ANIME, entries)
    searches = []

    def handler(request):
        body = json.loads(request.content)
        if "MediaTagCollection" in body["query"]:
            tags = [{"name": "Heterosexual", "category": "Theme-Romance"},
                    {"name": "Swordplay", "category": "Theme-Action"}]  # fmt: skip
            return httpx.Response(200, json={"data": {"MediaTagCollection": tags}})
        v = body["variables"]
        searches.append(v)
        romance = media_node(500 + len(searches))
        romance["relations"] = {"edges": []}
        romance["genres"] = ["Romance", "Slice of Life"]
        romance["tags"] = [{"name": "Heterosexual", "rank": 90, "isMediaSpoiler": False},
                           {"name": "Iyashikei", "rank": 80, "isMediaSpoiler": False}]  # fmt: skip
        action = media_node(600 + len(searches))
        action["relations"] = {"edges": []}
        action["genres"] = ["Action", "Romance"]
        action["tags"] = [{"name": "Heterosexual", "rank": 61, "isMediaSpoiler": False},
                          {"name": "Swordplay", "rank": 90, "isMediaSpoiler": False}]  # fmt: skip
        return httpx.Response(200, json={"data": {"Page": {"media": [romance, action]}}})

    client = AniListClient(transport=httpx.MockTransport(handler), sleep=lambda s: None)
    filters = Filters(genres=("Romance",), main_theme=True)
    result = run(store, client, "someone", MediaType.ANIME, RunOptions(filters=filters))

    tag_searches = [v for v in searches if v.get("perPage") == 30]
    assert len(tag_searches) >= 2  # one per liked tag, since tag_in needs all its tags
    assert all(len(v["tagIn"]) == 1 and v["genreIn"] == ["Romance"] for v in tag_searches)
    filter_searches = [v for v in searches if v.get("perPage") == 50 and "ids" not in v]
    assert [v["page"] for v in filter_searches] == [1]  # a short page ends the search
    ids = {r.media.id for r in result.recommendations}
    assert ids and all(500 < i < 600 for i in ids)  # the action title isn't romance-main


def test_titles_cached_without_distribution_are_refetched(store):
    from konomi.pipeline import _fill_details
    from konomi.recommend import Recommendation
    from tests.conftest import make_media

    old = make_media(7, cover_url="https://example.invalid/c.jpg")  # distribution never fetched
    new = make_media(8, cover_url="https://example.invalid/c.jpg", score_distribution=[])
    store.upsert_media([old, new])
    asked = []

    def handler(request):
        ids = json.loads(request.content)["variables"]["ids"]
        asked.append(ids)
        node = media_node(7)
        node["stats"] = {"scoreDistribution": [{"score": 90, "amount": 4}]}
        return httpx.Response(200, json={"data": {"Page": {"media": [node]}}})

    client = AniListClient(transport=httpx.MockTransport(handler), sleep=lambda s: None)
    recs = _fill_details(client, store, [Recommendation(old, 1.0), Recommendation(new, 0.5)], [])
    assert asked == [[7]]
    assert recs[0].media.score_distribution == [(90, 4)]
