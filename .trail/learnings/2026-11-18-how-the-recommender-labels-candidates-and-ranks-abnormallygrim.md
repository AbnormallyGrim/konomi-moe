---
title: "How the recommender labels a list, gathers candidates and ranks them, as tuned in the lab"
author: AbnormallyGrim
date: 2026-11-18
branch: main
id: l-7930cc18
scope: repo
status: active
src: agent
---

Moved here from lab/README.md and engine/README.md when the sub-folder READMEs were removed. The lab stays the reference for behaviour and tuning; the engine must match it (parity test).

## Decided
Labels (AniList 100-point scores, centred on the user's own mean, target in points out of 10):

| Entry | Target | Weight |
|---|---|---|
| Scored | (score − mean) / 10, +1 if rewatched | 1.0 (0.7 if watching or paused) |
| Unscored, rewatched | +1.5 | 0.8 |
| Unscored, completed | +1.0 | 0.7 |
| Unscored, dropped | −1 − 3 × (1 − fraction watched) | 1.0 |
| Unscored, paused | −0.5 | 0.3 |
| Unscored, watching | +0.5 | 0.3 |
| Planning | not trained on; ranked as a candidate when list titles are shown | |

A drop with unknown length counts 12 episodes or 50 chapters as a fair go.

Features: genres (1.0), tags (rank ÷ 100), main studios, format, decade. Weighted ridge, alpha 10, trained on both lists (format is a feature, so anime history helps a short manga list). Only the list's own liked titles seed candidates. Needs at least 5 usable entries.

Candidates: AniList user recommendations from liked titles (at or above mean); for each of the 3 most-liked tags, the 30 top-scored titles with it and none of the 3 most-disliked tags (one search per tag, because `tag_in` needs all its tags); with filters, the 100 top-scored matches; optionally unfinished list titles; anime only, best-fitting offline-database entries.

Ranking: model prediction + w × (community average − 70) / 10, with w = 0.6 × 150 / labelled titles, kept between 0.6 and 3. The score only orders picks; the UI shows the rank. Reasons leave out spoiler tags, format and decade (they still count in the model). A title's sources list its strongest recommendation first (highest rating, then lowest title ID) in both engine and lab; before, store order decided and the two disagreed.

Evaluation (`konomi evaluate`, `--sweep`): 5 folds with a fixed seed; compares community score alone, model alone, and model + community. Metrics: Spearman rank correlation (scored titles), liked-vs-not AUC, top-10 hit rate with k capped at the fold's liked titles. Unscored paused and in-progress titles are never graded. Expect noise below about 100 labelled titles.

## Tried and ruled out
- The lab's offline anime database isn't ported to the engine: it's anime-only and a 6 MB download, so whether the extension wants it is a later decision.

## Watch out
- Engine vs lab on a real list (517 anime): same top 20, scores within 0.0002 (the lab's iterative solver tolerance). Fit ~75 ms in Node; first sync of 517 anime + 147 manga ~37 s (rate limit); a run with discovery ~8 s; store ~2.5 MB of JSON.
- AniList's terms prohibit mass collection and using the API as a data store: fetch only what a run needs and cache it.

In the code: lab/src/konomi (taste, themes, pipeline, evaluate), engine/src (taste.ts, ridge.ts, recommend.ts, pipeline.ts, sync.ts), engine/test/parity.test.ts, lab/scripts/make_engine_fixtures.py, lab/scripts/parity_world.py.
