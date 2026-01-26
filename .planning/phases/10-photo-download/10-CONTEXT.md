# Phase 10: Photo Download - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract photos from Sportlink member detail pages via browser automation. Phase 9 already provides change detection (PersonImageDate tracking). Phase 11 handles uploading to Stadion and deletion. This phase focuses solely on downloading photos to local storage.

</domain>

<decisions>
## Implementation Decisions

### Photo Navigation
- Reuse existing browser session from CSV download — extend current automation
- Click thumbnail/avatar to open full-size photo modal, then extract from modal
- Process members sequentially one-by-one (simpler, easier to debug)
- Use natural pacing with small random delays (1-3 sec) between actions

### File Handling
- Preserve original image format (jpg, png, webp, etc.) as provided by Sportlink
- Smart update: only re-download if PersonImageDate has changed
- Store in `photos/` directory at project root (same level as `logs/`)
- Add `photos/` to `.gitignore` — photos are generated data, not source

### Error Recovery
- Log errors and skip failed members — don't block the batch
- Track failed member IDs with error reason in SQLite for potential retry
- Resumable on re-run: skip already-downloaded photos (fresh login required)

### Progress Reporting
- Minimal progress output: "Downloaded 15/42 photos"
- Simple summary at end: "Downloaded: 40, Skipped: 5, Failed: 2"
- Use existing logger, logs go to `logs/YYYY-MM-DD.log`
- Verbose mode (-v) shows per-member details (name, navigation steps, file sizes)

### Claude's Discretion
- How to handle members whose page exists but has no photo (data sync delay edge case)
- Exact timing of random delays
- Browser automation selectors and page structure handling

</decisions>

<specifics>
## Specific Ideas

- Resume capability means tracking download state, but requires fresh login when script restarts
- The "overwrite if changed" logic uses PersonImageDate from Phase 9's state tracking
- Sequential processing preferred over batching for reliability and debuggability

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-photo-download*
*Context gathered: 2026-01-26*
