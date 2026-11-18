---
title: "A genre's main theme is judged from its strongest ranked tag against plot-driving rival genres, and AniList's tag_in and genre_in need all their values"
author: AbnormallyGrim
date: 2026-11-16
branch: main
id: l-a7a954be
scope: repo
status: active
src: agent
---

## Decided
The owner wanted filters such as "only romance manga" and, where possible, "romance as the main theme, not an action shounen with a romance subplot". AniList ranks tags (0-100) but not genres, so a genre's strength is the rank of its strongest supporting tag: tags in the matching AniList tag category (fetched from MediaTagCollection, cached 30 days) plus hand-picked tags for genres with no category. A listed genre counts at least 50. A genre is the main theme when it's listed and either it's the only plot-driving genre listed, or it's at least 60 and no plot-driving rival beside it is stronger. Comedy, Drama, Slice of Life, Ecchi and Music never compete, so a romcom is still romance. For tags, main theme means rank 70 or more. Filters also go to AniList's search, so the candidate pool is gathered within them, not just trimmed.

## Tried and ruled out
- Romance tag rank alone: harem and action titles score just as high (Date A Live 97, Chainsaw Man film 88, Sword Art Online 85). Comparing against rivals is what separates them.
- A plain 60 cut-off: lesser-known romcom manga often have romance tags ranked around 40, or none, and were wrongly dropped (Bus for Two, My Teasing Fiancée). Then "untagged and no rival": still wrong, because those titles have a weak tag. Final rule: no plot-driving rival listed means main.

## Watch out
- AniList's `tag_in` and `genre_in` require ALL their values (checked: every result had both). The old discovery sent the 3 top tags in one tag_in and so found titles with all three. It now searches each tag separately.
- AniList's pageInfo.total is always 5000 here, so it's useless for counting. Check returned rows instead.
- `minimumTagRank` applies to every tag in tag_in.
- AppTest found widgets by position (`at.toggle[0]`); adding the filters moved them, and tests silently hit the network. Widgets the tests use now have keys, and an autouse fixture refuses real HTTP.

In the code: src/konomi/themes.py (Themes.is_main, RIVALS, GENRE_TAGS), src/konomi/filters.py (Filters.accepts, query_variables), the discovery loop in src/konomi/pipeline.py.
