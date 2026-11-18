import pytest

from konomi.models import ListEntry, ListStatus, Relation
from konomi.recommend import build_profile, discovery_tags, recommend
from tests.conftest import make_media


def seed(store):
    entries = []
    for i in range(1, 7):
        store.upsert_media([make_media(i, ["Iyashikei", "Found Family"], ["Slice of Life"])])
        entries.append(ListEntry(i, ListStatus.COMPLETED, 90))
    for i in range(7, 13):
        store.upsert_media([make_media(i, ["Harem", "Isekai"], ["Fantasy"])])
        entries.append(ListEntry(i, ListStatus.DROPPED, progress=1))
    return entries


def test_ranks_fitting_candidates_first_and_filters(store):
    entries = seed(store)
    store.upsert_media(
        [
            make_media(20, ["Iyashikei"], ["Slice of Life"], title="Cosy Pick"),
            make_media(21, ["Harem"], ["Fantasy"], title="Harem Pick"),
            make_media(22, ["Iyashikei"], ["Slice of Life"], is_adult=True),
            make_media(23, ["Iyashikei"], relations=[Relation("PREQUEL", 999, None)]),
            make_media(24, ["Found Family"], ["Slice of Life"], title="Backlog Pick"),
        ]
    )
    store.replace_recommendations({1: [(20, 5), (21, 5), (22, 5), (23, 5), (2, 5)], 7: [(30, 9)]})
    entries.append(ListEntry(24, ListStatus.PLANNING))

    profile = build_profile(store, entries)
    recs = recommend(store, profile)
    titles = [r.media.title for r in recs]

    assert titles[0] == "Cosy Pick"
    assert titles.index("Cosy Pick") < titles.index("Harem Pick")
    ids = {r.media.id for r in recs}
    assert not ids & {2, 22, 23, 24, 30}  # listed (even planning), adult, no prequel, disliked
    cosy = next(r for r in recs if r.media.id == 20)
    assert cosy.reasons and cosy.sources == ["liked Test Show 1"]


def test_include_listed_adds_unfinished_list_titles_only(store):
    entries = seed(store)
    for i, status in [(24, ListStatus.PLANNING), (25, ListStatus.CURRENT),
                      (26, ListStatus.PAUSED), (27, ListStatus.COMPLETED),
                      (28, ListStatus.DROPPED)]:  # fmt: skip
        store.upsert_media([make_media(i, ["Iyashikei"], ["Slice of Life"])])
        entries.append(ListEntry(i, status, progress=1))
    profile = build_profile(store, entries)

    assert not {r.media.id for r in recommend(store, profile)} & set(range(24, 29))
    shown = {r.media.id: r.sources for r in recommend(store, profile, include_listed=True)}
    assert shown[24] == ["on your planning list"]
    assert shown[25] == ["in progress on your list"]
    assert shown[26] == ["paused on your list"]
    assert 27 not in shown and 28 not in shown


def test_discovery_tags(store):
    profile = build_profile(store, seed(store))
    liked, disliked = discovery_tags(profile.model, n=1)
    assert liked[0] in {"Iyashikei", "Found Family"}
    assert disliked[0] in {"Harem", "Isekai"}


def test_profile_learns_from_the_other_list_but_seeds_only_from_its_own(store):
    from konomi.models import MediaType

    anime = seed(store)  # loves Iyashikei, drops Harem
    manga = []
    for i in range(100, 106):
        store.upsert_media([make_media(i, ["Iyashikei"], type=MediaType.MANGA, episodes=None)])
        manga.append(ListEntry(i, ListStatus.COMPLETED, 80))
    profile = build_profile(store, manga, anime)
    assert dict(profile.model.weights())["tag:Harem"] < 0  # only the anime list teaches this
    assert profile.liked_ids == {e.media_id for e in manga}
    assert profile.community_weight == 3.0  # six manga: lean on the community score


def test_not_interested_titles_train_as_dislikes_unless_listed(store):
    entries = seed(store)  # loves Iyashikei and Found Family, drops Harem
    for i in range(20, 26):  # and finished a few others without scoring them, as lists do
        store.upsert_media([make_media(i, ["Sports"], ["Sports"])])
        entries.append(ListEntry(i, ListStatus.COMPLETED))
    store.upsert_media([make_media(50, ["Found Family"], ["Slice of Life"])])
    plain = dict(build_profile(store, entries).model.weights())

    dismissed = build_profile(store, entries, not_interested=[50])
    assert dict(dismissed.model.weights())["tag:Found Family"] < plain["tag:Found Family"]
    assert 50 not in dismissed.liked_ids
    # A dismissed title that's on the list is labelled by the list alone.
    on_list = build_profile(store, entries, not_interested=[1])
    assert dict(on_list.model.weights()) == pytest.approx(plain)
