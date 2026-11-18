---
title: "The offline anime database comes from release downloads, and only its best-fitting entries get fetched from AniList"
author: AbnormallyGrim
date: 2026-11-16
branch: main
cost: { minutes: 1, tokens: 10587 }
id: l-bb2ba862
scope: repo
status: active
src: agent
---

## Decided
The manami-project anime-offline-database (ODbL) is the full-catalog anime source. Each run scores every imported entry with the user's model by matching its lowercase tags and studios to the model's AniList features case-insensitively. Tags count at 0.6 because the database has no tag ranks. Only the top 100 (`--offline-picks`) get their AniList details fetched, cached for 30 days, which keeps within AniList's "no mass collection" rule.

## Tried and ruled out
Cloning the repo: since 2025 it holds no data files, only schemas and docs (and 2.6 GB of history). The data is a release asset; download it with `gh release download latest --repo manami-project/anime-offline-database --pattern 'anime-offline-database.jsonl.zst'`.

## Watch out
Only about half the entries have an AniList ID, and the rest are skipped. The database has no prequel links, so sequels use up fetch slots and are filtered only after fetching. It also has no adult flag; entries tagged "hentai" are skipped unless --adult. Reading .zst uses the standard library's compression.zstd (Python 3.14+). The "latest" release was dated 2026-07-04 when imported.

In the code: src/konomi/offline.py (prescore, top_ids, offline_candidates, TAG_WEIGHT), Store.replace_offline_anime, import-offline-db command in src/konomi/cli.py.
