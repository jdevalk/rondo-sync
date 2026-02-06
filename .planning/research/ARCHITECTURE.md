# Architecture: Reverse Sync (Stadion → Sportlink)

**Domain:** Bidirectional data synchronization between WordPress REST API and browser-automated form submission
**Researched:** 2026-01-29
**Confidence:** MEDIUM (architecture patterns verified, Sportlink specifics inferred from existing code)

## Executive Summary

Reverse sync adds a Stadion → Sportlink flow to the existing one-way Sportlink → Stadion architecture. The implementation follows **timestamp-based conflict resolution** with **browser automation** for Sportlink writes (no write API available). The architecture preserves the existing SQLite-based state tracking pattern while adding modification time comparison.

**Key insight:** This is not true bidirectional sync (both sides writing freely). Instead, it's **conditional reverse sync** where Stadion updates are only pushed if they're newer than Sportlink's version. Sportlink remains the primary source of truth.

## Current Architecture (One-Way)

### Data Flow

```
Sportlink Club → SQLite → Stadion WordPress
     (download)      ↓         ↑
                 (upsert)  (stadionRequest)
```

### Key Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| `download-data-from-sportlink.js` | Browser automation downloads member JSON | Playwright + Chromium |
| `lib/stadion-db.js` | SQLite schema for state tracking | better-sqlite3 |
| `submit-stadion-sync.js` | Push members to Stadion via REST API | HTTPS client |
| `lib/stadion-client.js` | Stadion WordPress REST API wrapper | node:https + Basic Auth |
| `sync-people.js` | Orchestrates people pipeline | Sequential step execution |

### State Tracking Pattern

SQLite database (`rondo-sync.sqlite`) stores:
- `knvb_id` → `stadion_id` mapping (WordPress post ID)
- `source_hash` (SHA-256 of member data)
- `last_synced_hash` (hash of data last pushed to Stadion)
- `last_synced_at` (timestamp)

**Change detection:** Compare `source_hash != last_synced_hash` to determine if sync needed.

### Hash-Based Change Detection

```javascript
// From lib/stadion-db.js
function computeSourceHash(knvbId, data) {
  const payload = stableStringify({ knvb_id: knvbId, data: data || {} });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Check if member needs sync
function getMembersNeedingSync(db, force = false) {
  return db.prepare(`
    SELECT knvb_id, email, data_json, source_hash, stadion_id
    FROM stadion_members
    WHERE last_synced_hash IS NULL OR last_synced_hash != source_hash
  `).all();
}
```

## Proposed Architecture (Bidirectional)

### Data Flow with Reverse Sync

```
Sportlink Club ←───────────────→ Stadion WordPress
     ↓                                ↑
     ↓ (download via browser)         ↑ (read via REST API)
     ↓                                ↑
     ↓                                ↑
SQLite Database (state + timestamps)
     ↓                                ↑
     ↓ (compare timestamps)           ↑
     ↓                                ↑
     ↓                     ┌──────────┘
     ↓                     ↓
     ↓                 (if Stadion newer)
     ↓                     ↓
     ↓ (write via browser automation)
     ↓                     ↓
     ↓←────────────────────┘
```

### Modification Time Tracking

WordPress REST API provides modification timestamps:
- `modified` - Local timezone (e.g., "2026-01-29T10:30:45")
- `modified_gmt` - UTC timezone (use this for comparisons)

These fields are standard in all WordPress REST API responses for posts ([source](https://developer.wordpress.org/rest-api/reference/posts/)).

**Strategy:** Store `stadion_modified_gmt` in SQLite to compare against Sportlink's last-modified time.

### Schema Changes

Add to `stadion_members` table:

```sql
ALTER TABLE stadion_members
  ADD COLUMN stadion_modified_gmt TEXT;  -- Stadion's last modification timestamp
  ADD COLUMN sportlink_modified_at TEXT;  -- Sportlink's last modification timestamp (from download)
  ADD COLUMN last_reverse_synced_at TEXT; -- When we last pushed to Sportlink
```

### Conflict Resolution Strategy

**Rule:** Last Write Wins (LWW) based on modification timestamps ([source](https://mobterest.medium.com/conflict-resolution-strategies-in-data-synchronization-2a10be5b82bc))

```javascript
function needsReverseSync(member) {
  // No reverse sync if:
  // 1. Never synced to Stadion (stadion_id is null)
  if (!member.stadion_id) return false;

  // 2. Already reverse synced and Sportlink version is newer
  if (member.last_reverse_synced_at &&
      member.sportlink_modified_at > member.stadion_modified_gmt) {
    return false;
  }

  // Reverse sync if Stadion version is newer
  return member.stadion_modified_gmt > member.sportlink_modified_at;
}
```

## New Components

### 1. Fetch Stadion Changes

**Script:** `fetch-stadion-changes.js`

**Purpose:** Query Stadion REST API for members modified since last sync.

```javascript
// Pseudocode
async function fetchStadionChanges(db, options) {
  const members = getAllTrackedMembers(db); // Get all with stadion_id
  const changes = [];

  for (const member of members) {
    const response = await stadionRequest(
      `wp/v2/people/${member.stadion_id}`,
      'GET',
      null,
      options
    );

    const stadionModified = response.body.modified_gmt;
    const sportlinkModified = member.sportlink_modified_at;

    // Compare timestamps
    if (new Date(stadionModified) > new Date(sportlinkModified)) {
      changes.push({
        knvb_id: member.knvb_id,
        stadion_id: member.stadion_id,
        stadion_modified_gmt: stadionModified,
        stadion_data: response.body.acf
      });
    }
  }

  return { success: true, changes };
}
```

**Integration:** Runs after Sportlink download completes, before Stadion push.

### 2. Reverse Sync to Sportlink

**Script:** `submit-sportlink-reverse-sync.js`

**Purpose:** Browser automation to update Sportlink member pages.

**Fields to sync:** (from project context)
- Contact details: `email`, `email2`, `mobile`, `phone` → /general page
- VOG date: `datum-vog` → /other page, #inputRemarks8
- FreeScout ID: `freescout-id` → /other page, #inputRemarks3
- Financial block: `financiele-blokkade` → /financial page, toggle buttons

**Architecture:** Mirror existing `download-data-from-sportlink.js` pattern.

```javascript
// Pseudocode
async function runReverseSyncBrowser(changes, options) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login (reuse login flow from download script)
  await loginToSportlink(page);

  for (const change of changes) {
    const memberUrl = `https://club.sportlink.com/member/edit/${change.knvb_id}/general`;
    await page.goto(memberUrl);

    // Update contact fields
    await page.fill('#inputEmail', change.stadion_data.contact_info[0].contact_value);
    // ... more field updates

    await page.click('#btnSave');
    await page.waitForSelector('.success-message', { timeout: 5000 });

    // Update tracking
    updateReverseSyncState(db, change.knvb_id, new Date().toISOString());
  }

  await browser.close();
}
```

**Error handling:** If Sportlink page has changed since last update, log error and skip member. Notify operator via email.

### 3. Update Orchestrator

**Script:** `sync-people.js` (modify existing)

**Changes:**

```javascript
// New step: Fetch Stadion changes after Sportlink download
const stadionChanges = await fetchStadionChanges(db, { logger, verbose });

// New step: Reverse sync if changes detected
if (stadionChanges.changes.length > 0) {
  logger.log(`${stadionChanges.changes.length} Stadion changes to push to Sportlink`);
  const reverseResult = await runReverseSyncBrowser(stadionChanges.changes, { logger, verbose });
  stats.reverse = {
    total: stadionChanges.changes.length,
    synced: reverseResult.synced,
    errors: reverseResult.errors
  };
}
```

## Component Boundaries

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| `fetch-stadion-changes.js` | Detect Stadion modifications via REST API | SQLite state | List of changes to push |
| `submit-sportlink-reverse-sync.js` | Browser automation writes to Sportlink | Change list | Success/error results |
| `lib/stadion-db.js` | Schema + queries for timestamps | - | Database functions |
| `sync-people.js` | Orchestrate forward + reverse flows | CLI flags | Combined stats |

## Build Order (Recommended Phases)

### Phase 1: State Tracking (No Writes Yet)

**Goal:** Add timestamp tracking without writing to Sportlink.

**Tasks:**
1. Add timestamp columns to SQLite schema
2. Modify `download-data-from-sportlink.js` to extract Sportlink modification times
3. Modify `submit-stadion-sync.js` to capture Stadion `modified_gmt` after writes
4. Create `fetch-stadion-changes.js` to identify candidates
5. Add logging to show what *would* be reverse synced

**Output:** Dry-run mode shows reverse sync candidates without making changes.

### Phase 2: Single-Field Reverse Sync

**Goal:** Prove reverse sync with lowest-risk field.

**Tasks:**
1. Implement `submit-sportlink-reverse-sync.js` for `freescout-id` only
2. Add browser automation to navigate to /other page
3. Update #inputRemarks3 field
4. Save and verify success
5. Update `last_reverse_synced_at` in SQLite

**Output:** FreeScout ID syncs from Stadion → Sportlink reliably.

### Phase 3: Expand Field Coverage

**Goal:** Add remaining fields incrementally.

**Tasks:**
1. Add contact fields (email, mobile, phone) on /general page
2. Add VOG date on /other page
3. Add financial block toggle on /financial page
4. Test each field independently

**Output:** All specified fields sync reverse direction.

### Phase 4: Integration & Error Handling

**Goal:** Production-ready orchestration.

**Tasks:**
1. Integrate into `sync-people.js` orchestrator
2. Add error recovery (retry logic, skip on failure)
3. Email notifications for reverse sync failures
4. Add metrics to summary report
5. Update cron schedule if needed (or keep 4x daily)

**Output:** Reverse sync runs automatically in production.

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ FORWARD SYNC (Sportlink → Stadion)                              │
│                                                                  │
│ 1. download-data-from-sportlink.js                              │
│    ↓ (browser automation)                                       │
│    Members JSON + sportlink_modified_at                         │
│    ↓                                                             │
│ 2. upsert to SQLite (stadion_members)                           │
│    ↓                                                             │
│ 3. Compare source_hash vs last_synced_hash                      │
│    ↓ (if changed)                                               │
│ 4. submit-stadion-sync.js                                       │
│    ↓ (stadionRequest PUT/POST)                                  │
│    Stadion WordPress ACF fields updated                         │
│    ↓                                                             │
│ 5. Capture stadion_modified_gmt from response                   │
│    ↓                                                             │
│ 6. Update last_synced_hash in SQLite                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ REVERSE SYNC (Stadion → Sportlink)                              │
│                                                                  │
│ 7. fetch-stadion-changes.js                                     │
│    ↓ (for each member with stadion_id)                          │
│    GET /wp/v2/people/{stadion_id}                               │
│    ↓                                                             │
│ 8. Compare stadion_modified_gmt vs sportlink_modified_at        │
│    ↓ (if Stadion newer)                                         │
│ 9. submit-sportlink-reverse-sync.js                             │
│    ↓ (browser automation)                                       │
│    Navigate to member edit pages                                │
│    ↓                                                             │
│    Fill form fields + save                                      │
│    ↓                                                             │
│ 10. Update last_reverse_synced_at in SQLite                     │
└─────────────────────────────────────────────────────────────────┘
```

## Modification Time Sources

### Sportlink

**Source:** Browser automation extracts from page metadata or API response headers.

**Location:** Likely in member JSON response from SearchMembers POST:
```javascript
// Hypothesis (needs verification):
const member = jsonData.Members[0];
const modifiedAt = member.ModifiedAt || member.LastModified;
```

**Fallback:** If Sportlink doesn't provide modification time, use `last_seen_at` (when we downloaded it) as proxy. This is conservative but safe.

### Stadion WordPress

**Source:** REST API standard fields ([source](https://developer.wordpress.org/rest-api/reference/posts/))

**Response format:**
```json
{
  "id": 456,
  "modified": "2026-01-29T10:30:45",
  "modified_gmt": "2026-01-29T09:30:45",
  "acf": { ... }
}
```

**Use:** `modified_gmt` (UTC timezone) for all comparisons.

## Loop Prevention

**Risk:** Reverse sync could trigger forward sync, creating infinite loop.

**Prevention strategies:**

1. **Timestamp granularity:** Use second-level precision. If timestamps match, no sync needed.
2. **Sync token:** Add `sync_source` field to track which system last modified:
   ```sql
   ALTER TABLE stadion_members ADD COLUMN last_modified_by TEXT; -- 'sportlink' or 'stadion'
   ```
3. **Cooldown period:** Only reverse sync if Stadion change is >5 minutes old (prevents immediate bounce).

## Error Scenarios & Handling

### Scenario 1: Sportlink Page Layout Changed

**Symptom:** Playwright selectors fail (element not found).

**Detection:** `page.waitForSelector()` times out.

**Response:**
- Log error with screenshot
- Skip member, continue with others
- Email operator with error details
- Flag member for manual review

### Scenario 2: Conflicting Simultaneous Edits

**Symptom:** Both systems modified within same minute.

**Detection:** `abs(stadion_modified_gmt - sportlink_modified_at) < 60 seconds`

**Response:**
- Use LWW (Last Write Wins) - most recent timestamp wins
- Log conflict to separate audit table
- Include in email report for operator awareness

### Scenario 3: Network Failure Mid-Sync

**Symptom:** Browser automation crashes or API request times out.

**Detection:** Exception caught in sync loop.

**Response:**
- Transaction rollback (don't update `last_reverse_synced_at`)
- Retry on next sync cycle (4 hours later)
- If fails 3 consecutive times, email alert

### Scenario 4: Data Validation Failure

**Symptom:** Sportlink rejects field value (e.g., invalid email format).

**Detection:** Success message not shown after save, or error message appears.

**Response:**
- Log validation error with field + value
- Don't update `last_reverse_synced_at` (will retry next cycle)
- Email operator with validation details
- Consider adding pre-validation before browser automation

## Rollback Strategy

If reverse sync causes issues in production:

1. **Immediate:** Set `ENABLE_REVERSE_SYNC=false` in .env (feature flag)
2. **Data repair:** Run forward sync with `--force` to overwrite Sportlink values pushed to Stadion
3. **Investigation:** Review logs/screenshots to identify root cause
4. **Gradual re-enable:** Test with single member first (`--member=knvb_id` flag)

## Monitoring & Observability

### Metrics to Track

| Metric | What to Measure | Alert Threshold |
|--------|----------------|-----------------|
| Reverse sync rate | Changes synced per run | >10% of members = investigate |
| Conflict rate | Simultaneous edits detected | >5% = investigate timing |
| Error rate | Failed reverse syncs | >1% = alert operator |
| Sync duration | Time for reverse sync phase | >10 minutes = performance issue |

### Log Outputs

```javascript
// Summary report format
stats.reverse = {
  total: 15,           // Members checked
  candidates: 8,       // Stadion newer than Sportlink
  synced: 7,           // Successfully pushed
  skipped: 1,          // Skipped due to error
  errors: [{
    knvb_id: '12345',
    field: 'email',
    message: 'Invalid format',
    screenshot: 'logs/error-12345-email.png'
  }]
};
```

## Performance Considerations

### At 100 Members

- Fetch changes: ~30 seconds (REST API reads)
- Browser automation: ~2 min (if 10 members need updates, 12s each)
- **Total:** ~2.5 minutes added to sync

### At 500 Members

- Fetch changes: ~2 minutes (parallelizable with Promise.all in batches)
- Browser automation: ~10 min (if 50 members need updates)
- **Total:** ~12 minutes added to sync

**Optimization:** Batch browser automation (stay logged in, navigate between members without re-login).

### At 1000+ Members

- Consider splitting reverse sync to separate schedule (nightly instead of 4x daily)
- Parallel browser contexts (5 concurrent sessions)
- Incremental sync (only check members modified in last 48 hours)

## Security Considerations

### Credential Storage

Same as forward sync:
- `SPORTLINK_USERNAME`, `SPORTLINK_PASSWORD`, `SPORTLINK_OTP_SECRET` in .env
- Server-only execution (production server at 46.202.155.16)

### Audit Trail

All reverse syncs logged:
- What changed (field + old/new value)
- Who triggered (system user)
- When (timestamp)
- Why (Stadion modification timestamp)

**Implementation:** Add `reverse_sync_log` table:

```sql
CREATE TABLE reverse_sync_log (
  id INTEGER PRIMARY KEY,
  knvb_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  stadion_modified_gmt TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  success INTEGER DEFAULT 1
);
```

## Integration with Existing Sync Schedule

**Current:** 4x daily at 8am, 11am, 2pm, 5pm (people pipeline)

**Options:**

**Option A: Same schedule** (recommended for MVP)
- Add reverse sync as new step in existing `sync-people.js`
- Minimal changes to cron
- Keeps data fresh (4x daily in both directions)

**Option B: Separate schedule**
- New cron job for reverse sync only (e.g., nightly at 2am)
- Lower frequency acceptable for reverse direction (less urgent)
- Better performance isolation (doesn't slow down forward sync)

**Recommendation:** Start with Option A (same schedule). If performance becomes issue, split to Option B in Phase 4.

## Success Criteria

Reverse sync is production-ready when:

- [ ] Timestamp comparison correctly identifies Stadion-modified members
- [ ] Browser automation successfully updates all 4 target field types
- [ ] Loop prevention works (no infinite sync cycles)
- [ ] Error handling gracefully skips failures without blocking entire sync
- [ ] Email reports show reverse sync stats
- [ ] Logs contain audit trail of all reverse syncs
- [ ] Rollback procedure tested and documented
- [ ] Performance acceptable (<15 min total for 500 members)

## Open Questions (To Resolve in Phase 1)

1. **Sportlink modification time:** Does SearchMembers JSON include `ModifiedAt` or similar field? Need to verify during download phase.
2. **Field accessibility:** Can all target fields be automated reliably, or do some require special handling (CAPTCHA, 2FA prompts)?
3. **Rate limiting:** Does Sportlink throttle rapid page navigation? May need delays between members.
4. **Session timeout:** How long does Sportlink session stay active? May need periodic re-login during long sync runs.

## Architecture Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Full Data Sync on Every Run

**Problem:** Fetching all Stadion members via REST API on every sync (4x daily).

**Why bad:** Wasteful API calls, slow performance.

**Instead:** Only fetch members that *might* have changed (based on SQLite last sync timestamps).

### ❌ Anti-Pattern 2: Writing to Both Systems Simultaneously

**Problem:** Parallel writes to Sportlink and Stadion.

**Why bad:** Race conditions, unpredictable conflict resolution.

**Instead:** Sequential flow - forward sync completes before reverse sync starts.

### ❌ Anti-Pattern 3: Silent Failure

**Problem:** Reverse sync errors logged but not surfaced to operator.

**Why bad:** Data drift accumulates silently.

**Instead:** Email alerts for reverse sync failures, include in daily summary report.

### ❌ Anti-Pattern 4: Blind Overwrites

**Problem:** Pushing Stadion changes without checking Sportlink modification time.

**Why bad:** Loses legitimate Sportlink updates made after last sync.

**Instead:** Always compare timestamps, use LWW conflict resolution.

## References

**Architecture Patterns:**
- [Bidirectional Data Synchronization Patterns](https://dev3lop.com/bidirectional-data-synchronization-patterns-between-systems/) - Overview of bi-directional sync architectures
- [MuleSoft: Bi-Directional Sync Pattern](https://blogs.mulesoft.com/api-integration/patterns/data-integration-patterns-bi-directional-sync/) - Integration pattern fundamentals

**Conflict Resolution:**
- [Conflict Resolution Strategies in Data Synchronization](https://mobterest.medium.com/conflict-resolution-strategies-in-data-synchronization-2a10be5b82bc) - Timestamp-based resolution strategies
- [Mastering Two-Way Sync](https://www.stacksync.com/blog/mastering-two-way-sync-from-concept-to-deployment) - Practical conflict handling

**WordPress API:**
- [WordPress REST API: Posts](https://developer.wordpress.org/rest-api/reference/posts/) - Standard `modified` and `modified_gmt` fields
- [Stadion API Documentation](~/Code/stadion/docs/api-leden-crud.md) - Custom person ACF fields

---

**Next Steps:** Proceed to Phase 1 implementation (state tracking without writes).
