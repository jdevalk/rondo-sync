---
phase: quick
plan: "016"
subsystem: sync
tags: [laposta, stadion, volunteer, huidig-vrijwilliger, sqlite]

requires:
  - phase: stadion-sync
    provides: stadion_members table with person data from Stadion API
  - phase: laposta-sync
    provides: Laposta member preparation pipeline with custom fields
provides:
  - huidig_vrijwilliger column in stadion_members table
  - Volunteer status capture during Stadion person sync (UPDATE + CREATE paths)
  - huidigvrijwilliger custom field in Laposta member preparation
affects: [laposta-sync, stadion-sync, people-pipeline]

tech-stack:
  added: []
  patterns:
    - "Cross-database field enrichment: Stadion DB -> Laposta preparation"

key-files:
  created: []
  modified:
    - lib/stadion-db.js
    - submit-stadion-sync.js
    - prepare-laposta-members.js

key-decisions:
  - "Field comes from Stadion computed field, not from Sportlink directly - no field-mapping.json change needed"
  - "Parent entries always get huidigvrijwilliger '0' since parents are not volunteers themselves"
  - "Graceful fallback to '0' if stadion DB is unavailable during Laposta preparation"

patterns-established:
  - "Cross-DB enrichment: open rondo-sync.sqlite in Laposta prepare to add Stadion-sourced fields"

duration: 3min
completed: 2026-02-05
---

# Quick 016: Sync huidig-vrijwilliger to Laposta Summary

**Volunteer status (huidig-vrijwilliger) flows from Stadion API into stadion-sync DB and out to Laposta as huidigvrijwilliger custom field**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-05T11:24:38Z
- **Completed:** 2026-02-05T11:27:16Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added `huidig_vrijwilliger` INTEGER column to `stadion_members` table with migration
- Stadion person sync now captures volunteer status on both UPDATE and CREATE paths
- Laposta member preparation includes `huidigvrijwilliger` ("0" or "1") for all entries
- Parent entries always get "0" since parents are not volunteers themselves
- Graceful fallback: defaults to "0" if stadion DB is unavailable

## Task Commits

Each task was committed atomically:

1. **Task 1: Add huidig_vrijwilliger column and DB helper functions** - `7472042` (feat)
2. **Task 2: Capture huidig-vrijwilliger during Stadion sync** - `a1bfe81` (feat)
3. **Task 3: Add huidigvrijwilliger to Laposta member preparation** - `12aeb47` (feat)

## Files Created/Modified
- `lib/stadion-db.js` - Added column migration, `updateVolunteerStatus()`, `getVolunteerStatusMap()` functions
- `submit-stadion-sync.js` - Captures `huidig-vrijwilliger` from Stadion API after both PUT and POST
- `prepare-laposta-members.js` - Loads volunteer map from stadion DB, injects into Laposta custom fields

## Decisions Made
- Field not added to `field-mapping.json` since it comes from Stadion (computed field), not Sportlink
- Used `String(knvbId)` for map lookups since DB stores TEXT but Sportlink may provide number
- Parent override placed inside `buildMemberEntry()` after `buildParentCustomFields()` call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `huidigvrijwilliger` field will be auto-created in Laposta when the next sync runs. The volunteer status values will populate after the next Stadion person sync captures them from the API.

## Next Steps

1. Deploy to server: `git push && ssh root@46.202.155.16 "cd /home/sportlink && git pull"`
2. Run a person sync to populate volunteer statuses: `scripts/sync.sh people`
3. Create the `huidigvrijwilliger` field in Laposta list settings (if not auto-created)
4. Verify volunteer counts in Laposta after sync completes

---
*Quick task: 016*
*Completed: 2026-02-05*
