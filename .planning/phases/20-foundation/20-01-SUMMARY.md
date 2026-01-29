---
phase: 20-foundation
plan: 01
title: "Bidirectional Timestamp Tracking & Origin Attribution"
subsystem: database
tags: [sqlite, bidirectional-sync, timestamps, conflict-detection]

dependency_graph:
  requires: []
  provides:
    - "stadion_members bidirectional timestamp columns (14 fields)"
    - "sync_origin column for edit source tracking"
    - "lib/sync-origin.js utility module"
  affects:
    - "Phase 21: Forward sync integration (use timestamps)"
    - "Phase 22: Webhook handler (update stadion timestamps)"
    - "Phase 23: Reverse sync (use timestamps for conflict detection)"

tech_stack:
  added: []
  patterns:
    - "Per-field timestamp tracking ({field}_stadion_modified, {field}_sportlink_modified)"
    - "5-second tolerance for clock drift in timestamp comparison"
    - "NULL timestamps indicate 'modified before tracking started'"

key_files:
  created:
    - "lib/sync-origin.js"
  modified:
    - "lib/stadion-db.js"

decisions:
  - id: "20-01-01"
    title: "NULL for untracked history"
    rationale: "Existing data predates tracking - NULL indicates 'unknown modification time' rather than backfilling with arbitrary timestamps"
  - id: "20-01-02"
    title: "5-second clock drift tolerance"
    rationale: "Production server and Sportlink may have minor time differences; 5 seconds prevents false conflicts while catching real ones"
  - id: "20-01-03"
    title: "7 tracked fields"
    rationale: "email, email2, mobile, phone, datum_vog, freescout_id, financiele_blokkade are the fields that can change in both systems and need conflict detection"

metrics:
  duration: "3 minutes"
  completed: "2026-01-29"
---

# Phase 20 Plan 01: Bidirectional Timestamp Tracking & Origin Attribution Summary

**One-liner:** Per-field bidirectional timestamps (14 columns) and sync_origin tracking enable conflict detection for future reverse sync.

## Changes Made

### Task 1: Add bidirectional timestamp columns to stadion_members
- Added 14 timestamp columns (2 per tracked field) to stadion_members table
- Added sync_origin column for tracking edit source
- Followed existing incremental migration pattern (PRAGMA table_info checks)
- All new columns default to NULL (no backfilling)

**Tracked fields:**
| Field | Stadion Column | Sportlink Column |
|-------|----------------|------------------|
| email | email_stadion_modified | email_sportlink_modified |
| email2 | email2_stadion_modified | email2_sportlink_modified |
| mobile | mobile_stadion_modified | mobile_sportlink_modified |
| phone | phone_stadion_modified | phone_sportlink_modified |
| datum_vog | datum_vog_stadion_modified | datum_vog_sportlink_modified |
| freescout_id | freescout_id_stadion_modified | freescout_id_sportlink_modified |
| financiele_blokkade | financiele_blokkade_stadion_modified | financiele_blokkade_sportlink_modified |

**Commit:** 706aea6

### Task 2: Create sync-origin utility module
- Created lib/sync-origin.js with:
  - SYNC_ORIGIN constants (USER_EDIT, SYNC_FORWARD, SYNC_REVERSE)
  - TRACKED_FIELDS array (7 fields)
  - createTimestamp() - ISO 8601 UTC format
  - compareTimestamps() - 5-second tolerance, NULL treated as epoch
  - getTimestampColumnNames() - column name helper

**Commit:** 62783bc

### Task 3: Verify migration on production database copy
- Copied production database (1068 rows)
- Ran migration successfully
- Verified:
  - Row count unchanged (1068)
  - All 15 new columns added
  - Existing data preserved (knvb_id, stadion_id intact)
  - New columns are NULL (as expected)

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **NULL for untracked history**: Existing member data predates timestamp tracking. Using NULL indicates "modified before tracking started" rather than backfilling with arbitrary timestamps. This is honest and won't cause false conflict detection.

2. **5-second clock drift tolerance**: The compareTimestamps() function uses 5000ms tolerance to account for minor time differences between systems. This prevents false positives from clock drift while still detecting real conflicts.

3. **7 tracked fields selected**: These fields (email, email2, mobile, phone, datum_vog, freescout_id, financiele_blokkade) are the ones that can legitimately change in both Sportlink and Stadion. Other fields like name, birth_date are Sportlink-authoritative only.

## Technical Notes

### Migration Pattern
The migration uses the same incremental pattern as existing migrations:
```javascript
if (!memberColumns.some(col => col.name === 'email_stadion_modified')) {
  db.exec('ALTER TABLE stadion_members ADD COLUMN email_stadion_modified TEXT');
}
```
This is idempotent and safe to run multiple times.

### Timestamp Comparison
```javascript
// Returns: 1 (ts1 newer), -1 (ts2 newer), 0 (within tolerance)
compareTimestamps(ts1, ts2, toleranceMs = 5000)

// NULL is treated as infinitely old (epoch)
compareTimestamps(null, '2026-01-29T14:00:00.000Z') // Returns -1
```

## Next Phase Readiness

**Phase 21 (Forward Sync Integration) can proceed:**
- Timestamp columns are in place
- sync_origin column is ready
- createTimestamp() and SYNC_ORIGIN constants available

**Required for Phase 21:**
- Modify submit-stadion-sync.js to update *_sportlink_modified timestamps
- Set sync_origin to SYNC_FORWARD on each forward sync

**Blockers:** None

## Verification Evidence

Schema verification output:
```
New columns: 15 expected: 15
 - email_stadion_modified
 - email_sportlink_modified
 - email2_stadion_modified
 - email2_sportlink_modified
 - mobile_stadion_modified
 - mobile_sportlink_modified
 - phone_stadion_modified
 - phone_sportlink_modified
 - datum_vog_stadion_modified
 - datum_vog_sportlink_modified
 - freescout_id_stadion_modified
 - freescout_id_sportlink_modified
 - financiele_blokkade_stadion_modified
 - financiele_blokkade_sportlink_modified
 - sync_origin
```

Utility module verification:
```
Origins: OK (3 constants)
Fields: OK (7 fields)
Timestamp: OK (UTC format)
Compare: OK (NULL handling)
```

Production database copy test:
```
rows: 1068 hasOrigin: true hasEmailTs: true
sample: { knvb_id: 'VGPP426', stadion_id: 4914, email_stadion_modified: null, sync_origin: null }
```
