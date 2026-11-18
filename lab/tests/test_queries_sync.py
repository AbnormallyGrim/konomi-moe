"""The TypeScript engine's GraphQL queries must stay identical to the lab's."""

import json
import re
from pathlib import Path

from konomi.anilist import queries

ENGINE_QUERIES = Path(__file__).parents[2] / "engine" / "src" / "anilist" / "queries.ts"


def test_engine_queries_match_the_lab():
    # Biome may wrap long strings onto the next line, so allow any whitespace after '='.
    pattern = r'^export const (\w+) =\s*("(?:[^"\\]|\\.)*");'
    found = dict(re.findall(pattern, ENGINE_QUERIES.read_text(), re.M))
    for name in (
        "USER_LIST",
        "MEDIA_BY_IDS",
        "MEDIA_WITH_RECS_BY_IDS",
        "DISCOVER",
        "VIEWER",
        "MEDIA_DESCRIPTION",
        "MEDIA_DETAILS",
        "SAVE_ENTRY",
    ):
        assert json.loads(found[name]) == getattr(queries, name), f"{name} differs; regenerate"
