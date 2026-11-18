---
title: "Recommendation cards keep large vertical covers in a full-width grid, with the rank on the cover and no fit score or Why line"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-1eb53f40
scope: repo
status: active
replaces: l-6b777865
src: agent
---

## Decided
- Cards are vertical: a full-width 2:3 cover drawn as one st.html block with the bold rank badge in its top-left corner, then the title, one details line ("MANGA · 2022 · Mainly Romance"), the AniList score line and reason chips. The owner likes the large covers.
- The grid container (`key="grid"`) is a CSS grid, `repeat(auto-fill, minmax(200px, 1fr))` (CARD_MIN_WIDTH), so cards fill the window (4 per row at 1440px with the sidebar, 7 at 2000px) with equal heights per row.
- No fit score anywhere, and no "Why:" line in the opened card: the owner said users don't know what the fit number means, then asked for the Why line to go too. Reason chips stay on the cards, because clicking one offers to exclude it.
- The Anime/Manga picker sits above the tabs (key `media-type`; the sidebar reads it from session state). Sync from AniList syncs both lists.

## Tried and ruled out
- Fixed 200px cards in a wrapping flex row: left a wide empty band on the right.
- Short horizontal cards (110px cover beside the details): the owner disliked the small covers, so it was reverted the same day.
- Tightening caption line-height: wrapped detail lines overlapped the rating line. Only the inner container gap is tightened (0.35rem).

## Watch out
- `.st-key-grid` needs `align-items: stretch !important`, because Streamlit's horizontal container sets flex-start. Each wrapper also needs display:flex with `flex: 1` on the card, for equal heights.
- Streamlit makes element and block containers `position: relative`, which traps the title button's ::after click area. `st-key-open-*` and `st-key-info-*` are forced to `position: static`.
- In Playwright checks, scroll into view before clicking by coordinates.

In the code: CSS, CARD_MIN_WIDTH and _card in src/konomi/app.py.
