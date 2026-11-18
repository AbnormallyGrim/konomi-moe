---
title: "Excluding a title follows AniList's sequel links forward on every run, and custom-list exclusions block those titles and their sequels"
author: AbnormallyGrim
date: 2026-11-16
branch: main
id: l-d22cbe5b
scope: repo
status: active
src: agent
---

## Decided
The owner asked for exclusions of titles, tags and AniList custom lists, with "excluding a title excludes all its sequels". Sequels are the same-type SEQUEL relations, followed link by link from each excluded title (sequel_closure). This runs on every recommendation run with a client, and fetch_media only fetches links not cached in the last 30 days, so it usually costs no requests and picks up newly announced seasons. Nothing stores the resolved chain, so it can never go stale. A custom-list exclusion means none of that list's titles and none of their sequels are recommended. List titles still train the model; the owner didn't ask for them to be left out of learning. Tags and genres are stored as "tag:Name" / "genre:Name" so discovery can send them separately as tag_not_in and genre_not_in.

## Tried and ruled out
Relying only on walking each candidate's prequels through the cache: it breaks when a middle season isn't cached (season 3 → uncached season 2 → excluded season 1). That walk is kept only as a second check in Exclusions.blocks.

## Watch out
- AniList often marks films as SEQUELs, so they're excluded with the series. In the real check, Laid-Back Camp's chain included the film and an announced season 4.
- Custom list membership comes from the list query's lists where isCustomList is true. Those lists repeat entries, so entries are deduplicated by title ID. Membership is replaced on each sync.
- In the UI, the multiselects save in on_change callbacks, so the change lands before the Recommendations tab renders on the same rerun. Exclusions are part of the key that marks saved picks as out of date. Title exclusions are global, so saving one type's picker keeps the excluded IDs that aren't shown in it.

In the code: src/konomi/exclusions.py (load, sequel_closure, Exclusions.blocks), Store.set_exclusions and custom_lists, the exclude commands in cli.py, _exclusions in app.py.
