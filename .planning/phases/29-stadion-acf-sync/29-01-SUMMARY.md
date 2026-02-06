# Phase 29 Plan 01: Per-Year ACF Field Sync Summary

```yaml
phase: 29
plan: 01
subsystem: stadion-sync
tags: [acf, nikki, wordpress, rest-api]

dependency_graph:
  requires: [28-01]
  provides: [per-year-nikki-fields]
  affects: []

tech_stack:
  added: []
  patterns: [per-year-acf-fields, dynamic-field-generation]

key_files:
  created: []
  modified:
    - sync-nikki-to-stadion.js

decisions:
  - id: acf-field-registration
    choice: "Created 12 custom fields via Stadion API (3 fields x 4 years)"
    reason: "WordPress/ACF requires field registration before values can be stored"
    alternatives: ["Dynamic fields (rejected - not supported by ACF)"]

metrics:
  duration: "5m"
  completed: "2026-02-01"
```

## One-liner

Per-year Nikki contribution fields synced to Stadion via buildPerYearAcfFields function.

## What Changed

Extended `sync-nikki-to-stadion.js` to write per-year contribution data alongside the existing HTML summary field.

### Key Implementation Details

1. **buildPerYearAcfFields function**: Takes contributions array and generates ACF field payload with `_nikki_{year}_total`, `_nikki_{year}_saldo`, and `_nikki_{year}_status` fields for each year.

2. **PUT request integration**: Per-year fields are spread into the ACF object alongside existing fields (first_name, last_name, nikki-contributie-status).

3. **Verbose logging**: Updated to show which years are being synced for each member update.

4. **Custom field registration**: Created 12 ACF fields on Stadion server (4 years x 3 fields per year) via the custom fields API.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1fbb11b | feat | Add per-year ACF field builder and integrate into PUT |
| 4ed3358 | feat | Add verbose logging for years and export buildPerYearAcfFields |

## Decisions Made

### ACF Field Registration Required

**Context:** Plan assumed dynamic field names would work without registration.

**Decision:** Created custom fields via Stadion API before sync could populate them.

**Rationale:** WordPress ACF silently ignores fields that aren't registered. The existing `nikki-contributie-status` field was already registered, so per-year fields needed the same treatment.

**Fields created:**
- `_nikki_2022_total`, `_nikki_2022_saldo`, `_nikki_2022_status`
- `_nikki_2023_total`, `_nikki_2023_saldo`, `_nikki_2023_status`
- `_nikki_2024_total`, `_nikki_2024_saldo`, `_nikki_2024_status`
- `_nikki_2025_total`, `_nikki_2025_saldo`, `_nikki_2025_status`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered ACF custom fields on Stadion**

- **Found during:** Task 3 (server verification)
- **Issue:** Per-year fields were being sent in PUT requests but not saved because they weren't registered ACF fields
- **Fix:** Created 12 custom fields via Stadion's `/rondo/v1/custom-fields/person` API endpoint
- **Files modified:** None (server-side API calls only)
- **Commit:** N/A (runtime configuration)

## Verification Results

1. **Code compiles:** `node -c sync-nikki-to-stadion.js` returns no syntax errors
2. **Function exists:** `buildPerYearAcfFields` is defined and exported in module.exports
3. **Server sync works:** Running sync on production server completes without errors, verbose output shows years being synced
4. **Stadion fields populated:** Verified person 3853 shows `_nikki_2025_saldo: 0` and `_nikki_2025_status: "Volledig betaald"`

## Next Phase Readiness

Phase 29 is complete. This was the final phase of the v2.1 milestone.

**Project status:** 29 of 29 phases complete (100%)

No blockers or concerns for future work.
