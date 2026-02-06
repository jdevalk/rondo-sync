# Project Research Summary

**Project:** Rondo Sync v2.0 Bidirectional Sync
**Domain:** Bidirectional data synchronization with browser automation and last-edit-wins conflict resolution
**Researched:** 2026-01-29
**Confidence:** MEDIUM-HIGH

## Executive Summary

Adding bidirectional sync to Sportlink requires minimal stack changes but introduces significant architectural complexity. The existing Playwright + SQLite + WordPress REST API foundation is sufficient, needing only database schema additions for timestamp tracking and modification source attribution. The technical challenge is not technology selection but implementing robust conflict resolution and loop prevention.

The recommended approach uses **conditional reverse sync** with **last-edit-wins conflict resolution** at the field level. Sportlink remains the primary source of truth for member data; Stadion updates only push to Sportlink when they're demonstrably newer. This is not true bidirectional sync (both sides writing freely), but targeted correction sync where operators fix data in Stadion and those corrections flow back.

The critical risk is **infinite sync loops** - the #1 cause of production incidents in bidirectional systems. Prevention requires origin tracking (`modified_by` field distinguishing user edits from sync updates), hash-based deduplication in both directions, and coordinated scheduling to prevent forward and reverse sync running simultaneously. Clock drift and browser automation fragility are secondary but serious concerns. Success depends on implementing loop prevention BEFORE enabling reverse sync.

## Key Findings

### Recommended Stack

**No new dependencies required.** The existing technology stack (Playwright, better-sqlite3, WordPress REST API client) handles all reverse sync requirements. The implementation is primarily logic and schema extensions.

**Core additions:**
- **SQLite timestamp columns** — Track modification times per field in both directions (`forward_*` and `reverse_*` prefixes to avoid ambiguity)
- **Origin tracking fields** — `modified_by` column distinguishes user edits from sync-initiated changes (prevents loops)
- **WordPress `modified_gmt` usage** — Already available via REST API, provides post-level modification timestamps
- **Sportlink download time capture** — Use download timestamp as proxy for Sportlink modification time (no API provides this)

**Existing capabilities leveraged:**
- Playwright form automation (already handles login, navigation, data extraction — can handle form writing)
- SQLite state tracking (extend existing hash-based change detection to reverse direction)
- WordPress REST API (already integrated, just needs GET requests for change detection)

### Expected Features

**Must have (table stakes):**
- **Change detection** — Only sync what changed; prevents unnecessary writes
- **Conflict detection** — Compare modification timestamps before overwriting
- **Last-edit-wins resolution** — Timestamp comparison to determine winner
- **Verification after update** — Read-back confirmation that form submission succeeded
- **Audit trail** — Log all sync operations with timestamps for compliance
- **Retry on transient failure** — Exponential backoff for network/timeout errors
- **Dry run mode** — Preview changes before applying (essential for testing)

**Should have (competitive):**
- **Pre-sync validation** — Validate email format, phone format before browser submission
- **Field-specific conflict policies** — Some fields have clear authority (e.g., Sportlink owns membership status)
- **Success message detection** — Parse Sportlink success messages to confirm save
- **Batch update optimization** — Submit all changed fields in one page save
- **Rate limiting** — Prevent overwhelming Sportlink with rapid submissions

**Defer (v2+):**
- **Real-time sync** — Scheduled batch sync is sufficient (member data changes infrequently)
- **Three-way merge** — Last-edit-wins is simpler and predictable
- **Delete sync** — Manual deletion only; never auto-delete in Sportlink
- **Bidirectional photo sync** — Photos only flow Sportlink → Stadion (correct design)

### Architecture Approach

Reverse sync adds a Stadion → Sportlink flow using timestamp-based conflict resolution with browser automation for Sportlink writes (no API available). The architecture preserves existing SQLite state tracking while adding modification time comparison. Forward and reverse syncs run sequentially (never simultaneously) to prevent race conditions.

**Major components:**
1. **fetch-stadion-changes.js** — Query Stadion REST API for members modified since last sync
2. **submit-sportlink-reverse-sync.js** — Browser automation to update Sportlink member pages
3. **lib/conflict-resolver.js** — Field-level timestamp comparison and last-edit-wins logic
4. **sync-people.js (modified)** — Orchestrates forward sync, then reverse sync with shared state tracking

**Data flow:**
```
Sportlink → download → SQLite (with timestamps) → forward sync → Stadion
                          ↓
                  timestamp comparison
                          ↓
                  (if Stadion newer)
                          ↓
Sportlink ← browser automation ← reverse sync ← Stadion
```

### Critical Pitfalls

1. **Infinite sync loops** — Forward sync updates Stadion, reverse sync sees "new" changes and pushes to Sportlink, forward sync sees "new" changes again, creating endless cycle. Prevention: origin tracking (`modified_by` field), hash-based deduplication in both directions, coordinated scheduling (never run both simultaneously).

2. **Clock drift and timestamp comparison failures** — Last-edit-wins requires comparing timestamps from two systems with different clocks. NTP drift, timezone mismatches, and server reboots cause wrong conflict resolution decisions leading to silent data loss. Prevention: normalize all timestamps to UTC, add 5-minute grace period for comparisons, verify NTP on production server.

3. **Browser automation selector fragility** — Sportlink has no write API. Reverse sync uses Playwright to fill forms. If Sportlink updates their UI (new CSS, restructured HTML, added validation), selectors break and sync silently fails. Prevention: multiple fallback selectors per field, form submission verification, screenshot diffing to detect UI changes.

4. **Silent data loss with last-write-wins** — Concurrent edits to different fields result in entire record overwrite, losing one user's changes without error. Prevention: per-field timestamps (not per-record), conflict detection and alerting, field-level sync scope.

5. **State tracking database complexity** — Bidirectional sync requires tracking hashes and timestamps in BOTH directions. Easy to confuse forward vs reverse state, causing loops or missed changes. Prevention: clear naming convention (`forward_*` vs `reverse_*` prefixes), separate functions per direction, comprehensive integration tests.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Database Schema & Origin Tracking
**Rationale:** Loop prevention MUST be implemented before any reverse sync code runs. This is foundation work that prevents catastrophic production incidents.

**Delivers:** SQLite schema with bidirectional timestamp tracking, origin attribution, and hash-based deduplication

**Addresses:**
- Schema additions for `forward_*` and `reverse_*` tracking
- `modified_by` field for origin tracking
- Migration script to add columns to existing `rondo-sync.sqlite`
- Backfill existing data with initial timestamps

**Avoids:** Pitfall #1 (infinite loops), Pitfall #5 (state tracking complexity)

**Research flag:** Standard pattern (skip research) — SQLite schema extensions are well-understood

### Phase 2: Conflict Detection Infrastructure
**Rationale:** Before implementing reverse sync, need ability to detect conflicts and make resolution decisions.

**Delivers:** Conflict resolver module with timestamp comparison and field-level resolution logic

**Uses:**
- WordPress `modified_gmt` field from REST API
- Sportlink download timestamps as modification proxy
- UTC normalization and grace period for clock drift tolerance

**Implements:** `lib/conflict-resolver.js` with last-edit-wins logic

**Avoids:** Pitfall #2 (clock drift), Pitfall #4 (silent data loss with field-level resolution)

**Research flag:** Standard pattern (skip research) — Conflict resolution patterns well-documented

### Phase 3: Stadion Change Detection
**Rationale:** Need to identify which members have Stadion modifications before attempting browser automation.

**Delivers:** Script to query Stadion REST API and compare timestamps to determine reverse sync candidates

**Addresses:**
- `fetch-stadion-changes.js` implementation
- REST API pagination for large member counts
- Hash-based change detection for reverse direction

**Avoids:** Pitfall #5 (using wrong hash for wrong direction)

**Research flag:** Standard pattern (skip research) — WordPress REST API queries are straightforward

### Phase 4: Browser Automation for Contact Fields (Low Risk)
**Rationale:** Start with lowest-risk fields (email, mobile, phone) on single page (/general) to validate approach.

**Delivers:** Working reverse sync for contact fields with verification

**Addresses:**
- Browser automation for /general page
- Form submission and success verification
- Resilient selector strategy with fallbacks
- Retry logic with exponential backoff

**Avoids:** Pitfall #3 (selector fragility with fallback strategy)

**Research flag:** NEEDS PHASE RESEARCH — Sportlink /general page selectors must be inspected and tested

### Phase 5: Free Fields & Toggle (Medium Risk)
**Rationale:** Expand to remaining fields on different pages with different interaction patterns.

**Delivers:** Complete reverse sync coverage for all target fields

**Addresses:**
- VOG date and FreeScout ID on /other page
- Financial block toggle on /financial page
- Multi-page navigation and session management

**Avoids:** Pitfall #6 (session expiry with fresh login per run)

**Research flag:** NEEDS PHASE RESEARCH — Field accessibility and interaction patterns need validation

### Phase 6: Integration & Monitoring
**Rationale:** Production-ready requires comprehensive error handling, monitoring, and rollback capability.

**Delivers:** Reverse sync integrated into sync-people.js with full observability

**Addresses:**
- Email reporting with reverse sync stats
- Audit trail for all operations
- Conflict notification
- Graceful degradation on failures
- Selector smoke tests

**Avoids:** Pitfall #3 (silent failures), Pitfall #10 (email flood with batched reporting)

**Research flag:** Standard pattern (skip research) — Integration follows existing sync-people.js orchestration

### Phase Ordering Rationale

- **Database first** (Phase 1) — Loop prevention is existential; must exist before reverse sync runs
- **Conflict detection before automation** (Phase 2 → 4) — Need decision logic before writing to Sportlink
- **Low-risk fields first** (Phase 4 → 5) — Contact fields on single page validate approach before complex multi-page interactions
- **Monitoring last** (Phase 6) — Can run reverse sync manually during Phases 4-5, automate only after proven reliable

**Dependency chain:**
```
Phase 1 (schema) → Phase 2 (conflict detection) → Phase 3 (change detection)
                                                        ↓
                                    Phase 4 (contact fields) → Phase 5 (free fields)
                                                                        ↓
                                                        Phase 6 (integration & monitoring)
```

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4:** Browser automation selectors — Must inspect actual Sportlink /general page HTML to determine reliable selectors
- **Phase 5:** Multi-page navigation — Verify session persistence, page load patterns, toggle interaction

Phases with standard patterns (skip research-phase):
- **Phase 1:** SQLite schema extensions — Well-understood SQL ALTER TABLE operations
- **Phase 2:** Conflict resolution — Last-edit-wins via timestamp comparison is documented pattern
- **Phase 3:** WordPress REST API queries — Standard GET requests, existing client code reusable
- **Phase 6:** Integration — Follows existing sync orchestration patterns in sync-people.js

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing tools sufficient; no new dependencies needed; Playwright handles all form automation |
| Features | MEDIUM | Bidirectional sync patterns well-documented; project-specific validation/interaction details need testing |
| Architecture | MEDIUM | Timestamp-based conflict resolution proven in other systems; Sportlink-specific browser automation is project-unique |
| Pitfalls | HIGH | Infinite loops, clock drift, LWW data loss, selector fragility are well-known problems with documented solutions |

**Overall confidence:** MEDIUM-HIGH

Research provides strong foundation for implementation. Medium confidence areas (Features, Architecture) are due to Sportlink-specific details (form selectors, validation rules, session behavior) that require hands-on validation. These are phase-level research tasks, not architectural unknowns.

### Gaps to Address

**Sportlink modification timestamps:** Research assumes Sportlink provides `ModifiedAt` or similar field in member JSON. If not available, must use download time as proxy (acceptable but lower granularity). **Validation:** Inspect SearchMembers POST response during Phase 3.

**Sportlink form selectors:** Research uses hypothetical selectors (`#inputEmail`, `#inputRemarks8`). Actual selectors must be extracted from live Sportlink pages. **Validation:** Browser inspection during Phase 4 planning.

**Sportlink validation rules:** Research infers email/phone format requirements. Exact validation must be tested to match pre-sync validation. **Validation:** Form submission testing during Phase 4 execution.

**Stadion ACF field keys:** Research uses placeholder field names (`datum-vog`, `freescout-id`, `financiele-blokkade`). Exact ACF keys must be verified from Stadion API documentation. **Validation:** Check ~/Code/rondo/rondo-club/docs/api-leden-crud.md during Phase 3.

**Production server clock sync:** Research assumes NTP configured on 46.202.155.16. Must verify before relying on timestamp comparison. **Validation:** SSH to server, run `timedatectl status` during Phase 2 setup.

**Sportlink rate limits:** Research assumes form submissions are rate-limited but specifics unknown. Conservative approach (500ms delay between members) may be too slow or too fast. **Validation:** Monitor response times during Phase 4 testing.

## Sources

### Primary (HIGH confidence)
- [WordPress REST API Posts Reference](https://developer.wordpress.org/rest-api/reference/posts/) — `modified` and `modified_gmt` fields verified as standard
- [Playwright Actions Documentation](https://playwright.dev/docs/input) — Form automation API confirmed
- [Stadion API Documentation](~/Code/rondo/rondo-club/docs/) — ACF field structure, person API endpoints
- [Rondo Sync CLAUDE.md](CLAUDE.md) — Current architecture, existing patterns, database schema

### Secondary (MEDIUM confidence)
- [The Engineering Challenges of Bi-Directional Sync](https://www.stacksync.com/blog/the-engineering-challenges-of-bi-directional-sync-why-two-one-way-pipelines-fail) — Two one-way pipelines anti-pattern
- [Two-Way Sync Demystified: Key Principles And Best Practices](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices) — Conflict resolution strategies
- [How to prevent infinite loops in bi-directional data syncs](https://www.workato.com/product-hub/how-to-prevent-infinite-loops-in-bi-directional-data-syncs/) — Origin tracking pattern
- [Conflict Resolution: Using Last-Write-Wins vs. CRDTs](https://dzone.com/articles/conflict-resolution-using-last-write-wins-vs-crdts) — LWW tradeoffs and data loss risks
- [Clock Synchronization in Distributed Systems](https://www.geeksforgeeks.org/distributed-systems/clock-synchronization-in-distributed-system/) — NTP accuracy limits
- [CSS Selector Cheat Sheet for Automated Browser Testing](https://ghostinspector.com/blog/css-selector-strategies-automated-browser-testing/) — Resilient selector strategies

### Tertiary (LOW confidence)
- [Bidirectional Sync Implementation (December 2025)](https://medium.com/@janvi34334/how-i-implemented-bidirectional-data-sync-in-a-flutter-retail-app-060aa2f69c9f) — General patterns, needs adaptation
- [Playwright vs Puppeteer: Which to choose in 2026?](https://www.browserstack.com/guide/playwright-vs-puppeteer) — Browser automation comparison
- [State of AI Browser Automation 2026](https://www.browserless.io/blog/state-of-ai-browser-automation-2026) — Industry trends, not specific guidance

---
*Research completed: 2026-01-29*
*Ready for roadmap: yes*
