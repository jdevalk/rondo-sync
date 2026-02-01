# Phase 28: Per-Year SQLite Storage - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Store historical Nikki contribution data (multiple years) per member in SQLite. The table must support queries by knvb_id to retrieve multi-year history. This phase focuses on storage schema and update logic — syncing to Stadion ACF fields is Phase 29.

</domain>

<decisions>
## Implementation Decisions

### Year Boundaries
- Year value comes directly from Nikki's `Jaar` column (4-digit integer, e.g., 2024)
- No interpretation needed — store exactly what Nikki provides
- If multiple rows exist for same member/year, sum the values (aggregate contributions)

### Retention Policy
- Store up to 4 years of data (current year + 3 previous years)
- Filter on ingest: only store data within 4-year window from what Nikki provides
- Never auto-delete once stored — data persists even if member disappears from future Nikki syncs
- Example: In 2025, if Nikki provides 2020-2025 data, store 2022-2025 only

### Data Persistence
- Members who disappear from Nikki sync retain their historical data in SQLite
- Assume missing = member left club, not data corruption
- No cleanup job — manual intervention only if needed

### Claude's Discretion
- Table structure and column types
- Index strategy for knvb_id + year queries
- How to detect "current year" for the 4-year window calculation
- Error handling for malformed year values

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for SQLite schema design.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-per-year-sqlite-storage*
*Context gathered: 2026-02-01*
