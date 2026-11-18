import math

import pytest

from konomi import evaluate as ev
from konomi.models import ListEntry, ListStatus
from konomi.taste import examples
from tests.conftest import make_media


def history(n=42):
    """A made-up user: loves Iyashikei, finds Mecha so-so, drops Harem, unlike the crowd."""
    media, entries = {}, []
    for i in range(n):
        if i % 3 == 0:
            media[i] = make_media(
                i, ["Iyashikei", "Found Family"], ["Slice of Life"], average_score=60
            )
            entries.append(ListEntry(i, ListStatus.COMPLETED, 90))
        elif i % 3 == 1:
            media[i] = make_media(i, ["Real Robot", "Military"], ["Mecha"], average_score=75)
            entries.append(ListEntry(i, ListStatus.COMPLETED, 55))
        else:
            media[i] = make_media(i, ["Harem", "Isekai"], ["Fantasy"], average_score=85)
            entries.append(ListEntry(i, ListStatus.DROPPED, progress=1))
    return examples(entries, media)


def test_taste_model_beats_the_community_baseline():
    data = history()
    model = ev.cross_validate(data, ev.taste(community=0))
    crowd = ev.cross_validate(data, ev.community())
    assert model.auc > 0.9 and model.hit_rate > 0.9 and model.spearman > 0.8
    assert crowd.auc < 0.2  # this user disagrees with the crowd
    assert model.n == len(data) == 42


def test_results_are_deterministic_and_need_enough_titles():
    data = history()
    assert ev.cross_validate(data, ev.taste()) == ev.cross_validate(data, ev.taste())
    with pytest.raises(ValueError):
        ev.cross_validate(data[:6], ev.taste())


def test_spearman_needs_scored_titles():
    dropped_only = [ex for ex in history() if not ex.scored]
    unscored = dropped_only + [ex for ex in history(60) if ex.scored][:2]
    assert math.isnan(ev.cross_validate(unscored, ev.taste()).spearman)


def test_sweep_sorts_by_auc():
    rows = ev.sweep(history(), folds=3)
    assert len(rows) == 24
    assert rows[0][1].auc >= rows[-1][1].auc


def test_truth_grades_only_sure_titles_while_training_on_all():
    from konomi.taste import truth

    media = {i: make_media(i, ["Iyashikei"] if i % 2 else ["Harem"]) for i in range(30)}
    entries = [
        ListEntry(i, ListStatus.COMPLETED if i % 2 else ListStatus.DROPPED, progress=1)
        for i in range(24)
    ]
    entries += [ListEntry(i, ListStatus.PAUSED) for i in range(24, 30)]  # unsure: never graded
    key = truth(entries, media)
    assert {ex.media.id for ex in key} == set(range(24))
    result = ev.cross_validate(examples(entries, media), ev.taste(community=0), truth=key)
    assert result.n == 24 and result.auc > 0.9
