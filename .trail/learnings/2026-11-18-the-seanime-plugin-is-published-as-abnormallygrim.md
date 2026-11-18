---
title: "The Seanime plugin is published as a manifest committed to main and installed from its raw GitHub link"
author: AbnormallyGrim
date: 2026-11-18
branch: main
id: l-f07b8092
scope: repo
status: active
src: agent
---

## Decided
Hosting must be free. Seanime has no plugin store and refuses plugins from extension repositories, so users install from a URL. The manifest is committed to main and installed from its raw.githubusercontent.com link, the same way community plugins in Seanime-contributions/Seanime-Providers are. Committing a new build to main is a release.

## Tried and ruled out
- GitHub Releases (`releases/latest/download/…`): works too, but the owner chose the raw-link convention other Seanime plugins use.
- A konomi.moe domain: not free.

## Watch out
- The link only works while the repo is public.
- Every installed copy checks `manifestURI` for updates, so the path must never move. Seanime only offers an update when `version` changes: bump seanime/package.json before each release.
- raw.githubusercontent.com caches for a few minutes, so a release isn't visible instantly.
- A normal build still points at localhost for local testing; only `--release` bakes in the public link.

In the code: seanime/scripts/build.ts (`RELEASE_URI`, `--release`), `npm run release -w seanime` (build + smoke, writes seanime/release/konomi-moe.json), biome.json ignores seanime/release.
