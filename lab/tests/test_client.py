import httpx
import pytest

from konomi.anilist import AniListClient, AniListError


class FakeTime:
    def __init__(self):
        self.now = 0.0
        self.slept = []

    def clock(self):
        return self.now

    def sleep(self, s):
        self.slept.append(s)
        self.now += s


def client_with(responses, rpm=60, **kw):
    calls = []

    def handler(request):
        calls.append(request)
        return responses.pop(0)

    t = FakeTime()
    c = AniListClient(
        requests_per_minute=rpm,
        transport=httpx.MockTransport(handler),
        sleep=t.sleep,
        clock=t.clock,
        **kw,
    )
    return c, calls, t


def ok(data):
    return httpx.Response(200, json={"data": data})


def test_spaces_requests_by_rate_limit():
    c, _, t = client_with([ok({}), ok({}), ok({})], rpm=30)
    for _ in range(3):
        c.query("{ x }")
    assert t.slept == [2.0, 2.0]


def test_retries_429_using_retry_after():
    c, calls, t = client_with([httpx.Response(429, headers={"Retry-After": "7"}), ok({"a": 1})])
    assert c.query("{ a }") == {"a": 1}
    assert len(calls) == 2
    assert t.slept == [7.0]


def test_retries_server_errors_then_gives_up():
    c, calls, _ = client_with([httpx.Response(502)] * 3, max_retries=2)
    with pytest.raises(AniListError) as e:
        c.query("{ a }")
    assert e.value.status == 502
    assert len(calls) == 3


def test_graphql_errors_raise_without_retry():
    resp = httpx.Response(404, json={"data": None, "errors": [{"message": "User not found"}]})
    c, calls, _ = client_with([resp])
    with pytest.raises(AniListError, match="User not found"):
        c.query("{ a }")
    assert len(calls) == 1


def test_sends_token_when_given():
    c, calls, _ = client_with([ok({})], token="fake-token")
    c.query("{ a }")
    assert calls[0].headers["Authorization"] == "Bearer fake-token"
