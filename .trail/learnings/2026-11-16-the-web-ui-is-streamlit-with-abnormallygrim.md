---
title: "The web UI is Streamlit, with the cards drawn as HTML, and shares one recommendation pipeline with the CLI"
author: AbnormallyGrim
date: 2026-11-16
branch: main
id: l-cfbadd08
scope: repo
status: active
src: agent
---

## Decided
The frontend is Streamlit, started with `konomi ui`, because the tool is local and single-user and Streamlit stays in Python with the model code. The recommendation cards are one `st.html` block with its own CSS grid: native columns plus `st.image` gave uneven card heights and no badges over the covers. The CSS uses translucent greys and inherited colours so it works in light and dark themes. All the steps of a run live in pipeline.run(), which the CLI and UI both call, so they can't drift apart.

## Watch out
- `st.status(...).update` takes keyword arguments only, so pass `progress=lambda msg: status.update(label=msg)`, not the bound method. Rich's status.update takes it positionally, which is why the CLI can pass it directly.
- Every title, URL and reason goes through html.escape before reaching st.html. A test checks a title containing `<`.
- Titles cached before the cover field existed have no cover. The pipeline refetches only those shown (`fetch_media(..., max_age=0)`) instead of throwing away the cache.
- The UI opens a new SQLite connection on each Streamlit rerun and closes it at the end. A cached connection would break, because Streamlit reruns on other threads.
- Test the UI with streamlit.testing.v1.AppTest (tests/test_app.py) with discovery switched off, so no AniList requests happen. For a visual check, headless Brave plus Playwright from a scratch folder works (Chrome isn't installed).

In the code: src/konomi/app.py (_card, CSS), src/konomi/pipeline.py (run, _fill_covers), ui command in src/konomi/cli.py.
