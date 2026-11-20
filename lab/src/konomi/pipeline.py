"""One recommendation run, shared by the CLI and the web UI."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from konomi import crowd, exclusions
from konomi.anilist import AniListClient, AniListError
from konomi.filters import Filters, listed_versions, seen_adaptations
from konomi.models import Media, MediaType
from konomi.offline import offline_candidates
from konomi.recommend import Profile, Recommendation, build_profile, discovery_tags, recommend
from konomi.store import Store
from konomi.sync import discover, fetch_media
from konomi.themes import Themes, tag_categories


@dataclass
class RunOptions:
    """Settings for a recommendation run."""

    limit: int = 20
    discover: bool = True
    offline_picks: int = 100
    include_adult: bool = False
    filters: Filters = field(default_factory=Filters)
    # Anime: picks learned from other people's lists, plus places for new releases (crowd.py).
    crowd: bool = True


@dataclass
class RunResult:
    """Ranked picks, the profile behind them, and any steps that failed."""

    recommendations: list[Recommendation]
    profile: Profile
    warnings: list[str] = field(default_factory=list)
    crowd: bool = False  # the crowd's picks were used


class NoSyncedList(Exception):
    """The user has no synced list for this media type."""


def run(
    store: Store,
    client: AniListClient | None,
    user: str,
    media_type: MediaType,
    options: RunOptions,
    progress: Callable[[str], None] = lambda _: None,
) -> RunResult:
    """Fit the user's model, gather candidates and rank them; `client=None` stays offline."""
    entries = store.list_entries(user, media_type)
    if not entries:
        raise NoSyncedList(f"no synced {media_type.value.lower()} list for {user}")
    dismissed = [int(v) for v in store.exclusions(user, exclusions.NOT_INTERESTED)]
    profile = build_profile(
        store, entries, store.list_entries(user, media_type.other), not_interested=dismissed
    )
    online = client if options.discover else None
    on_list = {e.media_id for e in entries}
    extra: list[tuple[int, str]] = []
    warnings: list[str] = []

    try:
        excluded = exclusions.load(store, user, media_type, online)
    except AniListError as e:
        warnings.append(f"sequels of excluded titles may be missed: {e}")
        excluded = exclusions.load(store, user, media_type)

    filters = options.filters
    picks = None
    if media_type is MediaType.ANIME and options.crowd and (table := crowd.load()) is not None:
        picks = crowd.picks(table, entries, crowd.candidates_for(options.limit))
    try:
        themes = Themes(tag_categories(store, online))
    except AniListError as e:
        warnings.append(f"main themes judged without tag categories: {e}")
        themes = Themes(tag_categories(store))

    try:
        liked, disliked = discovery_tags(profile.model)
        liked = [t for t in liked if t not in excluded.tags]
        base = {
            "tagNotIn": sorted(set(disliked) | set(excluded.tags)),
            "genreNotIn": excluded.genres,
            "idNotIn": sorted(on_list | excluded.media_ids),
            **filters.query_variables(),
        }
        if online:
            progress("Searching AniList by your top tags")
            for tag in liked:  # one search each: AniList's tag_in needs all its tags
                tags = [tag, *filters.tags]
                found = discover(online, store, media_type, {**base, "tagIn": tags}, per_page=30)
                extra += [(m.id, f"top-scored with {tag}") for m in found]
            if picks:
                # New releases, which the crowd's lists predate: the best-scored since then.
                progress("Searching AniList for new releases")
                since = (picks.fresh_year - 1) * 10000 + 1231
                fresh = {**base, "startGreater": max(base.get("startGreater") or 0, since)}
                found = discover(online, store, media_type, fresh, per_page=50, pages=2)
                extra += [(m.id, "") for m in found]  # no reason shown: its card has its own
            if filters.active:
                progress("Searching AniList with your filters")
                found = discover(online, store, media_type, base, pages=2)
                extra += [(m.id, "top-scored for your filters") for m in found]
        if media_type is MediaType.ANIME and options.offline_picks > 0 and store.offline_info()[1]:
            progress("Picking from the offline database")
            ids = offline_candidates(
                store,
                profile.model,
                on_list | excluded.media_ids,
                options.offline_picks,
                online,
                options.include_adult,
                excluded.labels,
                filters.accepts_offline if filters.active else None,
            )
            extra += [(i, "offline database") for i in ids]
    except AniListError as e:
        warnings.append(f"some candidates skipped: {e}")

    progress("Ranking")
    seen = None
    if filters.hide_seen_adaptations:
        seen = seen_adaptations(store, user, media_type)
        if seen is None:
            other = "manga" if media_type is MediaType.ANIME else "anime"
            warnings.append(f"sync your {other} list to hide titles you've finished as {other}")

    # Hiding list titles also hides their other versions (light novel of a listed manga…).
    listed = listed_versions(store, user, media_type) if filters.hide_listed else None

    def accept(m: Media) -> bool:
        return (
            (not filters.active or filters.accepts(m, themes))
            and not (seen and seen.blocks(m))
            and not (listed and listed.blocks(m))
        )

    fetching = online

    def fetch(ids: set[int]) -> None:
        nonlocal fetching
        if not fetching:
            return
        try:
            fetch_media(fetching, store, ids)
        except AniListError as e:
            warnings.append(f"first seasons of some sequels may be missed: {e}")
            fetching = None

    recs = recommend(
        store,
        profile,
        extra,
        options.limit,
        options.include_adult,
        excluded,
        accept,
        include_listed=not filters.hide_listed,
        fetch=fetch,
        crowd=picks,
    )
    if online:
        recs = _fill_details(online, store, recs, warnings)
    return RunResult(recs, profile, warnings, crowd=picks is not None)


def _fill_details(
    client: AniListClient, store: Store, recs: list[Recommendation], warnings: list[str]
) -> list[Recommendation]:
    """Refetch shown titles cached before covers or score distributions were stored."""
    missing = {
        r.media.id for r in recs if not r.media.cover_url or r.media.score_distribution is None
    }
    if not missing:
        return recs
    try:
        fetch_media(client, store, missing, max_age=0)
    except AniListError as e:
        warnings.append(f"some covers and ratings skipped: {e}")
        return recs
    fresh = store.get_media(missing)
    for r in recs:
        r.media = fresh.get(r.media.id, r.media)
    return recs
