"""The engine's parity fixture must match what the lab produces today."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import parity_world  # noqa: E402

FIXTURE = Path(__file__).parents[2] / "engine" / "test" / "fixtures" / "parity.json"
HINT = "the lab changed; rerun scripts/make_engine_fixtures.py and make the engine match"


def test_parity_fixture_is_current():
    saved = json.loads(FIXTURE.read_text())
    world = json.loads(json.dumps(parity_world.world()))
    assert saved["world"] == world, HINT
    now = json.loads(json.dumps(parity_world.expected(world)))
    assert saved["scenarios"] == now["scenarios"], HINT
    for old, new in zip(saved["results"], now["results"], strict=True):
        assert old["likedIds"] == new["likedIds"], HINT
        assert old["warnings"] == new["warnings"], HINT
        assert old["weights"] == pytest.approx(new["weights"], abs=1e-6), HINT
        assert [r["id"] for r in old["recommendations"]] == [
            r["id"] for r in new["recommendations"]
        ], HINT
        for a, b in zip(old["recommendations"], new["recommendations"], strict=True):
            assert a == {**b, "score": pytest.approx(b["score"], abs=1e-6)}, HINT
