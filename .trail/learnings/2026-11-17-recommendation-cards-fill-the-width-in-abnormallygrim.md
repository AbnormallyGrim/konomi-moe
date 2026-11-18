---
title: "Recommendation cards fill the width in a CSS grid, show the rank on the cover and no fit score, and open dialogs on click"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-79aa259b
scope: repo
status: active
replaces: l-0325eb0e
src: agent
---

## Decided
- Cards are keyed native containers (`card-<id>`) inside a container keyed `grid`, restyled as a CSS grid (`repeat(auto-fill, minmax(200px, 1fr))`) so cards fill the window with no empty space on the right. The owner reported that space with fixed 200px cards in a wrapping flex row.
- Cover and rank badge are one st.html block (`.am-cover` with a 2:3 ratio, `.am-rank` bold in the top-left), so the cover fills the card and a missing cover shows a grey placeholder.
- No fit score anywhere (card, dialog, CLI): the owner said users don't know what it means. The dialog says "Why: …" with the reasons, and the score only orders the picks.
- The Anime/Manga picker sits above the tabs (key `media-type`). The sidebar renders first, so it reads st.session_state["media-type"]. Sync from AniList syncs both lists.
- Clicking anywhere on a card opens the details dialog, through the title button's ::after covering the card. Reason chips sit above it and open "exclude?". Dialog flags stay set until on_dismiss, Cancel or an action clears them.

## Watch out
- Streamlit's horizontal container sets align-items: flex-start, which also stops grid items from stretching. `.st-key-grid` needs `align-items: stretch !important`, and each wrapper needs display:flex with `flex: 1` on the card, for equal heights per row.
- Streamlit gives the title's element container `position: relative`, which traps the ::after click area; the CSS overrides it with `position: static !important`. Bold has to target `button p`.
- In Playwright checks, scroll an element into view before clicking by coordinates. A click below the fold silently does nothing, which looked like a broken overlay.
- Button labels and subheaders render Markdown, so titles go through _md(). Dialogs open their own short-lived Store.

In the code: CSS, _card and _recommendations in src/konomi/app.py; the media-type picker in main().
