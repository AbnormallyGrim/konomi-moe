---
title: "Built as a local Python tool for one user, managed with uv, not a GitHub Pages site"
author: AbnormallyGrim
date: 2026-11-16
branch: main
cost: { minutes: 1, tokens: 10587 }
id: l-e2a29a9d
scope: repo
status: active
replaces: l-c2eb0aad
src: agent
---

## Decided
Local Python CLI (httpx, SQLite, scikit-learn, Typer and Rich) for the owner's use only, managed with uv (uv.lock committed, run with `uv run konomi …`). Python because the work is mostly experimenting with labels and weights, and scikit-learn is far ahead of Rust's options.

## Tried and ruled out
A static GitHub Pages site (TypeScript, IndexedDB, model in the browser). It works technically (AniList allows browser requests and implicit-grant OAuth), but the owner needed almost instant results on every first visit, which needs a precomputed catalog, which the AniList terms rule out. Once the tool became single-user, a one-off sync taking a minute was fine and the static site lost its reason to exist.

## Watch out
The machine runs Python 3.15; every dependency installs from wheels there. requires-python stays at >=3.12, but reading the offline database's .zst file needs 3.14+.

In the code: pyproject.toml, uv.lock, konomi CLI entry point in src/konomi/cli.py.
