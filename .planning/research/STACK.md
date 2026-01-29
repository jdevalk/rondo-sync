# Technology Stack: Bidirectional Sync

**Project:** Sportlink Sync v2.0
**Research Focus:** Stack additions for bidirectional sync with last-edit-wins conflict resolution
**Researched:** 2026-01-29
**Overall confidence:** HIGH

## Executive Summary

Adding bidirectional sync (Stadion → Sportlink) requires minimal stack changes. The existing Playwright + SQLite + WordPress REST API foundation is sufficient. Key additions are:

1. **Modification time tracking columns** in SQLite (both directions)
2. **WordPress `modified` field usage** (already available via REST API)
3. **Sportlink download time capture** (approximate last-modified time)
4. **No new libraries needed** - existing Playwright handles form writing

The technical challenge is tracking field-level modification times, not technology gaps.

---

## Recommended Stack Additions

### 1. SQLite Schema Extensions

**Add to existing `stadion_members` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `email_modified_at` | TEXT (ISO 8601) | Tracks when email was last changed (either direction) |
| `email_source` | TEXT | Last source: 'sportlink' or 'stadion' |
| `phone_modified_at` | TEXT (ISO 8601) | Tracks when phone was last changed |
| `phone_source` | TEXT | Last source: 'sportlink' or 'stadion' |

**Rationale:**
- Field-level timestamps enable per-field conflict resolution
- Source tracking helps debug sync loops
- ISO 8601 TEXT format matches existing pattern (see `last_seen_at`, `created_at`)
- WordPress doesn't provide field-level modification times, so we track locally

**Add to existing `sportlink_member_free_fields` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `vog_datum_modified_at` | TEXT (ISO 8601) | When VOG date was last changed |
| `vog_datum_source` | TEXT | Last source: 'sportlink' or 'stadion' |
| `freescout_id_modified_at` | TEXT (ISO 8601) | When FreeScout ID was last changed |
| `freescout_id_source` | TEXT | Last source: 'sportlink' or 'stadion' |
| `has_financial_block_modified_at` | TEXT (ISO 8601) | When financial block was last changed |
| `has_financial_block_source` | TEXT | Last source: 'sportlink' or 'stadion' |

**Rationale:**
- Free fields already isolated in dedicated table
- Each synced field needs independent modification tracking
- Matches pattern from `stadion_members` table

### 2. WordPress Modification Time Tracking

**Use existing WordPress REST API fields:**

```json
{
  "id": 12345,
  "modified": "2026-01-29T10:30:00",
  "modified_gmt": "2026-01-29T09:30:00"
}
```

**Strategy:**
- WordPress provides post-level `modified` timestamp (when any field changes)
- WordPress does NOT provide field-level modification times
- ACF (Advanced Custom Fields) updates `post_modified` when fields change
- Use `modified` as proxy for "Stadion side changed"

**Limitation:**
We cannot determine WHICH field changed in Stadion, only WHEN the post changed. This means:
- If Stadion post modified time > SQLite field modified time → Stadion wins
- If SQLite field modified time > Stadion post modified time → Sportlink wins
- This is acceptable for the target use case (occasional manual edits)

**Sources:**
- [WordPress REST API Posts Reference](https://developer.wordpress.org/rest-api/reference/posts/) - Documents `modified` and `modified_gmt` fields
- [WordPress 5.7 REST API Changes](https://make.wordpress.org/core/2021/02/23/rest-api-changes-in-wordpress-5-7/) - Added `modified_before` and `modified_after` query parameters

### 3. Sportlink Modification Time Strategy

**Problem:**
Sportlink does not expose field modification timestamps via browser UI or API.

**Solution:**
Use download time as proxy for "last seen in Sportlink":

```javascript
// When downloading from Sportlink
const downloadTime = new Date().toISOString();

// Store with member data
{
  email: member.email,
  downloaded_at: downloadTime  // Approximate "Sportlink last modified"
}
```

**Rationale:**
- Sportlink data changes infrequently (member updates are rare)
- Download frequency (4x daily) provides reasonable granularity
- Conservative approach: if we downloaded recently, assume Sportlink data is current
- Limitation: Cannot detect changes between downloads

**Conflict resolution logic:**

```javascript
// Example: Email field conflict resolution
const sportlinkModified = downloadTime;  // When we saw this value in Sportlink
const stadionModified = post.modified;    // WordPress post modified timestamp
const sqliteFieldModified = row.email_modified_at; // Last known change time

if (!sqliteFieldModified) {
  // First sync - no history, accept Sportlink value
  useValue = sportlinkValue;
  source = 'sportlink';
} else if (stadionModified > sqliteFieldModified && stadionModified > sportlinkModified) {
  // Stadion changed more recently than both SQLite record and Sportlink download
  useValue = stadionValue;
  source = 'stadion';
  needsWriteToSportlink = true;
} else if (sportlinkModified > sqliteFieldModified) {
  // Sportlink value changed since last sync
  useValue = sportlinkValue;
  source = 'sportlink';
  needsWriteToStadion = true;
} else {
  // No changes detected
  useValue = sqliteValue;
}
```

### 4. Playwright Form Automation (No Changes Needed)

**Current capability** (already in project):
- Playwright v1.x+ installed (`package.json` dependency)
- Browser automation for Sportlink login (with TOTP)
- Page navigation and data extraction

**Form writing capability** (already available):

| Action | Playwright Method | Example |
|--------|------------------|---------|
| Text input | `page.fill(selector, value)` | `await page.fill('input[name="email"]', 'new@email.com')` |
| Dropdown | `page.selectOption(selector, value)` | `await page.selectOption('select[name="vog"]', dateValue)` |
| Checkbox | `page.setChecked(selector, checked)` | `await page.setChecked('input[name="block"]', true)` |
| Form submit | `page.click(selector)` | `await page.click('button[type="submit"]')` |

**No additional libraries needed.** Playwright handles all form interaction types required for Sportlink.

**Sources:**
- [Playwright Actions Documentation](https://playwright.dev/docs/input) - Complete form automation API reference
- [Playwright Form Automation Guide](https://blog.apify.com/playwright-how-to-automate-forms/) - Comprehensive form handling patterns

---

## Alternative Technologies Considered

### WordPress Modification Tracking Alternatives

| Approach | Why Not |
|----------|---------|
| ACF field-level modification hooks | Requires server-side plugin changes to Stadion. Not feasible for this project. |
| WordPress Revisions API | Provides post snapshots but no field-level diff. Too heavy for simple timestamp needs. |
| Custom modification tracking plugin | Would work but adds Stadion dependencies. Current approach (post-level `modified`) is sufficient. |

**Decision:** Use WordPress post-level `modified` timestamp. Acceptable trade-off: cannot determine which field changed, but post-level timestamp is good enough for last-edit-wins logic.

**Sources:**
- [ACF Field Modification Date Tracking](https://support.advancedcustomfields.com/forums/topic/field-last-update-date-stamp/) - Community confirms ACF doesn't provide field-level timestamps
- [WordPress Post Revisions API](https://developer.wordpress.org/rest-api/reference/post-revisions/) - Documents revision system (overkill for this use case)

### SQLite Sync Framework Alternatives

| Library | Why Not |
|---------|---------|
| sqlite-sync (AMPLI-SYNC) | Full bidirectional framework with change tracking. Too heavyweight - we only need timestamp columns. |
| SQLite Sync (CRDT-based) | CRDT conflict resolution is overkill. Last-write-wins via timestamps is sufficient. |
| LiteSync | Multi-device replication framework. Not applicable - we sync between different systems (Sportlink/Stadion), not SQLite replicas. |

**Decision:** Manual schema extension with timestamp columns. Existing hash-based change detection pattern already established (see `source_hash`, `last_synced_hash` in current schema).

**Sources:**
- [SQLite-Sync Framework (AMPLI-SYNC)](https://github.com/sqlite-sync/SQLite-sync.com) - Full bidirectional sync framework (too complex for our needs)
- [SQLite Sync (CRDT-based)](https://github.com/sqliteai/sqlite-sync/) - CRDT-based conflict resolution (overkill)
- [Bidirectional Sync Implementation Patterns](https://medium.com/@janvi34334/how-i-implemented-bidirectional-data-sync-in-a-flutter-retail-app-060aa2f69c9f) - December 2025 article on timestamp-based bidirectional sync

---

## Implementation Patterns

### Pattern 1: Download Time as Modification Proxy

**When downloading from Sportlink:**

```javascript
// download-data-from-sportlink.js
async function downloadMembers() {
  const downloadTime = new Date().toISOString();
  const members = await extractMembersFromPage();

  return members.map(member => ({
    ...member,
    downloaded_at: downloadTime  // Capture download time
  }));
}
```

**When storing in SQLite:**

```javascript
// Store download time with each field value
db.prepare(`
  UPDATE stadion_members
  SET
    email = ?,
    email_modified_at = CASE
      WHEN email IS NULL OR email != ? THEN ?
      ELSE email_modified_at
    END,
    email_source = CASE
      WHEN email IS NULL OR email != ? THEN 'sportlink'
      ELSE email_source
    END
  WHERE knvb_id = ?
`).run(newEmail, newEmail, downloadTime, newEmail, knvbId);
```

### Pattern 2: Conflict Detection on Sync

**Before syncing to Stadion:**

```javascript
// Check if Stadion has newer changes
const stadionPerson = await fetchStadionPerson(stadionId);
const stadionModified = new Date(stadionPerson.modified);
const sqliteEmailModified = new Date(row.email_modified_at);

if (stadionModified > sqliteEmailModified) {
  // Stadion was modified more recently than SQLite record
  // Don't overwrite Stadion value - pull it instead
  syncDirection = 'pull';
} else {
  // SQLite has newer value - push to Stadion
  syncDirection = 'push';
}
```

### Pattern 3: Form Automation for Sportlink Updates

**Writing contact details back to Sportlink:**

```javascript
// write-sportlink-contact.js (new file)
async function updateSportlinkContact(browser, knvbId, updates) {
  const page = await browser.newPage();

  // Navigate to member edit page
  await page.goto(`https://sportlink.club/member/${knvbId}/edit`);

  // Fill form fields
  if (updates.email) {
    await page.fill('input[name="email"]', updates.email);
  }

  if (updates.phone) {
    await page.fill('input[name="phone"]', updates.phone);
  }

  // Submit form
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  // Record write time
  const writeTime = new Date().toISOString();

  return { success: true, writtenAt: writeTime };
}
```

**Recording write time in SQLite:**

```javascript
// After successful Sportlink write
db.prepare(`
  UPDATE stadion_members
  SET
    email_modified_at = ?,
    email_source = 'stadion'
  WHERE knvb_id = ?
`).run(writeTime, knvbId);
```

---

## Clock Synchronization Considerations

### Challenge

Last-write-wins depends on accurate timestamp comparison across systems:
- Sportlink server (unknown timezone, clock accuracy unknown)
- Stadion WordPress server (Amsterdam timezone, clock managed by hosting)
- Sync server (Amsterdam timezone, clock managed by ops)

### Mitigation Strategy

**1. Use ISO 8601 UTC timestamps everywhere:**

```javascript
// Always use UTC
const timestamp = new Date().toISOString();  // "2026-01-29T09:30:00.000Z"
```

**2. Tolerance window for near-simultaneous changes:**

```javascript
const CONFLICT_TOLERANCE_MS = 60000;  // 1 minute tolerance

function resolveConflict(timestamp1, timestamp2) {
  const diff = Math.abs(new Date(timestamp1) - new Date(timestamp2));

  if (diff < CONFLICT_TOLERANCE_MS) {
    // Too close to call - prefer Sportlink as source of truth
    return 'sportlink';
  }

  return timestamp1 > timestamp2 ? 'source1' : 'source2';
}
```

**3. Download frequency provides granularity:**

Sportlink downloads occur 4x daily (every ~6 hours). This provides enough granularity for detecting changes without sub-second precision requirements.

**Sources:**
- [Couchbase Conflict Resolution](https://docs.couchbase.com/sync-gateway/current/conflict-resolution.html) - Documents timestamp-based last-write-wins with hybrid logical clocks
- [Bidirectional Sync Best Practices](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices) - Discusses clock synchronization challenges and timestamp tolerance

---

## Migration Path

### Phase 1: Add Schema Columns

**Migration SQL:**

```sql
-- Add to stadion_members table
ALTER TABLE stadion_members ADD COLUMN email_modified_at TEXT;
ALTER TABLE stadion_members ADD COLUMN email_source TEXT DEFAULT 'sportlink';
ALTER TABLE stadion_members ADD COLUMN phone_modified_at TEXT;
ALTER TABLE stadion_members ADD COLUMN phone_source TEXT DEFAULT 'sportlink';

-- Add to sportlink_member_free_fields table
ALTER TABLE sportlink_member_free_fields ADD COLUMN vog_datum_modified_at TEXT;
ALTER TABLE sportlink_member_free_fields ADD COLUMN vog_datum_source TEXT DEFAULT 'sportlink';
ALTER TABLE sportlink_member_free_fields ADD COLUMN freescout_id_modified_at TEXT;
ALTER TABLE sportlink_member_free_fields ADD COLUMN freescout_id_source TEXT DEFAULT 'sportlink';
ALTER TABLE sportlink_member_free_fields ADD COLUMN has_financial_block_modified_at TEXT;
ALTER TABLE sportlink_member_free_fields ADD COLUMN has_financial_block_source TEXT DEFAULT 'sportlink';
```

**Backfill strategy:**

```javascript
// Initialize timestamps from existing data
db.exec(`
  UPDATE stadion_members
  SET
    email_modified_at = last_seen_at,
    phone_modified_at = last_seen_at
  WHERE email_modified_at IS NULL;

  UPDATE sportlink_member_free_fields
  SET
    vog_datum_modified_at = last_seen_at,
    freescout_id_modified_at = last_seen_at,
    has_financial_block_modified_at = last_seen_at
  WHERE vog_datum_modified_at IS NULL;
`);
```

### Phase 2: Update Download Script

**Modify `download-data-from-sportlink.js`:**

```javascript
// Capture download time
const downloadTime = new Date().toISOString();

// Pass download time to database operations
upsertMembers(db, members.map(m => ({
  ...m,
  downloaded_at: downloadTime
})));
```

### Phase 3: Add Conflict Detection Logic

**Create `lib/conflict-resolver.js`:**

```javascript
function resolveFieldConflict(field, sportlinkValue, stadionValue, metadata) {
  const { sportlinkTime, stadionTime, lastKnownTime, lastKnownSource } = metadata;

  // Conflict resolution logic (see Pattern 2 above)
  // Returns { value, source, needsSync: { toSportlink, toStadion } }
}
```

### Phase 4: Implement Sportlink Writer

**Create `write-sportlink-updates.js`:**

```javascript
// New script to write changes back to Sportlink
// Uses Playwright form automation
// Records write timestamps in SQLite
```

---

## Confidence Assessment

| Component | Confidence | Notes |
|-----------|-----------|-------|
| SQLite schema | HIGH | Simple column additions following existing patterns |
| WordPress modified field | HIGH | Well-documented, stable API, verified in Stadion docs |
| Sportlink download time | MEDIUM | Proxy approach is necessary but has granularity limitations |
| Playwright form writing | HIGH | Core Playwright feature, well-documented, no special libraries needed |
| Clock sync strategy | MEDIUM | UTC + tolerance window is standard practice, but untested with Sportlink |

---

## Open Questions for Phase Implementation

1. **Sportlink form selectors:** Need to inspect actual Sportlink edit forms to determine CSS selectors for:
   - Email input field
   - Phone input field
   - VOG datum field (likely a date picker)
   - Financial block checkbox/toggle
   - FreeScout ID field

2. **Sportlink form validation:** Does Sportlink have client-side validation that might interfere with Playwright automation? (e.g., email format, phone format)

3. **Sportlink save confirmation:** How does Sportlink indicate successful save? (URL change, success message, etc.)

4. **Stadion ACF field names:** Verify exact ACF field keys for:
   - Phone number field
   - VOG datum field
   - FreeScout ID field
   - Financial block field

These questions are phase-specific research tasks, not stack decisions.

---

## Summary: Stack Changes

**New dependencies:** NONE

**Schema changes:**
- 10 new columns across 2 existing tables
- All TEXT type (ISO 8601 timestamps and source indicators)

**New patterns:**
- Download time capture (1 line change in download script)
- Conflict resolution logic (new module: `lib/conflict-resolver.js`)
- Sportlink form writer (new script: `write-sportlink-updates.js`)

**Existing capabilities leveraged:**
- Playwright (already installed, handles form writing)
- SQLite (better-sqlite3 already installed)
- WordPress REST API (already integrated via `lib/stadion-client.js`)

The stack is ready. Implementation is straightforward schema extension + logic layer.

---

## Sources

### WordPress Modification Tracking
- [WordPress REST API Posts Reference](https://developer.wordpress.org/rest-api/reference/posts/)
- [WordPress 5.7 REST API Changes](https://make.wordpress.org/core/2021/02/23/rest-api-changes-in-wordpress-5-7/)
- [ACF Field Modification Date Tracking](https://support.advancedcustomfields.com/forums/topic/field-last-update-date-stamp/)
- [WordPress Post Revisions API](https://developer.wordpress.org/rest-api/reference/post-revisions/)

### Playwright Form Automation
- [Playwright Actions Documentation](https://playwright.dev/docs/input)
- [Playwright Form Automation Guide](https://blog.apify.com/playwright-how-to-automate-forms/)

### Bidirectional Sync Patterns
- [Couchbase Conflict Resolution](https://docs.couchbase.com/sync-gateway/current/conflict-resolution.html)
- [Bidirectional Sync Best Practices](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices)
- [SQLite-Sync Framework (AMPLI-SYNC)](https://github.com/sqlite-sync/SQLite-sync.com)
- [SQLite Sync (CRDT-based)](https://github.com/sqliteai/sqlite-sync/)
- [Bidirectional Sync Implementation (December 2025)](https://medium.com/@janvi34334/how-i-implemented-bidirectional-data-sync-in-a-flutter-retail-app-060aa2f69c9f)
