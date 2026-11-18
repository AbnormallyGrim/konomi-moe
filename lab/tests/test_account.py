import json
import stat

import httpx

from konomi import account
from konomi.anilist import AniListClient
from konomi.models import ListStatus, MediaType
from tests.conftest import make_media


def test_token_file_is_owner_only(tmp_path):
    path = account.token_path(tmp_path / "cache.sqlite")
    assert account.load_account(path) is None
    account.save_account(path, account.Account("fake-token", "someone"))
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert account.load_account(path) == account.Account("fake-token", "someone")
    account.forget_account(path)
    assert account.load_account(path) is None


def test_add_to_planning_saves_on_anilist_and_locally(store):
    sent = []

    def handler(request):
        body = json.loads(request.content)
        sent.append((request.headers.get("Authorization"), body["variables"]))
        entry = {"id": 1, "status": "PLANNING"}
        return httpx.Response(200, json={"data": {"SaveMediaListEntry": entry}})

    client = AniListClient(token="fake-token", transport=httpx.MockTransport(handler))
    manga = make_media(30, type=MediaType.MANGA, episodes=None)
    account.add_to_planning(client, store, "Someone", manga)

    assert sent == [("Bearer fake-token", {"mediaId": 30, "status": "PLANNING"})]
    [entry] = store.list_entries("someone", MediaType.MANGA)
    assert (entry.media_id, entry.status) == (30, ListStatus.PLANNING)


def test_clean_description():
    raw = "First line.<br><br><br>Second <i>line</i> &amp; more.<br>\n(Source: Example)"
    assert (
        account.clean_description(raw) == "First line.\n\nSecond line & more.\n\n(Source: Example)"
    )
