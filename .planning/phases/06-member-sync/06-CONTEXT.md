# Phase 6: Member Sync - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Sync Sportlink member data to Stadion WordPress app via REST API. This includes: field mapping from Sportlink to Stadion person records, matching existing persons by KNVB ID (with email fallback), hash-based change detection, and handling creates/updates/deletes. Parents are handled in Phase 7; pipeline integration is Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Field Mapping
- Name: Separate first name and last name fields (Dutch tussenvoegsel merged into last name)
- Phone: Store both mobile and landline separately if Stadion supports it
- Address: Keep structured fields (street, number, addition, postal code, city) mapped separately
- Birth date: Store as an Important Date in Stadion (full date when available)

### Matching Logic
- Primary match: KNVB ID (relatiecode) stored in Stadion's KNVB ID field
- Fallback match: Email (case-insensitive exact match)
- No match found: Create new person in Stadion
- Multiple email matches: Update first match found
- Backfill: When matched by email, write KNVB ID to the Stadion record for future matching
- Data flow: One-way only — Sportlink → Stadion (no reverse sync)

### Conflict Handling
- Sportlink is authoritative: Always overwrite Stadion fields with Sportlink data
- Unmapped fields: Leave Stadion fields not in the mapping untouched
- Empty Sportlink fields: Clear corresponding Stadion fields (including Important Date/birth date)

### Sync Behavior
- Missing required fields: Skip member with warning, log for review
- Unchanged members: Completely skip (hash match = no API call)
- API errors: Log error and continue syncing remaining members
- Deleted from Sportlink: Delete person from Stadion

### Claude's Discretion
- Hash algorithm implementation details
- Exact API request batching/throttling
- Retry logic for transient failures
- Logging verbosity and format

</decisions>

<specifics>
## Specific Ideas

- Follow the same pattern as the existing Laposta sync (hash-based change detection, SQLite state tracking)
- Use the Promise-based HTTP client pattern established in Phase 5 (Stadion API client)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-member-sync*
*Context gathered: 2026-01-25*
