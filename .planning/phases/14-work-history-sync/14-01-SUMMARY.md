---
phase: 14-work-history-sync
plan: 01
subsystem: database
tags: [sqlite, wordpress, acf, work-history, team-linking]

# Dependency graph
requires:
  - phase: 13-team-sync
    provides: Team extraction and Stadion team post type sync
  - phase: 08-stadion-sync
    provides: Person CPT sync and KNVB ID tracking
provides:
  - stadion_work_history tracking table
  - Work history sync script linking persons to teams
  - ACF work_history repeater field management
  - Team change detection and history tracking
affects: [15-integration-testing, work-history-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Junction table for many-to-many relationships with WordPress repeater fields"
    - "WordPress repeater field row index tracking for updates"
    - "Preserving manually-created WordPress entries alongside sync entries"

key-files:
  created:
    - submit-stadion-work-history.js
  modified:
    - lib/stadion-db.js

key-decisions:
  - "Track WordPress repeater field row indices (stadion_work_history_id) to distinguish sync-created from manual entries"
  - "Only end sync-created work_history entries when team changes, preserve manual entries"
  - "Use composite unique key (knvb_id, team_name) for tracking member-team pairings"
  - "Backfilled entries have empty start_date to indicate historical data"

patterns-established:
  - "WordPress ACF repeater field sync pattern: track row indices, preserve manual entries, merge on update"
  - "Team change detection: compare current Sportlink teams vs tracked SQLite teams"
  - "Bidirectional relationship management: work_history in person -> team reference"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 14 Plan 01: Work History Sync Summary

**SQLite junction table and sync script linking Stadion persons to teams via ACF work_history repeater field with change detection**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T15:20:11Z
- **Completed:** 2026-01-26T15:22:20Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- stadion_work_history table tracks member-team pairings with stadion_work_history_id for WordPress row index tracking
- Work history sync script extracts teams from Sportlink, detects changes, and syncs to WordPress ACF repeater field
- Preserves manually created work_history entries in WordPress while managing sync-created entries
- Hash-based change detection prevents duplicate syncs and enables idempotent operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add work history tracking to SQLite** - `c9e6835` (feat)
2. **Task 2: Create work history sync script** - `361e9d1` (feat)
3. **Task 3: Test backfill and change detection** - `700de2b` (test)

## Files Created/Modified

- `lib/stadion-db.js` - Added stadion_work_history table schema and 8 work history tracking functions (computeWorkHistoryHash, upsertWorkHistory, getWorkHistoryNeedingSync, getMemberWorkHistory, getWorkHistoryByMember, updateWorkHistorySyncState, deleteWorkHistory, deleteAllMemberWorkHistory)
- `submit-stadion-work-history.js` - Work history sync orchestration script with team extraction, change detection, and ACF repeater field management

## Decisions Made

**1. Track WordPress repeater field row indices**
- Store stadion_work_history_id column in SQLite to track which row index in WordPress work_history array belongs to each sync entry
- Enables distinguishing sync-created entries from manually created entries in WordPress
- Allows safe updates and deletions without affecting manual entries

**2. Preserve manual WordPress entries**
- Only modify work_history entries at indices tracked in stadion_work_history_id column
- Manual entries (created directly in WordPress) have no tracking record and are never touched
- Merge pattern: fetch existing, modify only tracked indices, preserve rest

**3. Composite unique key for tracking**
- Unique constraint on (knvb_id, team_name) prevents duplicate tracking records
- Supports members being in multiple teams simultaneously
- Enables team change detection by comparing current vs tracked teams

**4. Backfill vs new entry distinction**
- Backfilled entries (initial historical data) have empty start_date
- New entries (team changes after backfill) have start_date = today
- is_current flag always true for active memberships

**5. Only end sync-created entries**
- When team changes, only set end_date on entries tracked via stadion_work_history_id
- Manual entries remain untouched even if team no longer in Sportlink
- Prevents data loss for manually managed work history

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed established patterns from submit-stadion-sync.js and prepare-stadion-teams.js.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Work history sync foundation complete. Ready for:
- Integration testing (Phase 15)
- Full pipeline automation
- Work history reporting and analytics

All sync scripts now operational:
- Members → Stadion persons
- Parents → Stadion persons with relationships
- Teams → Stadion team CPT
- Work history → ACF work_history repeater field linking persons to teams
- Photos → WordPress media library
- Important dates → ACF important_dates repeater field

The sync pipeline is feature-complete for v1.5 milestone.

---
*Phase: 14-work-history-sync*
*Completed: 2026-01-26*
