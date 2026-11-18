import json

from konomi.offline import offline_candidates, parse_entry, read_offline_db
from konomi.recommend import build_profile
from tests.test_recommend import seed


def entry(anilist_id, tags, **kw):
    sources = ["https://myanimelist.net/anime/1"]
    if anilist_id:
        sources.append(f"https://anilist.co/anime/{anilist_id}")
    return {
        "sources": sources,
        "title": kw.get("title", f"Offline Show {anilist_id}"),
        "type": "TV",
        "status": kw.get("status", "FINISHED"),
        "animeSeason": {"season": "SPRING", "year": 2010},
        "score": {"arithmeticMean": kw.get("score", 7.0)},
        "tags": tags,
        "studios": ["studio example"],
    }


def write_db(path, entries):
    lines = [json.dumps({"lastUpdate": "2026-01-03"})] + [json.dumps(e) for e in entries]
    path.write_text("\n".join(lines) + "\n")


def test_parse_entry_needs_anilist_source():
    assert parse_entry(entry(None, ["drama"])) is None
    a = parse_entry(entry(5, ["Iyashikei", "Slice of Life"]))
    assert (a.anilist_id, a.tags, a.year, a.score) == (5, ["iyashikei", "slice of life"], 2010, 7.0)


def test_import_and_pick_fitting_titles(store, tmp_path):
    path = tmp_path / "db.jsonl"
    write_db(
        path,
        [
            entry(50, ["iyashikei", "slice of life"]),
            entry(51, ["harem", "fantasy"]),
            entry(52, ["iyashikei"], status="UPCOMING"),
            entry(53, ["iyashikei", "hentai"]),
            entry(1, ["iyashikei"]),  # already on the list
            entry(None, ["iyashikei"]),
        ],
    )
    date, entries = read_offline_db(path)
    assert store.replace_offline_anime(date, entries) == 5
    assert store.offline_info() == ("2026-01-03", 5)

    list_entries = seed(store)
    model = build_profile(store, list_entries).model
    on_list = {e.media_id for e in list_entries}
    assert offline_candidates(store, model, on_list, n=1) == [50]
    assert set(offline_candidates(store, model, on_list, n=10)) == {50, 51}
    assert 53 in offline_candidates(store, model, on_list, n=10, include_adult=True)


def test_reads_zstd(store, tmp_path):
    import pytest

    zstd = pytest.importorskip("compression.zstd")
    path = tmp_path / "db.jsonl.zst"
    lines = [json.dumps({"lastUpdate": "2026-01-03"}), json.dumps(entry(5, ["drama"]))]
    path.write_bytes(zstd.compress("\n".join(lines).encode()))
    date, entries = read_offline_db(path)
    assert date == "2026-01-03"
    assert [a.anilist_id for a in entries] == [5]


def test_offline_picks_skip_excluded_labels(store, tmp_path):
    path = tmp_path / "db.jsonl"
    write_db(path, [entry(50, ["iyashikei", "gore"]), entry(51, ["iyashikei"])])
    store.replace_offline_anime(*read_offline_db(path))
    list_entries = seed(store)
    model = build_profile(store, list_entries).model
    on_list = {e.media_id for e in list_entries}
    picks = offline_candidates(store, model, on_list, n=10, exclude_labels={"tag:Gore"})
    assert picks == [51]
