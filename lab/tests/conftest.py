"""Shared fixtures: made-up titles only."""

import httpx
import pytest

from konomi.models import Media, MediaType, Relation, Tag
from konomi.store import Store


def make_media(id, tags=(), genres=(), *, type=MediaType.ANIME, episodes=12, **kw):
    """A fake title; `tags` are names (rank 80) or `(name, rank)` pairs."""
    return Media(
        id=id,
        type=type,
        title=kw.pop("title", f"Test Show {id}"),
        episodes=episodes,
        genres=list(genres),
        tags=[Tag(t, 80) if isinstance(t, str) else Tag(*t) for t in tags],
        **kw,
    )


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Fail any real HTTP request; tests use httpx.MockTransport."""

    def refuse(self, request):
        raise RuntimeError(f"test tried to reach the network: {request.url}")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)


@pytest.fixture(autouse=True)
def no_crowd_table(monkeypatch, tmp_path):
    """Runs don't use the shipped crowd table (real AniList IDs could match made-up ones);
    tests of the crowd's picks give `crowd.TABLE` a made-up table of their own."""
    from konomi import crowd

    monkeypatch.setattr(crowd, "TABLE", tmp_path / "no-crowd-table.bin")


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


__all__ = ["make_media", "Relation"]
