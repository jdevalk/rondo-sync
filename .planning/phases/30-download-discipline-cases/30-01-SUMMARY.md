---
phase: 30-download-discipline-cases
plan: 01
subsystem: database, browser-automation
tags: [playwright, sqlite, better-sqlite3, sportlink, discipline-cases]

# Dependency graph
requires:
  - phase: none
    provides: standalone first phase of v2.2 milestone
provides:
  - SQLite database module for discipline case storage
  - Playwright automation script for Sportlink discipline cases download
  - Module/CLI hybrid pattern for pipeline integration
affects: [31-sync-discipline-to-stadion, 32-integrate-discipline-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "waitForResponse() promise pattern for API capture"
    - "ON CONFLICT DO UPDATE for idempotent upserts"
    - "Hash-based change detection for sync optimization"

key-files:
  created:
    - lib/discipline-db.js
    - download-discipline-cases.js
  modified: []

key-decisions:
  - "Store ChargeCodes as JSON string if array (flexible for unknown API structure)"
  - "Multiple tab selector strategies for resilience against UI changes"
  - "Response URL pattern matching with fallbacks for unknown API endpoint"

patterns-established:
  - "Discipline database follows nikki-db.js pattern exactly"
  - "Download script follows download-data-from-sportlink.js login flow exactly"

# Metrics
duration: 4min
completed: 2026-02-02
---

# Phase 30 Plan 01: Download Discipline Cases Summary

**Playwright automation to download discipline cases from Sportlink and store in SQLite with upsert-based change detection**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-02T19:54:21Z
- **Completed:** 2026-02-02T19:58:30Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- SQLite database module with full discipline case schema (12 data columns + 3 metadata columns)
- Playwright download script with OTP authentication and response capture
- Idempotent upsert pattern for re-running without duplicates
- Multiple selector strategies for UI resilience
- DEBUG_LOG support for troubleshooting unknown API endpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create discipline database module** - `f461956` (feat)
2. **Task 2: Create discipline download script** - `b21850e` (feat)

## Files Created/Modified
- `lib/discipline-db.js` - SQLite database operations: openDb, upsertCases, getAllCases, getCasesByPersonId, getCaseCount
- `download-discipline-cases.js` - Playwright automation: login, navigate, click tab, capture API response, store in DB

## Decisions Made
- **ChargeCodes storage:** Store as JSON string if array, allowing flexibility for unknown API structure
- **Tab selectors:** Implemented 6 fallback selectors plus getByRole for resilience against Sportlink UI changes
- **API URL pattern:** Use partial match on 'DisciplineClubCasesPlayer', 'discipline', or 'Discipline' since exact endpoint unknown

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - both modules load and pass verification tests. Full integration test requires server execution (per CLAUDE.md sync must run on production server only).

## User Setup Required
None - no external service configuration required. Uses existing SPORTLINK_USERNAME, SPORTLINK_PASSWORD, and SPORTLINK_OTP_SECRET environment variables.

## Next Phase Readiness
- Database schema ready for Phase 31 (Stadion sync)
- Download script exports runDownload() for Phase 32 (pipeline integration)
- Note: First server execution may need selector/URL pattern adjustment based on DEBUG_LOG output

---
*Phase: 30-download-discipline-cases*
*Completed: 2026-02-02*
