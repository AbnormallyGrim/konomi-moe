"""The crowd's picks (crowd.py) on a made-up table and made-up titles."""

import numpy as np
import pytest

from konomi import crowd
from konomi.models import ListEntry, ListStatus, MediaType, Relation
from konomi.recommend import build_profile, recommend

from .conftest import make_media

# Made-up AniList IDs. 10 → 11 is a series and its season 2; 20, 30, 40 single titles; 50 a new
# release (first aired in the fresh year); 1-6 the user's list.
IDS = [1, 2, 3, 4, 5, 6, 10, 11, 20, 30, 40, 50]
ROOTS = [1, 2, 3, 4, 5, 6, 10, 10, 20, 30, 40, 50]
YEARS = [2010] * 11 + [2025]


def weights(links: dict[tuple[int, int], float]) -> np.ndarray:
    w = np.zeros((len(IDS), len(IDS)))
    for (a, b), v in links.items():
        w[IDS.index(a), IDS.index(b)] = v
    return w


def table(liked: dict, signed: dict | None = None, k: int = 4) -> crowd.CrowdTable:
    data = crowd.encode(IDS, ROOTS, YEARS, weights(liked), weights(signed or {}), k, 2025)
    return crowd.parse(data)


def entries(scores: dict[int, int]) -> list[ListEntry]:
    return [ListEntry(i, ListStatus.COMPLETED, s) for i, s in scores.items()]


LIST = {1: 90, 2: 85, 3: 80, 4: 40, 5: 70, 6: 75}  # mean 7.33: 1, 2, 3, 6 liked; 4 disliked


def test_the_file_decodes_to_the_weights_it_was_written_from():
    t = table({(1, 20): 0.5, (1, 30): -0.25, (2, 40): 1.0})
    row = dict(zip(t.liked_neighbours[0].tolist(), t.liked_weights[0].tolist(), strict=True))
    assert row[IDS.index(20)] == pytest.approx(0.5, rel=1e-4)
    assert row[IDS.index(30)] == pytest.approx(-0.25, rel=1e-4)
    assert t.fresh_year == 2025 and t.roots[IDS.index(11)] == 10


def test_liked_and_disliked_follow_how_the_table_learned_them():
    liked, disliked = crowd.liked_and_disliked(entries(LIST))
    assert sorted(liked) == [1, 2, 3, 6] and disliked == [4]


def test_a_series_is_picked_by_its_strongest_title_and_new_releases_are_left_out():
    t = table({(1, 11): 0.9, (2, 20): 0.5, (3, 30): 0.2, (1, 50): 5.0, (6, 1): 3.0})
    p = crowd.picks(t, entries(LIST))
    order = [root for root, _, _ in p.picks]
    # 10 rises through its season 2; 50 is a new release; 1, already on the list, never shows.
    assert order[:3] == [10, 20, 30] and 50 not in order and 1 not in order
    assert p.because[10] == 1


def test_disliked_titles_count_against_in_the_ordering_score():
    t = table({(1, 20): 0.1, (2, 30): 0.1, (3, 40): 0.1}, signed={(1, 20): 1.0, (4, 30): 1.0})
    p = crowd.picks(t, entries(LIST))
    assert p.order[20] > 0 > p.order[30]


def test_too_few_liked_titles_in_the_table_leave_ranking_as_it_was():
    assert crowd.picks(table({(1, 20): 1.0}), entries({1: 90, 2: 10, 99: 80})) is None


def test_the_list_keeps_places_for_new_releases_and_orders_by_preference_plus_the_crowd(store):
    t = table(
        {(1, 11): 0.9, (2, 20): 0.8, (3, 30): 0.7, (3, 40): 0.6},
        signed={(1, 40): 2.0},
    )
    listed = [make_media(i, ["Iyashikei"], year=2010) for i in (1, 2, 3, 4, 5, 6)]
    others = [make_media(i, ["Iyashikei"], year=2010) for i in (10, 20, 30, 40)]
    season2 = make_media(
        11, ["Iyashikei"], year=2011, relations=[Relation("PREQUEL", 10, MediaType.ANIME)]
    )
    others[0].relations = [Relation("SEQUEL", 11, MediaType.ANIME)]
    new = [
        make_media(i, ["Iyashikei"], year=2025, average_score=a) for i, a in ((50, 85), (60, 60))
    ]
    store.upsert_media([*listed, *others, season2, *new])
    profile = build_profile(store, entries(LIST))
    p = crowd.picks(t, entries(LIST))
    extra = [(50, "new"), (60, "new")]
    recs = recommend(store, profile, extra, limit=4, crowd=p)
    ids = [r.media.id for r in recs]
    # 3 places for the crowd's best (10 through its season 2, then 20 and 30); 1 for the new
    # release the preference score likes better (50: the higher community score); 40, 4th for
    # the crowd, doesn't fit.
    assert sorted(ids) == [10, 20, 30, 50]
    assert 40 not in ids
    assert [r.score for r in recs] == sorted((r.score for r in recs), reverse=True)


def test_without_the_crowd_ranking_is_unchanged(store):
    listed = [make_media(i, ["Iyashikei"]) for i in (1, 2, 3, 4, 5, 6)]
    store.upsert_media([*listed, make_media(20, ["Iyashikei"]), make_media(30, ["Gore"])])
    profile = build_profile(store, entries(LIST))
    plain = recommend(store, profile, [(20, "x"), (30, "x")], limit=5)
    assert [r.media.id for r in plain] == [
        r.media.id for r in sorted(plain, key=lambda r: r.score, reverse=True)
    ]


def test_a_long_list_is_built_page_by_page_so_old_candidates_dont_crowd_the_first(
    store, monkeypatch
):
    from konomi import recommend as rec

    monkeypatch.setattr(rec, "PAGE", 4)  # pages of 4: 3 crowd picks and 1 new release
    t = table({(1, 10): 0.9, (2, 20): 0.8, (3, 30): 0.7, (3, 40): 0.6})
    listed = [make_media(i, ["Iyashikei"], year=2010) for i in (1, 2, 3, 4, 5, 6)]
    crowd_picks = [make_media(i, ["Gore"], year=2010) for i in (10, 20, 30, 40)]
    new = [make_media(i, ["Gore"], year=2025) for i in (50, 60)]
    # Titles the preference model loves, found the old way: before, they took the top.
    old = [make_media(i, ["Iyashikei"], year=2010, average_score=95) for i in (70, 80)]
    store.upsert_media([*listed, *crowd_picks, *new, *old])
    profile = build_profile(store, entries(LIST))
    p = crowd.picks(t, entries(LIST))
    extra = [(i, "x") for i in (50, 60, 70, 80)]
    ids = [r.media.id for r in recommend(store, profile, extra, limit=8, crowd=p)]
    assert set(ids[:4]) == {10, 20, 30, 50}
    assert set(ids[4:]) == {40, 60, 70, 80}
