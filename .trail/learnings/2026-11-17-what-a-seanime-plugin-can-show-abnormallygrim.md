---
title: "What a Seanime plugin can show and use, for designing the plugin version"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-5c4f4746
scope: repo
status: active
src: agent
---

## Decided
The plugin version (design/layout/seanime.html) has no Profile or account linking, because Seanime already has the user signed in to AniList. Its "Settings" holds only preferences and exclusions. The owner agreed the plugin's layout differs from the desktop app's (design/layout/desktop.html).

## Watch out
Facts from the owner's local Seanime clone (commit 4bdff7b2, 2026-10-14), in internal/extension_repo/goja_plugin_types/plugin.d.ts:
- Plugins are JS/TS run by goja inside Seanime, not Node, so npm packages with native parts won't load. Check which modern JS features work with a tiny test plugin before porting the engine, otherwise the port may hit unsupported syntax late.
- Permissions: "storage" (key-value $storage), "database", "anilist". Network access is an allow-list of domains, so AniList's GraphQL domain must be listed.
- $anilist gives the user's collections including custom lists (getRawAnimeCollection / getRawMangaCollection), customQuery for any GraphQL using Seanime's token, and updateEntry for add-to-planning. That's why the plugin needs no sign-in flow.
- UI: newTray (an icon with a small popover built from Seanime's own components, not free HTML, so it's kept to a quick glance), newWebview with slot "screen" (a full page at /webview?id=<plugin>) or inline slots such as after-discover-screen-header, after-media-entry-details and home-screen-bottom, plus "fixed" floating windows, newModal and newCommandPalette.
