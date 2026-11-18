---
title: "The repo is a monorepo: the Python app moved to lab/, and the TypeScript engine lives in engine/ with npm, Biome and Vitest"
author: AbnormallyGrim
date: 2026-11-17
branch: main
id: l-1d90c6c7
scope: repo
status: active
src: agent
---

## Decided
- M0 step 3 made the repo a monorepo. The Python prototype moved to lab/ (lab/src/konomi, lab/tests, lab/pyproject.toml, lab/uv.lock), and its cache moved to lab/data. Earlier learnings that say src/konomi/… now mean lab/src/konomi/…. Run Python commands from lab/, because the default cache path (data/konomi.sqlite) and the offline-database path are relative to the working directory.
- The TypeScript engine is engine/ (package @konomi/engine), in an npm workspace at the root, because plugin/ and extension/ will join as workspaces and import the engine by name. npm, not pnpm or bun, because only Node 24 and npm are installed and CI needs nothing extra.
- Biome does lint and format in one tool (like ruff on the Python side), configured in biome.json to cover engine/ and root JSON only. Vitest runs the tests. tsconfig is strict with noUncheckedIndexedAccess and exactOptionalPropertyTypes, and imports use .ts extensions (allowImportingTsExtensions, noEmit), because the apps' bundlers compile the engine source directly.
- engine/src/taste.ts ports communityWeight first, as a proof that the toolchain works. Its tests mirror the Python ones (46 labelled → 1.96).

## Watch out
- `npm run check` at the root runs Biome, then tsc --noEmit and Vitest in every workspace. CI (.github/workflows/ci.yml) runs it on Node 22, and the lab job runs ruff and pytest with uv on Python 3.12, where the .zst offline-database test skips because it needs Python 3.14+.
- Biome 2.6 deprecates `linter.rules.recommended`. The recommended rules are on by default, so the config just sets `linter.enabled`.
- npm now asks before running install scripts (esbuild's postinstall was skipped). Vitest still works, because esbuild's platform binary comes as an optional dependency.
- The old root .venv from before the move is unused (lab/.venv is the live one).

In the code: package.json, biome.json, engine/package.json, engine/tsconfig.json, engine/src/taste.ts, .github/workflows/ci.yml, lab/pyproject.toml.
