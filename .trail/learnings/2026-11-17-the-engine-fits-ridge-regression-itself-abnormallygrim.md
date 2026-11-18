---
title: "The engine fits ridge regression itself via a sparse dual solve, and its model and ranking are pure so each host wires in storage"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-2b397bcb
scope: repo
status: active
src: agent
---

## Decided
- engine/src/ridge.ts implements weighted ridge regression itself (scikit-learn has no TypeScript equivalent). It centres implicitly so rows stay sparse, and solves the n×n dual system when features outnumber titles (about 1,000+ features for a few hundred titles), else the d×d primal one. Both use Cholesky, because an n³ dual solve is milliseconds in a browser while a dense d×d one would be seconds.
- The model, themes, filters, exclusions and ranking in engine/src are pure: storage and network come in as arguments (a media lookup, a `fetchMissing` callback, recommendation links), because the browser extension and the Seanime frame store data differently.
- `rank` in engine/src/recommend.ts takes candidate sources from `candidateSources(profile, links, {extra, includeListed})`. That's the lab's `recommend()` split in two, because the lab read links straight from SQLite.

## Watch out
- Golden check: lab/scripts/make_engine_fixtures.py writes engine/test/fixtures/ridge.json from scikit-learn's exact solver (dense X, solver="cholesky"); fitRidge matches it to 8 decimals. The lab's own TasteModel uses sparse X, so scikit-learn picks an iterative solver: on the owner's real list the engine matched the lab's top 20 in the same order, but scores differ by up to 0.0002. Parity tests need a tolerance near 1e-3, not exact equality.
- Feature names are sorted by code point, like DictVectorizer, and sorts are stable, so `weights()` and `contributions()` break ties like the lab does.
- The engine has no Node type definitions (it runs in browsers). Tests import fixtures as JSON (resolveJsonModule) instead of using node:fs, which fails the type check with TS2307.
- Biome rejects forEach callbacks that return a value (an `expect(...)` arrow), so use for…of.

In the code: fitRidge, solveSpd in engine/src/ridge.ts; TasteModel in engine/src/taste.ts; buildProfile, candidateSources, rank in engine/src/recommend.ts; lab/scripts/make_engine_fixtures.py.
