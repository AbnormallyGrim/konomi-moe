---
title: "Titles on the user's list are hidden by default, and the cross-media filter hides every version of a story the user completed or dropped"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-0f4a0202
scope: repo
status: active
replaces: l-004db80f
src: agent
---

## Decided
- "Exclude titles already on my list" is on by default and hides Planning titles too. Turning it off (include_listed / --show-listed) ranks only unfinished list titles (Planning, Current, Paused); completed and dropped titles never appear. The owner chose this.
- "Exclude titles whose anime I've watched / manga I've read" counts COMPLETED, REPEATING and DROPPED. The owner first chose completed-or-repeating, then reported a dropped anime's manga still showing as a bug, so dropped counts now. Current and Paused still don't.
- Versions of a story are linked by ADAPTATION, SOURCE or ALTERNATIVE, checked from both sides, plus one more hop within the target type.

## Tried and ruled out
Only ADAPTATION and SOURCE, one hop: this missed real cases. The Angel Next Door anime links to the light novel by ADAPTATION, and the light novel links to the manga. The manga links back to the anime only by ALTERNATIVE. AniList files novels as MANGA, so the novel is a same-type stop on the way to the manga.

## Watch out
- The extra hop through a source novel can also catch spin-off manga that the novel lists as ADAPTATION. The owner hasn't objected.
- Links come only from cached titles; nothing is fetched.
- The flags live on Filters but don't set Filters.active, since AniList's search can't apply them. They're applied in pipeline.run's accept() and recommend(include_listed=…).

In the code: CROSS_MEDIA, SEEN, SeenAdaptations, seen_adaptations and _versions in src/konomi/filters.py; UNFINISHED and include_listed in src/konomi/recommend.py.
