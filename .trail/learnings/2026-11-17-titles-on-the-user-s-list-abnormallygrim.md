---
title: "Titles on the user's list are hidden by default, Planning included, and the cross-media filter hides only adaptations of finished titles"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-004db80f
scope: repo
status: active
src: agent
---

## Decided
The owner asked for two filters and chose both defaults when asked:
- "Exclude titles already on my list" is on by default and hides Planning titles too. Before, Planning titles were always shown as "on your planning list". Turning it off (include_listed / --show-listed) ranks only unfinished list titles (Planning, Current, Paused); completed and dropped titles never appear.
- "Exclude titles whose anime I've watched / manga I've read" counts only COMPLETED and REPEATING as finished. A started or dropped counterpart doesn't hide the title.

Cross-media links are AniList's ADAPTATION and SOURCE relations, checked from both sides: the finished title's links to this type, and the candidate's links back to the finished IDs. Often only one side has the link cached. When the other type's list isn't synced, the filter can't work, and the run adds a warning instead of failing silently.

## Watch out
These two flags live on Filters but don't make Filters.active true, because AniList's search can't apply them. They're applied in pipeline.run's accept() and recommend(include_listed=…), not in Filters.accepts.

In the code: UNFINISHED and include_listed in src/konomi/recommend.py; SeenAdaptations and seen_adaptations in src/konomi/filters.py; the f-listed and f-seen-* toggles in app.py.
