"""The Shikimori collector, against a fake API (made-up users and titles only)."""

import sqlite3

import httpx
import pytest

from konomi.shikimori import Collector, ShikimoriError, summary

NICK = "made-up-nickname"


def fake_api(missing=(), empty=(), throttle_once=False):
    """Users 1-12: some missing, some with empty lists, the rest with one anime and one manga."""
    calls = {"paths": [], "agents": set(), "throttled": False}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["paths"].append(request.url.path)
        calls["agents"].add(request.headers["User-Agent"])
        path = request.url.path
        if path == "/api/users":
            return httpx.Response(200, json=[{"id": 12, "nickname": "newest"}])
        user_id = int(path.split("/")[3])
        if throttle_once and not calls["throttled"]:
            calls["throttled"] = True
            return httpx.Response(429, headers={"Retry-After": "7"})
        if user_id in missing:
            return httpx.Response(404, json={"message": "not found", "code": 404})
        if user_id in empty:
            return httpx.Response(200, json=[])
        user = {"id": user_id, "nickname": NICK}
        if path.endswith("anime_rates"):
            entry = {
                "score": 8, "status": "completed", "episodes": 12, "chapters": 0,
                "rewatches": 1, "updated_at": "2024-01-02T03:04:05.000+03:00",
                "created_at": "2023-06-01T00:00:00+00:00",
                "anime": {"id": 100 + user_id, "name": "Made-up Show"}, "manga": None,
                "user": user,
            }  # fmt: skip
        else:
            entry = {
                "score": 0, "status": "on_hold", "episodes": 0, "chapters": 40,
                "rewatches": 0, "updated_at": None, "created_at": "2023-07-01T00:00:00+00:00",
                "anime": None, "manga": {"id": 500 + user_id, "name": "Made-up Manga"},
                "user": user,
            }  # fmt: skip
        removed = {"score": 5, "status": "completed", "anime": None, "manga": None}
        return httpx.Response(200, json=[entry, removed])

    return handler, calls


def collector(path, handler, sleeps=None, **kw):
    return Collector(
        path,
        transport=httpx.MockTransport(handler),
        sleep=(sleeps.append if sleeps is not None else lambda s: None),
        clock=lambda: 0.0,
        **kw,
    )


def test_collects_lists_as_anilist_style_rows_without_identities(tmp_path):
    db = tmp_path / "shiki.sqlite"
    handler, calls = fake_api(missing={1, 2, 3, 4}, empty={5, 6})
    with collector(db, handler, app_name="my-test-app", min_entries=1) as c:
        c.run(3)
        p = c.progress()
    assert p.users == 3
    assert calls["agents"] == {"my-test-app"}  # Shikimori wants the app name as User-Agent

    con = sqlite3.connect(db)
    rows = con.execute(
        "select kind, status, score, progress, repeat, updated_at, created_at from entries"
        " order by kind"
    ).fetchall()
    assert ("ANIME", "COMPLETED", 80, 12, 1, 1704153845, 1685577600) in rows
    assert ("MANGA", "PAUSED", 0, 40, 0, None, 1688169600) in rows
    assert all(r[1] != "" for r in rows)  # removed titles were skipped
    # No nicknames or plain user IDs anywhere in the file.
    dump = "\n".join(con.iterdump())
    assert NICK not in dump and "newest" not in dump
    assert {r[0] for r in con.execute("select result from attempts")} <= {"ok", "empty", "missing"}
    con.close()
    s = summary(db)
    assert s["entries"] == {"ANIME": 3, "MANGA": 3}


def test_resumes_where_it_stopped_without_refetching(tmp_path):
    db = tmp_path / "shiki.sqlite"
    handler, calls = fake_api(missing={1, 2})
    with collector(db, handler, min_entries=1) as c:
        c.run(4)
        order = list(c.order())
    first = len(calls["paths"])
    with collector(db, handler, min_entries=1) as c:
        assert list(c.order()) == order  # same seed and newest ID, so the same order
        c.run(4)  # already done: no requests at all
        assert len(calls["paths"]) == first
        c.run(6)
        assert c.progress().users == 6
    fetched = [p for p in calls["paths"] if p != "/api/users"]
    assert len(fetched) == len(set(fetched))  # nobody fetched twice


def test_waits_as_asked_when_throttled_and_spaces_requests(tmp_path):
    sleeps = []
    handler, _ = fake_api(throttle_once=True)
    with collector(
        tmp_path / "s.sqlite", handler, sleeps, requests_per_minute=60, min_entries=1
    ) as c:
        c.run(1)
    assert 7.0 in sleeps  # Retry-After honoured
    assert 1.0 in sleeps  # 60 a minute: a second between requests


def test_refuses_more_than_shikimori_allows(tmp_path):
    handler, _ = fake_api()
    with pytest.raises(ValueError):
        collector(tmp_path / "s.sqlite", handler, requests_per_minute=120)


def test_only_users_with_enough_entries_count_towards_the_target(tmp_path):
    handler, _ = fake_api()  # every user has two entries
    with collector(tmp_path / "s.sqlite", handler, min_entries=3) as c:
        c.run(2)
        p = c.progress()
    assert p.users == 0 and p.stored == 12  # stored, but too small to count; IDs ran out


def test_skips_the_manga_request_for_users_without_anime(tmp_path):
    handler, calls = fake_api(empty={1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12})
    with collector(tmp_path / "s.sqlite", handler, min_entries=1) as c:
        c.run(1)  # nobody qualifies, so every ID gets tried once
    lists = [p for p in calls["paths"] if p != "/api/users"]
    assert len(lists) == 12 and all(p.endswith("anime_rates") for p in lists)


def test_stops_when_everything_is_refused_and_keeps_those_users_retryable(tmp_path):
    db = tmp_path / "s.sqlite"
    refusals = {"on": False}

    def handler(request):
        if request.url.path == "/api/users":
            return httpx.Response(200, json=[{"id": 100, "nickname": "newest"}])
        if refusals["on"]:
            return httpx.Response(403, json={"message": "forbidden"})
        return httpx.Response(200, json=[])

    from konomi.shikimori import REFUSED_IN_A_ROW, Refused

    with collector(db, handler, min_entries=1) as c:
        c._collect(1, c._hash(1))  # one ordinary (empty) user first
        refusals["on"] = True
        with pytest.raises(Refused):
            c.run(5)
        assert c.progress().attempts == 1  # the refused ones were forgotten, to retry later
        assert REFUSED_IN_A_ROW > 5


def test_user_agent_names_the_app_and_optionally_a_contact():
    from konomi.shikimori import user_agent

    assert user_agent("konomi-moe") == "konomi-moe"
    assert (
        user_agent("app", "https://example.invalid/repo") == "app (+https://example.invalid/repo)"
    )


def test_runs_without_a_limit_until_ids_run_out(tmp_path):
    handler, _ = fake_api(missing={3})
    with collector(tmp_path / "s.sqlite", handler, min_entries=1) as c:
        assert c.run() == "exhausted"
        assert c.progress().users == 11  # all 12 IDs tried, one missing


def test_stop_leaves_whole_users_and_the_next_run_carries_on(tmp_path):
    db = tmp_path / "s.sqlite"
    handler, _ = fake_api()
    seen = []
    with collector(db, handler, min_entries=1) as c:
        reason = c.run(should_stop=lambda: len(seen) >= 3, report=seen.append)
        assert reason == "stopped" and c.progress().users == 3
    con = sqlite3.connect(db)
    # Every stored user has both lists: nothing half-saved.
    per_user = con.execute("select user, count(*) from entries group by user").fetchall()
    assert [n for _, n in per_user] == [2, 2, 2]
    con.close()
    with collector(db, handler, min_entries=1) as c:
        assert c.run() == "exhausted" and c.progress().users == 12


def test_running_counts_match_the_database(tmp_path):
    db = tmp_path / "s.sqlite"
    handler, _ = fake_api(missing={1}, empty={2, 3})
    with collector(db, handler, min_entries=2) as c:
        c.run()
        live = c.progress()
    with collector(db, handler, min_entries=2) as c:
        fresh = c.progress()  # counted from the database
    assert (live.users, live.stored, live.attempts, live.entries) == (
        fresh.users, fresh.stored, fresh.attempts, fresh.entries,
    )  # fmt: skip


def test_command_shows_progress_and_ends_with_a_summary(tmp_path, monkeypatch):
    from typer.testing import CliRunner

    from konomi import shikimori
    from konomi.cli import app

    handler, _ = fake_api()
    real = shikimori.Collector

    def fake_collector(*args, **kw):
        return real(*args, transport=httpx.MockTransport(handler), sleep=lambda s: None, **kw)

    monkeypatch.setattr(shikimori, "Collector", fake_collector)
    db = tmp_path / "s.sqlite"
    result = CliRunner().invoke(
        app, ["collect-shikimori", "--db", str(db), "--users", "2", "--min-entries", "1"]
    )
    assert result.exit_code == 0, result.output
    assert "Reached 2 users." in result.output
    assert "users who started 1+ titles" in result.output


def list_of(statuses, start=1000):
    """Made-up anime entries with the given Shikimori statuses."""
    return [
        {"score": 0, "status": st, "episodes": 0, "rewatches": 0,
         "created_at": "2023-06-01T00:00:00+00:00", "anime": {"id": start + i}, "manga": None}
        for i, st in enumerate(statuses)
    ]  # fmt: skip


def test_planned_titles_dont_count_towards_the_target(tmp_path):
    def handler(request):
        if request.url.path == "/api/users":
            return httpx.Response(200, json=[{"id": 3}])
        if request.url.path.endswith("anime_rates"):
            return httpx.Response(200, json=list_of(["planned"] * 5 + ["completed"]))
        return httpx.Response(200, json=[])

    with collector(tmp_path / "s.sqlite", handler, min_entries=2) as c:
        assert c.run(1) == "exhausted"  # six entries each, but only one started
        p = c.progress()
    assert (p.users, p.stored) == (0, 3)
    assert summary(tmp_path / "s.sqlite", 1)["users who started 1+ titles"] == 3


def downgrade(db):
    """Make a dataset look like one collected before dates and started counts were kept."""
    con = sqlite3.connect(db)
    for table, column in (
        ("entries", "created_at"),
        ("attempts", "started"),
        ("attempts", "dated"),
    ):
        con.execute(f"alter table {table} drop column {column}")
    con.commit()
    con.close()


def test_upgrades_an_older_dataset_and_fetches_its_users_again_first(tmp_path):
    db = tmp_path / "s.sqlite"
    handler, calls = fake_api()
    with collector(db, handler, min_entries=2) as c:
        c.run(2)
        first_ids = [p for p in calls["paths"] if p != "/api/users"]
    downgrade(db)
    assert summary(db, 2)["users to fetch again for dates"] == 2  # works before upgrading

    calls["paths"].clear()
    with collector(db, handler, min_entries=2) as c:
        p = c.progress()
        assert (p.users, p.stored, p.undated) == (2, 2, 2)  # started counted from what's stored
        c.run(3)
        live = c.progress()
    assert [p for p in calls["paths"] if p != "/api/users"][:4] == first_ids  # same users first
    assert (live.users, live.stored, live.undated) == (3, 3, 0)

    con = sqlite3.connect(db)
    assert con.execute("select count(*) from entries where created_at is null").fetchone()[0] == 0
    assert con.execute("select distinct user from entries order by user").fetchall() == [
        (1,),
        (2,),
        (3,),
    ]  # fmt: skip  (the earlier users keep their numbers)
    assert con.execute("select count(*) from entries").fetchone()[0] == 6  # no duplicates
    con.close()
    with collector(db, handler, min_entries=2) as c:
        fresh = c.progress()
    assert (live.users, live.stored, live.attempts, live.entries, live.undated) == (
        fresh.users, fresh.stored, fresh.attempts, fresh.entries, fresh.undated,
    )  # fmt: skip


def test_a_list_made_private_since_is_removed_when_fetched_again(tmp_path):
    db = tmp_path / "s.sqlite"
    handler, _ = fake_api()
    with collector(db, handler, min_entries=1) as c:
        c.run(2)
    downgrade(db)

    def private(request):  # the newest ID (12) was fixed at the first run
        return httpx.Response(403, json={"message": "forbidden"})

    with collector(db, private, min_entries=1) as c:
        assert c.run() == "exhausted"
        p = c.progress()
    assert (p.users, p.stored, p.entries, p.undated) == (0, 0, 0, 0)
    con = sqlite3.connect(db)
    assert con.execute("select count(*) from entries").fetchone()[0] == 0
    # The two stored users, then the 10 untried IDs (too few refusals to look like a block).
    assert con.execute("select result, user from attempts").fetchall() == [("private", None)] * 12
    con.close()


def test_fetches_every_page_of_a_list_longer_than_one_request(tmp_path, monkeypatch):
    from konomi import shikimori

    monkeypatch.setattr(shikimori, "PER_LIST", 2)
    whole = list_of(["completed"] * 5)
    pages = []

    def handler(request):
        if request.url.path == "/api/users":
            return httpx.Response(200, json=[{"id": 1}])
        if request.url.path.endswith("manga_rates"):
            return httpx.Response(200, json=[])
        limit, page = int(request.url.params["limit"]), int(request.url.params["page"])
        pages.append(page)
        # Like Shikimori's v1: a page plus one more row when the list carries on.
        return httpx.Response(200, json=whole[limit * (page - 1) : limit * page + 1])

    with collector(tmp_path / "s.sqlite", handler, min_entries=1) as c:
        c.run(1)
        assert c.progress().entries == 5
    assert pages == [1, 2, 3]


def test_retries_a_reply_that_isnt_json_and_stops_cleanly_on_other_refusals(tmp_path):
    replies = iter(
        [httpx.Response(200, text="<html>maintenance</html>"), httpx.Response(401, json={})]
    )

    def handler(request):
        if request.url.path == "/api/users":
            return httpx.Response(200, json=[{"id": 1}])
        return next(replies)

    sleeps = []
    with collector(tmp_path / "s.sqlite", handler, sleeps, min_entries=1) as c:
        with pytest.raises(ShikimoriError, match="401"):
            c.run(1)
        assert c.progress().attempts == 0  # nothing half-saved
    assert 5.0 in sleeps  # backed off after the maintenance page
