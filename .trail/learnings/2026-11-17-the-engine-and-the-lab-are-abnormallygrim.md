---
title: "The engine and the lab are held together by a parity test on a made-up world; change the lab first, regenerate, then make the engine match"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-18eab6bc
scope: repo
status: active
src: agent
touches:
  - README.md
---

## Decided
- Parity is checked on a made-up, seeded world (240 anime, 120 manga, both lists, sequels, adaptations, custom lists, exclusions), not on recorded real data, so the fixture holds nothing personal and can be regenerated at any time.
- The guard runs both ways: the engine test expects the lab's saved output, and a lab test fails when the lab's output no longer matches the saved fixture. The lab is the reference: change the lab, regenerate, then make the engine pass.
- Tolerance is 0.001 for weights and scores. The real gap is about 0.00014, from the lab's iterative ridge solver. Titles whose lab scores are closer than the tolerance may swap places.
- A title's sources are ordered strongest recommendation first (rating descending, then from-ID). Before, the order was store order (a Python set plus SQLite against JS insertion order), and the engine and the lab disagreed on which source the card shows first.

## Watch out
- The generated fixtures are excluded from Biome: Biome reformats JSON, and the next regeneration would fail `npm run check`.
- Verified that the test bites: changing FULL_LIST from 150 to 151 in the engine fails all six scenarios.

In the code: lab/scripts/parity_world.py (world, expected, SCENARIOS), lab/scripts/make_engine_fixtures.py, lab/tests/test_engine_fixtures.py, engine/test/parity.test.ts, engine/test/fixtures/parity.json, candidateSources in engine/src/recommend.ts, recommend in lab/src/konomi/recommend.py, biome.json.
