---
phase: 21
plan: 01
subsystem: sync-infrastructure
tags: [conflict-resolution, bidirectional-sync, last-write-wins, audit-trail]
requires:
  - 20-01-bidirectional-timestamp-tracking
provides:
  - conflict-detection-logic
  - conflict-resolution-lww
  - conflict-audit-table
  - conflict-email-summary
affects:
  - 22-reverse-sync-contact-fields
  - 23-reverse-sync-member-metadata
  - 24-reverse-sync-commissie-data
tech-stack:
  added: []
  patterns:
    - last-write-wins-conflict-resolution
    - field-level-conflict-detection
    - grace-period-tolerance
    - null-timestamp-handling
key-files:
  created:
    - lib/conflict-resolver.js
  modified:
    - lib/stadion-db.js
decisions:
  - id: conflict-21-01
    what: Use 5-second grace period with Sportlink winning on near-ties
    why: Prevents false conflicts from clock drift while preferring forward sync
    alternatives: ["Always favor one system", "Prompt for manual resolution"]
  - id: null-21-01
    what: System with timestamp wins when other has NULL
    why: NULL means "no tracked history" not "no value" - honor tracked edits
    alternatives: ["Wait for both timestamps", "Always favor non-NULL"]
  - id: audit-21-01
    what: Log all conflicts to SQLite audit table
    why: Enables debugging, operator review, and conflict rate monitoring
    alternatives: ["Log to file only", "No logging"]
metrics:
  duration: 165s
  completed: 2026-01-29
---

# Phase 21 Plan 01: Conflict Resolution Infrastructure Summary

**One-liner:** Field-level LWW conflict detection with 5-second grace period and audit trail

## What Was Built

Created the conflict resolution infrastructure for bidirectional sync using last-write-wins (LWW) logic at the field level:

1. **Audit Table (lib/stadion-db.js):**
   - `conflict_resolutions` table with indexes on knvb_id and resolved_at
   - Stores: member ID, field name, both values, both timestamps, winner, reason
   - Helper functions: logConflictResolution(), getConflictResolutions(), getConflictResolutionCount()

2. **Conflict Resolver Module (lib/conflict-resolver.js):**
   - `resolveFieldConflicts()`: Detects and resolves conflicts for all tracked fields
   - `generateConflictSummary()`: Produces email-compatible plain text summary
   - NULL timestamp handling: system with history wins
   - Grace period: within 5 seconds, Sportlink wins
   - Logs all resolutions to audit table

3. **Integration:**
   - Uses existing `compareTimestamps()` from Phase 20
   - Uses existing `TRACKED_FIELDS` and `getTimestampColumnNames()`
   - Compatible with existing email system (formatAsHtml)
   - Comprehensive self-test demonstrates all behaviors

## Key Decisions

### Grace Period Behavior
Within 5 seconds tolerance, Sportlink wins (forward sync takes precedence). This prevents false conflicts from clock drift while maintaining a clear resolution preference for near-simultaneous edits.

### NULL Timestamp Handling
When one system has NULL timestamp (no tracked history) and the other has a timestamp:
- System with timestamp wins
- NULL means "modified before tracking started" not "no value"
- Both NULL: Sportlink wins (forward sync default)

### Conflict Resolution Strategy
Last-write-wins at field level:
- Compare timestamps for each tracked field individually
- Only detect conflict when both have timestamps AND values differ
- Grace period resolutions are logged but not counted as conflicts in email summary
- All resolutions logged to audit table for debugging

## Technical Implementation

### Resolution Reasons
The system uses standardized reason codes:
- `both_null_sportlink_default`: Both timestamps NULL, using Sportlink
- `only_sportlink_has_history`: Sportlink has timestamp, Stadion doesn't
- `only_stadion_has_history`: Stadion has timestamp, Sportlink doesn't
- `grace_period_sportlink_wins`: Within 5s tolerance, Sportlink wins
- `sportlink_newer`: Sportlink timestamp newer by >5s
- `stadion_newer`: Stadion timestamp newer by >5s
- `values_match_no_conflict`: Timestamps differ but values same

### Audit Trail Schema
```sql
CREATE TABLE conflict_resolutions (
  id INTEGER PRIMARY KEY,
  knvb_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  sportlink_value TEXT,
  stadion_value TEXT,
  sportlink_modified TEXT,
  stadion_modified TEXT,
  winning_system TEXT NOT NULL,
  resolution_reason TEXT NOT NULL,
  resolved_at TEXT NOT NULL
);
```

Indexes on knvb_id and resolved_at enable efficient querying for debugging and metrics.

### Email Summary Format
Plain text format compatible with existing formatAsHtml():
```
CONFLICTS DETECTED AND RESOLVED

Total conflicts: N
Members affected: M

RESOLUTION DETAILS

- KNVB123: 2 field(s)
  email: stadion won (stadion newer)
  mobile: sportlink won (sportlink newer)
```

## Verification Results

All verification checks passed:

1. **Schema:** conflict_resolutions table exists with indexes ✓
2. **Module exports:** resolveFieldConflicts and generateConflictSummary ✓
3. **Database exports:** logConflictResolution, getConflictResolutions, getConflictResolutionCount ✓
4. **Self-test:** All scenarios pass (NULL handling, grace period, conflict detection, summary) ✓
5. **Integration:** sync-origin utilities, stadion-db functions, email compatibility all verified ✓

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for Phase 22:** Reverse Sync - Contact Fields

The conflict resolution infrastructure is complete and tested. Phase 22 can now:
- Call `resolveFieldConflicts()` during forward sync to detect conflicts
- Apply resolved values from the returned resolutions map
- Include conflict summary in email reports via `generateConflictSummary()`
- Query audit table for debugging: `getConflictResolutions(db, since)`

**Dependencies satisfied:**
- ✅ Phase 20: Bidirectional timestamp tracking in place
- ✅ Conflict detection logic implemented and tested
- ✅ Audit trail functional
- ✅ Email summary generation working

**Known limitations:**
- No retention policy for audit table (grows unbounded)
- No conflict rate monitoring metrics yet
- Grace period not configurable (hardcoded 5 seconds)

These limitations are acceptable for Phase 22-24 implementation. Can be addressed in future optimization phases if needed.

## Files Modified

### Created
- `lib/conflict-resolver.js` - Conflict detection and resolution module (274 lines)
  - Exports: resolveFieldConflicts, generateConflictSummary
  - Includes comprehensive self-test

### Modified
- `lib/stadion-db.js` - Added conflict_resolutions table and helper functions (120 lines added)
  - Table: conflict_resolutions with indexes
  - Functions: logConflictResolution, getConflictResolutions, getConflictResolutionCount

## Performance Notes

Conflict resolution adds per-field timestamp comparison for all tracked fields:
- 7 tracked fields × 2 timestamps per member = 14 comparisons per member
- With 1000+ members: ~14,000 comparisons per sync
- Expected impact: negligible (simple integer comparisons)

Most syncs will have zero conflicts (early exit when values match).

## Testing Coverage

**Unit tests (self-test in conflict-resolver.js):**
- NULL timestamp handling (both NULL, one NULL, system with history wins)
- Grace period (within 5s tolerance, Sportlink wins)
- Real conflicts (timestamps differ by >5s, values differ)
- Summary generation (grouped by member, email-compatible format)

**Integration tests:**
- Full stack: sync-origin → conflict-resolver → stadion-db → email
- In-memory database with real timestamp columns
- Audit table population verified
- Summary format verified

All tests pass ✓

## Commits

- ed62d86: feat(21-01): add conflict_resolutions audit table and helper functions
- a689529: feat(21-01): create conflict resolver module with LWW logic
- 44a8761: test(21-01): verify integration with existing utilities

## Duration

Plan completed in 165 seconds (~3 minutes).

---

*Phase: 21-conflict-resolution-infrastructure*
*Plan: 01*
*Completed: 2026-01-29*
