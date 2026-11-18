---
title: "The engine's run pipeline sits on an async Store; MemoryStore saves as JSON, and sync now drops titles repeated across chunks"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-033fa754
scope: repo
status: active
src: agent
---

## Decided
- The engine's `Store` (engine/src/store.ts) is an async interface, because both real backends are async: IndexedDB in the extension, and Seanime's $storage reached through the webview channel. `MemoryStore` is the reference implementation. Its toJSON/fromJSON give the Seanime plugin one value to put in $storage, and later an export/import feature.
- `run` (engine/src/pipeline.ts) ports the lab's pipeline. Ranking needs synchronous lookups, so run loads everything it will consult into a Map first: list titles, candidates, each candidate's prequel chain, and two hops of seen-adaptation versions. Then it ranks over a lookup of that Map.
- The lab's offline anime database isn't ported (anime-only, a 6 MB download); the extension decides later.

## Tried and ruled out
Deduplicating list entries only inside parseListChunk: a title on a custom list can arrive again in a later chunk, so syncList (engine/src/sync.ts and lab/src/konomi/sync.py) now keeps the first across chunks. In the lab that duplicate failed the whole sync with "UNIQUE constraint failed" on list_entries. It never happened on the owner's two-chunk anime list, but it would on any large list with custom lists.

## Watch out
- Live, in memory: the first sync of 517 anime and 147 manga took about 37 s, mostly the 30-a-minute rate limit while fetching 650 candidates. A run with discovery took about 8 s. The whole store is 2.5 MB of JSON.
- `discover` drops unset variables (empty arrays, null, 0, false, "") like the lab does, because AniList treats an empty list filter as a real filter.
- Pipeline tests use engine/test/fake-anilist.ts, which routes by comparing the query string with `queries.*`, so a new query needs a branch there.

In the code: Store, MemoryStore in engine/src/store.ts; syncList, fetchMedia, discover in engine/src/sync.ts; run, loadExclusions, tagCategories in engine/src/pipeline.ts.
