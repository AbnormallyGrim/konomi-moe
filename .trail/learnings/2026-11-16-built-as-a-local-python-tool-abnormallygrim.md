---
title: "Built as a local Python tool for one user, not a GitHub Pages site"
author: AbnormallyGrim
date: 2026-11-16
branch: main
cost: { minutes: 10, tokens: 10587 }
id: l-c2eb0aad
scope: repo
status: active
src: agent
---

## Decided
Local Python CLI (httpx, SQLite, scikit-learn, Typer and Rich) for the owner's use only. Python because the work is mostly experimenting with labels and weights, and scikit-learn is far ahead of Rust's options.

## Tried and ruled out
A static GitHub Pages site (TypeScript, IndexedDB, model in the browser). It works technically (AniList allows browser requests and implicit-grant OAuth), but the owner needed almost instant results on every first visit, which needs a precomputed catalog, which the AniList terms rule out. Once the tool became single-user, a one-off sync taking a minute was fine and the static site lost its reason to exist.

## Watch out
uv isn't installed on the owner's machine; the venv was made with python3 -m venv on Python 3.15, where every dependency installs from wheels.

In the code: pyproject.toml (also works with uv sync), konomi CLI entry point in src/konomi/cli.py.
