---
title: "Model tuning: stronger completion signal, alpha 10, both lists in training, and more community weight for short lists"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-6501b2a0
scope: repo
status: active
replaces: l-f5c5f7af
src: agent
---

## Decided
- `konomi evaluate` (src/konomi/evaluate.py) runs 5-fold cross-validation graded on a fixed answer key (truth in src/konomi/taste.py): scores, unscored completions, rewatches and drops. Unscored PAUSED and CURRENT are never graded, because changing their labels would otherwise also change the answers. They still train.
- Adopted after a grid of 9 label variants × alpha × min features × community weight × other-list weight, with the top 10 re-run on 5 seeds: unscored completed +1.0 at weight 0.7 (Labels.completed); TasteModel alpha 10 with min_feature_count 1; build_profile trains on both lists, because anime and manga share tags and format is a feature; community_weight = 0.6 × 150 / labelled titles, between 0.6 and 3, because short lists teach the model little. On the owner's lists: anime AUC 0.67 → 0.70 and rank correlation 0.28 → 0.39; manga 0.38 → 0.67.

## Tried and ruled out
- Treating unscored PAUSED as neutral or as a like (the hunch was "caught up on an ongoing manga"): no measurable difference, within noise, so the label stays -0.5 at weight 0.3.
- Milder or harsher drop penalties: no gain.

## Watch out
- On a 28-title manga answer key, community score alone (AUC 0.74) still beats the model (0.67). That's too few titles to trust either way.
- Top-k hit rate caps k at each fold's liked titles, because otherwise small folds make even a perfect ranking score low (the test hit 33% for AUC 1.0).
- "Liked" is relative to the user's own mean, so synthetic tests need clearly separated groups. With a tiny synthetic list, the size-aware community weight dominates; model-only tests pass community=0.

In the code: cross_validate, taste, sweep in src/konomi/evaluate.py; Labels, truth, community_weight in src/konomi/taste.py; build_profile in src/konomi/recommend.py.
