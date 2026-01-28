# Project State: Sportlink Sync

**Last Updated:** 2026-01-28
**Milestone:** v1.7 MemberHeader API

## Project Reference

**Core Value:** Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention

**Current Focus:** Use MemberHeader API response to capture financial block status and optimize photo sync by replacing browser DOM scraping with direct API photo URLs

## Current Position

**Phase:** 17 - MemberHeader Data Capture
**Plan:** None (awaiting `/gsd:plan-phase 17`)
**Status:** Planning

**Progress:**
```
[░░░░░░░░░░░░░░░░░░░░] 0% (0/3 phases)
Phase 17: MemberHeader Data Capture     [░░░░░] Pending
Phase 18: Financial Block Sync          [░░░░░] Pending
Phase 19: Photo API Optimization        [░░░░░] Pending
```

**Next Action:** Plan Phase 17 (MemberHeader Data Capture)

## Performance Metrics

**Milestone v1.7:**
- Phases planned: 3
- Phases completed: 0
- Requirements: 12 total
- Coverage: 12/12 (100%)
- Started: 2026-01-28
- Target completion: TBD

**Phase 17:**
- Plans created: 0
- Plans completed: 0
- Tasks completed: 0
- Requirements: 4 (DATA-01, DATA-02, DATA-03, DATA-04)
- Status: Not started

## Accumulated Context

### Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Use MemberHeader API instead of new requests | Already fetched during `/other` page visit, no additional overhead | 2026-01-28 |
| Three-phase structure (Data → Financial → Photo) | Data capture is foundation, other phases can proceed independently after | 2026-01-28 |
| Phase numbering starts at 17 | Continues from v1.6 FreeScout (last phase was 16) | 2026-01-28 |

### Open Questions

(None at this time)

### Blockers

(None at this time)

### TODOs

- [ ] Plan Phase 17 (MemberHeader Data Capture)
- [ ] Identify MemberHeader API response structure in browser network tab
- [ ] Determine SQLite schema changes for new fields
- [ ] Plan Phase 18 (Financial Block Sync) after Phase 17 completion
- [ ] Plan Phase 19 (Photo API Optimization) after Phase 17 completion

### Recent Changes

**2026-01-28:**
- Created roadmap for v1.7 MemberHeader API milestone
- Defined 3 phases covering 12 requirements
- Validated 100% requirement coverage
- Initialized STATE.md for milestone tracking

## Session Continuity

### What We Know

**Milestone v1.7 scope:**
- Extract financial block status and photo metadata from MemberHeader API
- Sync financial block status to Stadion `financiele-blokkade` field
- Replace browser-based photo download with direct URL fetch
- Use Photo.PhotoDate for smarter change detection

**Phase 17 scope:**
- Capture MemberHeader API response during existing `/other` page visit
- Extract `HasFinancialTransferBlockOwnClub` boolean
- Extract `Photo.Url` and `Photo.PhotoDate` (handle null Photo object)
- Store in SQLite for downstream phases

**Dependencies:**
- Phase 18 depends on Phase 17 (needs financial block data)
- Phase 19 depends on Phase 17 (needs photo URL and date data)
- Phases 18 and 19 are independent of each other

### What We're Tracking

**For Phase 17 planning:**
- Location of MemberHeader API call in existing code
- Current database schema (which tables need new columns)
- API response structure (field names and types)
- Error handling for missing/null Photo object

**For Phase 18 planning (future):**
- Stadion ACF field name for financial block (`financiele-blokkade`)
- Hash calculation changes (include new field)
- Email report formatting for new field

**For Phase 19 planning (future):**
- Photo download replacement strategy (HTTP fetch vs browser)
- Change detection migration (PersonImageDate → Photo.PhotoDate)
- Cleanup scope (which files to remove)

### Context for Next Session

**When planning Phase 17:**
- Review `download-data-from-sportlink.js` for existing MemberFreeFields capture
- Check browser network tab for MemberHeader API endpoint and response structure
- Review `laposta-db.js` for SQLite schema and migration patterns
- Confirm Photo object structure (when is it null vs populated)

**When executing Phase 17:**
- Test with members who have photos vs members without photos
- Verify financial block boolean is correctly extracted (true/false/null handling)
- Validate SQLite storage (correct data types, null handling)
- Ensure no performance regression (single API call, no extra page loads)

---

*State tracking started: 2026-01-28*
*Last session: Roadmap creation for v1.7 MemberHeader API*
