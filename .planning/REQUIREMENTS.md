# Requirements: Sportlink Sync v2.0

**Defined:** 2026-01-29
**Core Value:** Keep downstream systems (Laposta, Stadion) automatically in sync with Sportlink member data without manual intervention — now bidirectionally

## v2.0 Requirements

Requirements for bidirectional sync. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Sync operations track origin (user edit vs sync-initiated) to prevent infinite loops
- [ ] **FOUND-02**: SQLite tracks modification timestamps in both directions (forward and reverse)
- [ ] **FOUND-03**: All timestamps normalized to UTC before comparison

### Conflict Resolution

- [ ] **CONF-01**: System compares modification timestamps to determine last-edit-wins
- [ ] **CONF-02**: Conflict resolution operates at field level, not whole record
- [ ] **CONF-03**: Operator receives notification when conflicts are detected and resolved

### Reverse Sync

- [ ] **RSYNC-01**: System queries Stadion to detect members with modifications newer than Sportlink
- [ ] **RSYNC-02**: Contact fields (email, email2, mobile, phone) sync from Stadion to Sportlink /general page
- [ ] **RSYNC-03**: Free fields (datum-vog, freescout-id) sync from Stadion to Sportlink /other page
- [ ] **RSYNC-04**: Financial block toggle syncs from Stadion to Sportlink /financial page

### Integration

- [ ] **INTEG-01**: All reverse sync operations logged with timestamps and field values for audit
- [ ] **INTEG-02**: Email reports include reverse sync statistics (members updated, conflicts resolved)

## Future Requirements

Deferred to later milestones.

### Reliability Enhancements

- **REL-01**: Dry run mode previews reverse sync changes without applying
- **REL-02**: Automatic retry with exponential backoff on transient failures
- **REL-03**: Multiple fallback selectors per Sportlink field
- **REL-04**: Pre-sync validation (email format, phone format)
- **REL-05**: Selector smoke tests detect Sportlink UI changes

### Advanced Conflict Handling

- **ADVCONF-01**: Field-specific authority policies (some fields always prefer Sportlink)
- **ADVCONF-02**: Grace period for clock drift tolerance (5-minute window)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time sync | Scheduled batch sync is sufficient for member data |
| Three-way merge | Last-edit-wins is simpler and predictable |
| Delete sync | Never auto-delete in Sportlink; manual only |
| Bidirectional photo sync | Photos only flow Sportlink → Stadion (correct design) |
| Full bidirectional sync | Only specific fields sync back; Sportlink remains primary source |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | — | Pending |
| FOUND-02 | — | Pending |
| FOUND-03 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| CONF-03 | — | Pending |
| RSYNC-01 | — | Pending |
| RSYNC-02 | — | Pending |
| RSYNC-03 | — | Pending |
| RSYNC-04 | — | Pending |
| INTEG-01 | — | Pending |
| INTEG-02 | — | Pending |

**Coverage:**
- v2.0 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-29 after initial definition*
