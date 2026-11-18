---
title: "The Seanime plugin needs Seanime 3.10.4+, runs its whole bundle inside the ui.register callback, and its ID must never change"
author: AbnormallyGrim
date: 2026-11-18
branch: main
id: l-360ac307
scope: repo
status: active
src: agent
---

Moved here from seanime/README.md when the sub-folder READMEs were removed.

## Decided
- Minimum Seanime is 3.10.4, declared as `semverConstraint: ">=3.10.4"` so Seanime (2.8.2+) says "Incompatible with this version of Seanime" instead of failing obscurely. 3.10.4 is needed for plugin dialogs (`ctx.newModal`, used by the AniList button); everything else exists since 3.3.0.
- Permissions are `storage` and `anilist` only. The user's lists come from Seanime's own AniList client (private and custom lists included, no token needed); AniList's public API (titles, searches, tags) is called straight from the page, which AniList allows from any origin.
- On a first run (no saved store) the plugin syncs both lists and ranks picks in goja about 5 s after Seanime starts, so the page usually opens with picks ready. If the page opens while it runs, it shows the loader with the job's progress; if the page opens before the job starts, the job is dropped and the page syncs itself; if the job fails, the page syncs itself too. Later syncs run in the page.

## Watch out
- Calling a Seanime API that doesn't exist while the plugin starts makes Seanime unload the whole plugin. The first build used `ctx.newModal` while the owner ran 3.10.3 and got "Object has no member 'newModal'". Before using a new Seanime API, run the API check against a release's typings: a new API either raises the minimum or gets a `typeof` check with a fallback. Rerun it and the smoke script against new Seanime tags.
- `$ui.register` receives its callback as source text and runs it in a separate runtime, so the whole bundle has to live inside that callback. A build with code outside it failed in real Seanime with `ReferenceError: LABEL is not defined`.
- The plugin ID is the key for its storage: changing it loses every user's saved data. It was renamed once, from animanga-recommendations to konomi-moe on 2026-11-18, when the app was named Konomi.moe; the owner reinstalls and resyncs after that. Don't rename it again once people use it. Seanime also rejects a manifest without an author.
- Install with Extensions → Add extensions → **Install from URL** (the top box). Seanime refuses plugins from repositories. Copying the JSON into the extensions folder (macOS: ~/Library/Application Support/Seanime/extensions/) and restarting also works.
- The page runs in an iframe sandboxed with `allow-scripts allow-forms`: null origin, no localStorage or IndexedDB, so storage goes through the plugin over `window.webview.send` / `.on`.
- goja lacks `setTimeout`, `structuredClone` and `performance`, and `ctx.fetch` returns Go-style headers; the background sync patches these in. graphql.anilist.co is on Seanime's built-in allow list, so no extra permission is needed.

In the code: seanime/scripts/build.ts (`ID`, `MIN_SEANIME`, `NAME`), seanime/scripts/check-api.ts (`node scripts/check-api.ts <seanime clone> [tag]`, `REQUIRED` / `OPTIONAL` lists), seanime/scripts/smoke.ts, seanime/src/background.ts (`prepareRuntime`, `gojaTransport`), seanime/src/protocol.ts. Build with `npm run build -w seanime` → seanime/dist/konomi-moe.json; serve it with `npm run serve -w seanime` (CORS headers, which the icon needs; python's http.server lacks them) for Install from URL (`MANIFEST_URI=…` overrides the address). Seanime's manifest checks live in internal/extension_repo/utils.go in Seanime's repo.
