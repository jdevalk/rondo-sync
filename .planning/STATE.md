# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention.
**Current focus:** v2.3 Birthday Field Migration

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements for v2.3
Last activity: 2026-02-06 — Milestone v2.3 started

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting future work:

- [Q014-01]: Functions sync filters to members with LastUpdate in last 2 days (80% performance improvement)
- [Q014-02]: Weekly full sync at Sunday 1:00 AM catches edge cases missed by LastUpdate filter
- [32-01]: Monday 11:30 PM schedule avoids overlap with weekend team sync and daytime syncs
- [32-01]: Discipline sync treated as non-critical in sync-all.js (continues on failure)
- [31-01]: Season derived from match date using August 1 boundary (matches KNVB season cycles)

### Pending Todos

6 pending:
- [fetch-invoice-addresses-from-sportlink](./todos/pending/2026-02-04-fetch-invoice-addresses-from-sportlink.md) - Fetch invoice addresses and email from Sportlink financial tab
- [review-deleted-member-handling](./todos/pending/2026-02-06-review-deleted-member-handling.md) - Review how deleted members are handled across all downstream systems
- [adapt-birthday-sync-to-acf-field](./todos/pending/2026-02-06-adapt-birthday-sync-to-acf-field.md) - Adapt birthday sync to new Stadion ACF field model (**in milestone v2.3**)
- [rename-project-to-rondo](./todos/pending/2026-02-06-rename-project-to-rondo.md) - Rename project from Sportlink Sync to Rondo Sync (Stadion → Rondo Club)
- [document-and-simplify-adding-sync-targets](./todos/pending/2026-02-06-document-and-simplify-adding-sync-targets.md) - Document and simplify adding custom sync targets
- [detect-stale-parent-email-addresses](./todos/pending/2026-02-06-detect-stale-parent-email-addresses.md) - Detect and flag stale parent email addresses

### Active Debug Sessions

2 active:
- birthday-sync-404-errors.md (likely resolved by v2.3 migration)
- download-functions-no-api-response.md

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 011 | Remove debug output from parent sync and fix photo phase HTML headers | 2026-02-02 | ae25606 | [011-remove-debug-output-fix-photo-headers](./quick/011-remove-debug-output-fix-photo-headers/) |
| 012 | Sum Nikki saldo per KNVB ID (support multiple entries per year) | 2026-02-03 | e4f411f | [012-sum-nikki-saldo-per-knvb-id](./quick/012-sum-nikki-saldo-per-knvb-id/) |
| 013 | Add discipline fees to Financieel card (doorbelast/non-doorbelast split) | 2026-02-04 | 2a27fbd | [013-add-discipline-fees-to-financieel](./quick/013-add-discipline-fees-to-financieel/) |
| 014 | Optimize member fetching with LastUpdate filter (daily recent, weekly full) | 2026-02-04 | 21d9d7a | [014-optimize-member-fetching-lastupdate-filter](./quick/014-optimize-member-fetching-lastupdate-filter/) |
| 015 | Add infix (tussenvoegsel) as separate ACF field for Stadion API | 2026-02-05 | 8fd1a03 | [015-add-infix-field-for-stadion-api](./quick/015-add-infix-field-for-stadion-api/) |
| 016 | Sync huidig-vrijwilliger from Stadion to Laposta as custom field | 2026-02-05 | 12aeb47 | [016-sync-huidig-vrijwilliger-to-laposta](./quick/016-sync-huidig-vrijwilliger-to-laposta/) |

## Session Continuity

Last session: 2026-02-06
Stopped at: Milestone v2.3 started, defining requirements
Resume file: None
Next steps: Define requirements and create roadmap
