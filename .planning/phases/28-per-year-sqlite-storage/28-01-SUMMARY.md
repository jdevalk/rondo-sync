---
phase: 28-per-year-sqlite-storage
plan: 01
subsystem: nikki-sync
tags: [database, retention, sqlite, pruning, historical-data]

dependency_graph:
  requires:
    - v1.6-nikki-contributions-status-field
  provides:
    - Per-year historical data retention (4 years)
    - Automatic pruning of old contribution records
    - Non-destructive sync behavior
  affects:
    - Future Nikki sync operations
    - Historical data queries
    - Database growth management

tech_stack:
  added: []
  patterns:
    - Year-based retention pruning
    - Upsert-then-prune pattern

key_files:
  created: []
  modified:
    - lib/nikki-db.js
    - download-nikki-contributions.js

decisions:
  - id: 28-01-retention-window
    choice: Use 4-year retention window (current + 3 previous)
    rationale: Clarified in research that "current year plus 2-3 previous years" means 3-4 years total. 4 years is safe default.
  - id: 28-01-upsert-before-prune
    choice: Upsert data first, then prune old records
    rationale: Prevents accidentally deleting data that was just inserted in the same sync.
  - id: 28-01-cutoff-calculation
    choice: cutoffYear = currentYear - retentionYears + 1
    rationale: Keeps exactly N years. Example 2026 with 4 years → cutoff 2023, keeps 2023-2026.

metrics:
  duration: 1m
  completed: 2026-02-01
---

# Phase 28 Plan 01: Per-Year Historical Data Retention

**One-liner:** Year-based retention pruning enables 4 years of historical Nikki contribution data to persist across syncs.

## Summary

Replaced destructive `clearContributions()` behavior with year-based retention pruning to preserve historical contribution data. Each sync now upserts current year data and prunes records older than the 4-year retention window (current year + 3 previous), allowing multi-year contribution history to persist across syncs.

**Key changes:**
- Added `pruneOldContributions(db, retentionYears=4)` function to lib/nikki-db.js
- Removed `clearContributions(db)` call from download-nikki-contributions.js
- Implemented upsert-then-prune pattern to safely update current data and remove old data
- Configurable retention window with safe default of 4 years

## What Was Built

### Added pruneOldContributions Function

Created new retention pruning function in lib/nikki-db.js:
- Calculates cutoff year: `currentYear - retentionYears + 1`
- Deletes records where `year < cutoffYear`
- Returns number of rows deleted for logging
- Exported in module.exports

Example: In 2026 with 4 years retention, cutoff = 2023, keeps 2023-2026 (4 years), deletes anything before 2023.

### Modified Download Script Behavior

Updated download-nikki-contributions.js to preserve historical data:
- Import `pruneOldContributions` instead of `clearContributions`
- Removed destructive clear-all call before upsert
- Added pruning after upsert with verbose logging
- Maintains proper order: upsert first (adds/updates), then prune (removes old)

## Technical Details

### Implementation Pattern

**Upsert-then-prune sequence:**
```javascript
// Store to database (upsert handles current year updates)
upsertContributions(db, contributions);

// Prune data older than retention window (keeps 4 years)
const pruned = pruneOldContributions(db);
if (pruned > 0) {
  logger.verbose(`Pruned ${pruned} old contribution records`);
}
```

**Why this order matters:**
- Upsert first: Adds new data and updates existing current-year records
- Prune second: Removes only records outside retention window
- Prevents race condition where pruning might delete just-inserted data

### Retention Logic

**Cutoff calculation:**
```javascript
const currentYear = new Date().getFullYear();  // 2026
const cutoffYear = currentYear - retentionYears + 1;  // 2026 - 4 + 1 = 2023
// Keeps: 2023, 2024, 2025, 2026 (4 years)
// Deletes: anything before 2023
```

**SQL operation:**
```sql
DELETE FROM nikki_contributions WHERE year < 2023
```

### Database Impact

**Before (destructive):**
- Each sync: DELETE all → INSERT new
- Historical data lost every sync
- Only current year visible after sync

**After (retention):**
- Each sync: UPSERT current → DELETE old
- Historical data persists within retention window
- 4 years of data visible after sync
- Automatic cleanup of data older than retention window

## Verification Results

All verification checks passed:
- ✅ nikki-db.js syntax valid
- ✅ download-nikki-contributions.js syntax valid
- ✅ pruneOldContributions function defined in file
- ✅ pruneOldContributions exported from module
- ✅ clearContributions(db) call removed from download script
- ✅ pruneOldContributions(db) called in download script
- ✅ Upsert happens before prune (order verified)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add pruneOldContributions function to nikki-db.js | bfbb8b4 | lib/nikki-db.js |
| 2 | Replace clearContributions with pruneOldContributions | 77d6db2 | download-nikki-contributions.js |

## Next Phase Readiness

**Phase 29 can proceed immediately.**

No blockers. The retention pruning is backward-compatible:
- Existing databases will start retaining historical data on next sync
- No migration needed (empty database works fine)
- clearContributions function still exists for backwards compatibility

**Recommended testing before production:**
1. Run sync on test database to verify pruning logic
2. Confirm 4-year retention window is appropriate for needs
3. Check that historical queries work as expected
4. Verify log output shows pruned record count when applicable

**Future considerations:**
- Retention window is configurable (default: 4 years)
- Could expose as environment variable if different retention needed
- Could add retention policy per sync type (e.g., 7 years for financial data)
