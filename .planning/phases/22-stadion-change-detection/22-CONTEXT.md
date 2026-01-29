# Phase 22: Stadion Change Detection - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Identify which Stadion members have modifications newer than the last forward sync for reverse sync. This phase detects changes — it does not perform the actual reverse sync to Sportlink (that's Phase 23-24).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User delegated all implementation decisions. Claude will use these approaches based on existing architecture:

**Detection criteria:**
- Use Stadion REST API `modified_gmt` as initial filter (efficient API query)
- Compare against `forward_modified` timestamps from stadion_members table (Phase 20)
- Only consider the 7 tracked fields: email, email2, mobile, phone, datum_vog, freescout_id, financiele_blokkade
- Hash-based change detection confirms actual field value differences (matches existing pattern)

**False positive handling:**
- Ignore changes to Stadion-only fields (photo, work_history, etc.)
- Check `sync_origin` column — skip records where last change was from forward sync
- Use 5-second grace period from conflict resolver (Phase 21) for near-ties

**Batch processing:**
- Query all members with `modified_gmt` > last detection run timestamp
- Use existing pagination pattern from Stadion API (100 per page)
- Store last detection timestamp in SQLite for incremental runs

**Audit logging:**
- Log to SQLite table (consistent with existing audit patterns)
- Store: knvb_id, field_name, old_value, new_value, detected_at, stadion_modified_gmt
- Detection logs feed into email reports (Phase 24)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches consistent with existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-stadion-change-detection*
*Context gathered: 2026-01-29*
