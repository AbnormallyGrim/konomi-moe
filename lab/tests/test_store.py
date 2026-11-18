from konomi.models import ListEntry, ListStatus, MediaType, Relation
from tests.conftest import make_media


def test_media_round_trip(store):
    m = make_media(1, ["Iyashikei"], ["Slice of Life"], relations=[Relation("PREQUEL", 2, None)])
    store.upsert_media([m])
    assert store.get_media([1, 2]) == {1: m}
    assert store.missing_or_stale([1, 2], max_age_seconds=3600) == [2]
    assert store.missing_or_stale([1], max_age_seconds=-1) == [1]


def test_replace_list_drops_removed_titles(store):
    store.replace_list("Someone", MediaType.ANIME, [ListEntry(1, ListStatus.COMPLETED, 80)])
    store.replace_list("someone", MediaType.ANIME, [ListEntry(2, ListStatus.DROPPED)])
    assert [e.media_id for e in store.list_entries("SOMEONE", MediaType.ANIME)] == [2]
    assert store.list_entries("someone", MediaType.MANGA) == []
    assert store.last_synced("someone", MediaType.ANIME) is not None


def test_replace_recommendations(store):
    store.replace_recommendations({1: [(5, 10), (6, 2)]})
    store.replace_recommendations({1: [(7, 4)]})
    assert store.recommendations_from([1]) == [(1, 7, 4)]
