# Domain Pitfalls: Adding Bidirectional Sync

**Domain:** Bidirectional sync with browser automation and last-edit-wins conflict resolution
**Researched:** 2026-01-29
**Context:** Adding reverse sync (Stadion → Sportlink) to existing one-way sync system

## Executive Summary

Adding bidirectional sync to an existing one-way system introduces fundamental architectural challenges that go beyond "just running the sync in reverse." The most critical pitfalls involve:

1. **Infinite sync loops** - The #1 cause of production incidents in bidirectional systems
2. **Clock drift and timestamp comparison** - Last-edit-wins requires reliable time comparison across systems
3. **Browser automation fragility** - Form selectors break when Sportlink updates their UI
4. **Silent data loss** - Last-write-wins silently discards conflicting updates
5. **State tracking complexity** - SQLite databases must track bidirectional modification times

## Critical Pitfalls

### Pitfall 1: Infinite Sync Loops

**What goes wrong:**
When Sportlink → Stadion sync runs, it updates Stadion. Then Stadion → Sportlink reverse sync runs, sees "new" changes in Stadion, and pushes them back to Sportlink. This triggers Sportlink → Stadion again, creating an infinite loop that:
- Generates thousands of API calls
- Triggers email floods to OPERATOR_EMAIL
- Exhausts API rate limits
- Creates database bloat

**Why it happens:**
The sync system can't distinguish between:
- Human-initiated changes (should trigger sync)
- Sync-initiated changes (should NOT trigger sync)

Without origin tracking, every write looks like a user edit.

**Real-world scenario:**
```
09:00 - Forward sync runs, updates email field in Stadion
09:15 - Reverse sync runs, sees "changed" email, writes to Sportlink
09:30 - Forward sync runs, sees "changed" email, writes to Stadion
09:45 - Reverse sync runs... (loop continues)
```

**Consequences:**
- Production outage (rate limiting)
- Hundreds of duplicate webhook/email notifications
- Database lock contention
- Difficult to diagnose (logs show "legitimate" changes)

**Prevention strategies:**

1. **Origin Tracking (REQUIRED)**
   - Add `modified_by` field to database tables tracking who made the change
   - Values: `'user'`, `'sync-forward'`, `'sync-reverse'`
   - Only sync records where `modified_by = 'user'`

   ```javascript
   // In stadion-db.js
   CREATE TABLE stadion_members (
     ...
     modified_by TEXT NOT NULL DEFAULT 'user',
     modified_at TEXT NOT NULL
   );

   // When reverse sync updates Sportlink
   UPDATE stadion_members
   SET modified_by = 'sync-reverse'
   WHERE knvb_id = ?;

   // Forward sync query
   SELECT * FROM stadion_members
   WHERE modified_by = 'user'
   AND modified_at > last_synced_at;
   ```

2. **Hash-Based Duplicate Detection**
   - Already implemented for forward sync (`source_hash` vs `last_synced_hash`)
   - **Must implement for reverse direction**
   - Compute hash of Stadion state, skip if unchanged since last reverse sync

   ```javascript
   // Add to stadion-db.js
   ALTER TABLE stadion_members
   ADD COLUMN last_reverse_synced_hash TEXT;

   // Before reverse sync
   const currentHash = computeSourceHash(knvbId, stadionData);
   if (currentHash === lastReverseSyncedHash) {
     logger.verbose('No changes in Stadion, skipping reverse sync');
     continue;
   }
   ```

3. **Sync Coordination Window**
   - Never run forward and reverse sync simultaneously
   - Enforce minimum gap (e.g., 30 minutes between directions)
   - Use flock locking with separate lock files per direction

   ```bash
   # scripts/sync.sh modification needed
   flock -n /tmp/sync-forward.lock scripts/sync-people.js
   # Wait 30 minutes before reverse sync can run
   flock -n /tmp/sync-reverse.lock scripts/sync-reverse.js
   ```

4. **Circuit Breaker Pattern**
   - Track sync frequency per record
   - If same record syncs >3 times in 1 hour, flag as loop
   - Alert operator and stop syncing that record

   ```javascript
   // Add loop detection table
   CREATE TABLE sync_loop_detector (
     knvb_id TEXT PRIMARY KEY,
     sync_count INTEGER DEFAULT 0,
     window_start TEXT,
     is_blocked INTEGER DEFAULT 0
   );
   ```

**Detection (early warning signs):**
- Sync logs show same KNVB IDs repeating across consecutive runs
- Email volume increases (multiple sync reports per hour)
- Database size grows rapidly (every sync creates new timestamps)
- Laposta/Stadion API shows elevated request counts

**Which phase addresses this:**
- **Phase 1: Foundation** - Must implement origin tracking and hash-based deduplication BEFORE any reverse sync runs
- **Phase 3: Reverse Sync** - Add circuit breaker and monitoring

### Pitfall 2: Clock Drift and Timestamp Comparison Failures

**What goes wrong:**
Last-edit-wins requires comparing timestamps from two systems (Stadion and Sportlink). If clocks are out of sync:

```
Sportlink server time: 09:00:00 (5 minutes fast)
Stadion server time:   08:56:00 (actual time)

User edits email in Sportlink at 09:00:00
Reverse sync runs at 08:57:00, compares:
  Sportlink timestamp: 09:00:00
  Stadion timestamp:   08:56:30
  Decision: Sportlink is "newer", push to Stadion ✓

User edits email in Stadion at 08:59:00
Forward sync runs at 09:01:00, compares:
  Stadion timestamp:   08:59:00
  Sportlink timestamp: 09:00:00
  Decision: Sportlink is "newer", overwrite Stadion ✗

Result: Stadion edit is LOST
```

**Why it happens:**
- WordPress servers use local timezone (not necessarily UTC)
- Sportlink server timezone unknown (likely Europe/Amsterdam)
- NTP sync can drift by [100-250ms with proper configuration, but "tens or even hundreds of milliseconds" in practice](https://www.geeksforgeeks.org/distributed-systems/clock-synchronization-in-distributed-system/)
- Server reboots can introduce minutes of clock drift before NTP resync

**Consequences:**
- Silent data loss (no error, no log entry, just missing updates)
- Non-deterministic behavior (works fine when clocks agree)
- Difficult to debug (requires correlating logs with actual wall clock time)
- User complaints about "changes disappearing"

**Prevention strategies:**

1. **Normalize All Timestamps to UTC**
   - WordPress by default uses UTC (since 5.3)
   - Sportlink timestamps must be converted to UTC before storage
   - SQLite stores all timestamps as UTC ISO 8601

   ```javascript
   // When downloading from Sportlink
   const sportlinkModified = browserDetectTimestamp(); // Local time
   const utcModified = convertToUTC(sportlinkModified, 'Europe/Amsterdam');

   // When comparing
   const stadionUTC = new Date(row.modified_at).getTime();
   const sportlinkUTC = new Date(utcModified).getTime();
   if (sportlinkUTC > stadionUTC + GRACE_PERIOD_MS) {
     // Sportlink wins
   }
   ```

2. **Clock Skew Grace Period**
   - Don't compare timestamps exactly
   - Add 5-minute grace period (300,000ms) to account for drift
   - Only update if difference > grace period

   ```javascript
   const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

   const timeDiff = Math.abs(sportlinkTime - stadionTime);
   if (timeDiff < CLOCK_SKEW_TOLERANCE_MS) {
     logger.verbose('Timestamps within grace period, keeping current value');
     continue;
   }
   ```

3. **Verify NTP Configuration on Production Server**
   - SSH to 46.202.155.16
   - Check NTP status: `timedatectl status`
   - Ensure NTP service is active and synchronized
   - Document server timezone in README (currently unclear)

   ```bash
   # Add to deployment checklist
   ssh root@46.202.155.16
   timedatectl status
   # Should show: "System clock synchronized: yes"
   ```

4. **Log Actual Timestamps for Debugging**
   - When conflict resolution runs, log both timestamps
   - Include timezone information
   - Helps diagnose clock drift issues

   ```javascript
   logger.log(`Conflict resolution for ${knvbId}:`);
   logger.log(`  Sportlink: ${sportlinkModified} (UTC: ${utcModified})`);
   logger.log(`  Stadion:   ${stadionModified}`);
   logger.log(`  Winner:    ${winner} (diff: ${timeDiff}ms)`);
   ```

5. **WordPress ACF Timezone Gotchas**
   - [WordPress 5.3 changed date_i18n() behavior](https://github.com/AdvancedCustomFields/acf/issues/252), breaking ACF date fields
   - [ACF stores dates as 'Y-m-d H:i:s' in database](https://www.advancedcustomfields.com/resources/date-time-picker/), but interpretation depends on WordPress timezone setting
   - [Never use `date_default_timezone_set()` with WordPress](https://support.advancedcustomfields.com/forums/topic/date-picker-fields-in-repeaters-gone-wrong-after-wp-5-3-update/) - breaks core functionality
   - Must use `get_option('gmt_offset')` to interpret ACF timestamps correctly

**Detection:**
- User reports "my changes disappeared"
- Changes oscillate between two values
- Sync logs show back-and-forth updates for same field
- Check: `timedatectl` shows clock not synchronized
- Check: Stadion WordPress timezone setting (Settings → General)

**Which phase addresses this:**
- **Phase 1: Foundation** - Implement UTC normalization and grace period
- **Phase 2: Timestamps** - Add comprehensive timestamp logging
- **Phase 5: Monitoring** - Add clock drift monitoring and alerts

### Pitfall 3: Browser Automation Selector Fragility

**What goes wrong:**
Sportlink has no API. Reverse sync must use Playwright to:
1. Login to Sportlink
2. Navigate to member edit page
3. Fill form fields
4. Submit changes

If Sportlink updates their UI (new CSS classes, restructured HTML, added validation), selectors break:

```javascript
// Worked yesterday
await page.fill('#contact_email', newEmail);

// Sportlink added a modal, selector fails
Error: Timeout waiting for selector '#contact_email'
```

Reverse sync silently fails, leaving systems out of sync.

**Why it happens:**
- Sportlink controls their UI, updates without notice
- [Selectors tied to DOM hierarchy are fragile](https://ghostinspector.com/blog/css-selector-strategies-automated-browser-testing/)
- No stable `data-test` attributes (Sportlink doesn't design for automation)
- [Dynamic SPAs require careful scripting and increase maintenance](https://www.browserstack.com/guide/playwright-vs-puppeteer)

**Real-world scenario:**
```
Month 1: Reverse sync works perfectly
Month 2: Sportlink adds CAPTCHA to /general page
Month 3: Sportlink redesigns member edit UI
Month 4: Sportlink adds client-side validation requiring specific order

Each change breaks automation. No notification. Sync silently stops.
```

**Consequences:**
- Silent failures (no error if selector doesn't exist)
- Stadion updates never reach Sportlink
- Systems diverge for weeks before discovery
- Manual cleanup required

**Prevention strategies:**

1. **Resilient Selector Strategy**
   - Use multiple fallback selectors per field
   - Prefer stable attributes (name, aria-label) over classes

   ```javascript
   // Bad: Single fragile selector
   await page.fill('#contact_email', email);

   // Good: Multiple fallbacks
   async function fillSportlinkField(page, fieldName, value, selectors) {
     for (const selector of selectors) {
       if (await page.locator(selector).count() > 0) {
         await page.fill(selector, value);
         return true;
       }
     }
     throw new Error(`Could not find field ${fieldName}`);
   }

   const emailSelectors = [
     'input[name="email"]',           // Most stable
     '#contact_email',                 // Current ID
     'input[type="email"]',            // Fallback
     'label:has-text("E-mail") + input' // Last resort
   ];
   ```

2. **Visual Regression Testing**
   - Take screenshots of Sportlink forms during each sync
   - Compare screenshots to detect UI changes
   - Alert operator before selectors break

   ```javascript
   // In download-sportlink-reverse.js
   const screenshot = await page.screenshot({
     path: `logs/sportlink-ui-${date}.png`
   });

   // Compare with previous screenshot
   const diff = compareImages(previousScreenshot, screenshot);
   if (diff > threshold) {
     logger.error('Sportlink UI has changed significantly!');
     sendAlert('UI change detected, verify selectors');
   }
   ```

3. **Form Submission Verification**
   - After submitting form, verify change took effect
   - Re-download member data and compare
   - Alert if submission failed silently

   ```javascript
   // After form submission
   await page.click('button[type="submit"]');
   await page.waitForLoadState('networkidle');

   // Verify change
   await page.goto(memberUrl);
   const actualEmail = await page.inputValue(emailSelectors[0]);
   if (actualEmail !== expectedEmail) {
     throw new Error(`Email update failed: expected ${expectedEmail}, got ${actualEmail}`);
   }
   ```

4. **Graceful Degradation**
   - If reverse sync fails, don't crash entire sync
   - Log failure, continue with other members
   - Accumulate failures in summary email

   ```javascript
   const failures = [];
   for (const member of membersToSync) {
     try {
       await updateSportlinkMember(member);
     } catch (error) {
       logger.error(`Failed to update ${member.knvb_id}: ${error.message}`);
       failures.push({ knvb_id: member.knvb_id, error: error.message });
     }
   }

   if (failures.length > 0) {
     emailOperator({
       subject: 'Reverse Sync Failures',
       body: `Failed to update ${failures.length} members: ${JSON.stringify(failures)}`
     });
   }
   ```

5. **Selector Smoke Tests**
   - Daily cron job just tests selectors (no data modification)
   - Verify all expected form fields exist
   - Alert operator before reverse sync runs

   ```javascript
   // scripts/test-sportlink-selectors.js
   async function verifySportlinkSelectors() {
     const page = await loginToSportlink();
     await page.goto('member/edit/12345'); // Test member

     const expectedFields = [
       { name: 'email', selectors: emailSelectors },
       { name: 'phone', selectors: phoneSelectors },
       { name: 'vog_date', selectors: vogSelectors }
     ];

     for (const field of expectedFields) {
       const found = await findWorkingSelector(page, field.selectors);
       if (!found) {
         throw new Error(`Field ${field.name} not found!`);
       }
     }
   }
   ```

**Detection:**
- Reverse sync logs show "Element not found" errors
- Sync completion time increases (timeouts)
- Operator email reports failures
- Manual check shows Stadion changes didn't reach Sportlink

**Which phase addresses this:**
- **Phase 3: Reverse Sync** - Implement resilient selectors and verification
- **Phase 4: Form Testing** - Add selector smoke tests
- **Phase 5: Monitoring** - Add screenshot diffing and alerts

### Pitfall 4: Silent Data Loss with Last-Write-Wins

**What goes wrong:**
Last-write-wins (LWW) conflict resolution [always bears the risk of data loss](https://dzone.com/articles/conflict-resolution-using-last-write-wins-vs-crdts). When concurrent edits occur:

```
09:00 - User edits email in Sportlink: old@example.com → new@example.com
09:01 - User edits phone in Stadion: 555-1234 → 555-5678
09:05 - Forward sync runs (Sportlink → Stadion)
        - Pushes email change
        - Overwrites phone back to 555-1234 (older timestamp)
09:10 - Phone change is LOST, no error reported
```

**Why it happens:**
- LWW compares entire record timestamps, not per-field
- [The cost of LWW is a lost update](https://www.numberanalytics.com/blog/last-writer-wins-distributed-systems)
- No conflict detection, just silent overwrite
- [Lack of causal ordering](https://dev.to/danyson/last-write-wins-a-conflict-resolution-strategy-2al6) means concurrent changes aren't detected

**Consequences:**
- User changes disappear without explanation
- Difficult to reproduce (requires precise timing)
- No audit trail of lost data
- Damages user trust

**Prevention strategies:**

1. **Per-Field Timestamps (RECOMMENDED)**
   - Track modification time per field, not per record
   - Compare timestamps field-by-field
   - Only overwrite fields that are older

   ```javascript
   // In stadion-db.js
   CREATE TABLE stadion_member_fields (
     id INTEGER PRIMARY KEY,
     knvb_id TEXT NOT NULL,
     field_name TEXT NOT NULL,
     field_value TEXT,
     modified_at TEXT NOT NULL,
     modified_by TEXT NOT NULL,
     UNIQUE(knvb_id, field_name)
   );

   // During sync
   for (const field of fieldsToSync) {
     const sportlinkTime = sportlinkData[`${field}_modified`];
     const stadionTime = stadionData[`${field}_modified`];

     if (sportlinkTime > stadionTime) {
       // Sportlink wins for this field only
       updateField(knvbId, field, sportlinkData[field]);
     }
   }
   ```

2. **Field-Level Sync Scope**
   - Reverse sync only syncs specific fields (email, phone, vog_date, freescout_id, financiele_blokkade)
   - Forward sync syncs everything else
   - Reduces conflict surface area
   - Already partially implemented (reverse sync targets specific fields)

3. **Conflict Detection and Alerting**
   - Before overwriting, detect if local value changed since last sync
   - If both systems changed same field, flag as conflict
   - Email operator with both values for manual resolution

   ```javascript
   // Check for conflict
   const sportlinkChanged = sportlinkHash !== lastSportlinkHash;
   const stadionChanged = stadionHash !== lastStadionHash;

   if (sportlinkChanged && stadionChanged) {
     logger.error(`Conflict detected for ${knvbId} field ${field}`);
     logger.error(`  Sportlink: ${sportlinkValue} (modified: ${sportlinkTime})`);
     logger.error(`  Stadion:   ${stadionValue} (modified: ${stadionTime})`);

     // Don't sync, wait for manual resolution
     conflicts.push({ knvb_id: knvbId, field, sportlinkValue, stadionValue });
     continue;
   }
   ```

4. **Sync Direction Priority**
   - Document which system is authoritative for each field
   - Reverse sync only writes to Sportlink fields that Stadion owns
   - Forward sync only writes to Stadion fields that Sportlink owns

   ```javascript
   const fieldAuthority = {
     // Stadion is authoritative
     'datum-vog': 'stadion',
     'freescout-id': 'stadion',
     'financiele-blokkade': 'stadion',

     // Sportlink is authoritative
     'first_name': 'sportlink',
     'last_name': 'sportlink',
     'date_of_birth': 'sportlink',

     // Bidirectional (LWW applies)
     'email': 'bidirectional',
     'phone': 'bidirectional'
   };
   ```

5. **Audit Trail**
   - Log every field change with old value, new value, timestamp
   - Allows investigating data loss after the fact
   - Helps identify patterns (e.g., phone always loses to email)

   ```javascript
   CREATE TABLE field_change_audit (
     id INTEGER PRIMARY KEY,
     knvb_id TEXT NOT NULL,
     field_name TEXT NOT NULL,
     old_value TEXT,
     new_value TEXT,
     changed_at TEXT NOT NULL,
     sync_direction TEXT NOT NULL,
     conflict_detected INTEGER DEFAULT 0
   );
   ```

**Detection:**
- User reports: "I updated my phone number but it changed back"
- Pattern of same field being updated repeatedly
- Audit logs show value oscillation
- Manual comparison shows systems out of sync

**Which phase addresses this:**
- **Phase 2: Timestamps** - Implement per-field timestamp tracking
- **Phase 3: Reverse Sync** - Add conflict detection
- **Phase 5: Monitoring** - Add audit trail and conflict reporting

### Pitfall 5: State Tracking Database Complexity

**What goes wrong:**
Forward sync uses SQLite to track:
- `source_hash` - Hash of Sportlink data
- `last_synced_hash` - Hash of last pushed data
- `last_synced_at` - Timestamp of last push

Reverse sync needs to track:
- `stadion_hash` - Hash of Stadion data
- `last_reverse_synced_hash` - Hash of last pulled data
- `last_reverse_synced_at` - Timestamp of last pull
- `modified_by` - Origin tracking (user vs sync)
- `stadion_modified_at` - Stadion's modification time

This doubles database complexity. Common mistakes:

```javascript
// BUG: Using forward sync hash for reverse direction
if (stadion_hash === last_synced_hash) {
  // Wrong hash! Should be last_reverse_synced_hash
  continue;
}

// BUG: Updating wrong timestamp
UPDATE stadion_members
SET last_synced_at = NOW()
WHERE knvb_id = ?;
// Should update last_reverse_synced_at for reverse direction
```

**Why it happens:**
- Bidirectional sync requires dual state tracking
- Easy to confuse forward vs reverse hashes/timestamps
- SQLite schema must support both directions
- [Two one-way pipelines introduce fundamental architectural flaws](https://www.stacksync.com/blog/the-engineering-challenges-of-bi-directional-sync-why-two-one-way-pipelines-fail)

**Consequences:**
- Sync loops (using wrong hash comparison)
- Changes not detected (comparing wrong timestamps)
- Data corruption (overwriting wrong direction)
- Difficult debugging (must trace both directions)

**Prevention strategies:**

1. **Clear Naming Convention**
   - Prefix all forward sync fields with `forward_`
   - Prefix all reverse sync fields with `reverse_`
   - No ambiguous names like `last_synced_at`

   ```sql
   -- GOOD: Clear direction
   CREATE TABLE stadion_members (
     -- Forward sync: Sportlink → Stadion
     forward_source_hash TEXT NOT NULL,
     forward_last_synced_hash TEXT,
     forward_last_synced_at TEXT,

     -- Reverse sync: Stadion → Sportlink
     reverse_source_hash TEXT,
     reverse_last_synced_hash TEXT,
     reverse_last_synced_at TEXT,

     -- Origin tracking
     modified_by TEXT NOT NULL DEFAULT 'user',
     modified_at TEXT NOT NULL
   );

   -- BAD: Ambiguous names
   CREATE TABLE stadion_members (
     source_hash TEXT,      -- Which direction?
     last_synced_at TEXT,   -- Forward or reverse?
     last_synced_hash TEXT  -- Confusing!
   );
   ```

2. **Separate Functions for Each Direction**
   - Don't reuse forward sync code for reverse
   - Create `reverse-sync-lib.js` with distinct functions
   - Prevents accidentally using forward logic in reverse

   ```javascript
   // lib/forward-sync-lib.js
   function getForwardSyncChanges(db) {
     return db.prepare(`
       SELECT * FROM stadion_members
       WHERE forward_source_hash != forward_last_synced_hash
       AND modified_by != 'sync-forward'
     `).all();
   }

   // lib/reverse-sync-lib.js
   function getReverseSyncChanges(db) {
     return db.prepare(`
       SELECT * FROM stadion_members
       WHERE reverse_source_hash != reverse_last_synced_hash
       AND modified_by != 'sync-reverse'
     `).all();
   }
   ```

3. **Database Schema Migration Plan**
   - Existing `stadion-sync.sqlite` schema designed for forward sync only
   - Must add reverse sync columns without breaking forward sync
   - Migration script with rollback capability

   ```javascript
   // scripts/migrate-db-for-reverse-sync.js
   function migrateForReverseSync(db) {
     // Rename existing columns to forward_* prefix
     db.exec(`
       ALTER TABLE stadion_members
       RENAME COLUMN source_hash TO forward_source_hash;

       ALTER TABLE stadion_members
       RENAME COLUMN last_synced_hash TO forward_last_synced_hash;

       ALTER TABLE stadion_members
       RENAME COLUMN last_synced_at TO forward_last_synced_at;
     `);

     // Add reverse sync columns
     db.exec(`
       ALTER TABLE stadion_members
       ADD COLUMN reverse_source_hash TEXT;

       ALTER TABLE stadion_members
       ADD COLUMN reverse_last_synced_hash TEXT;

       ALTER TABLE stadion_members
       ADD COLUMN reverse_last_synced_at TEXT;

       ALTER TABLE stadion_members
       ADD COLUMN modified_by TEXT NOT NULL DEFAULT 'user';

       ALTER TABLE stadion_members
       ADD COLUMN modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
     `);
   }
   ```

4. **Integration Tests**
   - Test forward sync still works after DB changes
   - Test reverse sync doesn't interfere with forward
   - Test both running in sequence (no loops)

   ```javascript
   // tests/bidirectional-sync.test.js
   test('forward then reverse sync maintains consistency', async () => {
     // Setup: Member exists in both systems
     const sportlinkData = { email: 'old@example.com' };
     const stadionData = { email: 'old@example.com' };

     // User edits in Sportlink
     sportlinkData.email = 'new@example.com';

     // Forward sync
     await runForwardSync();
     expect(stadionData.email).toBe('new@example.com');

     // User edits in Stadion
     stadionData.phone = '555-9999';

     // Reverse sync
     await runReverseSync();
     expect(sportlinkData.phone).toBe('555-9999');

     // Forward sync again (should NOT overwrite phone)
     await runForwardSync();
     expect(sportlinkData.phone).toBe('555-9999');
   });
   ```

5. **Database State Diagram Documentation**
   - Document all possible states and transitions
   - Helps developers understand bidirectional flow
   - Include in `.planning/research/ARCHITECTURE.md`

   ```
   State diagram:

   [User edits in Sportlink]
     ↓
   modified_by = 'user'
   forward_source_hash changes
     ↓
   [Forward sync detects change]
     ↓
   Updates Stadion
   modified_by = 'sync-forward'
   forward_last_synced_hash updated
     ↓
   [Reverse sync runs]
     ↓
   Sees modified_by = 'sync-forward'
   SKIPS (prevents loop)
   ```

**Detection:**
- Sync loops occur after database changes
- Forward sync reports false positives (no actual changes)
- Changes sync in wrong direction
- Database queries return unexpected results

**Which phase addresses this:**
- **Phase 1: Foundation** - Design and implement database schema changes
- **Phase 2: Timestamps** - Add bidirectional timestamp tracking
- **Phase 6: Testing** - Write comprehensive integration tests

## Moderate Pitfalls

### Pitfall 6: Session Management and Cookie Expiry

**What goes wrong:**
Sportlink login requires:
1. Username/password
2. TOTP 2FA code
3. Session cookie (expires after inactivity)

If reverse sync runs infrequently (e.g., hourly), session cookies expire. Next run fails authentication, sync stops.

**Prevention:**
- Re-authenticate for every reverse sync run (don't rely on persistent sessions)
- Use [Playwright's BrowserContext per run](https://playwright.dev/docs/api/class-browsercontext) (already implemented in `download-data-from-sportlink.js`)
- Log authentication failures clearly

```javascript
// In download-sportlink-reverse.js
async function updateSportlinkMember(member) {
  // Fresh browser context per sync run
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginToSportlink(page); // Fresh login each time
    await updateMemberFields(page, member);
  } finally {
    await browser.close(); // Clean up
  }
}
```

**Phase:** Phase 3 (Reverse Sync)

### Pitfall 7: Form Validation and Business Rules

**What goes wrong:**
Sportlink forms have client-side and server-side validation:
- Email format validation
- Phone number format (must match country)
- VOG date cannot be in the future
- Financial block requires admin privileges

Reverse sync bypasses client-side validation, but server-side validation still rejects invalid data.

**Prevention:**
- Validate data in reverse sync code before submitting
- Match Sportlink's validation rules exactly
- Handle validation errors gracefully

```javascript
// In reverse-sync-validation.js
function validateForSportlink(field, value) {
  switch (field) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new ValidationError('Invalid email format');
      }
      break;
    case 'phone':
      // Sportlink expects Netherlands format
      if (!/^(\+31|0)[0-9]{9}$/.test(value)) {
        throw new ValidationError('Phone must be Netherlands format');
      }
      break;
    case 'datum-vog':
      if (new Date(value) > new Date()) {
        throw new ValidationError('VOG date cannot be in future');
      }
      break;
  }
}
```

**Phase:** Phase 3 (Reverse Sync)

### Pitfall 8: Rate Limiting and Throttling

**What goes wrong:**
Stadion WordPress and Sportlink have undocumented rate limits. Reverse sync that updates 100 members in rapid succession may hit rate limits:
- Sportlink: Form submissions per minute
- Stadion: API requests per hour

**Prevention:**
- Add delay between member updates (e.g., 500ms)
- Batch updates (10 members per sync run)
- Respect HTTP 429 responses

```javascript
// In download-sportlink-reverse.js
const MEMBERS_PER_BATCH = 10;
const DELAY_BETWEEN_MEMBERS_MS = 500;

const membersToUpdate = getReverseSyncChanges(db);
const batch = membersToUpdate.slice(0, MEMBERS_PER_BATCH);

for (const member of batch) {
  await updateSportlinkMember(member);
  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MEMBERS_MS));
}
```

**Phase:** Phase 3 (Reverse Sync)

### Pitfall 9: Race Conditions on Concurrent Edits

**What goes wrong:**
User edits same member in both systems simultaneously:

```
09:00:00 - User A edits email in Sportlink
09:00:05 - User B edits phone in Stadion
09:00:10 - Forward sync starts reading Sportlink
09:00:15 - Reverse sync starts reading Stadion
09:00:20 - Forward sync writes to Stadion (email + old phone)
09:00:25 - Reverse sync writes to Sportlink (old email + phone)
Result: Both changes lost
```

**Prevention:**
- [Database-level uniqueness constraints](https://makandracards.com/makandra/13901-understanding-race-conditions-with-duplicate-unique-keys-in-rails) prevent duplicate writes
- [SELECT FOR UPDATE](https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/) locks rows during updates
- Grace period (5 minutes) reduces race window
- Per-field timestamps (Pitfall 4) minimize conflict scope

```javascript
// In stadion-db.js
function updateMemberWithLock(db, knvbId, updates) {
  const txn = db.transaction(() => {
    // Lock row for update
    const current = db.prepare(`
      SELECT * FROM stadion_members
      WHERE knvb_id = ?
    `).get(knvbId);

    // Apply only newer fields
    for (const [field, value] of Object.entries(updates)) {
      if (updates[`${field}_modified`] > current[`${field}_modified`]) {
        // This field is newer, update it
        db.prepare(`
          UPDATE stadion_members
          SET ${field} = ?, ${field}_modified = ?
          WHERE knvb_id = ?
        `).run(value, updates[`${field}_modified`], knvbId);
      }
    }
  });

  txn();
}
```

**Phase:** Phase 2 (Timestamps) and Phase 3 (Reverse Sync)

### Pitfall 10: Email Flood from Sync Failures

**What goes wrong:**
If reverse sync fails (selector broke, validation error, network issue), it sends failure email to operator. If it fails for 100 members, operator receives 100 emails.

Cron runs hourly = 100 emails/hour = 2,400 emails/day.

**Prevention:**
- Batch errors into single summary email
- Rate limit emails (max 1 per sync run)
- Escalate only after N consecutive failures

```javascript
// In scripts/sync.sh
const failures = [];

for (const member of membersToSync) {
  try {
    await updateSportlinkMember(member);
  } catch (error) {
    failures.push({ knvb_id: member.knvb_id, error: error.message });
  }
}

// Single summary email
if (failures.length > 0) {
  await sendEmail({
    subject: `Reverse Sync: ${failures.length} failures`,
    body: renderFailureSummary(failures)
  });
}

// Escalate only after 3 consecutive failures
const failureCount = getConsecutiveFailureCount(db);
if (failureCount >= 3) {
  await sendEmail({
    subject: 'URGENT: Reverse sync failing repeatedly',
    body: 'Manual intervention required'
  });
}
```

**Phase:** Phase 3 (Reverse Sync) and Phase 5 (Monitoring)

## Minor Pitfalls

### Pitfall 11: Photo Sync Timing

**What goes wrong:**
Current architecture downloads photos via HTTP URLs from Sportlink API. Reverse sync doesn't have photo URLs (Stadion stores uploaded photos).

If user uploads photo to Stadion, reverse sync can't push it to Sportlink (no API for photo upload).

**Prevention:**
- Document photos as one-way only (Sportlink → Stadion)
- If reverse photo sync needed, requires different approach:
  - Download photo from Stadion media library
  - Upload via Sportlink form file input
  - Much more complex than field updates

**Phase:** Phase 1 (Foundation) - Document scope exclusion

### Pitfall 12: Transaction Boundaries

**What goes wrong:**
SQLite updates span multiple operations:
1. Read current state
2. Compute hash
3. Call Sportlink/Stadion API
4. Update database

If step 3 fails, database is inconsistent (believes sync succeeded but it didn't).

**Prevention:**
- Only update database after confirmed API success
- Use SQLite transactions for multi-step updates
- Add retry logic with exponential backoff

```javascript
function syncMemberWithRetry(db, member, maxRetries = 3) {
  let attempt = 0;
  let lastError;

  while (attempt < maxRetries) {
    const txn = db.transaction(() => {
      try {
        // Call API
        const result = updateSportlinkAPI(member);

        // Only update DB if API succeeded
        if (result.success) {
          db.prepare(`
            UPDATE stadion_members
            SET reverse_last_synced_hash = reverse_source_hash,
                reverse_last_synced_at = ?
            WHERE knvb_id = ?
          `).run(new Date().toISOString(), member.knvb_id);
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        lastError = error;
        throw error; // Rollback transaction
      }
    });

    try {
      txn();
      return; // Success
    } catch (error) {
      attempt++;
      await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError}`);
}
```

**Phase:** Phase 3 (Reverse Sync)

### Pitfall 13: Field Mapping Inconsistencies

**What goes wrong:**
Sportlink uses different field names than Stadion:
- Sportlink: `email_contact`
- Stadion ACF: `email`
- SQLite: `contact_email`

Mapping errors cause wrong field updates or data loss.

**Prevention:**
- Centralize field mapping in `field-mapping.json` (already exists for forward sync)
- Add reverse mapping section
- Validate mappings in tests

```json
// field-mapping.json
{
  "forward": {
    "sportlink_field": "stadion_acf_field"
  },
  "reverse": {
    "email": {
      "stadion": "email",
      "sportlink": "email_contact",
      "sportlinkPage": "/general",
      "sportlinkSelector": "input[name='email']"
    },
    "datum-vog": {
      "stadion": "datum-vog",
      "sportlink": "vog_expiry_date",
      "sportlinkPage": "/other",
      "sportlinkSelector": "input[name='vog_date']"
    }
  }
}
```

**Phase:** Phase 1 (Foundation)

### Pitfall 14: Logging Verbosity

**What goes wrong:**
Reverse sync adds significant logging (authentication, navigation, form filling, verification). Log files grow rapidly:
- Forward sync: ~50KB per run
- Reverse sync: ~500KB per run (10x larger)
- Daily logs: 12MB (24 runs)
- Monthly logs: 360MB

**Prevention:**
- Use `verbose` mode judiciously (only for debugging)
- Rotate logs more aggressively (weekly instead of monthly)
- Separate reverse sync logs from forward sync logs

```javascript
// lib/logger.js modification
function createSyncLogger({ verbose, logType = 'forward' }) {
  const logDir = path.join(process.cwd(), 'logs', logType);
  ensureDir(logDir);

  const logPath = path.join(logDir, `sync-${date}.log`);
  // ... existing logger code
}

// In sync-reverse.js
const logger = createSyncLogger({
  verbose: false,  // Default to quiet
  logType: 'reverse'
});
```

**Phase:** Phase 3 (Reverse Sync)

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: Foundation | Infinite sync loops (Pitfall 1) | **MUST** implement origin tracking (`modified_by`) and hash-based deduplication before any reverse sync code |
| Phase 2: Timestamps | Clock drift (Pitfall 2) | Implement UTC normalization and 5-minute grace period; verify NTP on production server |
| Phase 3: Reverse Sync | Browser automation fragility (Pitfall 3) | Use resilient selectors with fallbacks; add form submission verification |
| Phase 3: Reverse Sync | State tracking complexity (Pitfall 5) | Clear naming convention (`forward_*` vs `reverse_*`); separate functions per direction |
| Phase 4: Testing | Missing integration tests | Test forward-then-reverse-then-forward sequence; verify no loops |
| Phase 5: Monitoring | Silent failures (Pitfalls 3, 4) | Screenshot diffing, conflict detection, audit trail |
| Phase 6: Production | All pitfalls at once | Comprehensive monitoring before enabling automated reverse sync |

## Domain-Specific Anti-Patterns

### Anti-Pattern 1: Treating Bidirectional Sync as "Two One-Way Syncs"

**Why it fails:**
[Two one-way pipelines introduce fundamental architectural flaws](https://www.stacksync.com/blog/the-engineering-challenges-of-bi-directional-sync-why-two-one-way-pipelines-fail) because they don't coordinate. Each pipeline:
- Doesn't know the other exists
- Has independent state tracking
- Can't prevent loops
- Creates race conditions

**Instead:**
Design bidirectional sync as unified system with:
- Shared state tracking (single SQLite database)
- Origin tracking (`modified_by` field)
- Coordinated scheduling (never run simultaneously)
- Central conflict resolution logic

### Anti-Pattern 2: Assuming Clock Synchronization

**Why it fails:**
[Timestamps are not a reliable resolution mechanism in distributed systems](https://www.geeksforgeeks.org/distributed-systems/clock-synchronization-in-distributed-system/). [Clock drift](https://scalardynamic.com/resources/articles/21-when-logs-lie-how-clock-drift-skews-reality-and-breaks-systems) is inevitable:
- NTP provides 100-250ms accuracy at best
- Server reboots introduce minutes of drift
- WordPress timezone settings add confusion
- Network latency affects timestamp capture

**Instead:**
- Always normalize timestamps to UTC
- Add 5-minute grace period for comparisons
- Log actual timestamps for debugging
- Monitor clock drift on production server

### Anti-Pattern 3: Relying on Stable Selectors

**Why it fails:**
[Selectors tied to DOM hierarchy are fragile](https://ghostinspector.com/blog/css-selector-strategies-automated-browser-testing/). Sportlink has no `data-test` attributes, no stable IDs, no automation-friendly design.

**Instead:**
- Multiple fallback selectors per field
- Visual regression testing (screenshot diffing)
- Form submission verification
- Graceful degradation on failure

### Anti-Pattern 4: Ignoring Update Conflicts

**Why it fails:**
["What are the odds of that happening?" is not a strategy](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices). In production:
- Admins edit members frequently
- Sync runs 4x daily (forward) + 1x daily (reverse)
- 500+ members = high probability of concurrent edits
- Batch operations increase conflict likelihood

**Instead:**
- Per-field timestamps
- Conflict detection and alerting
- Audit trail for lost updates
- Manual resolution workflow

## Sources

Bidirectional Sync:
- [The Engineering Challenges of Bi-Directional Sync: Why Two One-Way Pipelines Fail](https://www.stacksync.com/blog/the-engineering-challenges-of-bi-directional-sync-why-two-one-way-pipelines-fail)
- [Two-Way Sync Demystified: Key Principles And Best Practices](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices)

Infinite Loop Prevention:
- [How to prevent infinite loops in bi-directional data syncs | Workato](https://www.workato.com/product-hub/how-to-prevent-infinite-loops-in-bi-directional-data-syncs/)
- [How To Stop Infinite Loops In Bidirectional Syncs — Valence](https://docs.valence.app/en/latest/guides/stop-infinite-loops.html)
- [The Infinite Loop Trap: How to Prevent Your Integration from Talking to Itself](https://www.ambientia.fi/en/news/the-infinite-loop-trap-how-to-prevent-your-integration-from-talking-to-itself)

Clock Synchronization:
- [Clock Synchronization in Distributed Systems - GeeksforGeeks](https://www.geeksforgeeks.org/distributed-systems/clock-synchronization-in-distributed-system/)
- [When Logs Lie: How Clock Drift Skews Reality and Breaks Systems | Scalar Dynamic](https://scalardynamic.com/resources/articles/21-when-logs-lie-how-clock-drift-skews-reality-and-breaks-systems)

Last-Write-Wins:
- [Conflict Resolution: Using Last-Write-Wins vs. CRDTs](https://dzone.com/articles/conflict-resolution-using-last-write-wins-vs-crdts)
- [Last Writer Wins in Distributed Systems](https://www.numberanalytics.com/blog/last-writer-wins-distributed-systems)
- [Last Write Wins - A Conflict resolution strategy - DEV Community](https://dev.to/danyson/last-write-wins-a-conflict-resolution-strategy-2al6)

Browser Automation:
- [CSS Selector Cheat Sheet for Automated Browser Testing](https://ghostinspector.com/blog/css-selector-strategies-automated-browser-testing/)
- [Playwright vs Puppeteer: Which to choose in 2026? | BrowserStack](https://www.browserstack.com/guide/playwright-vs-puppeteer)
- [Managing Cookies using Playwright | BrowserStack](https://www.browserstack.com/guide/playwright-cookies)
- [Authentication | Playwright](https://playwright.dev/docs/auth)

Race Conditions:
- [Understanding race conditions with duplicate unique keys in Rails - makandra dev](https://makandracards.com/makandra/13901-understanding-race-conditions-with-duplicate-unique-keys-in-rails)
- [Preventing Postgres SQL Race Conditions with SELECT FOR UPDATE](https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/)
- [Avoiding race conditions using MySQL locks | Engineering Blog | Kraken](https://engineering.kraken.tech/news/2025/01/20/mysql-race-conditions.html)

WordPress ACF Timestamps:
- [ACF Pro field time are not taking timezone · Issue #252 · AdvancedCustomFields/acf](https://github.com/AdvancedCustomFields/acf/issues/252)
- [Date Picker fields in Repeaters gone wrong after WP 5.3 update - ACF Support](https://support.advancedcustomfields.com/forums/topic/date-picker-fields-in-repeaters-gone-gone-wrong-after-wp-5-3-update/)
- [ACF | Date Time Picker](https://www.advancedcustomfields.com/resources/date-time-picker/)
