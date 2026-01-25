# Requirements: Sportlink Sync

**Defined:** 2026-01-25
**Core Value:** Keep Laposta email lists automatically in sync with Sportlink member data without manual intervention

## v1.2 Requirements

Requirements for Email Improvements milestone.

### Email Formatting

- [ ] **EMAIL-06**: Sync reports are sent as HTML email with proper formatting
- [ ] **EMAIL-07**: Email from name displays as "Sportlink SYNC"
- [ ] **EMAIL-08**: Email body does not include npm script execution header

### Installer

- [ ] **INST-01**: Running install-cron replaces existing sportlink-sync cron entries instead of adding duplicates

## Future Requirements

None planned - define in next milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fallback to plain text | HTML with text fallback is sufficient |
| Configurable from name | "Sportlink SYNC" is appropriate for all deployments |
| Email templates | Simple inline HTML is sufficient for sync reports |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EMAIL-06 | TBD | Pending |
| EMAIL-07 | TBD | Pending |
| EMAIL-08 | TBD | Pending |
| INST-01 | TBD | Pending |

**Coverage:**
- v1.2 requirements: 4 total
- Mapped to phases: 0
- Unmapped: 4

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after initial definition*
