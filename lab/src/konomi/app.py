"""Streamlit web UI. Start it with `konomi ui`."""

from __future__ import annotations

import html
import os
import re
from dataclasses import replace
from datetime import date, datetime

import altair as alt
import pandas as pd
import streamlit as st

from konomi import account
from konomi import exclusions as ex
from konomi.anilist import AniListClient, AniListError
from konomi.filters import FORMATS, Filters
from konomi.models import ListStatus, Media, MediaType
from konomi.offline import read_offline_db
from konomi.pipeline import NoSyncedList, RunOptions, run
from konomi.preference import NotEnoughHistory, examples, user_mean
from konomi.recommend import Recommendation, build_profile
from konomi.store import Store
from konomi.sync import sync_list
from konomi.themes import GENRES, Themes, tag_categories

DB = os.environ.get("KONOMI_DB", "data/konomi.sqlite")
TOKEN_FILE = account.token_path(DB)
OFFLINE_DEFAULT = "data/offline-db/anime-offline-database.jsonl.zst"
RPM = 30
CARD_MIN_WIDTH = 200
MEDIA_TYPE = "media-type"
SHOW_RATINGS = "show-ratings"
FIRST_YEAR = 1940

# Cards are keyed containers; Streamlit gives each one a `st-key-<key>` class to style.
# The grid fills the width with equal columns at least CARD_MIN wide.
# The title button's ::after covers the whole card, so clicking anywhere opens the details;
# the reason chips sit above it.
CSS = """
<style>
[class*="st-key-card-"] { position: relative; }
.am-cover { position: relative; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden;
  background: rgba(128, 128, 128, 0.18); }
.am-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.st-key-grid { display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(CARD_MIN, 1fr)); gap: 1rem;
  align-items: stretch !important; }
.st-key-grid > div { width: auto !important; min-width: 0; max-width: none !important;
  display: flex; flex-direction: column; }
[class*="st-key-card-"] { width: 100% !important; flex: 1; }
.am-rank { position: absolute; top: 0.3rem; left: 0.3rem; padding: 0.05rem 0.45rem;
  border-radius: 999px; background: rgba(0, 0, 0, 0.72); color: #fff; font-weight: 700;
  font-size: 0.95rem; pointer-events: none; }
[class*="st-key-open-"], [class*="st-key-info-"] { position: static !important; }
[class*="st-key-info-"] { min-width: 0; gap: 0.35rem !important; }
[class*="st-key-open-"] button { justify-content: flex-start; text-align: left; padding: 0;
  min-height: 0; }
[class*="st-key-open-"] button p { font-weight: 600; }
[class*="st-key-open-"] button::after { content: ""; position: absolute; inset: 0;
  cursor: pointer; }
[class*="st-key-why-"] { position: relative; z-index: 1; }
.am-rating { display: flex; justify-content: space-between; font-size: 0.8rem; opacity: 0.8; }
</style>
"""


CSS = CSS.replace("CARD_MIN", f"{CARD_MIN_WIDTH}px")


def main() -> None:
    """Render the page."""
    st.set_page_config(page_title="Konomi.moe", page_icon="🎴", layout="wide")
    if flash := st.session_state.pop("flash", None):
        st.toast(flash)
    store = Store(DB)
    try:
        user, media_type, options = _sidebar(store)
        st.title("Konomi.moe")
        if not user:
            st.info("Enter your AniList username in the sidebar, then sync your list.")
            return
        st.segmented_control(
            "Recommend",
            ["ANIME", "MANGA"],
            default="ANIME",
            required=True,
            format_func=str.title,
            key=MEDIA_TYPE,
            label_visibility="collapsed",
        )
        picks, preferences = st.tabs(["Recommendations", "Your preferences"])
        with picks:
            _recommendations(store, user, media_type, options)
        with preferences:
            _preferences(store, user, media_type)
    finally:
        store.close()


# Sidebar


def _sidebar(store: Store) -> tuple[str, MediaType, RunOptions]:
    with st.sidebar:
        st.header("Your list")
        users = store.synced_users()
        user = st.text_input("AniList username", value=users[0] if users else "").strip()
        # The picker sits above the tabs, but the sidebar renders first: read its state.
        media_type = MediaType(st.session_state.get(MEDIA_TYPE) or "ANIME")

        if user:
            synced = []
            for t in MediaType:
                last = store.last_synced(user, t)
                when = datetime.fromtimestamp(last).strftime("%d %b, %H:%M") if last else "never"
                synced.append(f"{t.value.lower()} {when}")
            st.caption("Last synced: " + " · ".join(synced))
        if st.button("Sync from AniList", disabled=not user, width="stretch"):
            _sync(store, user)

        st.header("Options")
        limit = st.slider("Number of picks", 5, 60, 20, step=5)
        discover = st.toggle(
            "Search AniList for more",
            value=True,
            key="discover",
            help="Searches by your top tags and fetches details for offline picks. "
            "Off uses only cached data.",
        )
        date, count = store.offline_info()
        offline_picks = st.slider(
            "Offline database picks",
            0,
            300,
            100,
            step=25,
            disabled=media_type is MediaType.MANGA or not count,
            help="Best-fitting anime from the offline database to consider. Anime only.",
        )
        adult = st.toggle("Include adult titles", value=False)
        st.toggle(
            "Show AniList ratings",
            value=store.get_meta(SHOW_RATINGS) != "0",
            key=SHOW_RATINGS,
            on_change=_save_show_ratings,
            help="The average score on cards, and the score distribution when you open one. "
            "Hide them to judge picks without the crowd's opinion.",
        )

        if user:
            with st.expander("Exclusions"):
                _exclusions(store, user, media_type)
        with st.expander("AniList account"):
            _account_settings()
        with st.expander("Offline anime database"):
            st.caption(f"{count:,} anime, dataset from {date}" if count else "Not imported")
            path = st.text_input("File", value=OFFLINE_DEFAULT)
            if st.button("Import", width="stretch"):
                _import_offline(store, path)

    return user, media_type, RunOptions(limit, discover, offline_picks, adult)


def _token() -> str | None:
    if token := os.environ.get("ANILIST_TOKEN"):
        return token
    saved = account.load_account(TOKEN_FILE)
    return saved.token if saved else None


def _client() -> AniListClient:
    return AniListClient(requests_per_minute=RPM, token=_token())


def _signed_in_as() -> str | None:
    """Name of the AniList user the token belongs to, looked up once per session."""
    if os.environ.get("ANILIST_TOKEN"):
        if "viewer" not in st.session_state:
            try:
                with _client() as client:
                    st.session_state["viewer"] = account.viewer_name(client)
            except AniListError:
                st.session_state["viewer"] = None
        return st.session_state["viewer"]
    saved = account.load_account(TOKEN_FILE)
    return saved.name if saved else None


def _account_settings() -> None:
    if os.environ.get("ANILIST_TOKEN"):
        st.caption(f"Signed in as **{_signed_in_as() or 'unknown'}** (from `ANILIST_TOKEN`).")
        return
    saved = account.load_account(TOKEN_FILE)
    if saved:
        st.caption(f"Signed in as **{saved.name}**. Lets you add titles to your planning list.")
        if st.button("Sign out", width="stretch"):
            account.forget_account(TOKEN_FILE)
            st.rerun()
        return

    st.caption(
        "Sign in to add titles to your planning list. One-time setup: on "
        f"[AniList's developer settings]({account.DEVELOPER_SETTINGS}), create a client "
        '(its name can\'t include "AniList") with the redirect URL '
        f"`{account.PIN_REDIRECT}`, then paste its ID here."
    )
    client_id = st.text_input("Client ID").strip()
    if client_id.isdigit():
        st.link_button(
            "Approve on AniList", account.AUTHORIZE_URL.format(client_id), width="stretch"
        )
    token = st.text_input("Token AniList shows you", type="password").strip()
    if st.button("Sign in", disabled=not token, width="stretch"):
        try:
            with AniListClient(requests_per_minute=RPM, token=token) as client:
                name = account.viewer_name(client)
        except AniListError as e:
            st.error(f"That token didn't work: {e}")
            return
        account.save_account(TOKEN_FILE, account.Account(token, name))
        st.session_state["flash"] = f"Signed in as {name}"
        st.rerun()


def _sync(store: Store, user: str) -> None:
    """Sync the anime and manga lists."""
    done = []
    try:
        with _client() as client:
            for t in MediaType:
                with st.spinner(f"Syncing {t.value.lower()} list…"):
                    result = sync_list(client, store, user, t)
                done.append(f"{result.entries} {t.value.lower()}")
    except AniListError as e:
        st.error(f"Sync failed: {e}")
        return
    st.session_state.pop("result", None)
    st.success("Synced " + " and ".join(done) + " entries.")


def _import_offline(store: Store, path: str) -> None:
    try:
        with st.spinner("Importing…"):
            date, entries = read_offline_db(path)
            count = store.replace_offline_anime(date, entries)
    except (OSError, ValueError, RuntimeError) as e:
        st.error(f"Import failed: {e}")
        return
    st.success(f"Imported {count:,} anime.")
    st.rerun()


def _exclusions(store: Store, user: str, media_type: MediaType) -> None:
    st.caption(
        "Never recommended. Add more by clicking a title or tag on a pick. "
        "Titles take their sequels with them."
    )
    scope = f"{user.lower()}:{media_type.value}"

    titles = {m.id: m for m in store.all_media(media_type)}
    current = {int(v) for v in store.exclusions(user, ex.TITLE)}
    options = sorted(titles, key=lambda i: titles[i].title.lower())
    _multiselect(
        "Titles",
        options,
        [i for i in options if i in current],
        key=f"ex-title:{scope}",
        format_func=lambda i: _title_label(titles[i]),
        on_change=_save_titles,
        args=(user, set(options), f"ex-title:{scope}"),
    )

    labels = set().union(
        *(m.labels() for t in MediaType for m in store.all_media(t)),
        store.exclusions(user, ex.LABEL),
    )
    _multiselect(
        "Tags, genres and studios",
        sorted(labels, key=lambda k: k.split(":", 1)[1].lower()),
        sorted(store.exclusions(user, ex.LABEL)),
        key=f"ex-label:{user.lower()}",
        format_func=_label_text,
        on_change=_save,
        args=(user, ex.LABEL, None, f"ex-label:{user.lower()}"),
    )

    lists = store.custom_lists(user, media_type)
    chosen = store.exclusions(user, ex.CUSTOM_LIST, media_type)
    if lists or chosen:
        _multiselect(
            f"{media_type.value.title()} custom lists",
            sorted(set(lists) | chosen, key=str.lower),
            sorted(chosen),
            key=f"ex-list:{scope}",
            format_func=lambda n: f"{n} ({len(lists.get(n, ()))})",
            on_change=_save,
            args=(user, ex.CUSTOM_LIST, media_type, f"ex-list:{scope}"),
        )
    else:
        st.caption(f"No {media_type.value.lower()} custom lists. Sync to pick them up.")

    blocked = ex.load(store, user, media_type).media_ids
    known = [m for m in store.get_media(blocked).values() if m.type is media_type]
    if known:
        st.caption(f"Blocking {len(known)} known {media_type.value.lower()} titles.")


def _multiselect(label: str, options: list, default: list, *, key: str, **kwargs) -> None:
    """A multiselect whose first value comes from the store, then from the widget's state."""
    if key in st.session_state:
        st.multiselect(label, options, key=key, **kwargs)
    else:
        st.multiselect(label, options, default=default, key=key, **kwargs)


def _save_titles(user: str, shown: set[int], key: str) -> None:
    with _store() as store:
        hidden = {int(v) for v in store.exclusions(user, ex.TITLE)} - shown
        store.set_exclusions(user, ex.TITLE, map(str, hidden | set(st.session_state[key])))


def _save(user: str, kind: str, media_type: MediaType | None, key: str) -> None:
    with _store() as store:
        store.set_exclusions(user, kind, st.session_state[key], media_type)


class _store:  # noqa: N801 - used like a function
    """A short-lived store for callbacks and dialogs, which outlive the page's own."""

    def __enter__(self) -> Store:
        self.s = Store(DB)
        return self.s

    def __exit__(self, *exc: object) -> None:
        self.s.close()


# Recommendations


def _recommendations(store: Store, user: str, media_type: MediaType, options: RunOptions) -> None:
    options = replace(options, filters=_filters(store, media_type, options.include_adult))
    key = (user.lower(), media_type, options)
    if st.button("Get recommendations", type="primary"):
        try:
            with st.status("Finding picks…", expanded=False) as status, _client() as client:
                online = client if options.discover else None
                result = run(
                    store,
                    online,
                    user,
                    media_type,
                    options,
                    progress=lambda msg: status.update(label=msg),
                )
                status.update(label="Done", state="complete")
        except NoSyncedList:
            st.info("Sync your list first, with the button in the sidebar.")
            return
        except NotEnoughHistory as e:
            st.warning(f"Not enough history to learn from: {e}.")
            return
        st.session_state["result"] = (key, result.recommendations, result.warnings)

    saved = st.session_state.get("result")
    if not saved:
        st.caption("Press the button to rank titles for you.")
        return
    saved_key, recs, warnings = saved
    if saved_key != key:
        st.caption("Settings changed since these picks; press the button to refresh.")
    for w in warnings:
        st.warning(w)

    excluded = ex.load(store, user, media_type)
    shown = [r for r in recs if not excluded.blocks(r.media, store)]
    if len(shown) < len(recs):
        st.caption(
            f"{len(recs) - len(shown)} picks hidden by your exclusions; "
            "press the button to fill their places."
        )
    if not shown:
        st.info("No picks to show. Try syncing again, or turn on searching AniList.")
        return

    st.caption("Click a title for details and actions, or a tag to exclude it.")
    st.html(CSS)
    themes = Themes(tag_categories(store))
    with st.container(horizontal=True, wrap=True, gap="medium", key="grid"):
        for rank, r in enumerate(shown, 1):
            _card(rank, r, themes)

    if (media_id := st.session_state.get("open-title")) is not None:
        rec = next((r for r in shown if r.media.id == media_id), None)
        if rec:
            _title_dialog(user, rec)
        else:
            _close_dialogs()
    elif label := st.session_state.get("open-label"):
        _label_dialog(user, label, shown)


def _filters(store: Store, media_type: MediaType, adult: bool) -> Filters:
    this_year = date.today().year + 1
    with st.expander("Filters", expanded=True):
        left, right = st.columns(2, gap="medium")
        genres = left.multiselect(
            "Genres",
            GENRES + (["Hentai"] if adult else []),
            key="f-genres",
            help="Titles must have all of them.",
        )
        categories = tag_categories(store)
        tags = sorted(n for n, c in categories.items() if adult or c != "Sexual Content") or sorted(
            {t.name for m in store.all_media(media_type) for t in m.tags}
        )
        chosen_tags = right.multiselect(
            "Tags", tags, key="f-tags", help="Titles must have all of them."
        )
        main = st.toggle(
            "Only where these are the main theme",
            key="f-main",
            help="Genres must be what the title is mainly about, judged from its ranked tags: "
            "a romance first, not an action series with a romance subplot. "
            "Tags must rank at least 70%.",
        )
        formats = left.multiselect(
            "Formats",
            FORMATS[media_type],
            key=f"f-formats-{media_type.value}",
            format_func=lambda f: f.replace("_", " ").title().replace("Tv", "TV"),
        )
        start, end = right.slider(
            "First released", FIRST_YEAR, this_year, (FIRST_YEAR, this_year), key="f-years"
        )
        finished = st.toggle("Finished only", key="f-finished")
        hide_listed = st.toggle(
            "Exclude titles already on my list",
            value=True,
            key="f-listed",
            help="Off also ranks unfinished titles on your list: planning, in progress and "
            "paused. Completed and dropped titles never appear.",
        )
        other, verb = ("anime", "watched") if media_type is MediaType.MANGA else ("manga", "read")
        hide_seen = st.toggle(
            f"Exclude titles whose {other} I've already {verb}",
            key=f"f-seen-{media_type.value}",
            help=f"Hides other versions of {other} you've completed, dropped or are "
            f"repeating, including adaptations of the same light novel. Needs your {other} "
            "list synced.",
        )
    return Filters(
        genres=tuple(genres),
        tags=tuple(chosen_tags),
        main_theme=main,
        formats=tuple(formats),
        year_from=start if start > FIRST_YEAR else None,
        year_to=end if end < this_year else None,
        finished_only=finished,
        hide_listed=hide_listed,
        hide_seen_adaptations=hide_seen,
    )


def _save_show_ratings() -> None:
    with _store() as store:
        store.set_meta(SHOW_RATINGS, "1" if st.session_state[SHOW_RATINGS] else "0")


def _ratings_html(m: Media) -> str:
    """AniList's average score and how many users have the title."""
    score = f"★ {m.average_score}%" if m.average_score else "No score yet"
    users = f"{_compact(m.popularity)} users" if m.popularity else ""
    return f'<div class="am-rating"><span>{score}</span><span>{users}</span></div>'


def _ratings_details(m: Media) -> None:
    a, b, c, d = st.columns(4)
    a.metric("Average", f"{m.average_score}%" if m.average_score else "–",
             help="AniList's weighted average score")  # fmt: skip
    b.metric("Mean", f"{m.mean_score}%" if m.mean_score else "–")
    c.metric("Users", _compact(m.popularity) if m.popularity else "–")
    d.metric("Favourites", _compact(m.favourites) if m.favourites else "–")
    if m.score_distribution:
        df = pd.DataFrame(m.score_distribution, columns=["Score", "Users"])
        df["Colour"] = [_score_colour(s) for s in df["Score"]]
        chart = (
            alt.Chart(df)
            .mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3)
            .encode(
                x=alt.X("Score:O", axis=alt.Axis(labelAngle=0)),
                y=alt.Y("Users:Q", axis=alt.Axis(format="~s")),
                color=alt.Color("Colour:N", scale=None),
                tooltip=["Score", alt.Tooltip("Users:Q", format=",")],
            )
            .properties(height=150)
        )
        st.altair_chart(chart, width="stretch")


def _score_colour(score: int) -> str:
    """Red for low scores through to green for high ones, like AniList's chart."""
    return f"hsl({(score - 10) / 90 * 120:.0f},65%,50%)"


def _compact(n: int) -> str:
    """1234567 → 1.2M, 34567 → 35k."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    return f"{n / 1000:.0f}k" if n >= 10_000 else f"{n:,}"


def _card(rank: int, r: Recommendation, themes: Themes) -> None:
    """A card: large cover with the rank in its corner, then details and reasons."""
    m = r.media
    with st.container(key=f"card-{m.id}", border=True, gap="small"):
        img = f'<img src="{html.escape(m.cover_url)}" alt="" loading="lazy">' if m.cover_url else ""
        st.html(f'<div class="am-cover">{img}<span class="am-rank">#{rank}</span></div>')
        with st.container(key=f"info-{m.id}", gap="small"):
            st.button(
                _md(m.title),
                key=f"open-{m.id}",
                type="tertiary",
                on_click=st.session_state.__setitem__,
                args=("open-title", m.id),
            )
            main = [t.genre for t in themes.summary(m) if t.main]
            details = [*_meta(m)[:2], *(["Mainly " + " & ".join(main)] if main else [])]
            st.caption(" · ".join(details))
            if st.session_state.get(SHOW_RATINGS, True) and (m.average_score or m.popularity):
                st.html(_ratings_html(m))
            if r.reasons:
                key = f"why-{m.id}"
                st.pills(
                    "Why",
                    [f"{c.kind}:{c.value}" for c in r.reasons],
                    key=key,
                    format_func=lambda k: k.split(":", 1)[1],
                    label_visibility="collapsed",
                    on_change=_pick_label,
                    args=(key,),
                )


def _close_dialogs() -> None:
    """Forget which dialog is open; dialogs stay open across reruns until this runs."""
    st.session_state.pop("open-title", None)
    st.session_state.pop("open-label", None)


def _done(message: str) -> None:
    """Close the dialog and show `message` after the page reloads."""
    _close_dialogs()
    st.session_state["flash"] = message
    st.rerun()


def _md(text: str) -> str:
    """Escape Markdown, since button labels and headers render it."""
    return re.sub(r"([\\`*_{}\[\]()#+\-.!|~<>])", r"\\\1", text)


def _pick_label(key: str) -> None:
    if label := st.session_state[key]:
        st.session_state["open-label"] = label
    st.session_state[key] = None


@st.dialog("Recommendation", width="large", on_dismiss=_close_dialogs)
def _title_dialog(user: str, rec: Recommendation) -> None:
    m = rec.media
    with _store() as store:
        status = {e.media_id: e.status for e in store.list_entries(user, m.type)}.get(m.id)

    left, right = st.columns([1, 2], gap="medium")
    if m.cover_url:
        left.image(m.cover_url, width="stretch")
    with right:
        st.subheader(_md(m.title))
        st.caption(" · ".join(_meta(m, full=True)))
        with _store() as store:
            themes = Themes(tag_categories(store)).summary(m)
        if themes:
            st.markdown(
                "**Themes:** "
                + " · ".join(
                    f"{t.genre} {t.strength}" + (" (main)" if t.main else "") for t in themes
                ),
                help="How strongly each genre shows in the title's ranked AniList tags (0-100). "
                "A main theme ranks at least 60 and beats every plot-driving genre beside it.",
            )
        if st.session_state.get(SHOW_RATINGS, True):
            _ratings_details(m)
        if rec.sources:
            st.caption(", ".join(dict.fromkeys(rec.sources)))
        st.write(_description(m.id) or "_No description._")

    st.divider()
    a, b, c = st.columns(3)
    with a:
        _planning_button(user, m, status)
    with b:
        if st.button("Exclude title and sequels", width="stretch"):
            with _store() as store:
                current = store.exclusions(user, ex.TITLE)
                store.set_exclusions(user, ex.TITLE, current | {str(m.id)})
            _done(f"Excluded {m.title} and its sequels")
    with c:
        if m.site_url:
            st.link_button("Open on AniList", m.site_url, width="stretch")

    labels = sorted(
        {f"genre:{g}" for g in m.genres}
        | {f"tag:{t.name}" for t in m.tags if not t.spoiler}
        | {f"studio:{s}" for s in m.studios},
        key=lambda k: k.split(":", 1)[1].lower(),
    )
    if labels:
        picked = st.pills(
            "Exclude tags, genres or studios",
            labels,
            selection_mode="multi",
            format_func=lambda k: k.split(":", 1)[1],
            key=f"dialog-labels-{m.id}",
        )
        if st.button("Exclude selected", disabled=not picked):
            with _store() as store:
                store.set_exclusions(user, ex.LABEL, store.exclusions(user, ex.LABEL) | set(picked))
            _done("Excluded " + ", ".join(map(_label_text, picked)))


def _planning_button(user: str, m: Media, status: ListStatus | None) -> None:
    kind = m.type.value.lower()
    if status:
        label = "On your planning list" if status is ListStatus.PLANNING else "On your list"
        st.button(label, disabled=True, width="stretch")
        return
    viewer = _signed_in_as()
    if not viewer:
        st.button(
            f"Add to {kind} planning",
            disabled=True,
            width="stretch",
            help='Sign in under "AniList account" in the sidebar first.',
        )
        return
    if viewer.lower() != user.lower():
        st.button(
            f"Add to {kind} planning",
            disabled=True,
            width="stretch",
            help=f"You're signed in as {viewer}, not {user}.",
        )
        return
    if st.button(f"Add to {kind} planning", type="primary", width="stretch"):
        try:
            with _client() as client, _store() as store:
                account.add_to_planning(client, store, user, m)
        except AniListError as e:
            st.error(f"AniList refused: {e}")
            return
        _done(f"Added {m.title} to your {kind} planning list")


@st.dialog("Exclude?", on_dismiss=_close_dialogs)
def _label_dialog(user: str, label: str, shown: list[Recommendation]) -> None:
    kind, name = label.split(":", 1)
    hits = [r.media.title for r in shown if label in r.media.labels()]
    st.write(f"Never recommend titles with the {kind} **{name}**?")
    if hits:
        st.caption(f"{len(hits)} of the current picks have it: " + ", ".join(hits))
    yes, no = st.columns(2)
    if yes.button("Exclude", type="primary", width="stretch"):
        with _store() as store:
            store.set_exclusions(user, ex.LABEL, store.exclusions(user, ex.LABEL) | {label})
        _done(f"Excluded {_label_text(label)}")
    if no.button("Cancel", width="stretch"):
        _close_dialogs()
        st.rerun()


def _description(media_id: int) -> str:
    cache = st.session_state.setdefault("descriptions", {})
    if media_id not in cache:
        try:
            with _client() as client:
                cache[media_id] = account.description(client, media_id)
        except AniListError:
            return ""
    return cache[media_id]


def _meta(m: Media, full: bool = False) -> list[str]:
    parts = [(m.format or "").replace("_", " "), str(m.year) if m.year else ""]
    if full:
        unit = "episodes" if m.type is MediaType.ANIME else "chapters"
        parts += [
            f"{m.length} {unit}" if m.length else "",
            (m.status or "").replace("_", " ").title(),
            f"{m.popularity:,} users" if m.popularity else "",
        ]
    parts.append(f"★ {m.average_score}%" if m.average_score else "")
    return [p for p in parts if p]


def _title_label(m: Media) -> str:
    details = ", ".join(_meta(m)[:2])
    return f"{m.title} ({details})" if details else m.title


def _label_text(label: str) -> str:
    kind, name = label.split(":", 1)
    return f"{name} ({kind})"


# Preferences


def _preferences(store: Store, user: str, media_type: MediaType) -> None:
    entries = store.list_entries(user, media_type)
    if not entries:
        st.info("Sync your list first, with the button in the sidebar.")
        return
    try:
        profile = build_profile(store, entries, store.list_entries(user, media_type.other))
    except NotEnoughHistory as e:
        st.warning(f"Not enough history to learn from: {e}.")
        return

    scored = [e for e in entries if e.score > 0]
    a, b, c, d = st.columns(4)
    a.metric("On your list", len(entries))
    b.metric("Scored", len(scored))
    c.metric("Your average", f"{user_mean(entries) / 10:.1f} / 10" if scored else "–")
    d.metric("Learned from", len(examples(entries, profile.media)))

    weights = profile.model.weights()
    left, right = st.columns(2)
    with left:
        st.subheader("Pulls you in")
        _weights_table([(k, w) for k, w in weights if w > 0][:15])
    with right:
        st.subheader("Puts you off")
        _weights_table([(k, -w) for k, w in reversed(weights) if w < 0][:15])
    st.caption(
        "How much each feature moves your predicted rating, in points out of 10. "
        "Learned from your scores, drops and rewatches."
    )


def _weights_table(rows: list[tuple[str, float]]) -> None:
    if not rows:
        st.caption("Nothing yet.")
        return
    df = pd.DataFrame(
        [(*k.split(":", 1)[::-1], w) for k, w in rows], columns=["Feature", "Kind", "Strength"]
    )
    st.dataframe(
        df,
        hide_index=True,
        width="stretch",
        height=(len(df) + 1) * 35 + 3,
        column_config={
            "Strength": st.column_config.ProgressColumn(
                format="%.2f", min_value=0.0, max_value=float(df["Strength"].max())
            )
        },
    )


main()
