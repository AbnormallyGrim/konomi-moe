---
title: "Recommendation cards are native Streamlit containers that open dialogs, so a click can exclude a title or tag or add it to planning"
author: AbnormallyGrim
date: 2026-11-16
branch: main
id: l-0325eb0e
scope: repo
status: active
replaces: l-cfbadd08
src: agent
---

## Decided
The owner wanted to click a title or tag on a recommendation to act on it, instead of a separate Exclusions tab. So the cards moved from one st.html block (which can't send clicks back to Python) to keyed native containers in a wrapping horizontal container (`key="grid"`), styled through Streamlit's `st-key-<key>` classes. The title button's ::after pseudo-element covers the whole card, so clicking anywhere opens the details dialog; reason chips (st.pills) sit above it with z-index and open an "exclude?" dialog. Exclusion management moved to a sidebar expander for undo and custom lists. Adding to planning uses AniList's SaveMediaListEntry mutation with a token from AniList's PIN sign-in (implicit grant with redirect `https://anilist.co/api/v2/oauth/pin`), because a local app has no redirect target and Streamlit can't read URL fragments.

## Tried and ruled out
- A custom component for clickable HTML cards: native widgets were enough.
- Clearing a dialog's open flag the moment it opened: any full rerun then dropped clicks made inside the dialog, and AppTest reruns the whole script. The flags ("open-title", "open-label") stay set until on_dismiss, Cancel or an action clears them.

## Watch out
- Streamlit gives the title's element container `position: relative`, which traps the ::after click area. The CSS overrides it with `position: static !important`. Bold has to target `button p`, not the button.
- Button labels and subheaders render Markdown, so titles go through _md() to escape it.
- The AniList token has no scopes and is valid for a year. It's kept in data/anilist_token.json (mode 600, git-ignored), not in the cache DB. ANILIST_TOKEN takes priority. Planning is only offered when the token's Viewer name matches the user shown.
- Dialogs open their own short-lived Store, because the page closes its own at the end of each run.
- `set.intersection(a, b)` intersects with both sets (AND); use `banned & {*a, *b}`. This bit the offline studio filter and a test caught it.
- Exclusions now filter saved picks at render time, so excluding takes effect without a new run, and they're no longer part of the "settings changed" key.

In the code: src/konomi/app.py (CSS, _card, _title_dialog, _label_dialog, _close_dialogs, _md), src/konomi/account.py.
