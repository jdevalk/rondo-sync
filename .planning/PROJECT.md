# Sportlink Sync

## What This Is

A CLI tool that synchronizes member data from Sportlink Club (a Dutch sports club management system) to Laposta email marketing lists. It downloads member data via browser automation, transforms it according to field mappings, and syncs changes to up to 4 Laposta lists — tracking state to only submit actual changes.

## Core Value

Keep Laposta email lists automatically in sync with Sportlink member data without manual intervention.

## Requirements

### Validated

- ✓ Download member data from Sportlink via browser automation with OTP — existing
- ✓ Transform Sportlink fields to Laposta format via configurable mapping — existing
- ✓ Sync members to up to 4 Laposta lists — existing
- ✓ Track sync state in SQLite to only submit changed members — existing
- ✓ Support parent/child member associations — existing
- ✓ Deduplicate parent entries across lists — existing
- ✓ Inspect pending changes before sync — existing

### Active

- [ ] Cronjob setup for scheduled automated sync
- [ ] Reduced/formatted output suitable for email reports

### Out of Scope

- Web UI — CLI tool is sufficient for operator use
- Real-time sync — scheduled batch sync is appropriate for member data
- Bidirectional sync — Laposta is downstream only, Sportlink is source of truth

## Context

This is a brownfield project with a working sync pipeline. The tool runs on a server and needs to be automated via cron. Current output is verbose (progress messages, debug info) which isn't suitable for email reports — needs a cleaner summary format.

**Existing pipeline:**
1. `npm run download` — Playwright automation logs into Sportlink, fetches member JSON
2. `npm run prepare-laposta` — Transforms data, computes hashes, stores in SQLite
3. `npm run sync-laposta` — Submits changed members to Laposta API
4. `npm run sync-all` — Runs all three steps

**Server environment:** Node.js with Playwright/Chromium, persistent SQLite database, `.env` credentials.

## Constraints

- **Runtime**: Node.js 18+ with Playwright browser automation
- **Dependencies**: Requires Chromium (downloaded by Playwright) for Sportlink scraping
- **Network**: Needs access to club.sportlink.com and api.laposta.nl
- **Credentials**: Sportlink username/password/OTP secret and Laposta API key in `.env`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser automation for Sportlink | No API available, must scrape web interface | ✓ Good |
| SQLite for state tracking | Simple, no external database needed, portable | ✓ Good |
| Hash-based change detection | Avoids timestamp issues, reliable diff detection | ✓ Good |

---
*Last updated: 2026-01-24 after initialization*
