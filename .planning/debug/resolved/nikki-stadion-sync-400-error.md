---
status: resolved
trigger: "sync-nikki-to-stadion.js fails with 400 error - Stadion API requires first_name when updating ACF fields"
created: 2026-01-28T10:00:00Z
updated: 2026-01-28T10:25:00Z
---

## Current Focus

hypothesis: CONFIRMED - WordPress REST API requires first_name field in ACF updates
test: COMPLETED - Modified script to fetch and include required fields
expecting: Script will successfully update Stadion records without 400 errors
next_action: Deploy to server for production testing

## Symptoms

expected: Update Stadion person records with Nikki contribution HTML in the nikki-contributie-status ACF field
actual: Every API call returns 400 error: "first_name is a required property of acf"
errors: {"code":"rest_invalid_param","message":"Invalid parameter(s): acf","data":{"status":400,"params":{"acf":"first_name is a required property of acf."},"details":{"acf":{"code":"rest_property_required","message":"first_name is a required property of acf.","data":null}}}}
reproduction: npm run sync-nikki-stadion-verbose
started: New script just created, first run

## Eliminated

## Evidence

- timestamp: 2026-01-28T10:05:00Z
  checked: sync-nikki-to-stadion.js lines 144-153
  found: PUT request sends only `acf: { 'nikki-contributie-status': html }` without first_name or last_name
  implication: Partial ACF updates may not be supported by WordPress REST API

- timestamp: 2026-01-28T10:05:00Z
  checked: submit-stadion-work-history.js line 295
  found: When updating work_history, includes first_name and last_name: `{ acf: { first_name: existingFirstName, last_name: existingLastName, work_history: newWorkHistory } }`
  implication: Other sync scripts fetch existing first_name/last_name and include them in PUT requests

- timestamp: 2026-01-28T10:05:00Z
  checked: submit-stadion-sync.js line 119
  found: When updating parent relationships, includes first_name, last_name, relationships, and _visibility: `{ acf: { first_name, last_name, relationships: mergedRelationships, _visibility: existingVisibility } }`
  implication: Pattern confirmed - all existing scripts fetch current values and include required fields in updates

- timestamp: 2026-01-28T10:20:00Z
  checked: Modified sync-nikki-to-stadion.js lines 109-143, 156-167
  found: Script now fetches first_name and last_name in GET request (line 115-123) and includes them in PUT request (line 160-164)
  implication: Fix follows established pattern from other sync scripts

- timestamp: 2026-01-28T10:20:00Z
  checked: Ran dry-run test
  found: Script executes without errors, helper functions work correctly
  implication: Code logic is sound, fix should resolve 400 error on server

## Resolution

root_cause: WordPress REST API requires first_name when updating ACF fields. The sync-nikki-to-stadion.js script sends only `acf: { 'nikki-contributie-status': html }` but the API validation requires first_name to be present (line 148-150). All other sync scripts (submit-stadion-work-history.js, submit-stadion-sync.js) follow the pattern of fetching existing first_name and last_name before making partial ACF updates.

fix: Modified sync-nikki-to-stadion.js to:
1. Fetch existing ACF data including first_name and last_name during the GET request (lines 115-123)
2. Include first_name and last_name in the PUT request payload along with nikki-contributie-status (lines 160-164)
3. Optimized to avoid duplicate GET requests by combining change detection and name field fetching
4. Added error handling to skip updates when GET request fails (can't safely update without first_name)

verification:
- ✓ Script executes without errors in dry-run mode
- ✓ Helper functions (generateContributionHtml, formatEuro) work correctly
- ✓ Code follows the established pattern from submit-stadion-work-history.js and submit-stadion-sync.js
- ✓ Error handling ensures we never send PUT without required first_name field
- ✓ Local verification complete
- Note: Full production testing requires server deployment with actual Nikki data

files_changed: ['sync-nikki-to-stadion.js']
