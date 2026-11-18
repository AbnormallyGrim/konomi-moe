---
title: "The Seanime plugin is a side-menu page running the same web UI as the browser extension, with a thin relay to Seanime"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-9ccb6ff2
scope: repo
status: active
replaces: l-5c4f4746
src: agent
---

## Decided
- The owner wants the Seanime plugin reached from a "For you" item in Seanime's side menu that opens a full page, like Seanime's own Manga or My lists, not a small modal. Seanime supports this, because a webview with slot "screen" can pass `sidebar: { label, icon }` and gets one menu item per plugin, opening /webview?id=<plugin> (see seanime-web/src/app/(main)/_features/plugin/webview/plugin-sidebar.tsx).
- The desktop app was dropped for a browser extension, because stores remove the code-signing problem and users already use AniList in the browser. So the plugin page and the extension tab share one web UI (design/mock/app.html shows both through its Host switch): inside Seanime, Seanime's menu replaces our sidebar, page tabs (For you · Your taste · Settings) replace our nav, and Settings has no Accounts, since Seanime is already signed in.

## Watch out
- Seanime renders the plugin's HTML (webview.setContent returns a string) in an iframe with sandbox="allow-scripts allow-forms". That gives a null origin, so the frame can't use localStorage or IndexedDB, and the UI must be bundled into one HTML string. Storage, AniList queries with the user's token, updateEntry and navigation go through the plugin context over webview.channel, because only the plugin context has $storage, $anilist and ctx.screen.
- Run the engine inside the frame, not in the plugin context. The frame is normal browser JavaScript, while the plugin context is goja, which isn't Node and may lack modern JS features.
- Other plugin surfaces: newTray (a small popover from Seanime's components, not free HTML), inline webview slots such as after-discover-screen-header and after-media-entry-details, plus "fixed" floating windows, newModal and newCommandPalette. Permissions: "storage", "database", "anilist", with network access as a domain allow-list. Source: the owner's clone at commit 4bdff7b2 (2026-10-14), internal/extension_repo/goja_plugin_types/plugin.d.ts.
