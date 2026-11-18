"""Two cheap ideas measured on the owner's real lists, with the same folds and answer key as
`konomi evaluate`:

1. Staff as features: key people (director, series composition, original creator, character
   design, music; for manga story and art) as one feature per person, so a creator matches
   across anime and manga.
2. How much AniList's average score should count, especially for manga, where the list is
   small and the taste model alone doesn't beat the community score.

Usage, from lab/: uv run python -I scripts/staff_community_experiment.py data/konomi.sqlite \
    <staff cache json>
Staff come from AniList's public API for the titles on the user's lists only (one-off, about
14 requests, cached in the given file). Prints only aggregate numbers.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import numpy as np

from konomi import evaluate as ev
from konomi import taste
from konomi.anilist import AniListClient
from konomi.models import MediaType
from konomi.store import Store
from konomi.taste import community_weight, examples, truth

db_path, cache_path = sys.argv[1], Path(sys.argv[2])
SEEDS = 10
KEY_ROLES = {
    "Director", "Chief Director", "Series Composition", "Original Creator", "Original Story",
    "Story & Art", "Story", "Art", "Character Design", "Original Character Design", "Music",
}  # fmt: skip
STAFF_QUERY = """
query ($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    media(id_in: $ids) {
      id
      staff(perPage: 25, sort: RELEVANCE) { edges { role node { id } } }
    }
  }
}
"""

con = sqlite3.connect(db_path)
user = con.execute("select user from list_syncs where media_type = 'ANIME' limit 1").fetchone()[0]
con.close()
store = Store(db_path)
lists = {t: store.list_entries(user, t) for t in (MediaType.ANIME, MediaType.MANGA)}
media = {t: store.get_media(e.media_id for e in lists[t]) for t in lists}

# Staff for every title on either list, cached.
staff: dict[int, list[int]] = (
    {int(k): v for k, v in json.loads(cache_path.read_text()).items()}
    if cache_path.exists()
    else {}
)
wanted = sorted({e.media_id for es in lists.values() for e in es} - set(staff))
if wanted:
    client = AniListClient()
    for i in range(0, len(wanted), 50):
        data = client.query(STAFF_QUERY, {"ids": wanted[i : i + 50], "page": 1})
        for m in data["Page"]["media"]:
            people = []
            for edge in m["staff"]["edges"]:
                role = edge["role"].split(" (")[0].strip()
                if role in KEY_ROLES and edge["node"]["id"] not in people:
                    people.append(edge["node"]["id"])
            staff[m["id"]] = people
    cache_path.write_text(json.dumps(staff))
covered = sum(1 for es in lists.values() for e in es if staff.get(e.media_id))
total = sum(len(es) for es in lists.values())
print(f"titles with key staff: {covered} of {total}")

plain_features = taste.features


def with_staff(weight: float):
    def features(m):
        f = plain_features(m)
        for person in staff.get(m.id, []):
            f[f"staff:{person}"] = weight
        return f

    return features


def score(rows, train, key):
    print(f"  {'method':<46} {'AUC':>11} {'hit@10':>7} {'Spearman':>9}")
    for name, trainer, feats in rows:
        taste.features = feats
        accs = [ev.cross_validate(train, trainer, 5, seed=s, truth=key) for s in range(SEEDS)]
        taste.features = plain_features
        auc = [a.auc for a in accs]
        print(
            f"  {name:<46} {np.mean(auc):6.3f}±{np.std(auc):.3f}"
            f" {np.mean([a.hit_rate for a in accs]):7.0%}"
            f" {np.nanmean([a.spearman for a in accs]):9.3f}"
        )


for kind in (MediaType.ANIME, MediaType.MANGA):
    other = kind.other
    train, key = examples(lists[kind], media[kind]), truth(lists[kind], media[kind])
    extra = examples(lists[other], media[other])
    current = community_weight(len(train))
    print(f"\n{kind.value}: {len(train)} labelled, {len(key)} graded, current weight {current:.2f}")
    rows = [
        ("community score only", ev.community(), plain_features),
        ("current model", ev.taste(extra=extra), plain_features),
        ("current model + staff", ev.taste(extra=extra), with_staff(1.0)),
        ("current model + staff (half weight)", ev.taste(extra=extra), with_staff(0.5)),
    ]
    for w in (0.3, 1.0, 2.0, 3.0, 5.0, 8.0):
        rows.append((f"community weight {w:g}", ev.taste(community=w, extra=extra), plain_features))
        rows.append(
            (f"community weight {w:g} + staff", ev.taste(community=w, extra=extra), with_staff(1.0))
        )
    score(rows, train, key)
store.close()
