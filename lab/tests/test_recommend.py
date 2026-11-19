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


def test_sequels_only_after_a_finished_prequel(store):
    entries = seed(store)
    statuses = [
        ListStatus.COMPLETED,
        ListStatus.REPEATING,
        ListStatus.PLANNING,
        ListStatus.CURRENT,
        ListStatus.PAUSED,
        ListStatus.DROPPED,
    ]
    for i, status in enumerate(statuses):
        store.upsert_media([make_media(40 + i, ["Iyashikei"], ["Slice of Life"])])
        entries.append(ListEntry(40 + i, status, progress=1))
    store.upsert_media(
        [
            make_media(
                50 + i,
                ["Iyashikei"],
                ["Slice of Life"],
                relations=[Relation("PREQUEL", 40 + i, None)],
            )
            for i in range(len(statuses))
        ]
    )
    store.replace_recommendations({1: [(50 + i, 5) for i in range(len(statuses))]})

    ids = {r.media.id for r in recommend(store, build_profile(store, entries))}
    assert ids == {50, 51}  # sequels of completed and rewatched seasons only


def test_sequel_of_an_unwatched_season_becomes_its_first_unwatched_season(store):
    entries = seed(store)
    entries.append(ListEntry(70, ListStatus.COMPLETED, 80))

    def show(i, prequel=None, title=None):
        relations = [Relation("PREQUEL", prequel, None)] if prequel else []
        return make_media(i, ["Iyashikei"], ["Slice of Life"], relations=relations, title=title)

    store.upsert_media(
        [
            show(60, title="Season 1"),
            show(61, 60),
            show(62, 61),  # season 3 of an unwatched season 1 → season 1
            show(70),
            show(71, 70, title="Next Season"),
            show(72, 71),  # season 3 after a finished season 1 → season 2
            show(81, 80),  # season 1 not cached → dropped
            show(91, 90),  # season 1 on the list, dropped → dropped
        ]
    )
    entries.append(ListEntry(90, ListStatus.DROPPED, progress=1))
    store.replace_recommendations({1: [(62, 9), (61, 5), (72, 5), (81, 5), (91, 5)]})

    recs = {r.media.id: r for r in recommend(store, build_profile(store, entries))}
    assert {60, 71} <= recs.keys()
    assert not recs.keys() & {61, 62, 72, 81, 91}
    assert recs[60].sources == ["liked Test Show 1"]


def test_fetch_caches_uncached_first_seasons(store):
    entries = seed(store)
    store.upsert_media([make_media(61, ["Iyashikei"], relations=[Relation("PREQUEL", 60, None)])])
    store.replace_recommendations({1: [(61, 5)]})
    asked = []

    def fetch(ids):
        asked.append(ids)
        store.upsert_media([make_media(60, ["Iyashikei"], title="Season 1")])

    recs = recommend(store, build_profile(store, entries), fetch=fetch)
    assert asked == [{60}]
    assert [r.media.id for r in recs] == [60]


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
