import json
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from konomi.models import ListEntry, ListStatus, MediaType
from konomi.store import Store
from tests.conftest import make_media
from tests.test_recommend import seed

APP = str(Path(__file__).parents[1] / "src" / "konomi" / "app.py")


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "cache.sqlite"
    monkeypatch.setenv("KONOMI_DB", str(path))
    return path


def test_asks_for_a_username_on_first_run(db):
    at = AppTest.from_file(APP).run()
    assert not at.exception
    assert "Enter your AniList username" in at.info[0].value


def test_recommends_from_cached_data(db):
    store = Store(db)
    entries = seed(store)
    store.upsert_media([make_media(20, ["Iyashikei"], ["Slice of Life"], title="Cosy <Pick>")])
    store.replace_recommendations({1: [(20, 5)]})
    store.replace_list("someone", MediaType.ANIME, entries + [ListEntry(99, ListStatus.PLANNING)])
    store.close()

    at = AppTest.from_file(APP).run()
    assert at.text_input[0].value == "someone"
    at.toggle(key="discover").set_value(False).run()  # no AniList requests
    next(b for b in at.button if b.label == "Get recommendations").click().run()

    assert not at.exception
    assert at.button(key="open-20").label == r"Cosy \<Pick\>"  # Markdown escaped
    assert at.metric[0].value == str(len(entries) + 1)
    assert at.dataframe  # preference tables render


def test_sidebar_exclusions_save_choices(db):
    store = Store(db)
    entries = seed(store)
    store.replace_list("someone", MediaType.ANIME, entries)
    store.replace_custom_lists("someone", MediaType.ANIME, {"Example": {1}})
    store.close()

    at = AppTest.from_file(APP).run()
    at.multiselect(key="ex-title:someone:ANIME").select(7).run()
    at.multiselect(key="ex-label:someone").select("tag:Harem").run()
    at.multiselect(key="ex-list:someone:ANIME").select("Example").run()
    assert not at.exception

    store = Store(db)
    assert store.exclusions("someone", "title") == {"7"}
    assert store.exclusions("someone", "label") == {"tag:Harem"}
    assert store.exclusions("someone", "custom_list", MediaType.ANIME) == {"Example"}
    store.close()
    assert any("Blocking 2 known anime titles" in c.value for c in at.caption)


def picks_app(db):
    store = Store(db)
    entries = seed(store)
    store.upsert_media(
        [
            make_media(20, ["Iyashikei", "Gore"], ["Slice of Life"], title="Cosy Pick"),
            make_media(21, ["Iyashikei"], ["Slice of Life"], title="Other Pick"),
        ]
    )
    store.replace_recommendations({1: [(20, 5), (21, 5)]})
    store.replace_list("someone", MediaType.ANIME, entries)
    store.close()
    at = AppTest.from_file(APP).run()
    at.toggle(key="discover").set_value(False).run()  # no AniList requests
    next(b for b in at.button if b.label == "Get recommendations").click().run()
    return at


def test_title_dialog_excludes_title(db, monkeypatch):
    monkeypatch.setattr("konomi.account.description", lambda client, media_id: "Synopsis.")
    at = picks_app(db)
    at.button(key="open-20").click().run()
    assert not at.exception
    assert any(m.value == "Cosy Pick" for m in at.subheader)
    planning = next(b for b in at.button if b.label == "Add to anime planning")
    assert planning.disabled  # not signed in
    next(b for b in at.button if b.label == "Exclude title and sequels").click().run()

    assert not at.exception
    assert Store(db).exclusions("someone", "title") == {"20"}
    assert not [b for b in at.button if b.key == "open-20"]
    assert [b for b in at.button if b.key == "open-21"]


def test_clicking_a_tag_offers_to_exclude_it(db):
    at = picks_app(db)
    pills = at.get("button_group")
    assert pills  # reason chips render
    at.session_state["open-label"] = "tag:Gore"
    at.run()
    assert any("tag **Gore**" in m.value for m in at.markdown)
    next(b for b in at.button if b.label == "Exclude").click().run()
    assert Store(db).exclusions("someone", "label") == {"tag:Gore"}
    assert not [b for b in at.button if b.key == "open-20"]


def test_filters_limit_picks_to_main_theme(db):
    store = Store(db)
    entries = seed(store)
    store.upsert_media(
        [
            make_media(30, [("Iyashikei", 90), ("Heterosexual", 95)], ["Romance"], title="Love"),
            make_media(
                31,
                [("Iyashikei", 90), ("Swordplay", 95), ("Heterosexual", 70)],
                ["Action", "Romance"],
                title="Swords",
            ),  # fmt: skip
        ]
    )
    store.replace_recommendations({1: [(30, 5), (31, 5)]})
    store.replace_list("someone", MediaType.ANIME, entries)
    store.set_meta("tag_categories", json.dumps({"at": 9e12, "categories": {
        "Heterosexual": "Theme-Romance", "Swordplay": "Theme-Action"}}))  # fmt: skip
    store.close()

    at = AppTest.from_file(APP).run()
    at.toggle(key="discover").set_value(False).run()
    at.multiselect(key="f-genres").select("Romance").run()
    at.toggle(key="f-main").set_value(True).run()
    next(b for b in at.button if b.label == "Get recommendations").click().run()

    assert not at.exception
    assert [b.label for b in at.button if (b.key or "").startswith("open-")] == ["Love"]
    assert any(c.value == "Mainly Romance" for c in at.caption)


def test_list_filters_default_and_labels(db):
    store = Store(db)
    store.replace_list("someone", MediaType.ANIME, seed(store))
    store.close()
    at = AppTest.from_file(APP).run()
    assert at.toggle(key="f-listed").value is True
    assert at.toggle(key="f-seen-ANIME").label == "Exclude titles whose manga I've already read"
    assert at.toggle(key="f-seen-ANIME").value is False


def test_ratings_show_on_cards_and_can_be_hidden(db):
    store = Store(db)
    entries = seed(store)
    store.upsert_media(
        [make_media(20, ["Iyashikei"], ["Slice of Life"], title="Rated", average_score=82,
                    popularity=141000, score_distribution=[(10, 5), (90, 50), (100, 40)])]
    )  # fmt: skip
    store.replace_recommendations({1: [(20, 5)]})
    store.replace_list("someone", MediaType.ANIME, entries)
    store.close()

    at = AppTest.from_file(APP).run()
    at.toggle(key="discover").set_value(False).run()
    next(b for b in at.button if b.label == "Get recommendations").click().run()

    def card_html():
        return [h.proto.body for h in at.get("html") if '<div class="am-rating">' in h.proto.body]

    [html] = card_html()
    assert "★ 82%" in html and "141k users" in html and "<span style=" not in html  # no chart

    at.toggle(key="show-ratings").set_value(False).run()
    assert not card_html()
    assert Store(db).get_meta("show-ratings") == "0"
    at = AppTest.from_file(APP).run()  # remembered across sessions
    assert at.toggle(key="show-ratings").value is False
