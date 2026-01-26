# Requirements: Sportlink Sync

**Defined:** 2026-01-26
**Core Value:** Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention.

## v1.5 Requirements

Requirements for team sync milestone. Each maps to roadmap phases.

### Team Extraction

- [ ] **TEAM-01**: System extracts team name from UnionTeams field (priority)
- [ ] **TEAM-02**: System falls back to ClubTeams if UnionTeams is empty

### Team Management

- [ ] **TEAM-03**: System creates team in Stadion if it doesn't exist
- [ ] **TEAM-04**: System tracks team name → Stadion ID mapping in SQLite

### Work History

- [ ] **TEAM-05**: System adds work_history entry to person with team reference
- [ ] **TEAM-06**: Work history uses "Speler" as job_title
- [ ] **TEAM-07**: Work history is_current is set to true

### Change Detection

- [ ] **TEAM-08**: System tracks member's current team in SQLite
- [ ] **TEAM-09**: System updates work_history when team changes

### Pipeline Integration

- [ ] **TEAM-10**: Team sync runs as part of member sync to Stadion
- [ ] **TEAM-11**: Email report includes team sync statistics

## Future Requirements

None currently identified for team sync.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple team memberships | Members are on one team at a time per Sportlink |
| Team history tracking | Only track current team assignment |
| Team deletion sync | Teams persist in Stadion even if empty |
| Parent team assignments | Parents don't have team data in Sportlink |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEAM-01 | TBD | Pending |
| TEAM-02 | TBD | Pending |
| TEAM-03 | TBD | Pending |
| TEAM-04 | TBD | Pending |
| TEAM-05 | TBD | Pending |
| TEAM-06 | TBD | Pending |
| TEAM-07 | TBD | Pending |
| TEAM-08 | TBD | Pending |
| TEAM-09 | TBD | Pending |
| TEAM-10 | TBD | Pending |
| TEAM-11 | TBD | Pending |

**Coverage:**
- v1.5 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-26 after initial definition*
