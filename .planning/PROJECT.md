# Sportlink Sync

## What This Is

A CLI tool that synchronizes member data from Sportlink Club (a Dutch sports club management system) to multiple destinations: Laposta email marketing lists and Stadion (a WordPress-based member management app). It downloads member data via browser automation, transforms it according to field mappings, syncs changes to both destinations, and runs automatically on a daily schedule with combined email reports via Postmark.

## Core Value

Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention.

## Current Milestone: v1.5 Team Sync

**Goal:** Sync member teams from Sportlink to Stadion, creating teams and work history entries.

**Target features:**
- Extract team from Sportlink `UnionTeams` field (fallback to `ClubTeams`)
- Create teams in Stadion if they don't exist
- Add work_history entry to persons linking them to their team
- Track team assignments for change detection
- Include team sync statistics in email report

## Previous State (v1.4 Shipped)

**Shipped:** 2026-01-26

Photo sync is fully operational:
- Photo state tracking via PersonImageDate in SQLite
- Browser automation downloads photos from member detail pages
- Photos saved locally in `photos/` directory
- Photos uploaded to Stadion via REST API
- Photo deletion when removed in Sportlink
- Photo sync integrated into daily pipeline with email statistics

## Requirements

### Validated

- ✓ Download member data from Sportlink via browser automation with OTP — existing
- ✓ Transform Sportlink fields to Laposta format via configurable mapping — existing
- ✓ Sync members to up to 4 Laposta lists — existing
- ✓ Track sync state in SQLite to only submit changed members — existing
- ✓ Support parent/child member associations — existing
- ✓ Deduplicate parent entries across lists — existing
- ✓ Inspect pending changes before sync — existing
- ✓ Cronjob setup for scheduled automated sync — v1.0
- ✓ Reduced/formatted output suitable for email reports — v1.0
- ✓ Send sync reports via Postmark transactional email — v1.1
- ✓ Configure Postmark via environment variables — v1.1
- ✓ Graceful failure handling if email fails — v1.1
- ✓ Sync reports sent as HTML email with semantic formatting — v1.2
- ✓ Email from name displays as "Sportlink SYNC" — v1.2
- ✓ Clean cron output without npm script header — v1.2
- ✓ Install-cron overwrites existing cron entries (idempotent) — v1.2
- ✓ Sync creates/updates person in Stadion via WordPress REST API — v1.3
- ✓ Authenticate with Stadion via application password — v1.3
- ✓ Map Sportlink fields to Stadion ACF structure — v1.3
- ✓ Store Sportlink relatiecode as "KNVB ID" field in Stadion — v1.3
- ✓ Match members by KNVB ID first, email fallback — v1.3
- ✓ Hash-based change detection for Stadion sync — v1.3
- ✓ Sync parents as separate person records — v1.3
- ✓ Deduplicate parents across members — v1.3
- ✓ Add Stadion sync to sync-all pipeline — v1.3
- ✓ Include Stadion results in email report — v1.3
- ✓ Download photos from Sportlink when PersonImageDate indicates presence — v1.4
- ✓ Track PersonImageDate in SQLite for change detection — v1.4
- ✓ Navigate to member detail page and extract photo from modal — v1.4
- ✓ Save photos locally with PublicPersonId as filename — v1.4
- ✓ Upload photos to Stadion via REST API endpoint — v1.4
- ✓ Delete photos from local and Stadion when removed in Sportlink — v1.4
- ✓ Integrate photo sync into sync-all pipeline — v1.4
- ✓ Include photo sync statistics in email report — v1.4

### Active

- [ ] Extract team from Sportlink UnionTeams field (fallback to ClubTeams)
- [ ] Create teams in Stadion if they don't exist
- [ ] Add work_history entry to persons with team reference and "Speler" job title
- [ ] Track team assignments in SQLite for change detection
- [ ] Include team sync statistics in email report

### Out of Scope

- Web UI — CLI tool is sufficient for operator use
- Real-time sync — scheduled batch sync is appropriate for member data
- Bidirectional sync — Sportlink is source of truth, downstream systems are read-only
- Slack/Discord notifications — Email reports are sufficient for now
- Fallback to local mail — Postmark is reliable enough, no fallback needed
- Fail sync on email failure — Email is secondary to the actual sync operation
- Delete sync — Members removed from Sportlink stay in downstream systems

## Context

**Codebase:**
- 4,393 lines of JavaScript + shell
- Node.js with Playwright for browser automation
- SQLite for state tracking (Laposta and Stadion)
- Shell scripts for cron automation

**Tech stack:** Node.js 18+, Playwright/Chromium, SQLite, Bash, Postmark, WordPress REST API

**Server requirements:**
- Chromium (downloaded by Playwright) for Sportlink scraping
- Network access to club.sportlink.com, api.laposta.nl, api.postmarkapp.com, and Stadion WordPress site
- Credentials in `.env` file (Sportlink, Laposta, Postmark, Stadion)

## Constraints

- **Runtime**: Node.js 18+ with Playwright browser automation
- **Dependencies**: Requires Chromium for Sportlink scraping
- **Network**: Needs access to club.sportlink.com, api.laposta.nl, api.postmarkapp.com, and Stadion WordPress site
- **Credentials**: Sportlink username/password/OTP secret, Laposta API key, Postmark API key, and Stadion application password in `.env`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser automation for Sportlink | No API available, must scrape web interface | ✓ Good |
| SQLite for state tracking | Simple, no external database needed, portable | ✓ Good |
| Hash-based change detection | Avoids timestamp issues, reliable diff detection | ✓ Good |
| Dual-stream logger (stdout + file) | Simple logging, email-ready output | ✓ Good |
| Module/CLI hybrid pattern | Scripts work standalone and as imports | ✓ Good |
| Plain text summary format | Clean in email clients, no ANSI codes | ✓ Good |
| Cron timezone Europe/Amsterdam | Club operates in Amsterdam timezone | ✓ Good |
| Email in wrapper vs MAILTO | Enables custom subject lines | ✓ Good |
| flock-based locking | Prevents overlapping sync executions | ✓ Good |
| Postmark for email delivery | Reliable transactional email, doesn't land in spam | ✓ Good |
| Graceful email failure | Sync succeeds even if email fails | ✓ Good |
| Store credentials via upsert | BSD sed compatible, handles existing .env | ✓ Good |
| WordPress application password auth | Simpler than browser automation, native WordPress feature | ✓ Good |
| KNVB ID as primary match key | Stable identifier from Sportlink (relatiecode) | ✓ Good |
| Email fallback for matching | Handles members without KNVB ID in Stadion | ✓ Good |
| Parents as separate persons | Enables proper relationship modeling in Stadion | ✓ Good |
| Bidirectional relationship linking | Parent.children and child.parents arrays stay in sync | ✓ Good |
| Stadion sync non-critical | Pipeline continues if Stadion fails, Laposta is primary | ✓ Good |
| 2 second API rate limiting | Prevents WordPress timeout on slow servers | ✓ Good |
| Photo state CHECK constraint | Limits photo_state column to 6 valid states, prevents invalid states | ✓ Good |
| Empty string normalization to NULL | PersonImageDate empty strings normalized to null for SQL correctness | ✓ Good |
| Atomic state detection in ON CONFLICT | State transitions handled entirely in SQL ON CONFLICT clause | ✓ Good |

---
*Last updated: 2026-01-26 after starting milestone v1.5*
