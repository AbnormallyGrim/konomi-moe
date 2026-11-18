"""Signing in to AniList, and changes to the user's AniList list."""

from __future__ import annotations

import html
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

from konomi.anilist import AniListClient
from konomi.anilist import queries as q
from konomi.models import ListEntry, ListStatus, Media
from konomi.store import Store

AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize?client_id={}&response_type=token"
PIN_REDIRECT = "https://anilist.co/api/v2/oauth/pin"
DEVELOPER_SETTINGS = "https://anilist.co/settings/developer"


@dataclass
class Account:
    """A saved AniList access token and the user it belongs to."""

    token: str
    name: str


def token_path(db_path: str | Path) -> Path:
    """Where the token is kept: beside the cache, in its own owner-only file."""
    return Path(db_path).parent / "anilist_token.json"


def load_account(path: Path) -> Account | None:
    """The saved account, if any."""
    try:
        return Account(**json.loads(path.read_text()))
    except (OSError, ValueError, TypeError):
        return None


def save_account(path: Path, account: Account) -> None:
    """Save the account readable by the owner only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"token": account.token, "name": account.name}, f)
    path.chmod(0o600)


def forget_account(path: Path) -> None:
    """Delete the saved token."""
    path.unlink(missing_ok=True)


def viewer_name(client: AniListClient) -> str:
    """Name of the user the client's token belongs to."""
    return client.query(q.VIEWER)["Viewer"]["name"]


def add_to_planning(client: AniListClient, store: Store, user: str, media: Media) -> ListEntry:
    """Add a title to the user's AniList planning list, and to the local copy of the list."""
    client.query(q.SAVE_ENTRY, {"mediaId": media.id, "status": ListStatus.PLANNING.value})
    entry = ListEntry(media.id, ListStatus.PLANNING, updated_at=int(time.time()))
    store.upsert_entry(user, media.type, entry)
    return entry


def description(client: AniListClient, media_id: int) -> str:
    """A title's synopsis as plain text."""
    raw = client.query(q.MEDIA_DESCRIPTION, {"id": media_id})["Media"]["description"] or ""
    return clean_description(raw)


def clean_description(raw: str) -> str:
    """Turn AniList's lightly formatted description into plain text."""
    text = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return re.sub(r"\n{3,}", "\n\n", text).strip()
