"""How well a predictor ranks a user's own titles it wasn't trained on (cross-validation)."""

from __future__ import annotations

import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score

from konomi.models import Media
from konomi.preference import MIN_EXAMPLES, Example, PreferenceModel, community_weight

Predictor = Callable[[list[Media]], np.ndarray]
Trainer = Callable[[list[Example]], Predictor]

TOP_K = 10


@dataclass
class Scores:
    """Out-of-fold results; higher is better for every metric."""

    spearman: float  # rank correlation with the user's actual scores (scored titles only)
    auc: float  # chance a liked title is predicted above a not-liked one (0.5 = random)
    hit_rate: float  # share of each fold's top predictions (up to 10) the user liked
    n: int  # titles evaluated


def cross_validate(
    examples: list[Example],
    train: Trainer,
    folds: int = 5,
    seed: int = 0,
    truth: list[Example] | None = None,
) -> Scores:
    """Train on all folds but one, predict the held-out fold, and score the pooled predictions.

    With `truth`, folds are drawn from it and graded against it, while training uses `examples`
    minus the held-out titles; titles only in `examples` always train and are never graded.
    """
    graded = examples if truth is None else truth
    if len(graded) < folds * 2:
        raise ValueError(f"need at least {folds * 2} titles to evaluate, got {len(graded)}")
    order = list(range(len(graded)))
    random.Random(seed).shuffle(order)
    predicted = np.zeros(len(graded))
    hits = []
    for f in range(folds):
        held = order[f::folds]
        held_ids = {graded[i].media.id for i in held}
        fit_on = [ex for ex in examples if ex.media.id not in held_ids]
        predict = train(fit_on)
        scores = np.asarray(predict([graded[i].media for i in held]), dtype=float)
        predicted[held] = scores
        # Cap k at the fold's liked titles, so a perfect ranking scores 100% even in small folds.
        k = min(TOP_K, sum(graded[i].liked for i in held))
        if k:
            top = [held[i] for i in np.argsort(-scores)[:k]]
            hits.append(np.mean([graded[i].liked for i in top]))

    targets = np.array([ex.target for ex in graded])
    liked = np.array([ex.liked for ex in graded])
    scored = np.array([ex.scored for ex in graded])
    spearman = (
        spearmanr(predicted[scored], targets[scored]).statistic
        if scored.sum() > 2
        else float("nan")
    )
    auc = roc_auc_score(liked, predicted) if 0 < liked.sum() < len(liked) else float("nan")
    hit_rate = float(np.mean(hits)) if hits else float("nan")
    return Scores(float(spearman), float(auc), hit_rate, len(graded))


def community() -> Trainer:
    """Baseline: AniList's average score, ignoring the user's history."""
    return lambda _train: lambda items: np.array([m.average_score or 70 for m in items], float)


def preference(
    alpha: float = 10.0,
    min_feature_count: int = 1,
    community: float | None = None,
    extra: Sequence[Example] = (),
) -> Trainer:
    """The preference model plus `community` × the community score, as ranking does (prediction +
    weight × (average − 70) / 10). `None` uses ranking's size-aware weight; `extra` (the other
    list) always trains and is never graded."""

    def train(fit_on: list[Example]) -> Predictor:
        if len(fit_on) < MIN_EXAMPLES:
            return lambda items: np.zeros(len(items))
        model = PreferenceModel(alpha, min_feature_count).fit([*fit_on, *extra])
        weight = community_weight(len(fit_on)) if community is None else community

        def predict(items: list[Media]) -> np.ndarray:
            boost = np.array([((m.average_score or 70) - 70) / 10 for m in items])
            return model.predict(items) + weight * boost

        return predict

    return train


def sweep(
    examples: list[Example],
    folds: int = 5,
    truth: list[Example] | None = None,
    extra: Sequence[Example] = (),
) -> list[tuple[str, Scores]]:
    """Every combination of the model's settings worth comparing, best AUC first."""
    rows = []
    for alpha in (3.0, 10.0, 30.0):
        for min_count in (1, 2):
            for weight in (0.3, 0.6, 1.0, 2.0):
                name = f"alpha {alpha:g} · min features {min_count} · community {weight:g}"
                trainer = preference(alpha, min_count, weight, extra)
                rows.append((name, cross_validate(examples, trainer, folds, truth=truth)))
    return sorted(rows, key=lambda r: r[1].auc, reverse=True)
