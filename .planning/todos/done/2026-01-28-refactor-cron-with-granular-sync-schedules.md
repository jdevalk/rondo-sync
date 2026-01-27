---
created: 2026-01-28T15:30
title: Refactor cron with granular sync schedules
area: tooling
files:
  - sync-all.js
  - scripts/cron-wrapper.sh
  - scripts/install-cron.sh
---

## Problem

Current `sync-all.js` runs everything in one pipeline, but different sync operations have different freshness requirements:

- **People sync** (members, parents, important dates): Should run hourly - membership changes need quick propagation
- **Photo sync**: Once per day is sufficient - photos don't change often
- **Team sync**: Once per week - rosters only change a few times per season

Additionally, the current cron setup requires multiple lines and hardcoded paths. Want:
- Single-line crontab entries
- All configuration (paths, credentials, email settings) read from `.env` or environment variables
- Simpler cron management

## Solution

1. Split `sync-all.js` into composable sync scripts or add CLI flags:
   - `npm run sync-people` (members + parents + important dates)
   - `npm run sync-photos` (download + upload)
   - `npm run sync-teams` (team download + team sync + work history)
   - Keep `sync-all` for manual full runs

2. Create new cron wrapper that:
   - Sources `.env` automatically
   - Takes sync type as argument
   - Handles locking per sync type
   - Sends email reports

3. Simplify crontab to something like:
   ```
   0 * * * * /path/to/sync.sh people
   0 6 * * * /path/to/sync.sh photos
   0 6 * * 0 /path/to/sync.sh teams
   ```
