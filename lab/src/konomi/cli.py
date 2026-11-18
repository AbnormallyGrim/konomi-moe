"""Command-line interface for syncing, recommending, exclusions and the web UI."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from konomi import evaluate as ev
from konomi import exclusions as ex
from konomi.anilist import AniListClient, AniListError
from konomi.filters import Filters
from konomi.models import MediaType
from konomi.offline import read_offline_db
from konomi.pipeline import NoSyncedList, RunOptions, run
from konomi.recommend import build_profile
from konomi.store import Store
from konomi.sync import sync_list
from konomi.taste import NotEnoughHistory, examples, truth

app = typer.Typer(help="Anime and manga recommendations learned from your AniList list.")
console = Console()

DbOption = Annotated[Path, typer.Option(envvar="KONOMI_DB", help="SQLite cache file.")]
TypeOption = Annotated[MediaType, typer.Option("--type", "-t", case_sensitive=False)]
RpmOption = Annotated[float, typer.Option(help="Max AniList requests per minute.", min=1, max=60)]


def _client(rpm: float) -> AniListClient:
    return AniListClient(requests_per_minute=rpm, token=os.environ.get("ANILIST_TOKEN"))


@app.command()
def sync(
    user: str,
    media_type: TypeOption = MediaType.ANIME,
    db: DbOption = Path("data/konomi.sqlite"),
    rpm: RpmOption = 30,
) -> None:
    """Fetch a user's list and the details of titles recommended from ones they liked."""
    store = Store(db)
    try:
        with _client(rpm) as client, console.status(f"Syncing {media_type.value.lower()} list"):
            result = sync_list(client, store, user, media_type)
    except AniListError as e:
        raise typer.Exit(_fail(e)) from e
    console.print(
        f"Synced {result.entries} entries; fetched {result.candidates_fetched} candidate titles."
    )


@app.command(name="recommend")
def recommend_cmd(
    user: str,
    media_type: TypeOption = MediaType.ANIME,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 20,
    discover_more: Annotated[
        bool, typer.Option("--discover/--no-discover", help="Search AniList by your top tags.")
    ] = True,
    adult: Annotated[bool, typer.Option(help="Include adult titles.")] = False,
    offline_picks: Annotated[
        int, typer.Option(help="Anime candidates taken from the offline database (0 = none).")
    ] = 100,
    genre: Annotated[list[str], typer.Option(help="Only titles with this genre.")] = [],  # noqa: B006
    tag: Annotated[list[str], typer.Option(help="Only titles with this tag.")] = [],  # noqa: B006
    main_theme: Annotated[
        bool, typer.Option(help="Chosen genres must be the main theme; tags rank 70+.")
    ] = False,
    fmt: Annotated[
        list[str], typer.Option("--format", help="Only these AniList formats, e.g. TV, MANGA.")
    ] = [],  # noqa: B006
    year_from: Annotated[int | None, typer.Option(help="First released from this year.")] = None,
    year_to: Annotated[int | None, typer.Option(help="First released up to this year.")] = None,
    finished: Annotated[bool, typer.Option(help="Only finished titles.")] = False,
    hide_listed: Annotated[
        bool,
        typer.Option(
            "--hide-listed/--show-listed",
            help="Hide titles on your list; --show-listed also ranks unfinished ones.",
        ),
    ] = True,
    hide_seen: Annotated[
        bool,
        typer.Option(help="Hide titles whose manga/anime counterpart you've finished."),
    ] = False,
    db: DbOption = Path("data/konomi.sqlite"),
    rpm: RpmOption = 30,
) -> None:
    """Rank titles for a user from their synced list, optionally filtered."""
    store = Store(db)
    filters = Filters(
        tuple(genre),
        tuple(tag),
        main_theme,
        tuple(f.upper() for f in fmt),
        year_from,
        year_to,
        finished,
        hide_listed,
        hide_seen,
    )
    options = RunOptions(limit, discover_more, offline_picks, adult, filters)
    try:
        with _client(rpm) as client, console.status("Working") as status:
            result = run(store, client, user, media_type, options, progress=status.update)
    except NoSyncedList:
        console.print(f"No synced list for {user}. Run: konomi sync {user} -t {media_type}")
        raise typer.Exit(1) from None
    except NotEnoughHistory as e:
        raise typer.Exit(_fail(e)) from e
    for w in result.warnings:
        console.print(f"[yellow]Warning:[/] {w}")
    recs = result.recommendations
    table = Table(title=f"Top {media_type.value.lower()} picks for {user}")
    table.add_column("#", justify="right")
    table.add_column("Title")
    table.add_column("AniList", justify="right")
    table.add_column("Why")
    for i, r in enumerate(recs, 1):
        why = ", ".join(map(str, r.reasons))
        if r.sources:
            why += f"\n[dim]{r.sources[0]}[/]"
        anilist = f"{r.media.average_score}%" if r.media.average_score else "–"
        table.add_row(str(i), r.media.title, anilist, why)
    console.print(table)


@app.command()
def profile(
    user: str,
    media_type: TypeOption = MediaType.ANIME,
    top: Annotated[int, typer.Option(min=1, max=50)] = 10,
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """Show what the model learned the user likes and dislikes."""
    store = Store(db)
    entries = store.list_entries(user, media_type)
    try:
        weights = build_profile(
            store, entries, store.list_entries(user, media_type.other)
        ).model.weights()
    except NotEnoughHistory as e:
        raise typer.Exit(_fail(e)) from e
    for title, rows in (("Likes", weights[:top]), ("Dislikes", weights[::-1][:top])):
        table = Table(title=title)
        table.add_column("Feature")
        table.add_column("Weight", justify="right")
        for name, w in rows:
            table.add_row(name, f"{w:+.2f}")
        console.print(table)


@app.command()
def evaluate(
    user: str,
    media_type: TypeOption = MediaType.ANIME,
    folds: Annotated[int, typer.Option(min=2, max=10, help="Cross-validation folds.")] = 5,
    sweep_settings: Annotated[
        bool, typer.Option("--sweep", help="Also try every model setting combination.")
    ] = False,
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """Measure how well the model predicts the user's own titles it wasn't trained on."""
    store = Store(db)
    entries = store.list_entries(user, media_type)
    media = store.get_media(e.media_id for e in entries)
    train, key = examples(entries, media), truth(entries, media)
    others = store.list_entries(user, media_type.other)
    extra = examples(others, store.get_media(e.media_id for e in others))
    try:
        rows = [
            ("Community score only", ev.cross_validate(train, ev.community(), folds, truth=key)),
            (
                "Taste model only",
                ev.cross_validate(train, ev.taste(community=0, extra=extra), folds, truth=key),
            ),
            (
                "Taste model + community (as ranked)",
                ev.cross_validate(train, ev.taste(extra=extra), folds, truth=key),
            ),
        ]
        if sweep_settings:
            rows += ev.sweep(train, folds, truth=key, extra=extra)[:10]
    except ValueError as e:
        raise typer.Exit(_fail(e)) from e

    table = Table(
        title=f"{len(key)} {media_type.value.lower()} titles graded · {folds}-fold cross-validation"
    )
    table.add_column("Predictor")
    table.add_column("Rank correlation", justify="right")
    table.add_column("Liked vs not (AUC)", justify="right")
    table.add_column(f"Top-{ev.TOP_K} hit rate", justify="right")
    for name, sc in rows:
        table.add_row(name, f"{sc.spearman:.2f}", f"{sc.auc:.2f}", f"{sc.hit_rate:.0%}")
    console.print(table)
    console.print(
        "[dim]Rank correlation: with your actual scores (scored titles only). AUC: chance a title "
        "you liked is ranked above one you didn't (0.50 = guessing). Hit rate: share of each "
        "held-out fold's top picks you liked.[/]"
    )


@app.command(name="import-offline-db")
def import_offline_db(
    path: Annotated[Path, typer.Argument(exists=True, dir_okay=False)],
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """Import the anime-offline-database (`.jsonl` or `.jsonl.zst`) as extra anime candidates."""
    store = Store(db)
    try:
        date, entries = read_offline_db(path)
        with console.status("Importing"):
            count = store.replace_offline_anime(date, entries)
    except (OSError, ValueError, RuntimeError) as e:
        raise typer.Exit(_fail(e)) from e
    console.print(f"Imported {count} anime with AniList IDs (dataset from {date or 'unknown'}).")


@app.command(name="collect-shikimori")
def collect_shikimori(
    users: Annotated[
        int | None,
        typer.Option(help="Stop at this many users with long enough lists (default: no limit)."),
    ] = None,
    db: Annotated[Path, typer.Option(help="Dataset file (kept out of git).")] = Path(
        "data/shikimori.sqlite"
    ),
    app_name: Annotated[
        str, typer.Option(help="Your Shikimori OAuth app's name, sent as the User-Agent.")
    ] = "konomi-moe",
    contact: Annotated[
        str | None,
        typer.Option(help="Added to the User-Agent so Shikimori can reach you (opt-in)."),
    ] = None,
    rpm: Annotated[float, typer.Option(help="Requests a minute (Shikimori allows 90).")] = 80,
    min_entries: Annotated[
        int,
        typer.Option(
            help="Only users who started at least this many titles count (planned ones don't)."
        ),
    ] = 10,
    status: Annotated[
        bool, typer.Option("--status", help="Show what's collected and stop.")
    ] = False,
) -> None:
    """Collect public lists from Shikimori into a local dataset, for experiments. Runs until
    you press Q (or Ctrl+C), which finishes the current user and exits; run it again to carry
    on. Also stops if Shikimori starts refusing requests."""
    import signal

    from rich.live import Live
    from rich.text import Text

    from konomi import shikimori
    from konomi.keys import StopKey

    db.parent.mkdir(parents=True, exist_ok=True)
    if status:
        console.print(
            shikimori.summary(db, min_entries) if db.exists() else "Nothing collected yet."
        )
        return

    agent = shikimori.user_agent(app_name, contact)
    start = time.monotonic()
    state: dict = {"progress": None, "first": None, "stopping": False}

    def duration(seconds: float) -> str:
        h, rem = divmod(int(seconds), 3600)
        return f"{h}h {rem // 60:02d}m" if h else f"{rem // 60}m {rem % 60:02d}s"

    def render() -> Text:
        p = state["progress"]
        elapsed = time.monotonic() - start
        lines = [f"Collecting from Shikimori as '{agent}' at {rpm:g} requests a minute"]
        if p is None:
            lines.append("Starting...")
        else:
            new = p.users - state["first"]
            rate = new / (elapsed / 3600) if elapsed > 60 else 0
            target = f" of {users:,}" if users else ""
            lines += [
                f"Users: {p.users:,}{target} who started {min_entries}+ titles "
                f"({p.stored:,} stored, {new:,} this run)",
                f"Entries: {p.entries:,}   IDs tried: {p.attempts:,}   Requests: {p.requests:,}",
                f"Running {duration(elapsed)}"
                + (f", about {rate:,.0f} users an hour" if rate else ""),
            ]
            if p.undated:
                lines.append(
                    f"First fetching {p.undated:,} earlier users again, to add the dates "
                    "titles were added (stored before dates were kept)"
                )
        lines.append(
            "Stopping after the current user..."
            if state["stopping"]
            else "Press Q to stop (finishes the current user, then exits). Ctrl+C works too."
        )
        return Text("\n".join(lines))

    def ask_to_stop(*_: object) -> None:
        if state["stopping"]:  # second Ctrl+C: stop right now (the current user isn't saved)
            raise KeyboardInterrupt
        state["stopping"] = True

    previous = signal.signal(signal.SIGINT, ask_to_stop)
    try:
        with (
            shikimori.Collector(
                db,
                app_name=app_name,
                contact=contact,
                requests_per_minute=rpm,
                min_entries=min_entries,
            ) as c,
            StopKey() as key,
            Live(get_renderable=render, console=console, refresh_per_second=2),
        ):
            state["progress"] = c.progress()
            state["first"] = state["progress"].users

            def should_stop() -> bool:
                if key.pressed.is_set():
                    state["stopping"] = True
                return state["stopping"]

            def report(p: shikimori.Progress) -> None:
                state["progress"] = p

            reason = c.run(users, report, should_stop)
    except KeyboardInterrupt:
        console.print("Stopped immediately. Every finished user is saved; run again to carry on.")
        return
    except shikimori.ShikimoriError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    finally:
        signal.signal(signal.SIGINT, previous)
    ended = {
        "stopped": "Stopped. Run the same command again to carry on.",
        "target": f"Reached {users:,} users." if users else "Done.",
        "exhausted": "Every user ID has been tried.",
    }[reason]
    console.print(ended)
    console.print(shikimori.summary(db, min_entries))


exclude_app = typer.Typer(help="Keep titles, tags, genres and custom lists out of picks.")
app.add_typer(exclude_app, name="exclude")

TitleOpt = Annotated[list[int], typer.Option("--title", help="AniList ID; sequels go too.")]
TagOpt = Annotated[list[str], typer.Option("--tag", help="AniList tag name.")]
GenreOpt = Annotated[list[str], typer.Option("--genre", help="AniList genre name.")]
ListOpt = Annotated[list[str], typer.Option("--list", help="Custom list name (per --type).")]


@exclude_app.command("add")
def exclude_add(
    user: str,
    title: TitleOpt = [],  # noqa: B006 - Typer reads list defaults
    tag: TagOpt = [],  # noqa: B006
    genre: GenreOpt = [],  # noqa: B006
    custom_list: ListOpt = [],  # noqa: B006
    media_type: TypeOption = MediaType.ANIME,
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """Add exclusions."""
    _change_exclusions(Store(db), user, media_type, True, title, tag, genre, custom_list)


@exclude_app.command("remove")
def exclude_remove(
    user: str,
    title: TitleOpt = [],  # noqa: B006
    tag: TagOpt = [],  # noqa: B006
    genre: GenreOpt = [],  # noqa: B006
    custom_list: ListOpt = [],  # noqa: B006
    media_type: TypeOption = MediaType.ANIME,
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """Remove exclusions."""
    _change_exclusions(Store(db), user, media_type, False, title, tag, genre, custom_list)


@exclude_app.command("show")
def exclude_show(
    user: str,
    media_type: TypeOption = MediaType.ANIME,
    db: DbOption = Path("data/konomi.sqlite"),
) -> None:
    """List exclusions and the titles they block (cached data only)."""
    store = Store(db)
    ids = sorted(int(v) for v in store.exclusions(user, ex.TITLE))
    media = store.get_media(ids)
    console.print("[bold]Titles:[/]", ", ".join(_name(i, media) for i in ids) or "none")
    labels = sorted(store.exclusions(user, ex.LABEL))
    console.print("[bold]Tags and genres:[/]", ", ".join(labels) or "none")
    lists = sorted(store.exclusions(user, ex.CUSTOM_LIST, media_type))
    console.print(f"[bold]{media_type.value.title()} custom lists:[/]", ", ".join(lists) or "none")
    blocked = store.get_media(ex.load(store, user, media_type).media_ids)
    names = sorted(m.title for m in blocked.values() if m.type is media_type)
    console.print(f"[bold]Blocked {media_type.value.lower()} titles ({len(names)}):[/]")
    console.print(", ".join(names) or "none")


def _change_exclusions(
    store: Store,
    user: str,
    media_type: MediaType,
    add: bool,
    titles: list[int],
    tags: list[str],
    genres: list[str],
    lists: list[str],
) -> None:
    changes = [
        (ex.TITLE, None, {str(t) for t in titles}),
        (ex.LABEL, None, {f"tag:{t}" for t in tags} | {f"genre:{g}" for g in genres}),
        (ex.CUSTOM_LIST, media_type, set(lists)),
    ]
    for kind, scope, values in changes:
        if values:
            current = store.exclusions(user, kind, scope)
            store.set_exclusions(user, kind, current | values if add else current - values, scope)
    console.print("Saved. See them with: konomi exclude show " + user)


def _name(media_id: int, media: dict) -> str:
    m = media.get(media_id)
    return f"{m.title} ({media_id})" if m else str(media_id)


@app.command()
def ui(
    db: DbOption = Path("data/konomi.sqlite"),
    port: Annotated[int, typer.Option(help="Local port.")] = 8501,
) -> None:
    """Open the web UI in your browser."""
    app_path = Path(__file__).with_name("app.py")
    env = {**os.environ, "KONOMI_DB": str(db)}
    cmd = [sys.executable, "-m", "streamlit", "run", str(app_path)]
    cmd += ["--server.port", str(port), "--server.address", "localhost"]
    cmd += ["--client.toolbarMode", "minimal", "--browser.gatherUsageStats", "false"]
    raise typer.Exit(subprocess.call(cmd, env=env))


def _fail(e: Exception) -> int:
    console.print(f"[red]Error:[/] {e}")
    return 1
