import json

import httpx

from konomi.anilist import AniListClient
from konomi.filters import Filters
from konomi.models import ListEntry, ListStatus, MediaType, Relation
from konomi.offline import parse_entry
from konomi.themes import Themes, tag_categories
from tests.conftest import make_media

CATEGORIES = {
    "Heterosexual": "Theme-Romance",
    "Love Triangle": "Theme-Romance",
    "Swordplay": "Theme-Action",
    "School": "Setting-Scene",
}
THEMES = Themes(CATEGORIES)


def romcom():
    return make_media(1, [("Love Triangle", 92), ("School", 95)], ["Comedy", "Romance"])


def action_with_romance():
    return make_media(
        2, [("Swordplay", 90), ("Heterosexual", 75), ("Virtual World", 98)],
        ["Action", "Adventure", "Romance"],
    )  # fmt: skip


def test_strength_uses_ranked_tags_and_listed_genres():
    assert THEMES.strength(romcom(), "Romance") == 92
    assert THEMES.strength(romcom(), "Comedy") == 50  # listed, no ranked tag
    assert THEMES.strength(romcom(), "Action") == 0
    assert THEMES.strength(action_with_romance(), "Adventure") == 98  # Virtual World


def test_main_theme_must_beat_plot_rivals_but_not_comedy():
    assert THEMES.is_main(romcom(), "Romance")
    assert not THEMES.is_main(action_with_romance(), "Romance")
    assert THEMES.is_main(action_with_romance(), "Adventure")
    weak = make_media(3, [("Heterosexual", 40)], ["Comedy", "Romance"])
    assert THEMES.is_main(weak, "Romance")  # the only plot-driving genre, however weak
    weak_rival = make_media(8, [("Heterosexual", 55)], ["Action", "Romance"])
    assert not THEMES.is_main(weak_rival, "Romance")  # a rival is listed and romance < 60
    assert [t.genre for t in THEMES.summary(action_with_romance())] == [
        "Adventure", "Action", "Romance",
    ]  # fmt: skip


def test_heterosexual_is_not_romance_evidence():
    # Re:Zero's light novel: "Heterosexual" ranked 80 used to make Romance its main theme.
    rezero = make_media(9, [("Heterosexual", 80), ("Swordplay", 78)], ["Action", "Romance"])
    assert THEMES.strength(rezero, "Romance") == 50  # listed genre only
    assert not THEMES.is_main(rezero, "Romance")
    assert THEMES.is_main(rezero, "Action")


def test_tag_categories_are_cached(store):
    calls = []

    def handler(request):
        calls.append(1)
        tags = [{"name": "Heterosexual", "category": "Theme-Romance"}]
        return httpx.Response(200, json={"data": {"MediaTagCollection": tags}})

    client = AniListClient(transport=httpx.MockTransport(handler))
    assert tag_categories(store) == {}
    assert tag_categories(store, client) == {"Heterosexual": "Theme-Romance"}
    assert tag_categories(store, client) == {"Heterosexual": "Theme-Romance"}
    assert tag_categories(store) == {"Heterosexual": "Theme-Romance"}
    assert len(calls) == 1


def test_filters_accept():
    f = Filters(genres=("Romance",), main_theme=True)
    assert f.accepts(romcom(), THEMES)
    assert not f.accepts(action_with_romance(), THEMES)
    assert Filters(genres=("Romance",)).accepts(action_with_romance(), THEMES)

    tagged = Filters(tags=("Love Triangle",), main_theme=True)
    subplot = make_media(6, [("Love Triangle", 61)], ["Action", "Romance"])
    assert tagged.accepts(romcom(), THEMES) and not tagged.accepts(subplot, THEMES)
    assert Filters(tags=("Love Triangle",)).accepts(subplot, THEMES)

    m = make_media(4, ["Heterosexual"], ["Romance"], format="MOVIE", year=2015, status="FINISHED")
    assert Filters(formats=("MOVIE",), year_from=2010, year_to=2020, finished_only=True).accepts(
        m, THEMES
    )
    assert not Filters(formats=("TV",)).accepts(m, THEMES)
    assert not Filters(year_from=2016).accepts(m, THEMES)
    assert not Filters(year_to=2014).accepts(make_media(5), THEMES)  # unknown year
    assert not Filters().active and not Filters(main_theme=True).active


def test_main_theme_with_a_supporting_genre_means_listed_alongside():
    # A romcom: romance is the main theme, comedy is listed but has no tag evidence.
    romcom_manga = make_media(7, [("Love Triangle", 85)], ["Comedy", "Romance"])
    f = Filters(genres=("Romance", "Comedy"), main_theme=True)
    assert f.main_genres == ("Romance",)
    assert f.accepts(romcom_manga, THEMES)
    assert not f.accepts(action_with_romance(), THEMES)  # romance isn't main there
    only_comedy = Filters(genres=("Comedy",), main_theme=True)
    assert only_comedy.main_genres == ("Comedy",)
    assert not only_comedy.accepts(romcom_manga, THEMES)  # comedy alone must be main


def test_filters_offline_and_query_variables():
    entry = parse_entry(
        {
            "sources": ["https://anilist.co/anime/9"],
            "title": "x",
            "type": "TV",
            "status": "FINISHED",
            "animeSeason": {"year": 2012},
            "tags": ["Romance", "school"],
        }
    )
    assert Filters(genres=("Romance",), formats=("TV_SHORT",)).accepts_offline(entry)
    assert not Filters(genres=("Action",)).accepts_offline(entry)
    assert not Filters(formats=("MOVIE",)).accepts_offline(entry)

    v = Filters(("Romance",), ("Heterosexual",), True, ("MANGA",), 2010, 2020, True)
    assert v.query_variables() == {
        "genreIn": ["Romance"],
        "tagIn": ["Heterosexual"],
        "minimumTagRank": 70,
        "formatIn": ["MANGA"],
        "startGreater": 20100000,
        "startLesser": 20201231,
        "statusIn": ["FINISHED"],
    }
    assert json.dumps(Filters().query_variables()) == "{}"


def test_seen_adaptations_work_from_either_side(store):
    from konomi.filters import seen_adaptations
    from konomi.models import ListEntry, ListStatus, MediaType, Relation

    assert seen_adaptations(store, "someone", MediaType.MANGA) is None  # anime list not synced

    def manga(id, relations=(), fmt="MANGA"):
        return make_media(
            id, type=MediaType.MANGA, episodes=None, format=fmt, relations=list(relations)
        )

    finished = make_media(1, relations=[Relation("SOURCE", 100, MediaType.MANGA)])
    dropped = make_media(2, relations=[Relation("ADAPTATION", 110, MediaType.MANGA)])
    watching = make_media(3, relations=[Relation("SOURCE", 101, MediaType.MANGA)])
    planned = make_media(4, relations=[Relation("SOURCE", 105, MediaType.MANGA)])
    novel = manga(110, [Relation("ADAPTATION", 111, MediaType.MANGA)], fmt="NOVEL")
    store.upsert_media([finished, dropped, watching, planned, novel])
    store.replace_list(
        "someone",
        MediaType.ANIME,
        [
            ListEntry(1, ListStatus.COMPLETED),
            ListEntry(2, ListStatus.DROPPED, progress=5),
            ListEntry(3, ListStatus.CURRENT),
            ListEntry(4, ListStatus.PLANNING),
        ],
    )
    seen = seen_adaptations(store, "someone", MediaType.MANGA)

    assert seen.blocks(manga(100))  # the finished anime links to it
    assert seen.blocks(manga(102, [Relation("ADAPTATION", 1, MediaType.ANIME)]))  # it links back
    assert seen.blocks(manga(103, [Relation("ALTERNATIVE", 2, MediaType.ANIME)]))  # dropped too
    assert seen.blocks(novel)  # the dropped anime's source novel
    assert seen.blocks(manga(111))  # the manga of that novel, one hop on
    assert seen.blocks(manga(101))  # still being watched counts too
    assert not seen.blocks(manga(105))  # planning to watch doesn't
    assert not seen.blocks(manga(104, [Relation("SEQUEL", 1, MediaType.ANIME)]))


def test_listed_versions_cover_every_format_of_a_listed_story(store):
    from konomi.filters import listed_versions

    manga = make_media(1, type=MediaType.MANGA, episodes=None)
    novel = make_media(2, type=MediaType.MANGA, episodes=None, format="NOVEL")
    recap_of = make_media(3)
    recap = make_media(4, format="MOVIE")
    sequel = make_media(5)
    manga.relations = [Relation("SOURCE", 2, MediaType.MANGA)]
    recap.relations = [Relation("SUMMARY", 3, MediaType.ANIME)]
    sequel.relations = [Relation("PREQUEL", 3, MediaType.ANIME)]
    store.upsert_media([manga, novel, recap_of, recap, sequel])
    store.replace_list("someone", MediaType.MANGA, [ListEntry(1, ListStatus.PLANNING)])
    store.replace_list("someone", MediaType.ANIME, [ListEntry(3, ListStatus.CURRENT)])

    assert listed_versions(store, "someone", MediaType.MANGA).blocks(novel)  # any status
    anime = listed_versions(store, "someone", MediaType.ANIME)
    assert anime.blocks(recap)  # from the recap's own link
    assert not anime.blocks(sequel)  # a sequel is new story
