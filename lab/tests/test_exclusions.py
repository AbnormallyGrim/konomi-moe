import json

import httpx

from konomi import exclusions as ex
from konomi.anilist import AniListClient
from konomi.anilist.parse import parse_list_chunk
from konomi.models import ListEntry, ListStatus, MediaType, Relation
from konomi.recommend import build_profile, recommend
from tests.conftest import make_media
from tests.test_parse import media_node
from tests.test_recommend import seed


def season(id, prequel=None, sequel=None, tags=("Iyashikei",), **kw):
    rel = []
    if prequel:
        rel.append(Relation("PREQUEL", prequel, MediaType.ANIME))
    if sequel:
        rel.append(Relation("SEQUEL", sequel, MediaType.ANIME))
    return make_media(id, list(tags), ["Slice of Life"], relations=rel, **kw)


def fake_client(media_by_id):
    """Answers MEDIA_BY_IDS from `media_by_id`; records requested IDs."""
    asked = []

    def handler(request):
        ids = json.loads(request.content)["variables"]["ids"]
        asked.append(sorted(ids))
        nodes = [media_by_id[i] for i in ids if i in media_by_id]
        return httpx.Response(200, json={"data": {"Page": {"media": nodes}}})

    client = AniListClient(
        requests_per_minute=60, transport=httpx.MockTransport(handler), sleep=lambda s: None
    )
    return client, asked


def node_with_sequel(id, sequel=None):
    n = media_node(id)
    n["relations"] = {
        "edges": [{"relationType": "SEQUEL", "node": {"id": sequel, "type": "ANIME"}}]
        if sequel
        else []
    }
    return n


def test_parses_custom_list_membership():
    entry = {"status": "PLANNING", "score": 0, "progress": 0, "repeat": 0}
    data = {
        "MediaListCollection": {
            "lists": [
                {
                    "name": "Planning",
                    "isCustomList": False,
                    "entries": [
                        {**entry, "media": media_node(1)},
                        {**entry, "media": media_node(2)},
                    ],
                },
                {
                    "name": "Example",
                    "isCustomList": True,
                    "entries": [{**entry, "media": media_node(2)}],
                },
            ]
        }
    }
    chunk = parse_list_chunk(data)
    assert chunk.custom_lists == {"Example": {2}}
    assert [e.media_id for e in chunk.entries] == [1, 2]


def test_store_round_trips(store):
    store.replace_custom_lists("Someone", MediaType.MANGA, {"Example": {1, 2}})
    assert store.custom_lists("someone", MediaType.MANGA) == {"Example": {1, 2}}
    assert store.custom_lists("someone", MediaType.ANIME) == {}
    store.set_exclusions("someone", ex.CUSTOM_LIST, ["Example"], MediaType.MANGA)
    assert store.exclusions("someone", ex.CUSTOM_LIST, MediaType.MANGA) == {"Example"}
    assert store.exclusions("someone", ex.CUSTOM_LIST, MediaType.ANIME) == set()


def test_sequel_closure_fetches_uncached_links(store):
    store.upsert_media([season(40, sequel=41)])
    client, asked = fake_client({41: node_with_sequel(41, 42), 42: node_with_sequel(42)})
    assert ex.sequel_closure(store, {40}, client) == {40, 41, 42}
    assert asked == [[41], [42]]
    assert ex.sequel_closure(store, {40}) == {40, 41, 42}  # now cached


def test_blocks_by_prequel_chain_and_label(store):
    store.upsert_media([season(40, sequel=41), season(41, prequel=40, sequel=42)])
    excl = ex.Exclusions(media_ids={40}, labels={"tag:Gore"})
    assert excl.blocks(season(42, prequel=41), store)
    assert excl.blocks(season(50, tags=["Gore"]), store)
    assert not excl.blocks(season(51), store)


def test_recommend_skips_excluded_titles_sequels_labels_and_custom_lists(store):
    entries = seed(store)
    store.upsert_media(
        [
            season(40, title="Excluded S1", sequel=41),
            season(41, title="Excluded S2", prequel=40),
            season(60, title="Gory Pick", tags=["Iyashikei", "Gore"]),
            season(70, title="Listed Pick"),
            season(80, title="Kept Pick"),
        ]
    )
    store.replace_recommendations({1: [(40, 5), (41, 5), (60, 5), (70, 5), (80, 5)]})
    entries.append(ListEntry(70, ListStatus.PLANNING))
    store.replace_list("someone", MediaType.ANIME, entries)
    store.replace_custom_lists("someone", MediaType.ANIME, {"Example": {70}})
    store.set_exclusions("someone", ex.TITLE, ["40"])
    store.set_exclusions("someone", ex.LABEL, ["tag:Gore"])
    store.set_exclusions("someone", ex.CUSTOM_LIST, ["Example"], MediaType.ANIME)

    profile = build_profile(store, entries)
    excl = ex.load(store, "someone", MediaType.ANIME)
    titles = {r.media.title for r in recommend(store, profile, exclusions=excl)}
    assert "Kept Pick" in titles
    assert not titles & {"Excluded S1", "Excluded S2", "Gory Pick", "Listed Pick"}
