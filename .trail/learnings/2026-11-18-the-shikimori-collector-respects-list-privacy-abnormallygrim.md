---
title: "The Shikimori dataset collector respects list privacy and Shikimori's API rules, and stops after 15 refusals in a row"
author: AbnormallyGrim
date: 2026-11-18
branch: main
id: l-e638a76b
scope: repo
status: active
src: agent
---

Moved here from lab/README.md when the sub-folder READMEs were removed.

## Decided
- Shikimori is the dataset source for multi-user experiments because its terms allow fetching through its API; AniList's, MyAnimeList's and Kitsu's don't. Nothing from the dataset ships; the app would only ever ship vectors trained from it.
- Privacy: users are sampled at random by ID and stored under an anonymous number; their IDs are kept only as salted hashes (so a run can resume), nicknames are never stored.
- Stored per entry: status, score, progress, rewatches, when it was last changed and when it was added (the date added lets experiments hold out what each user started most recently).
- Under 90 requests a minute (80 by default), API only, and the app's name as the User-Agent. `--contact` is opt-in: nothing extra is sent unless passed.
- Each user is saved whole, so a stop (Q or Ctrl+C) or crash never half-writes; rerunning resumes.

## Tried and ruled out
- v2's `user_rates` would be faster but ignores list privacy, so the v1 list endpoints (which refuse private lists) are used.

## Watch out
- If Shikimori refuses 15 requests in a row (normally a 403 means one private list), the collector stops rather than mark real users private all night, and forgets those attempts so a later run retries them.
- Datasets from before 2026-11-18 lack the date added; the next run upgrades the file and refetches those users first (about 2,400 an hour).
- The first estimate of 500-1,000 useful users an hour came from only 13 IDs; trust the live rate. 20,000 users is enough to start experiments.
- For overnight runs on Windows, turn off sleep while plugged in. The dataset is one file to copy back.

In the code: lab/src/konomi (`collect-shikimori`, options `--users`, `--min-entries 10`, `--rpm 80`, `--app-name`, `--contact`, `--db data/shikimori.sqlite`, `--status`). Data in lab/data/shikimori.sqlite, git-ignored. More history in HANDOVER.md.
