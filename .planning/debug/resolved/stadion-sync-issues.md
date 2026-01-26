---
status: resolved
trigger: "Relations and birthdates not syncing properly to Stadion WordPress, with .map() errors for many members"
created: 2026-01-26T10:00:00Z
updated: 2026-01-26T10:20:00Z
---

## Current Focus

hypothesis: stadion-db.js upsertParents() only stores parent.data, not parent.childKnvbIds, causing getParentsNeedingSync() to return parents without childKnvbIds field
test: Verified stadion-db.js lines 312-320 and 345-350
expecting: This causes .map() error in submit-stadion-sync.js line 124 when it tries to call childKnvbIds.map()
next_action: Fix upsertParents to store childKnvbIds separately, and getParentsNeedingSync to return it

## Symptoms

expected: Relations should be added to Stadion members; Birthdates should be added as Important dates
actual: Relations not being added properly; Birthdates not added as Important dates; Many .map() errors during sync
errors: "Cannot read properties of undefined (reading 'map')" appearing for many email addresses during sync (e.g., toonenhans@gmail.com, zonneveldwim@gmail.com, etc.)
reproduction: Run npm run sync-all or npm run sync-stadion
timeline: Happening currently on sync runs

## Eliminated

## Evidence

- timestamp: 2026-01-26T10:05:00Z
  checked: prepare-stadion-members.js
  found: Missing buildImportantDates() function and important_dates field in ACF data
  implication: Birthdates are not being added because the function was planned but never implemented

- timestamp: 2026-01-26T10:06:00Z
  checked: submit-stadion-sync.js lines 124-133
  found: childKnvbIds.map() call on line 124 - could fail if childKnvbIds is undefined
  implication: If parent.childKnvbIds is undefined, this will throw "Cannot read properties of undefined (reading 'map')"

- timestamp: 2026-01-26T10:07:00Z
  checked: lib/stadion-db.js upsertParents (lines 312-320) and getParentsNeedingSync (lines 345-350)
  found: upsertParents only stores parent.data in data_json, NOT parent.childKnvbIds. getParentsNeedingSync returns parsed data_json as 'data' field
  implication: childKnvbIds is lost during storage, so when syncParent() receives parent object from getParentsNeedingSync(), it has no childKnvbIds field

- timestamp: 2026-01-26T10:08:00Z
  checked: prepare-stadion-parents.js line 74
  found: prepareParent() creates object with { email, childKnvbIds, data } structure
  implication: childKnvbIds is at top level, not inside data, but upsertParents only stores data field

## Evidence

## Resolution

root_cause: Two distinct issues found - (1) Relations not syncing: stadion-db.js upsertParents() only stores parent.data in database, discarding parent.childKnvbIds. When getParentsNeedingSync() retrieves parents, they have no childKnvbIds field, causing .map() error on line 124 of submit-stadion-sync.js. (2) Birthdates not syncing: prepare-stadion-members.js missing buildImportantDates() function and important_dates field that was planned but never implemented.
fix: |
  1. Updated lib/stadion-db.js upsertParents() to store full parent object with childKnvbIds in data_json
  2. Updated lib/stadion-db.js getParentsNeedingSync() to parse and return childKnvbIds field (with backward compatibility)
  3. Added buildImportantDates() function to prepare-stadion-members.js that creates important_dates array with birth_date
  4. Updated preparePerson() to include important_dates in ACF fields
verification: |
  1. Verified prepare-stadion-members.js generates important_dates field with birth_date entries
  2. Verified prepare-stadion-parents.js includes childKnvbIds in prepared parent objects
  3. Verified database round-trip: upsertParents stores childKnvbIds, getParentsNeedingSync retrieves them
  4. Verified backward compatibility: old database records without childKnvbIds get empty array (no errors)
  5. Ready for production sync - .map() errors will be eliminated, birthdates will sync
files_changed:
  - lib/stadion-db.js
  - prepare-stadion-members.js
