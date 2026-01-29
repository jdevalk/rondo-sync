# Phase 26: Wire Conflict Resolution to Forward Sync - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect the orphaned conflict resolution infrastructure (built in Phase 21) to the forward sync pipeline. When forward sync runs, it should detect when both Sportlink and Stadion have modified the same field and resolve using last-edit-wins logic. This is infrastructure wiring — the conflict resolver already exists.

</domain>

<decisions>
## Implementation Decisions

### Conflict reporting
- Per-field details in email reports
- Show each conflict: field name, both values, which system won, timestamp comparison
- Conflicts should be clearly visible for operator review

### Error handling
- Skip member and continue sync if conflict resolution fails
- Log detailed error for skipped member
- Do not abort entire sync for individual conflict resolution errors
- Remaining members should process normally

### Tie-breaker rule
- Sportlink wins when timestamps are equal (within grace period)
- Forward sync has precedence as Sportlink is source of truth for member data
- Explicit decision: forward bias on ties

### Field scope
- Conflict detection applies only to reverse-sync fields
- Fields: email, email2, mobile, phone, datum-vog, freescout-id, financiele-blokkade
- Forward-only fields (name, address, etc.) always overwrite without conflict check

### Claude's Discretion
- Grace period duration for timestamp comparison
- Exact integration point within submit-stadion-sync.js
- Audit table structure (use existing from Phase 21)
- Log formatting for conflict details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — standard integration of existing conflict resolution module.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-wire-conflict-resolution*
*Context gathered: 2026-01-29*
