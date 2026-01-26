# Phase 9: Photo State Tracking - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

System tracks photo state in SQLite and detects when photos need syncing. This phase adds the schema and detection logic — actual downloading/uploading happens in subsequent phases.

</domain>

<decisions>
## Implementation Decisions

### Change Detection Logic
- Compare stored PersonImageDate to incoming value from Sportlink data
- If PersonImageDate changes (new date), always re-download unconditionally
- If PersonImageDate was present but becomes empty/null, mark for deletion (local + Stadion)
- Track intermediate sync states separately: download-pending vs upload-pending vs fully-synced

### State Model
- Photo states: `no_photo`, `pending_download`, `downloaded`, `pending_upload`, `synced`, `pending_delete`
- Store the actual PersonImageDate value (not just a hash) for debugging and audit
- Extend existing members table with photo columns rather than separate table

### Edge Case Handling
- Photo reappears after removal: treat as new photo, reset to pending_download
- Member deleted from Sportlink entirely: delete local photo + Stadion photo
- Database is source of truth: if local file exists but DB says no_photo, delete orphaned file

### Processing Approach
- Full comparison every run: PersonImageDate comes in main Sportlink download, compare all members
- Photo state detection happens during import when member data is updated in SQLite
- Process all pending photos per run (no per-run limit)
- No force-rescan mode — always trust stored state

### Claude's Discretion
- Whether to track timestamps for each state transition (downloaded_at, uploaded_at)
- How to handle malformed/unparseable PersonImageDate values

</decisions>

<specifics>
## Specific Ideas

- PersonImageDate is already available in the main Sportlink data download — leverage this
- Integrate detection into existing member import flow rather than separate step

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-photo-state-tracking*
*Context gathered: 2026-01-26*
