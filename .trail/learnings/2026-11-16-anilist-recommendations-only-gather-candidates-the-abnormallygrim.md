---
title: "AniList recommendations only gather candidates; the user's own model ranks them"
author: AbnormallyGrim
date: 2026-11-16
branch: main
cost: { minutes: 10, tokens: 10587 }
id: l-cddb0964
scope: repo
status: active
src: agent
---

## Decided
Two stages. Candidates come from AniList user recommendations of titles the user liked, a search for top-scored titles with the user's most-liked tags (excluding most-disliked), and the planning list. A ridge regression on the user's own labels (scores centred on their mean, drops weighted by how early they dropped, rewatch bonus, planning excluded) ranks them. AniList's per-title recommendations alone ignore dislikes, why the user liked a title, and how much, and favour popular titles. The owner first read the design as "just AniList's recommendations", so explain this split up front when describing it.

"Liked" means at or above the user's own average, not strictly above it: with strictly above, a user who scores everything they finish at the same value has no liked titles and gets no candidates.

## Watch out
If a title never reaches the candidate pool the model can't recommend it; the tag search is what widens the pool toward the user's taste. Sequels whose prequel isn't on the list are filtered out, and spoiler tags are kept as features but never shown as reasons.

In the code: Example.liked and label() in src/konomi/taste.py; recommend() and discovery_tags() in src/konomi/recommend.py.
