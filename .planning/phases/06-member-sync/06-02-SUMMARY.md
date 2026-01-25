---
phase: 06-member-sync
plan: 02
subsystem: data-transformation
tags: [sportlink, stadion, acf, wordpress, field-mapping]

# Dependency graph
requires:
  - phase: 05-stadion-foundation
    provides: Stadion API client and database foundation
  - phase: 01-02
    provides: laposta-db.js with getLatestSportlinkResults
provides:
  - Sportlink to Stadion member transformation logic
  - Dutch name handling (tussenvoegsel merged into last name)
  - ACF repeater field structuring
  - Member validation logic
affects: [06-03-submit-stadion, 08-pipeline-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [acf-repeater-structuring, dutch-name-handling, empty-field-normalization]

key-files:
  created: [prepare-stadion-members.js]
  modified: []

key-decisions:
  - "Merge Dutch tussenvoegsel into last_name field (not separate field)"
  - "Empty meta fields use empty string '' (not null/undefined)"
  - "Empty repeater arrays omit items entirely (not empty objects)"
  - "Birth date stored in important_dates ACF repeater"

patterns-established:
  - "ACF repeater pattern: omit empty items, not empty objects with null values"
  - "Name transformation: buildName() returns {first_name, last_name} with tussenvoegsel merged"
  - "Validation pattern: isValidMember() checks required fields before transformation"

# Metrics
duration: 2min
completed: 2026-01-25
---

# Phase 6 Plan 02: Stadion Member Preparation Summary

**Sportlink to Stadion data transformation with Dutch name handling, ACF repeater structuring, and field validation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-25T19:29:54Z
- **Completed:** 2026-01-25T19:31:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Transform Sportlink members to Stadion person format with all required fields
- Handle Dutch tussenvoegsel correctly by merging into last_name
- Structure contact_info, addresses, and important_dates as ACF repeater arrays
- Map gender codes (Male→M, Female→F) and store birth_date in important_dates
- Validate members before transformation (skip missing KNVB ID or name)
- Enforce empty string for missing meta fields, omit empty repeater items

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prepare-stadion-members.js with field mapping** - `c2e1eb4` (feat)

**Plan metadata:** (pending - created with summary commit)

## Files Created/Modified
- `prepare-stadion-members.js` - Transforms Sportlink data to Stadion person format with Dutch name handling and ACF repeater structuring

## Decisions Made

**1. Dutch tussenvoegsel handling**
Merged tussenvoegsel into last_name field instead of keeping separate. Rationale: Stadion WordPress uses separate first_name/last_name fields (no tussenvoegsel field), and keeping "van der Berg" as full last name is more natural for Dutch names.

**2. Empty field normalization**
Meta fields (first_name, last_name, gender) use empty string '' when missing, not null/undefined. Repeater arrays (contact_info, addresses, important_dates) omit empty items entirely. Rationale: WordPress meta fields handle empty strings cleanly, and ACF repeaters shouldn't have null entries.

**3. Birth date in important_dates**
Store birth_date as an item in important_dates ACF repeater with type='birth_date'. Rationale: Follows Stadion's Important Dates structure and allows for future date types.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - transformation logic implemented as specified with no blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for:**
- Phase 6 Plan 03: Submit to Stadion (will use prepare-stadion-members.js output)
- Hash-based change detection implementation
- Person matching by KNVB ID and email fallback

**Prepared:**
- Member transformation returns { knvb_id, email, data } structure
- Data structure ready for WordPress REST API POST/PUT requests
- Validation ensures all transformed members have required fields

**Note:**
Tested with 1068 real Sportlink members - all transformed successfully with 0 skipped. Field mappings verified for:
- Dutch tussenvoegsel: "Mats van Alphen" → first_name: "Mats", last_name: "van Alphen"
- Gender mapping: Male→M, Female→F working correctly
- ACF repeaters: contact_info, addresses, important_dates structured correctly
- Empty field handling: meta fields use '', repeater arrays omit empty items

---
*Phase: 06-member-sync*
*Completed: 2026-01-25*
