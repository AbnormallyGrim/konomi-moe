---
title: "Cards show only AniList's score; the score distribution chart lives in the details dialog, and one toggle hides both"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-fa385f36
scope: repo
status: active
src: agent
---

## Decided
The owner asked for AniList ratings and the score distribution, with an option to hide them. They then clarified that the numerical rating goes on the card and the distribution chart only in the opened card (the details dialog). So the card shows "★ average%" and the user count. The dialog shows average, mean, users, favourites and the distribution as an Altair bar chart coloured red to green like AniList's. "Show AniList ratings" in the sidebar hides both and is saved in the cache's meta table (key show-ratings), so it survives restarts.

## Tried and ruled out
A mini 10-bar distribution on every card: built, then removed, because the owner wanted the chart only when a card is opened.

## Watch out
- score_distribution is None for titles cached before the field existed, and [] when AniList has no scores. Only None triggers the one-off refetch of shown picks (pipeline._fill_details, formerly _fill_covers).
- The tuples are stored as JSON lists; Media.from_dict turns them back into tuples so cached and fresh Media compare equal.
- st.bar_chart sorted the x axis as strings and turned labels sideways, which is why the dialog uses Altair with an ordinal x axis.

In the code: _ratings_html, _ratings_details, _score_colour and SHOW_RATINGS in src/konomi/app.py; _fill_details in src/konomi/pipeline.py; the stats { scoreDistribution } fields in queries.py.
