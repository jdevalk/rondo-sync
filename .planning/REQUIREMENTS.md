# Requirements: Sportlink Sync

**Defined:** 2026-01-25
**Core Value:** Keep Laposta email lists automatically in sync with Sportlink member data without manual intervention

## v1.1 Requirements

Requirements for Postmark Email Delivery milestone.

### Email Delivery

- [ ] **EMAIL-01**: System sends sync report via Postmark API after each sync
- [ ] **EMAIL-02**: Postmark API key configured via POSTMARK_API_KEY env var
- [ ] **EMAIL-03**: Sender email configured via POSTMARK_FROM_EMAIL env var
- [ ] **EMAIL-04**: Recipient email configured via existing OPERATOR_EMAIL env var
- [ ] **EMAIL-05**: Email failure is logged but does not fail the sync

### Integration

- [ ] **INTG-01**: cron-wrapper.sh calls Node.js script for email instead of `mail` command
- [ ] **INTG-02**: install-cron.sh prompts for Postmark credentials during setup

## Future Requirements

None planned — define in next milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fallback to local mail | Postmark is reliable enough, adds complexity |
| Fail sync on email failure | Email is secondary to actual sync operation |
| HTML email formatting | Plain text is clean and sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EMAIL-01 | Pending | Pending |
| EMAIL-02 | Pending | Pending |
| EMAIL-03 | Pending | Pending |
| EMAIL-04 | Pending | Pending |
| EMAIL-05 | Pending | Pending |
| INTG-01 | Pending | Pending |
| INTG-02 | Pending | Pending |

**Coverage:**
- v1.1 requirements: 7 total
- Mapped to phases: 0
- Unmapped: 7 ⚠️

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after initial definition*
