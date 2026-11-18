---
title: The evaluation harness scores the model on held-out titles; first results favour more regularisation and show manga lists are too small
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-f5c5f7af
scope: repo
status: active
src: agent
---

## Decided
M0 step 1: `konomi evaluate` (src/konomi/evaluate.py, cross_validate) runs 5-fold cross-validation on a user's labelled titles, so every title is predicted by a model that never saw it. It compares community score only, the taste model, and model + community. Metrics: Spearman on scored titles, AUC for liked vs not, and top-k hit rate with k capped at each fold's liked count. The cap is there because otherwise small folds make even a perfect ranking score low: the test hit 33% for AUC 1.0.

## Watch out
- Owner's anime list (325 titles): the model beats community score only modestly (AUC 0.65 vs 0.56). The sweep prefers stronger regularisation, alpha 10 with community weight 0.6 (AUC 0.67, hit rate 82 to 86%). Not adopted yet, because tuning is step 2.
- Owner's manga list (46 titles): the model is at chance, because 98 of 144 manga are PLANNING, which isn't a label. Adding the anime list to training only lifts AUC to about 0.56.
- Unscored PAUSED counts as a mild dislike (-0.5) in taste.label, but for manga it often means caught up on an ongoing series, so test that label in step 2.
- "Liked" is relative to the user's own mean, so for someone who scores everything 85-95, titles at 85 count as not liked. Synthetic tests need clearly separated groups, otherwise the metrics look broken.

In the code: cross_validate, community, taste and sweep in src/konomi/evaluate.py; the evaluate command in src/konomi/cli.py; Example.scored in src/konomi/taste.py.
