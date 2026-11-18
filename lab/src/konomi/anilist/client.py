"""Rate-limited AniList GraphQL client with retries."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import httpx

API_URL = "https://graphql.anilist.co"


class AniListError(Exception):
    """AniList returned an error or could not be reached."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class AniListClient:
    """Sends GraphQL queries, spacing requests out and retrying on 429 and 5xx."""

    def __init__(
        self,
        *,
        requests_per_minute: float = 30,
        token: str | None = None,
        max_retries: int = 5,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._http = httpx.Client(timeout=30, headers=headers, transport=transport)
        self._interval = 60.0 / requests_per_minute
        self._max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._next_allowed = 0.0

    def __enter__(self) -> AniListClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        """Close the HTTP connection."""
        self._http.close()

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run a query and return its `data`."""
        payload = {"query": query, "variables": variables or {}}
        for attempt in range(self._max_retries + 1):
            last = attempt == self._max_retries
            self._wait_turn()
            try:
                resp = self._http.post(API_URL, json=payload)
            except httpx.TransportError as e:
                if last:
                    raise AniListError(f"could not reach AniList: {e}") from e
                self._back_off(2.0**attempt)
                continue

            if resp.status_code == 429 or resp.status_code >= 500:
                if last:
                    raise AniListError(f"AniList returned {resp.status_code}", resp.status_code)
                self._back_off(_retry_after(resp) or 2.0**attempt)
                continue

            self._respect_remaining(resp)
            body = resp.json()
            if body.get("errors"):
                msg = "; ".join(e.get("message", "unknown error") for e in body["errors"])
                raise AniListError(msg, resp.status_code)
            if resp.status_code != 200:
                raise AniListError(f"AniList returned {resp.status_code}", resp.status_code)
            return body["data"]
        raise AssertionError("unreachable")

    def _wait_turn(self) -> None:
        now = self._clock()
        if now < self._next_allowed:
            self._sleep(self._next_allowed - now)
        self._next_allowed = max(now, self._next_allowed) + self._interval

    def _back_off(self, seconds: float) -> None:
        self._next_allowed = max(self._next_allowed, self._clock() + seconds)

    def _respect_remaining(self, resp: httpx.Response) -> None:
        remaining = resp.headers.get("X-RateLimit-Remaining")
        reset = resp.headers.get("X-RateLimit-Reset")
        if remaining == "0" and reset and reset.isdigit():
            self._back_off(max(0.0, int(reset) - time.time()))


def _retry_after(resp: httpx.Response) -> float | None:
    value = resp.headers.get("Retry-After")
    try:
        return float(value) if value else None
    except ValueError:
        return None
