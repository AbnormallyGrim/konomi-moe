---
title: "Never pull the whole AniList catalog, even slowly; fetch only what a run needs and cache it"
author: AbnormallyGrim
date: 2026-11-16
branch: main
cost: { minutes: 10, tokens: 10587 }
id: l-2d3169c8
scope: repo
status: active
src: agent
---

## Decided
The owner wanted a full local copy of the AniList catalog, synced slowly, so early recommendations could pick from everything. Dropped after reading AniList's API terms: "Hoarding or mass collection of data from the AniList API is strictly prohibited", and using the API "as a backup or data storage service" is also banned. Going slowly only reduces load; it doesn't change that it's mass collection, and personal use is not an exception (only school-style educational projects get leniency). The tool fetches only the user's list, the details of titles recommended from ones they liked, and one tag search per run, and caches those.

## Tried and ruled out
- Full crawl at a slow rate: still mass collection.
- A scheduled job that publishes a precomputed catalog as static JSON (for a GitHub Pages version): same problem, plus redistribution.

## Watch out
A full catalog wouldn't improve early accuracy much anyway: accuracy comes from how much the model knows about the user, and taste-driven tag searches reach the relevant part of the catalog. The openly licensed manami-project anime-offline-database is the allowed way to get a full anime candidate list (no manga equivalent known). Asking AniList for permission is the only route to a full crawl.

In the code: src/konomi/sync.py (sync_list, fetch_media, discover), MEDIA_MAX_AGE = 30 days cache freshness.
