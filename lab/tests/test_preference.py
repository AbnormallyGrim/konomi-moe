import pytest

from konomi.models import ListEntry, ListStatus, MediaType
from konomi.preference import NotEnoughHistory, PreferenceModel, examples, label
from tests.conftest import make_media

SHOW = make_media(1, episodes=24)


def test_planning_is_ignored():
    assert label(ListEntry(1, ListStatus.PLANNING), SHOW, 70) is None


def test_score_is_relative_to_user_mean_with_rewatch_bonus():
    assert label(ListEntry(1, ListStatus.COMPLETED, 90), SHOW, 70) == (2.0, 1.0)
    assert label(ListEntry(1, ListStatus.COMPLETED, 90, repeat=1), SHOW, 70) == (3.0, 1.0)
    assert label(ListEntry(1, ListStatus.CURRENT, 60), SHOW, 70) == (-1.0, 0.7)


def test_early_drop_is_worse_than_late_drop():
    early, _ = label(ListEntry(1, ListStatus.DROPPED, progress=1), SHOW, 70)
    late, _ = label(ListEntry(1, ListStatus.DROPPED, progress=22), SHOW, 70)
    assert early < late < 0


def test_drop_with_unknown_length_uses_fair_go():
    manga = make_media(2, type=MediaType.MANGA, episodes=None, chapters=None)
    target, _ = label(ListEntry(2, ListStatus.DROPPED, progress=50), manga, 70)
    assert target == -1.0


def test_needs_enough_history():
    media = {1: SHOW}
    with pytest.raises(NotEnoughHistory):
        PreferenceModel().fit(examples([ListEntry(1, ListStatus.COMPLETED, 80)], media))


def test_learns_liked_and_disliked_tags():
    media, entries = {}, []
    for i in range(6):
        media[i] = make_media(i, ["Iyashikei", "Found Family"], ["Slice of Life"])
        entries.append(ListEntry(i, ListStatus.COMPLETED, 90))
    for i in range(6, 12):
        media[i] = make_media(i, ["Harem", "Isekai"], ["Fantasy"])
        entries.append(ListEntry(i, ListStatus.DROPPED, progress=1))

    model = PreferenceModel().fit(examples(entries, media))
    weights = dict(model.weights())
    assert weights["tag:Iyashikei"] > 0 > weights["tag:Harem"]

    cosy = make_media(100, ["Iyashikei"], ["Slice of Life"])
    harem = make_media(101, ["Harem"], ["Fantasy"])
    good, bad = model.predict([cosy, harem])
    assert good > bad
    assert model.contributions(cosy)[0][0] in {"tag:Iyashikei", "genre:Slice of Life"}


def test_community_weight_grows_for_short_lists():
    from konomi.preference import community_weight

    assert community_weight(325) == community_weight(150) == 0.6
    assert round(community_weight(46), 2) == 1.96
    assert community_weight(10) == community_weight(1) == 3.0


def test_unscored_completed_is_a_clear_like():
    assert label(ListEntry(1, ListStatus.COMPLETED), SHOW, 70) == (1.0, 0.7)
