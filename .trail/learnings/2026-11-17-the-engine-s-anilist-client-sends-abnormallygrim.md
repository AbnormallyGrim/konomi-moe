---
title: "The engine's AniList client sends requests through a swappable transport, with plain-object types and queries generated from the lab"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-8480ba3f
scope: repo
status: active
src: agent
---

## Decided
- The engine's AniListClient (engine/src/anilist/client.ts) sends every request through a Transport function and keeps the rate limiting and retries itself, because the hosts differ. The browser extension uses fetchTransport (fetch plus a bearer token). The Seanime plugin will relay to Seanime's $anilist client, which holds the user's token, from inside its sandboxed frame. Clock, sleep and epoch time are injectable, so the tests run instantly.
- Engine types (engine/src/models.ts) are plain objects with helper functions (prequelIds, mediaLabels, otherType…), not classes, because they must survive JSON storage and Seanime's webview channel unchanged. Fields are camelCase versions of the lab's snake_case.
- engine/src/anilist/queries.ts is generated from lab/src/konomi/anilist/queries.py, and lab/tests/test_queries_sync.py fails if they differ, because a hand-copied GraphQL string drifts silently.

## Watch out
- Biome wraps long string constants onto the next line (`export const X =\n  "...";`), so the sync test's pattern allows whitespace after `=`. It first failed with KeyError when it expected one line.
- Biome also formats Markdown under engine/ (it realigned the README tables).
- Node 24 runs .ts files directly (type stripping), so a quick live check is `node script.ts` importing engine/src/index.ts. That works because the engine uses .ts import extensions and no TS-only runtime syntax such as enums or parameter properties. Keep it that way.
- Checked live against AniList: the lookup, discovery and list queries (a made-up user gives 404 "User not found") all parse.

In the code: AniListClient, fetchTransport, Transport in engine/src/anilist/client.ts; parseMedia, parseListChunk in engine/src/anilist/parse.ts; engine/src/models.ts; lab/tests/test_queries_sync.py.
