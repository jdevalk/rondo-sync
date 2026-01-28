---
phase: 19-photo-api-optimization
plan: 01
subsystem: database
tags: [sqlite, photo-sync, schema-migration, member-data]

# Dependency graph
requires:
  - phase: 17-memberheader-data-capture
    provides: MemberHeader API capture with photo_url/photo_date in sportlink_member_free_fields
provides:
  - photo_url and photo_date columns in stadion_members table
  - Change detection using photo_url/photo_date for API-based photo sync
  - Backwards-compatible fallback to person_image_date
affects: [19-02, 19-03]  # Future plans for photo download and pipeline integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid photo detection: photo_url preferred, person_image_date fallback"

key-files:
  created: []
  modified:
    - lib/stadion-db.js
    - prepare-stadion-members.js

key-decisions:
  - "Store photo_url/photo_date in stadion_members (not just free_fields) for direct access"
  - "Keep person_image_date as fallback for members without MemberHeader data"
  - "Photo data flows through prepare step, not download step (architectural deviation)"

patterns-established:
  - "Schema migrations use PRAGMA table_info check before ALTER TABLE"
  - "Hybrid change detection: new fields preferred, old fields as fallback"

# Metrics
duration: 3min
completed: 2026-01-28
---

# Phase 19 Plan 01: Photo Schema Migration Summary

**Added photo_url/photo_date columns to stadion_members with hybrid change detection using MemberHeader API data when available**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-28T20:17:31Z
- **Completed:** 2026-01-28T20:20:47Z
- **Tasks:** 2 (combined into 1 commit)
- **Files modified:** 2

## Accomplishments

- Added `photo_url` and `photo_date` columns to `stadion_members` table via conditional migration
- Updated `upsertMembers()` to accept and store photo data from MemberHeader API
- Implemented hybrid photo change detection: uses `photo_url`/`photo_date` when available, falls back to `person_image_date`
- Photo data now flows from `sportlink_member_free_fields` through `prepare-stadion-members.js` to database

## Task Commits

Tasks were combined into a single atomic commit (schema + data flow are coupled):

1. **Task 1+2: Add photo columns and flow photo data** - `418034a` (feat)

## Files Created/Modified

- `lib/stadion-db.js` - Schema migration for photo_url/photo_date columns, updated upsertMembers() with hybrid change detection
- `prepare-stadion-members.js` - Flow photo_url/photo_date from free_fields lookup to member data

## Decisions Made

1. **Combined tasks into single commit** - Schema changes and data flow are interdependent; committing separately would break the sync pipeline temporarily.

2. **Store photo data in stadion_members** - Following research recommendation: "Use Option A (add to stadion_members) for simplicity and completeness." Avoids JOIN complexity and keeps all photo state in one table.

3. **Hybrid change detection** - Photo state triggers `pending_download` when:
   - `photo_url` is provided and differs from stored value, OR
   - `photo_url` is null AND `person_image_date` differs (fallback for ~200 members without MemberHeader data)

## Deviations from Plan

### Architectural Deviation

**1. [Rule 3 - Blocking] Modified prepare-stadion-members.js instead of download-data-from-sportlink.js**
- **Found during:** Task 2 analysis
- **Issue:** Plan assumed `download-data-from-sportlink.js` visits individual member pages to capture MemberHeader API. In reality, it performs a single bulk SearchMembers API call that returns all members at once. No individual page visits means no MemberHeader API responses to capture.
- **Fix:** Modified `prepare-stadion-members.js` to flow `photo_url` and `photo_date` from the existing `sportlink_member_free_fields` lookup (which already contains MemberHeader data for ~500 members captured during functions download).
- **Files modified:** prepare-stadion-members.js (instead of download-data-from-sportlink.js)
- **Verification:** Syntax checks pass, data flow is correct
- **Impact:** Same outcome achieved - photo data flows to stadion_members. ~500 members with functions/committees get photo_url/photo_date. ~200 members without functions continue using person_image_date for change detection.

---

**Total deviations:** 1 architectural (implementation approach changed, outcome preserved)
**Impact on plan:** Implementation file changed from download to prepare step. Achieves same goal: photo_url/photo_date stored in stadion_members for API-based photo sync.

## Issues Encountered

**Plan-code mismatch:** The plan was written assuming `download-data-from-sportlink.js` visits individual member pages. After code analysis, discovered it does bulk search only. Resolved by implementing through `prepare-stadion-members.js` instead, which already has access to the required data via `sportlink_member_free_fields` lookup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 19-02:**
- `stadion_members` table has `photo_url` and `photo_date` columns
- `upsertMembers()` stores photo data and triggers state changes
- Change detection prefers `photo_url`/`photo_date` when available

**Coverage note:**
- ~500 members (with functions/committees) have `photo_url` and `photo_date` from MemberHeader API
- ~200 members (without functions) use `person_image_date` fallback
- Full coverage would require extending MemberHeader capture to all members (potential future enhancement)

---
*Phase: 19-photo-api-optimization*
*Completed: 2026-01-28*
