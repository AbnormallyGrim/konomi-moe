"""Does a collaborative signal from public MyAnimeList ratings improve ranking on the owner's
real AniList list? Same folds and answer key as `konomi evaluate`.

Usage, from lab/:
    uv run python -I scripts/cf_experiment.py cooperunion <dir> data/konomi.sqlite
    uv run python -I scripts/cf_experiment.py useranimelist <dir> data/konomi.sqlite

Datasets (downloads, so keep them outside the repo):
- cooperunion: Kaggle "Anime Recommendations Database" (CC0): anime.csv, rating.csv. 73.5k
  users, ~7.8M entries (rating -1 = watched, not scored), ending around 2016-17.
- useranimelist: "User Animelist Dataset" (Kaggle tavuksuzdurum / Hugging Face mramazan):
  animes.csv, ratings.npy. 1.77M users, 148M scores (1-10, scored titles only), titles into
  2025. Marked CC-BY-4.0 but collected from MyAnimeList, so private measurement only.

Prints only aggregate numbers, never usernames or titles from the owner's list.

Results (2026-11-17, owner's anime list, 316 graded titles, 10 seeds), cooperunion: 111 titles
(35%) have a vector. Graded on those 111, the current model scores AUC 0.690 ± 0.017,
people-like-you alone 0.721, the blend (× 2) 0.737; on all 316 the blend adds only about
+0.012 AUC. Watch-based (implicit) vectors beat score-based ones.
useranimelist (every 4th user: 341k users, 13.6k anime, 35M scores; 54 s, 4.7 GB RAM): 294 of
316 titles (93%) have a vector. On all 316: current model AUC 0.705, hit@10 86%; people-like-you
alone 0.677; blend implicit × 1 → AUC 0.717, hit@10 89%, Spearman 0.409 → 0.431; blend explicit
× 0.5 → AUC 0.709, hit@10 92% (× 1: 94%). So with full coverage the gain is modest in AUC and
clearer at the top of the list. See HANDOVER.md.
"""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import svds

from konomi import evaluate as ev
from konomi.models import MediaType
from konomi.offline import _open
from konomi.store import Store
from konomi.taste import examples, truth

which, data_dir, db_path = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
DIMS = 64
SEEDS = 10


def load_cooperunion() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """User ids, MAL ids and ratings (-1 = watched, not scored)."""
    u, a, r = [], [], []
    with open(data_dir / "rating.csv", newline="") as fh:
        for row in csv.DictReader(fh):
            u.append(int(row["user_id"]))
            a.append(int(row["anime_id"]))
            r.append(int(row["rating"]))
    return np.array(u), np.array(a), np.array(r)


def load_useranimelist(every: int = 4) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every `every`-th user, with the dataset's anime ids turned into MAL ids."""
    to_mal = {}
    with open(data_dir / "animes.csv", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            url = row["mal_url"].rstrip("/")
            if "/anime/" in url:
                to_mal[int(row["animeID"])] = int(url.split("/anime/")[1].split("/")[0])
    data = np.load(data_dir / "ratings.npy", mmap_mode="r", allow_pickle=False)
    keep = np.asarray(data[:, 0]) % every == 0
    rows = np.asarray(data[keep])
    lookup = np.zeros(max(to_mal) + 1, dtype=np.int64)
    for k, v in to_mal.items():
        lookup[k] = v
    mal = lookup[rows[:, 1]]
    ok = mal > 0
    return rows[ok, 0], mal[ok], rows[ok, 2]


def item_vectors(users, mals, ratings, kind: str) -> tuple[np.ndarray, np.ndarray]:
    """Unit-length item vectors and the MAL id of each row, from a weighted user × item matrix."""
    _, item_counts = np.unique(mals, return_counts=True)
    common = np.unique(mals)[item_counts >= 20]
    m = np.isin(mals, common)
    users, mals, ratings = users[m], mals[m], ratings[m]
    uid, ucount = np.unique(users, return_inverse=True, return_counts=True)[1:]
    m = ucount[uid] >= 10
    users, mals, ratings = users[m], mals[m], ratings[m]
    rows = np.unique(users, return_inverse=True)[1]
    item_ids, cols = np.unique(mals, return_inverse=True)
    if kind == "implicit":  # watched or scored at all
        vals = np.ones(len(rows), dtype=np.float32)
    else:  # centred score; watched-but-unscored counts as slightly above the user's mean
        scored = ratings > 0
        sums = np.bincount(rows[scored], weights=ratings[scored], minlength=rows.max() + 1)
        cnt = np.bincount(rows[scored], minlength=rows.max() + 1)
        mean = np.where(cnt > 0, sums / np.maximum(cnt, 1), 7.0)
        vals = np.where(scored, ratings - mean[rows], 0.5).astype(np.float32)
    mat = csr_matrix((vals, (rows, cols)), shape=(rows.max() + 1, len(item_ids)))
    mat.eliminate_zeros()
    if kind == "implicit":  # down-weight blockbusters (idf) and heavy users (row norm)
        idf = np.log(mat.shape[0] / (1 + np.bincount(cols, minlength=len(item_ids))))
        mat = csr_matrix(mat.multiply(idf.astype(np.float32)))
        norms = np.sqrt(np.asarray(mat.multiply(mat).sum(axis=1)).ravel()) + 1e-9
        mat = csr_matrix(mat.multiply((1 / norms)[:, None].astype(np.float32)))
    _, s, vt = svds(mat, k=DIMS)
    vecs = (vt.T * s).astype(np.float64)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9
    print(f"  {kind}: {mat.shape[0]} users × {mat.shape[1]} anime, {mat.nnz} entries")
    return vecs, item_ids


# MAL id → AniList id, from the original offline database file (the lab's import keeps only
# AniList IDs, but each raw entry lists every site's URL).
mal_to_anilist: dict[int, int] = {}
raw_db = Path(db_path).parent / "offline-db" / "anime-offline-database.jsonl.zst"
with _open(raw_db) as fh:
    for line in fh:
        entry = json.loads(line)
        sources = entry.get("sources", []) if isinstance(entry, dict) else []
        mal = [u for u in sources if "myanimelist.net/anime/" in u]
        ani = [u for u in sources if "anilist.co/anime/" in u]
        if mal and ani:
            mal_id = int(mal[0].rstrip("/").split("/")[-1])
            mal_to_anilist[mal_id] = int(ani[0].rstrip("/").split("/")[-1])
print(f"MAL → AniList links: {len(mal_to_anilist)}")

# The owner's examples and answer key, exactly as `konomi evaluate` builds them.
con = sqlite3.connect(db_path)
user = con.execute("select user from list_syncs where media_type = 'ANIME' limit 1").fetchone()[0]
con.close()
store = Store(db_path)
kind = MediaType.ANIME
entries = store.list_entries(user, kind)
media = store.get_media(e.media_id for e in entries)
train, key = examples(entries, media), truth(entries, media)
others = store.list_entries(user, kind.other)
extra = examples(others, store.get_media(e.media_id for e in others))
store.close()


def cf_trainer(vectors: dict[int, np.ndarray]) -> ev.Trainer:
    """Taste vector = training titles' vectors weighted by their centred targets; a title's
    score is its cosine with that. Titles without a vector score 0 (neutral)."""

    def train_fn(fit_on):
        have = [ex for ex in fit_on if ex.media.id in vectors]
        if not have:
            return lambda items: np.zeros(len(items))
        t = np.array([ex.target for ex in have])
        w = np.array([ex.weight for ex in have])
        u = ((t - np.average(t, weights=w)) * w) @ np.stack([vectors[ex.media.id] for ex in have])
        u /= np.linalg.norm(u) + 1e-9
        return lambda items: np.array(
            [vectors[m.id] @ u if m.id in vectors else 0.0 for m in items]
        )

    return train_fn


def blend(a: ev.Trainer, b: ev.Trainer, weight: float) -> ev.Trainer:
    """`a` + weight × `b`, with `b` scaled to unit spread on the fold's training titles."""

    def train_fn(fit_on):
        pa, pb = a(fit_on), b(fit_on)
        spread = float(np.std(pb([ex.media for ex in fit_on]))) or 1.0
        return lambda items: pa(items) + weight * pb(items) / spread

    return train_fn


loaded = load_cooperunion() if which == "cooperunion" else load_useranimelist()
print(f"{which}: {len(loaded[0])} entries loaded")
for vec_kind in ("implicit", "explicit"):
    print(f"\nItem vectors ({vec_kind}):")
    vecs, mal_ids = item_vectors(*loaded, vec_kind)
    vectors = {
        mal_to_anilist[int(mal)]: vecs[i]
        for i, mal in enumerate(mal_ids)
        if int(mal) in mal_to_anilist
    }
    covered_key = [ex for ex in key if ex.media.id in vectors]
    print(f"  owner's graded anime with a vector: {len(covered_key)} of {len(key)}")
    base = ev.taste(extra=extra)
    rows = [
        ("community score only", ev.community()),
        ("current model (baseline)", base),
        ("people-like-you only", cf_trainer(vectors)),
    ] + [
        (f"current + people-like-you × {w:g}", blend(base, cf_trainer(vectors), w))
        for w in (0.5, 1.0, 2.0, 4.0)
    ]
    for label_, graded in (("all", key), (f"the {len(covered_key)} with a vector", covered_key)):
        print(f"  -- grading {label_} ({'AUC':>5} {'hit@10':>7} {'Spearman':>9})")
        for name, trainer in rows:
            accs = [
                ev.cross_validate(train, trainer, 5, seed=s, truth=graded) for s in range(SEEDS)
            ]
            auc = [a.auc for a in accs]
            print(
                f"  {name:<40} {np.mean(auc):6.3f}±{np.std(auc):.3f}"
                f" {np.mean([a.hit_rate for a in accs]):7.0%}"
                f" {np.nanmean([a.spearman for a in accs]):9.3f}"
            )
