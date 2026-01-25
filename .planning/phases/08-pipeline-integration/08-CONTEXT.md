# Phase 8: Pipeline Integration - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate Stadion sync into the existing sync-all pipeline and produce unified email reports. Running `npm run sync-all` syncs to both Laposta and Stadion. Email report includes both systems' results.

</domain>

<decisions>
## Implementation Decisions

### Report format
- Separate sections: Laposta section, then Stadion section in email report
- Summary stats only for Stadion (totals: created, updated, skipped)
- Combined persons count (members + parents together, not separate stats)
- Errors in separate section at bottom (not inline with stats)

### Execution order
- Laposta sync runs first, then Stadion sync
- Stadion reads from existing SQLite database (not CSV — update CLAUDE.md)
- Provide `npm run sync-stadion` for Stadion-only sync

### Summary output
- Minimal console output by default (phase names and final totals)
- `--verbose` flag available for progress and details
- `--dry-run` flag to show what would sync without making changes

### Claude's Discretion
- Whether to continue Stadion sync if Laposta fails (based on error severity)
- End-of-run console summary format
- Implementation of verbose/dry-run flag handling

</decisions>

<specifics>
## Specific Ideas

- Stadion reads from SQLite database, not CSV — documentation in CLAUDE.md needs updating to reflect actual data flow

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-pipeline-integration*
*Context gathered: 2026-01-25*
