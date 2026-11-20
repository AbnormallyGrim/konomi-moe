"""Learns a user's preferences from their list: labels, features and the model."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge

from konomi.models import ListEntry, ListStatus, Media, MediaType

DEFAULT_MEAN = 70.0
MIN_EXAMPLES = 5
COMMUNITY_WEIGHT = 0.6  # for a list of FULL_LIST labelled titles or more
FULL_LIST = 150
MAX_COMMUNITY_WEIGHT = 3.0


def community_weight(labelled: int) -> float:
    """How much the community score counts in ranking: more for short lists, which teach the
    model less (0.6 × 150 / labelled, between 0.6 and 3)."""
    scale = FULL_LIST / max(labelled, 1)
    return min(MAX_COMMUNITY_WEIGHT, COMMUNITY_WEIGHT * max(1.0, scale))


@dataclass
class Example:
    """A training example: how much the user liked a title, relative to their average."""

    media: Media
    target: float
    weight: float
    scored: bool = False  # the user gave it a score, so the target is exact

    @property
    def liked(self) -> bool:
        """At or above the user's average; such titles seed candidate gathering."""
        return self.target >= 0


def user_mean(entries: list[ListEntry]) -> float:
    """Average of the user's non-zero scores (0-100)."""
    scores = [e.score for e in entries if e.score > 0]
    return float(np.mean(scores)) if scores else DEFAULT_MEAN


@dataclass(frozen=True)
class Labels:
    """How entries become `(target, weight)` pairs; `None` leaves that kind out of training."""

    rewatch_bonus: float = 1.0
    tentative_weight: float = 0.7  # scored but still watching or paused
    rewatched: tuple[float, float] = (1.5, 0.8)
    completed: tuple[float, float] = (1.0, 0.7)
    drop_base: float = -1.0
    drop_slope: float = 3.0  # extra penalty for dropping early
    paused: tuple[float, float] | None = (-0.5, 0.3)
    current: tuple[float, float] | None = (0.5, 0.3)
    # A recommendation the user dismissed with "not interested": a dislike of the premise, about
    # as strong as dropping a title halfway but weighted lower, since they never tried it.
    # Targets are relative to the list, so it must sit well below a typical list's average.
    # Untuned: there's no answer key for it.
    not_interested: tuple[float, float] = (-2.0, 0.6)


DEFAULT_LABELS = Labels()


def label(
    entry: ListEntry, media: Media, mean: float, labels: Labels = DEFAULT_LABELS
) -> tuple[float, float] | None:
    """`(target, weight)` for an entry, or `None` if it says nothing about preferences."""
    rewatched = entry.repeat > 0 or entry.status is ListStatus.REPEATING
    if entry.status is ListStatus.PLANNING:
        return None

    if entry.score > 0:
        target = (entry.score - mean) / 10
        if rewatched:
            target += labels.rewatch_bonus
        tentative = entry.status in (ListStatus.CURRENT, ListStatus.PAUSED)
        return target, labels.tentative_weight if tentative else 1.0

    if rewatched:
        return labels.rewatched
    if entry.status is ListStatus.COMPLETED:
        return labels.completed
    if entry.status is ListStatus.DROPPED:
        early = 1.0 - _progress_fraction(entry, media)
        return labels.drop_base - labels.drop_slope * early, 1.0
    if entry.status is ListStatus.PAUSED:
        return labels.paused
    return labels.current


def _progress_fraction(entry: ListEntry, media: Media) -> float:
    if media.length:
        return min(entry.progress / media.length, 1.0)
    # Unknown length (often ongoing): treat 12 episodes or 50 chapters as "gave it a fair go".
    fair_go = 12 if media.type is MediaType.ANIME else 50
    return min(entry.progress / fair_go, 1.0)


def examples(
    entries: list[ListEntry], media: dict[int, Media], labels: Labels = DEFAULT_LABELS
) -> list[Example]:
    """Training examples for every entry with known details and a usable label."""
    mean = user_mean(entries)
    out = []
    for e in entries:
        m = media.get(e.media_id)
        labelled = label(e, m, mean, labels) if m else None
        if m and labelled:
            out.append(Example(m, *labelled, scored=e.score > 0))
    return out


def not_interested_examples(media: list[Media], labels: Labels = DEFAULT_LABELS) -> list[Example]:
    """Training examples for titles the user dismissed as "not interested"."""
    return [Example(m, *labels.not_interested) for m in media]


def truth(entries: list[ListEntry], media: dict[int, Media]) -> list[Example]:
    """A fixed answer key for evaluation: scores, unscored completions, rewatches and drops, with
    the default labels. Unscored paused and in-progress titles are left out, because what they
    mean is the thing being tuned."""
    unsure = {ListStatus.PAUSED, ListStatus.CURRENT}
    sure = [e for e in entries if e.score > 0 or e.status not in unsure]
    return examples(sure, media, DEFAULT_LABELS)


def features(media: Media) -> dict[str, float]:
    """Sparse feature dict for a title."""
    f: dict[str, float] = {}
    for g in media.genres:
        f[f"genre:{g}"] = 1.0
    for t in media.tags:
        f[f"tag:{t.name}"] = t.rank / 100
    for s in media.studios:
        f[f"studio:{s}"] = 1.0
    if media.format:
        f[f"format:{media.format}"] = 1.0
    if media.year:
        f[f"decade:{media.year // 10 * 10}s"] = 1.0
    return f


class NotEnoughHistory(Exception):
    """The list has too few usable entries to learn from."""


class PreferenceModel:
    """Ridge regression from title features to how much the user likes it."""

    def __init__(self, alpha: float = 10.0, min_feature_count: int = 1) -> None:
        self.alpha = alpha
        self.min_feature_count = min_feature_count
        self._vec = DictVectorizer()
        self._model = Ridge(alpha=alpha)

    def fit(self, train: list[Example]) -> PreferenceModel:
        """Fit on examples; features seen on fewer than `min_feature_count` titles are dropped."""
        if len(train) < MIN_EXAMPLES:
            raise NotEnoughHistory(f"need at least {MIN_EXAMPLES} rated titles, got {len(train)}")
        dicts = [features(ex.media) for ex in train]
        counts = Counter(k for d in dicts for k in d)
        keep = {k for k, c in counts.items() if c >= self.min_feature_count}
        dicts = [{k: v for k, v in d.items() if k in keep} for d in dicts]
        x = self._vec.fit_transform(dicts)
        y = np.array([ex.target for ex in train])
        w = np.array([ex.weight for ex in train])
        self._model.fit(x, y, sample_weight=w)
        return self

    def predict(self, items: list[Media]) -> np.ndarray:
        """Predicted liking for each title (points out of 10, relative to the user's mean)."""
        if not items:
            return np.array([])
        return self._model.predict(self._vec.transform([features(m) for m in items]))

    def contributions(self, media: Media) -> list[tuple[str, float]]:
        """Each known feature's contribution to a title's prediction, largest first."""
        index = self._vec.vocabulary_
        coef = self._model.coef_
        items = [(k, v * coef[index[k]]) for k, v in features(media).items() if k in index]
        return sorted(items, key=lambda kv: kv[1], reverse=True)

    def weights(self) -> list[tuple[str, float]]:
        """All feature weights, most liked first."""
        names = self._vec.get_feature_names_out()
        return sorted(
            zip(names, self._model.coef_, strict=True), key=lambda kv: kv[1], reverse=True
        )
