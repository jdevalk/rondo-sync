# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention — now bidirectionally

**Current focus:** Phase 23 - Reverse Sync to Sportlink (General Fields)

## Current Position

Phase: 23 of 24 (Reverse Sync - Sportlink General)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-01-29 — Completed 23-02-PLAN.md

Progress: [█████████░░░░░░░░░░░] 23/24 phases (96%)

## Performance Metrics

**Velocity:**
- Total plans completed: 21 phases (v1.0-v1.7 + Phase 20-22)
- Average duration: Not tracked for previous milestones
- Total execution time: Not tracked for previous milestones

**By Phase:**

| Phase | Plan | Duration | Tasks |
|-------|------|----------|-------|
| 20-01 | Bidirectional Timestamp Tracking | 3 min | 3/3 |
| 21-01 | Conflict Resolution Infrastructure | 3 min | 3/3 |
| 22-01 | Stadion Change Detection | 3 min | 3/3 |
| 22-02 | Field-Level Comparison Fix | 1 min | 2/2 |
| 23-01 | Contact Fields Reverse Sync Foundation | 2.4 min | 3/3 |
| 23-02 | Pipeline Integration | 3 min | 2/2 |

**Recent Trend:**
- Phase 20-01 completed in 3 minutes
- Phase 21-01 completed in 3 minutes
- Phase 22-01 completed in 3 minutes
- Phase 22-02 completed in 1 minute (gap closure)
- Phase 23-01 completed in 2.4 minutes
- Phase 23-02 completed in 3 minutes
- Trend: Consistent 2-3 min per plan, faster for gap closures

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 23-02: REVERSE_SYNC_DETAIL env var controls field-level output (summary default)
- Phase 23-02: Email report section only shown when changes exist (no noise)
- Phase 23-02: updateSportlinkTimestamps helper extracts timestamp update logic
- Phase 23-01: Use Playwright for Sportlink form automation (no API available)
- Phase 23-01: Verify field values after save by reading them back
- Phase 23-01: Sequential processing with 1-2s delay between members (rate limiting)
- Phase 23-01: Exponential backoff retry (3 attempts) with jitter
- Phase 22-02: Move data_json fetch outside field loop for efficiency
- Phase 22-02: Use extractFieldValue for both old and new values for consistency
- Phase 22-01: Hash-based change detection using SHA-256 of tracked fields only
- Phase 22-01: Skip members where sync_origin=SYNC_FORWARD to avoid loop detection false positives
- Phase 22-01: Use WordPress modified_after parameter for efficient incremental detection
- Phase 22-01: Store detection_run_id for correlating changes within a single detection run
- Phase 21-01: Grace period (5s tolerance) - Sportlink wins on near-ties
- Phase 21-01: NULL timestamp handling - system with history wins
- Phase 21-01: Conflict audit trail in SQLite for debugging and metrics
- Phase 20-01: NULL timestamps for untracked history (no backfilling)
- Phase 20-01: 5-second clock drift tolerance for timestamp comparison
- Phase 20-01: 7 tracked fields (email, email2, mobile, phone, datum_vog, freescout_id, financiele_blokkade)
- Photo API Optimization (v1.7): Store photo_url/photo_date in stadion_members for direct access
- Photo API Optimization (v1.7): HTTP photo fetch with 3-retry backoff for resilience
- Photo API Optimization (v1.7): Photo sync integrated into people pipeline (hourly)
- Team Sync (v1.5): Track WordPress repeater field row indices to preserve manual entries
- Core Architecture: Hash-based change detection avoids timestamp issues

### Pending Todos

None.

### Blockers/Concerns

**Research Required:**
- Phase 24 (NEXT): Sportlink /general page selectors need browser inspection for reliable automation [CRITICAL - placeholder selectors need verification]
- Phase 24: Multi-page navigation session persistence must be validated
- Clock sync: Production server (46.202.155.16) NTP configuration must be verified before timestamp-based conflict resolution

**Architecture:**
- Loop prevention (origin tracking) MUST be implemented before any reverse sync code runs [READY - sync_origin column added]
- All timestamps must normalize to UTC to prevent timezone comparison errors [DONE - createTimestamp() uses UTC]
- Conflict resolution infrastructure MUST be in place before reverse sync [READY - Phase 21 complete]
- Change detection MUST be in place before reverse sync [READY - Phase 22 complete with field-level comparison]

## Session Continuity

Last session: 2026-01-29 16:00 UTC
Stopped at: Completed Phase 23-02 (Pipeline Integration)
Resume file: None

---
*State created: 2026-01-29*
*Last updated: 2026-01-29*
