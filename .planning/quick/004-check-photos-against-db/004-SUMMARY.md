---
phase: quick-004
plan: 004
subsystem: photos
tags: [sqlite, filesystem, consistency, photos]

# Dependency graph
requires:
  - phase: 12-photo-download
    provides: download-photos-from-sportlink.js and photo_state tracking
  - phase: 13-photo-upload
    provides: upload-photos-to-stadion.js and photo sync logic
provides:
  - Photo consistency checker between database state and filesystem
  - Automated repair tool for missing photo files
affects: [photo-sync, maintenance, troubleshooting]

# Tech tracking
tech-stack:
  added: []
  patterns: [consistency checking, dry-run with fix mode]

key-files:
  created:
    - check-photo-consistency.js
  modified:
    - package.json

key-decisions:
  - "Use same findPhotoFile logic as upload script for consistency"
  - "Dry-run mode by default, --fix flag for repairs"

patterns-established:
  - "Consistency checkers with dry-run/fix modes for safe validation"

# Metrics
duration: <1min
completed: 2026-01-26
---

# Quick Task 004: Check Photos Against DB

**Consistency checker that detects missing photo files and marks affected members for re-download**

## Performance

- **Duration:** <1 min
- **Started:** 2026-01-26T14:15:59Z
- **Completed:** 2026-01-26T14:16:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created CLI script to validate photo files against database state
- Identifies members with photo_state='downloaded' or 'synced' but no local file
- Provides dry-run mode for safe inspection before repairs
- Automated repair with --fix flag marks missing photos for re-download

## Task Commits

Each task was committed atomically:

1. **Task 1: Create check-photo-consistency.js script** - `ac3f96c` (feat)
2. **Task 2: Add npm script** - `221ba2d` (chore)

## Files Created/Modified
- `check-photo-consistency.js` - Consistency checker between database photo_state and filesystem photos
- `package.json` - Added check-photo-consistency npm script

## Decisions Made
- Used same `findPhotoFile()` logic as upload-photos-to-stadion.js for consistency
- Dry-run mode by default (safe inspection), --fix flag for database updates
- Reports both summary and detailed list of missing photos with KNVB IDs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Tool is ready for immediate use. Can be used to:
- Diagnose photo sync issues after failed downloads
- Detect accidental file deletions
- Repair database state before re-running photo download

---
*Quick Task: 004*
*Completed: 2026-01-26*
