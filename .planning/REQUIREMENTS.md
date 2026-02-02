# Requirements: Sportlink Sync v2.2

**Defined:** 2026-02-02
**Core Value:** Keep downstream systems automatically in sync with Sportlink member data without manual intervention

## v2.2 Requirements

Requirements for discipline case sync. Each maps to roadmap phases.

### Download & Storage

- [ ] **DISC-01**: Download discipline cases from Sportlink `/competition-affairs/discipline-cases`
- [ ] **DISC-02**: Click "Individuele tuchtzaken" tab and capture DisciplineClubCasesPlayer API response
- [ ] **DISC-03**: Store cases in SQLite with all fields (DossierId, PublicPersonId, MatchDate, MatchDescription, TeamName, ChargeCodes, ChargeDescription, SanctionDescription, ProcessingDate, AdministrativeFee, IsCharged)

### Stadion Sync

- [ ] **DISC-04**: Create/update discipline-cases as Stadion custom post type
- [ ] **DISC-05**: Map all case fields to Stadion ACF fields
- [ ] **DISC-06**: Link case to person via ACF relationship field (using PublicPersonId → stadion_id mapping)
- [ ] **DISC-07**: Display player card on case detail page in Stadion
- [ ] **DISC-08**: Display related cases on player detail page in Stadion

### Season Organization

- [ ] **DISC-09**: Derive season from case date (Aug 1 = new season boundary)
- [ ] **DISC-10**: Create season category if it doesn't exist (e.g., "2025-2026")
- [ ] **DISC-11**: Assign cases to appropriate season category

### Pipeline Integration

- [ ] **DISC-12**: Weekly sync schedule (cron)
- [ ] **DISC-13**: Include discipline case stats in email report
- [ ] **DISC-14**: Add `scripts/sync.sh discipline` command

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bidirectional sync | Cases are read-only from Sportlink, no editing in Stadion |
| Case deletion | Cases persist in Stadion even if removed from Sportlink (historical record) |
| Team discipline cases | Only individual cases ("Individuele tuchtzaken"), not team cases |
| Real-time sync | Weekly batch sync sufficient for rare disciplinary events |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | TBD | Pending |
| DISC-02 | TBD | Pending |
| DISC-03 | TBD | Pending |
| DISC-04 | TBD | Pending |
| DISC-05 | TBD | Pending |
| DISC-06 | TBD | Pending |
| DISC-07 | TBD | Pending |
| DISC-08 | TBD | Pending |
| DISC-09 | TBD | Pending |
| DISC-10 | TBD | Pending |
| DISC-11 | TBD | Pending |
| DISC-12 | TBD | Pending |
| DISC-13 | TBD | Pending |
| DISC-14 | TBD | Pending |

**Coverage:**
- v2.2 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after initial definition*
