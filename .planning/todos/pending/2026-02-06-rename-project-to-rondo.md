---
created: 2026-02-06T12:10
title: Rename project from Sportlink Sync to Rondo Sync
area: general
files:
  - README.md
  - CLAUDE.md
  - package.json
  - scripts/sync.sh
  - docs/
---

## Problem

"Sportlink" is a brand name and shouldn't be used as the project name. The project ecosystem is being rebranded to "Rondo":

- **This tool:** "Sportlink Sync" → **Rondo Sync**
- **WordPress site (Stadion):** "Stadion" → **Rondo Club**

This is a wide-reaching rename affecting:
- Repository name (`sportlink-sync` → `rondo-sync`?)
- package.json name
- README, CLAUDE.md, all docs/
- Log messages, email subjects, error messages referencing "Sportlink Sync" or "Stadion"
- Server paths (`/home/sportlink/` → `/home/rondo/`?)
- Cron jobs, SSH references
- `.planning/` files (STATE.md, PROJECT.md, etc.)
- CLAUDE.md memory files
- Variable names like `STADION_URL`, `STADION_USERNAME`, etc. → decision needed on whether env vars change too
- Database filenames (`stadion-sync.sqlite`, `laposta-sync.sqlite`)

Note: "Sportlink" as the upstream data source (Sportlink Club) remains — that's the actual product name. The rename is about *our* project identity, not the upstream system.

## Solution

TBD — this is a large coordinated rename. Needs a plan for:
1. Decide scope: just user-facing names, or also internal variable/file names?
2. Coordinate with Stadion/Rondo Club rename (env vars, API URLs)
3. Server-side path changes and cron updates
4. Git repo rename (GitHub)
5. Update all references in code, docs, and planning files
