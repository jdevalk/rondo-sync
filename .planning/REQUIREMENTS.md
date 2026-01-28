# Requirements: Sportlink Sync

**Defined:** 2026-01-28
**Core Value:** Keep downstream systems automatically in sync with Sportlink member data without manual intervention

## v1.7 Requirements

Requirements for MemberHeader API milestone. Each maps to roadmap phases.

### Data Capture

- [ ] **DATA-01**: Capture MemberHeader API response when visiting `/other` page (alongside existing MemberFreeFields capture)
- [ ] **DATA-02**: Extract `HasFinancialTransferBlockOwnClub` boolean from MemberHeader response
- [ ] **DATA-03**: Extract `Photo.Url` and `Photo.PhotoDate` from MemberHeader response
- [ ] **DATA-04**: Store captured data in SQLite database for downstream sync

### Financial Block

- [ ] **FINB-01**: Store financial block status (`has_financial_block` boolean) in stadion_members table
- [ ] **FINB-02**: Sync financial block status to Stadion `financiele-blokkade` ACF field
- [ ] **FINB-03**: Include financial block changes in hash-based change detection

### Photo Optimization

- [ ] **PHOT-01**: Fetch photos directly from `Photo.Url` instead of browser DOM scraping
- [ ] **PHOT-02**: Use `Photo.PhotoDate` for change detection (skip re-download if date unchanged)
- [ ] **PHOT-03**: Handle members without photos (null/missing Photo object)
- [ ] **PHOT-04**: Remove browser-based photo download code (`download-photos-from-sportlink.js`)
- [ ] **PHOT-05**: Maintain existing photo upload/deletion flow to Stadion

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

(None identified)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Photo caching/CDN | Direct URL fetch is sufficient, Sportlink hosts the images |
| Batch photo API calls | MemberHeader is per-member, no batch endpoint available |
| Financial block sync to FreeScout | FreeScout doesn't have this field concept |
| Historical financial block tracking | Current state only, not history |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 17 | Pending |
| DATA-02 | Phase 17 | Pending |
| DATA-03 | Phase 17 | Pending |
| DATA-04 | Phase 17 | Pending |
| FINB-01 | Phase 18 | Pending |
| FINB-02 | Phase 18 | Pending |
| FINB-03 | Phase 18 | Pending |
| PHOT-01 | Phase 19 | Pending |
| PHOT-02 | Phase 19 | Pending |
| PHOT-03 | Phase 19 | Pending |
| PHOT-04 | Phase 19 | Pending |
| PHOT-05 | Phase 19 | Pending |

**Coverage:**
- v1.7 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-01-28*
*Last updated: 2026-01-28 after roadmap creation*
