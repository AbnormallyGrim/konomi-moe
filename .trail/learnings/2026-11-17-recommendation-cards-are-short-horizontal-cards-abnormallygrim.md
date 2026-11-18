---
title: "Recommendation cards are short horizontal cards in a full-width grid, with the rank on the cover, no fit score, and dialogs on click"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-6b777865
scope: repo
status: active
replaces: l-79aa259b
src: agent
---

## Decided
- Each card is a horizontal keyed container (`card-<id>`). On the left, a 110px cover (COVER_WIDTH) drawn as one st.html block with the bold rank badge in its top-left corner. Beside it, an `info-<id>` container with the title, one details line ("MANGA · 2022 · Mainly Romance"), the AniList score line and reason chips. The owner found tall vertical cards (2:3 cover across the card, ~570-600px) too long and asked for shorter, wider ones. Horizontal cards are about 200-290px tall.
- The grid container (`key="grid"`) is restyled as a CSS grid with `repeat(auto-fill, minmax(300px, 1fr))` (CARD_MIN_WIDTH), so cards fill the window: 3 per row at 1440px with the sidebar, 4 at 2000px.
- No fit score anywhere (the owner said users don't know what it means). The rank badge shows the order, and the dialog says "Why: …".
- The Anime/Manga picker sits above the tabs (key `media-type`; the sidebar reads it from session state). Sync from AniList syncs both lists.
- Clicking anywhere on a card opens the details dialog, through the title button's ::after covering the card. Reason chips sit above it with z-index and open "exclude?".

## Tried and ruled out
- Fixed 200px cards in a wrapping flex row: left a wide empty band on the right.
- Vertical cards in a stretching grid: filled the width but were far too tall.
- Tightening caption line-height inside cards: wrapped detail lines overlapped the rating line. Only the container gap is tightened (0.35rem).

## Watch out
- Streamlit's horizontal container sets align-items: flex-start, which also stops grid items from stretching. `.st-key-grid` needs `align-items: stretch !important`, and each wrapper needs display:flex with `flex: 1` on the card.
- Streamlit makes element and block containers `position: relative`, which traps the ::after click area. Both `st-key-open-*` and `st-key-info-*` are forced to `position: static`.
- In Playwright checks, scroll an element into view before clicking by coordinates; a click below the fold silently does nothing.
- Titles go through _md() because button labels render Markdown. Dialogs open their own short-lived Store.

In the code: CSS, CARD_MIN_WIDTH, COVER_WIDTH and _card in src/konomi/app.py; the media-type picker in main().
