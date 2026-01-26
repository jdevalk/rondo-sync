---
phase: 09-photo-state-tracking
plan: 01
subsystem: database
tags: [sqlite, state-tracking, photo-sync]

# Dependency graph
requires:
  - phase: 08-parent-relationship-sync
    provides: Stadion database infrastructure for member tracking
provides:
  - Photo state tracking columns in stadion_members table
  - State detection logic for photo changes (added/updated/removed)
  - Query functions for retrieving members by photo state
  - PersonImageDate extraction from Sportlink data pipeline
affects: [10-photo-download, 11-photo-upload, 12-photo-deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Photo state machine: no_photo -> pending_download -> downloaded -> pending_upload -> synced -> pending_delete"
    - "CASE-based state detection in SQL ON CONFLICT clause"
    - "PersonImageDate change detection via NULL and inequality checks"

key-files:
  created: []
  modified:
    - lib/stadion-db.js
    - prepare-stadion-members.js

key-decisions:
  - "Photo state column with CHECK constraint limits to 6 valid states"
  - "Empty PersonImageDate strings normalized to NULL for SQL comparison correctness"
  - "State transitions handled atomically in upsertMembers ON CONFLICT clause"

patterns-established:
  - "Photo state tracking: person_image_date stores source value, photo_state tracks sync status"
  - "State detection: compare excluded.person_image_date to stadion_members.person_image_date in ON CONFLICT"
  - "Query functions return filtered subsets by state for downstream photo sync operations"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 9 Plan 1: Photo State Tracking Summary

**SQLite schema extended with photo state tracking (person_image_date, photo_state, photo_state_updated_at) and automatic state detection for photo changes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T10:37:49Z
- **Completed:** 2026-01-26T10:39:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added photo state tracking columns to stadion_members table with CHECK constraint
- Implemented automatic photo state detection in upsertMembers (new/changed/removed)
- Created query functions for photo sync operations (getMembersByPhotoState, updatePhotoState, clearPhotoState)
- PersonImageDate extraction from Sportlink data via field-mapping.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Photo State Tracking to stadion-db.js** - `586c05c` (feat)
2. **Task 2: Pass PersonImageDate Through Pipeline** - `d3f49e9` (feat)

## Files Created/Modified
- `lib/stadion-db.js` - Added person_image_date, photo_state, photo_state_updated_at columns; state detection in upsertMembers; getMembersByPhotoState, updatePhotoState, clearPhotoState functions
- `prepare-stadion-members.js` - Extract PersonImageDate from Sportlink data and pass to upsertMembers

## Decisions Made

**1. Photo state CHECK constraint**
- Limited photo_state column to 6 valid states: no_photo, pending_download, downloaded, pending_upload, synced, pending_delete
- Rationale: Prevents invalid states, documents state machine at schema level

**2. Empty string normalization to NULL**
- PersonImageDate empty strings normalized to null in preparePerson
- Rationale: SQL NULL comparisons (IS NULL, != NULL) only work correctly with null, not empty strings

**3. Atomic state detection in ON CONFLICT**
- State transitions handled entirely in SQL ON CONFLICT clause
- Rationale: No race conditions, single atomic operation per member upsert

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 10 (Photo Download):**
- Photo state tracking complete
- getMembersByPhotoState('pending_download') will return members needing photo download
- updatePhotoState('downloaded') will mark photos as downloaded
- Existing Sportlink data shows 769 members with PersonImageDate (potential photos to download)

**Foundation established:**
- State machine defined (no_photo -> pending_download -> downloaded -> pending_upload -> synced)
- Delete path defined (pending_delete -> no_photo)
- Query functions ready for downstream photo sync scripts

---
*Phase: 09-photo-state-tracking*
*Completed: 2026-01-26*
