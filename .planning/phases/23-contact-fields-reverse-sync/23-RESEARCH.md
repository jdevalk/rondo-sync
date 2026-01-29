# Phase 23: Contact Fields Reverse Sync - Research

**Researched:** 2026-01-29
**Domain:** Playwright browser automation for form filling and verification
**Confidence:** HIGH

## Summary

This phase implements reverse sync of contact field corrections (email, email2, mobile, phone) from Stadion to Sportlink using browser automation. Phase 22 already detects changes and stores them in `stadion_change_detections` table. This phase focuses on pushing those changes to Sportlink's /general edit page via Playwright automation. The system must navigate to each member's edit page, fill contact fields, submit, verify the save, and update timestamps to prevent re-sync loops.

The standard approach is:
1. Query `stadion_change_detections` for contact field changes (email, email2, mobile, phone)
2. Group changes by member (knvb_id) for batch efficiency
3. For each member: login → navigate to /general page → enter edit mode → fill fields → submit → verify save
4. On success: update `forward_modified` timestamp in stadion_members to prevent sync loop
5. On failure: retry with exponential backoff (3 attempts max)
6. Generate email report with summary or field-level detail based on config

**Primary recommendation:** Use Playwright page automation with existing login pattern from download-data-from-sportlink.js, implement retry logic with exponential backoff, verify saves by reading back field values with `inputValue()`, and integrate reporting into existing sync-people.js email flow.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright | existing | Browser automation with Chromium | Already used for Sportlink login and download automation |
| lib/detect-stadion-changes.js | existing | Change detection returns array of changes | Phase 22 infrastructure provides input data |
| lib/stadion-db.js | existing | SQLite operations for state tracking | Stores timestamps, tracks sync state |
| lib/stadion-client.js | existing | Stadion API client for updating timestamps | Updates forward_modified after successful sync |
| lib/logger.js | existing | Dual-stream logging (stdout + file) | Standard logging pattern for all sync operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| otplib | existing | TOTP generation for 2FA | Sportlink login requires OTP |
| crypto (built-in) | Node.js | Random delays, jitter for retry backoff | Prevents thundering herd on retry |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright browser automation | Sportlink API (if available) | No documented API for member edits; browser automation is only option |
| Sequential processing with delays | Parallel processing | Sequential is safer for form automation, avoids session conflicts, easier to debug |
| Read-back verification | Trust form submission | Read-back catches validation errors and provides proof of save |

**Installation:**
No new dependencies required - all libraries already present.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── reverse-sync-sportlink.js  # NEW: Reverse sync logic module
├── detect-stadion-changes.js  # Existing: Phase 22 change detection
├── stadion-db.js               # Existing: Database operations
└── logger.js                   # Existing: Logging

reverse-sync-contact-fields.js  # NEW: CLI wrapper + main function
```

### Pattern 1: Reuse Login Flow from Existing Sportlink Automation
**What:** Extract and reuse login sequence from download-data-from-sportlink.js
**When to use:** Every reverse sync run requires authenticated session
**Example:**
```javascript
// Source: download-data-from-sportlink.js (lines 52-96)
const { chromium } = require('playwright');
const otplib = require('otplib');

async function loginToSportlink(page, username, password, otpSecret, options = {}) {
  const { logger, verbose } = options;
  const logDebug = verbose ? console.log : () => {};

  await page.goto('https://club.sportlink.com/', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login');

  await page.waitForSelector('#otp', { timeout: 20000 });
  const otpCode = await otplib.generate({ secret: otpSecret });
  await page.fill('#otp', otpCode);
  await page.click('#kc-login');

  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#panelHeaderTasks', { timeout: 30000 });

  logger?.verbose('Login successful');
}
```

### Pattern 2: Form Fill with Read-Back Verification
**What:** Fill form field, submit, then read value back to verify save
**When to use:** Every field update on Sportlink /general page
**Example:**
```javascript
// Fill field
await page.fill('#email', 'newemail@example.com');

// Submit form (method depends on Sportlink UI)
await page.click('#btnSave');

// Wait for save confirmation (network idle or success message)
await page.waitForLoadState('networkidle', { timeout: 10000 });

// Read back to verify
const savedValue = await page.inputValue('#email');
if (savedValue !== 'newemail@example.com') {
  throw new Error('Field value not saved correctly');
}
```

**Sources:**
- [Playwright input actions documentation](https://playwright.dev/docs/input)
- [How do I check the value inside an input field with Playwright?](https://playwrightsolutions.com/how-do-i-check-the-value-inside-an-input-field-with-playwright/)
- [Form automation with Playwright guide](https://blog.apify.com/playwright-how-to-automate-forms/)

### Pattern 3: Exponential Backoff Retry Logic
**What:** Retry failed operations with increasing delays between attempts
**When to use:** Form submission failures, network timeouts, validation errors
**Example:**
```javascript
async function syncMemberWithRetry(knvbId, fieldUpdates, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await syncMember(knvbId, fieldUpdates);
      return { success: true, attempts: attempt + 1 };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        return {
          success: false,
          attempts: attempt + 1,
          error: error.message
        };
      }

      // Exponential backoff: 2^attempt seconds + random jitter
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      logger.verbose(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Sources:**
- [Playwright retry feature discussion](https://github.com/microsoft/playwright/issues/28857)
- [Effective Error Handling and Retries in Playwright Tests](https://www.neovasolutions.com/2024/08/15/effective-error-handling-and-retries-in-playwright-tests/)
- [Polly Retry resilience strategy](https://www.pollydocs.org/strategies/retry.html)

### Pattern 4: Batch Members, Process Sequentially
**What:** Group field changes by member, process members one at a time
**When to use:** Always - safer for form automation, easier debugging
**Example:**
```javascript
// Group changes by member
const memberChanges = new Map();
for (const change of detectedChanges) {
  if (!memberChanges.has(change.knvb_id)) {
    memberChanges.set(change.knvb_id, []);
  }
  memberChanges.get(change.knvb_id).push(change);
}

// Process sequentially with small delay between members
const results = [];
for (const [knvbId, changes] of memberChanges) {
  const result = await syncMemberWithRetry(knvbId, changes);
  results.push({ knvb_id: knvbId, ...result });

  // Small delay to avoid rate limiting (1-2 seconds)
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
}
```

**Sources:**
- [Rate Limiting Strategies for Serverless Applications](https://aws.amazon.com/blogs/architecture/rate-limiting-strategies-for-serverless-applications/)
- [Batch Processing Best Practices](https://www.acceldata.io/blog/batch-processing-demystified-tools-challenges-and-solutions)

### Pattern 5: Update forward_modified Timestamp After Successful Sync
**What:** After pushing to Sportlink, update stadion_members timestamps to prevent loop
**When to use:** After every successful field update in Sportlink
**Example:**
```javascript
// After successful sync to Sportlink
const now = new Date().toISOString();

// Update per-field timestamps for synced fields
for (const change of syncedChanges) {
  const timestampColumn = `${change.field_name}_sportlink_modified`;

  db.prepare(`
    UPDATE stadion_members
    SET ${timestampColumn} = ?
    WHERE knvb_id = ?
  `).run(now, change.knvb_id);
}

// Also update sync_origin to indicate this was a reverse sync
db.prepare(`
  UPDATE stadion_members
  SET sync_origin = 'sync_stadion_to_sportlink'
  WHERE knvb_id = ?
`).run(change.knvb_id);
```

**Sources:**
- Phase 20-01 implementation (lib/stadion-db.js lines 316-323)
- Phase 22 change detection filtering logic

### Anti-Patterns to Avoid
- **Parallel processing of members:** Risks session conflicts, harder to debug, no significant speed benefit
- **Skipping read-back verification:** Sportlink may reject values silently (validation, permissions)
- **Fixed retry delays:** Use exponential backoff + jitter to prevent thundering herd
- **Not updating timestamps on success:** Creates sync loops where same change is pushed repeatedly
- **Assuming form fields match detection field names:** Map detection field names (email, mobile) to Sportlink form IDs

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser automation | Custom HTTP requests or Selenium | Playwright (already in use) | Sportlink has no documented API; Playwright already used successfully for login/download |
| Login flow | New authentication logic | Extract from download-data-from-sportlink.js | Proven working pattern with OTP handling |
| Retry logic | Simple loop with fixed delay | Exponential backoff with jitter | Prevents thundering herd, standard pattern for distributed systems |
| Change detection | Re-query Stadion API | Use Phase 22 detectChanges() | Already implemented, tested, and efficient |
| Email reporting | Custom HTML generation | Extend scripts/send-email.js formatAsHtml() | Already handles sync summaries with proper formatting |

**Key insight:** The existing codebase has mature patterns for Sportlink automation, retry logic, and reporting. The main task is orchestrating these patterns for the reverse direction.

## Common Pitfalls

### Pitfall 1: Form Field IDs May Not Match Detection Field Names
**What goes wrong:** Code tries to fill `#email` but Sportlink uses `#memberEmail`
**Why it happens:** Sportlink's internal field naming doesn't match our schema
**How to avoid:** Create explicit mapping between detection field names and Sportlink form IDs
**Warning signs:** TimeoutError waiting for selector that doesn't exist

**Example mapping:**
```javascript
const SPORTLINK_FIELD_MAP = {
  'email': '#email',           // Need to verify actual IDs from Sportlink
  'email2': '#email2',
  'mobile': '#mobile',
  'phone': '#telephone'
};

// Use in code
const formFieldId = SPORTLINK_FIELD_MAP[change.field_name];
await page.fill(formFieldId, change.new_value);
```

**Recommendation:** Manually inspect Sportlink /general edit page to identify correct field IDs before implementation.

### Pitfall 2: Edit Mode Must Be Activated Before Fields Are Editable
**What goes wrong:** Fields are disabled, fill() doesn't update value
**Why it happens:** Sportlink /general page shows read-only view by default
**How to avoid:** Click "Edit" button or equivalent before filling fields
**Warning signs:** inputValue() returns old value after fill(), no errors thrown

**Example:**
```javascript
// Navigate to member's /general page
await page.goto(`https://club.sportlink.com/member/${memberId}/general`);

// Enter edit mode
await page.click('#btnEdit'); // Need to verify actual button ID
await page.waitForSelector('#email:not([disabled])', { timeout: 5000 });

// Now fields are editable
await page.fill('#email', newEmail);
```

### Pitfall 3: Save Confirmation May Not Be Obvious
**What goes wrong:** Form submits but code continues before save completes
**Why it happens:** Sportlink may use AJAX submit without page reload
**How to avoid:** Wait for network idle, success message, or form to return to read-only mode
**Warning signs:** Read-back shows old value, changes don't persist

**Example verification strategies:**
```javascript
// Strategy 1: Wait for network idle
await page.click('#btnSave');
await page.waitForLoadState('networkidle', { timeout: 10000 });

// Strategy 2: Wait for success message
await page.click('#btnSave');
await page.waitForSelector('.success-message', { timeout: 5000 });

// Strategy 3: Wait for form to return to read-only mode
await page.click('#btnSave');
await page.waitForSelector('#email[disabled]', { timeout: 5000 });

// Always read back to verify
const saved = await page.inputValue('#email');
if (saved !== expectedValue) {
  throw new Error('Save failed: value not persisted');
}
```

**Sources:**
- [Understanding Different Types of Playwright Wait](https://www.browserstack.com/guide/playwright-wait-types)
- [Playwright Auto-waiting documentation](https://playwright.dev/docs/actionability)
- [Finding a Solution to Wait for Form Submission Completion](https://ray.run/discord-forum/threads/115137-waiting-for-form-submission-to-complete)

### Pitfall 4: Not Clearing detection_run_id After Successful Sync
**What goes wrong:** Same changes are synced repeatedly on every run
**Why it happens:** No mechanism to mark changes as "synced" in stadion_change_detections
**How to avoid:** Track sync state in stadion_change_detections or query only recent detections
**Warning signs:** Log shows same members syncing every run despite no new changes

**Solution options:**
```javascript
// Option 1: Add synced_at column to stadion_change_detections
db.exec(`
  ALTER TABLE stadion_change_detections
  ADD COLUMN synced_at TEXT
`);

// Mark as synced after successful push
db.prepare(`
  UPDATE stadion_change_detections
  SET synced_at = ?
  WHERE knvb_id = ? AND field_name = ? AND synced_at IS NULL
`).run(now, knvbId, fieldName);

// Query only unsynced changes
const unsyncedChanges = db.prepare(`
  SELECT * FROM stadion_change_detections
  WHERE synced_at IS NULL
  ORDER BY detected_at ASC
`).all();
```

**Alternative:** Query changes detected after last successful reverse sync run (store in reverse_sync_state).

### Pitfall 5: Verbose Logging Leaks Sensitive Data in Email Reports
**What goes wrong:** Email report shows personal phone numbers, email addresses in field-level detail
**Why it happens:** Field-level logging includes old_value → new_value
**How to avoid:** Control verbosity with environment variable, default to summary only
**Warning signs:** Operator email contains PII that shouldn't be broadly shared

**Example implementation:**
```javascript
// Read from .env or config
const REVERSE_SYNC_DETAIL = process.env.REVERSE_SYNC_DETAIL || 'summary';

// Summary report (default - safe for email)
if (REVERSE_SYNC_DETAIL === 'summary') {
  logger.log(`Reverse sync complete: ${successCount} members updated, ${failureCount} failed`);
}

// Field-level detail (opt-in for debugging)
if (REVERSE_SYNC_DETAIL === 'detailed') {
  for (const result of results) {
    logger.log(`  ${result.knvb_id}:`);
    for (const change of result.changes) {
      logger.log(`    - ${change.field_name}: "${change.old_value}" → "${change.new_value}"`);
    }
  }
}
```

## Code Examples

Verified patterns from official sources and existing codebase:

### Extract Changes Needing Reverse Sync
```javascript
// Source: Phase 22 implementation (lib/detect-stadion-changes.js)
const { detectChanges } = require('./lib/detect-stadion-changes');
const { openDb, getChangeDetections } = require('./lib/stadion-db');

async function getContactFieldChanges(options = {}) {
  const db = openDb();

  // Query unsynced changes for contact fields only
  const stmt = db.prepare(`
    SELECT *
    FROM stadion_change_detections
    WHERE field_name IN ('email', 'email2', 'mobile', 'phone')
      AND synced_at IS NULL
    ORDER BY detected_at ASC
  `);

  const changes = stmt.all();
  db.close();

  return changes;
}

// Group by member for batch processing
function groupChangesByMember(changes) {
  const grouped = new Map();

  for (const change of changes) {
    if (!grouped.has(change.knvb_id)) {
      grouped.set(change.knvb_id, []);
    }
    grouped.get(change.knvb_id).push(change);
  }

  return grouped;
}
```

### Sync Single Member to Sportlink with Retry
```javascript
// Source: Existing patterns from download-data-from-sportlink.js + Playwright best practices
const { chromium } = require('playwright');
const otplib = require('otplib');

async function syncMemberToSportlink(page, knvbId, fieldChanges, options = {}) {
  const { logger } = options;

  // Map detection field names to Sportlink form IDs
  const FIELD_MAP = {
    'email': '#email',        // VERIFY these selectors against actual Sportlink UI
    'email2': '#email2',
    'mobile': '#mobile',
    'phone': '#telephone'
  };

  // Navigate to member's /general page
  const memberUrl = `https://club.sportlink.com/member/${knvbId}/general`;
  logger?.verbose(`Navigating to ${memberUrl}`);
  await page.goto(memberUrl, { waitUntil: 'domcontentloaded' });

  // Enter edit mode (VERIFY selector against actual Sportlink UI)
  await page.click('#btnEdit');
  await page.waitForSelector('#email:not([disabled])', { timeout: 5000 });

  // Fill each changed field
  const verifications = [];
  for (const change of fieldChanges) {
    const selector = FIELD_MAP[change.field_name];
    if (!selector) {
      logger?.error(`Unknown field: ${change.field_name}`);
      continue;
    }

    await page.fill(selector, change.new_value || '');
    logger?.verbose(`Filled ${change.field_name}: ${change.new_value}`);

    verifications.push({
      field: change.field_name,
      selector: selector,
      expected: change.new_value
    });
  }

  // Submit form (VERIFY selector against actual Sportlink UI)
  await page.click('#btnSave');

  // Wait for save to complete
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // Verify all fields saved correctly
  for (const verify of verifications) {
    const saved = await page.inputValue(verify.selector);
    if (saved !== verify.expected) {
      throw new Error(
        `Field ${verify.field} verification failed: ` +
        `expected "${verify.expected}", got "${saved}"`
      );
    }
  }

  logger?.verbose(`Successfully synced ${fieldChanges.length} fields for ${knvbId}`);
}

async function syncMemberWithRetry(page, knvbId, fieldChanges, options = {}) {
  const { logger, maxRetries = 3 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await syncMemberToSportlink(page, knvbId, fieldChanges, options);
      return { success: true, attempts: attempt + 1 };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        logger?.error(`Failed after ${maxRetries} attempts: ${error.message}`);
        return {
          success: false,
          attempts: attempt + 1,
          error: error.message
        };
      }

      // Exponential backoff with jitter
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delay = Math.round(baseDelay + jitter);

      logger?.verbose(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Update Timestamps After Successful Sync
```javascript
// Source: Phase 20 implementation pattern
const { openDb } = require('./lib/stadion-db');

function updateTimestampsAfterSync(knvbId, syncedFields) {
  const db = openDb();
  const now = new Date().toISOString();

  try {
    // Use transaction for atomicity
    db.transaction(() => {
      // Update per-field timestamps
      for (const fieldName of syncedFields) {
        const column = `${fieldName}_sportlink_modified`;

        db.prepare(`
          UPDATE stadion_members
          SET ${column} = ?
          WHERE knvb_id = ?
        `).run(now, knvbId);
      }

      // Update sync_origin
      db.prepare(`
        UPDATE stadion_members
        SET sync_origin = 'sync_stadion_to_sportlink'
        WHERE knvb_id = ?
      `).run(knvbId);

      // Mark changes as synced in detection table
      const placeholders = syncedFields.map(() => '?').join(',');
      db.prepare(`
        UPDATE stadion_change_detections
        SET synced_at = ?
        WHERE knvb_id = ?
          AND field_name IN (${placeholders})
          AND synced_at IS NULL
      `).run(now, knvbId, ...syncedFields);
    })();
  } finally {
    db.close();
  }
}
```

### Main Reverse Sync Flow
```javascript
// Source: Existing sync patterns from sync-people.js
const { chromium } = require('playwright');
const { createSyncLogger } = require('./lib/logger');
const { openDb } = require('./lib/stadion-db');

async function runReverseSync(options = {}) {
  const { verbose = false, logger: providedLogger } = options;
  const logger = providedLogger || createSyncLogger({ verbose });

  let browser;
  try {
    // Get changes needing sync
    const changes = await getContactFieldChanges();
    if (changes.length === 0) {
      logger.log('No contact field changes to sync');
      return { success: true, synced: 0, failed: 0 };
    }

    const memberChanges = groupChangesByMember(changes);
    logger.log(`Syncing ${memberChanges.size} members (${changes.length} field changes)`);

    // Launch browser and login
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginToSportlink(page,
      process.env.SPORTLINK_USERNAME,
      process.env.SPORTLINK_PASSWORD,
      process.env.SPORTLINK_OTP_SECRET,
      { logger, verbose }
    );

    // Process each member sequentially
    const results = [];
    for (const [knvbId, fieldChanges] of memberChanges) {
      const result = await syncMemberWithRetry(page, knvbId, fieldChanges, {
        logger,
        maxRetries: 3
      });

      if (result.success) {
        // Update timestamps to prevent re-sync
        const syncedFields = fieldChanges.map(c => c.field_name);
        updateTimestampsAfterSync(knvbId, syncedFields);
      }

      results.push({ knvb_id: knvbId, ...result, changes: fieldChanges });

      // Small delay between members
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    logger.log(`Reverse sync complete: ${successCount} synced, ${failureCount} failed`);

    return {
      success: failureCount === 0,
      synced: successCount,
      failed: failureCount,
      results: results
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { runReverseSync };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');

  runReverseSync({ verbose })
    .then(result => {
      process.exitCode = result.success ? 0 : 1;
    })
    .catch(err => {
      console.error('Reverse sync failed:', err.message);
      process.exitCode = 1;
    });
}
```

### Email Report Integration
```javascript
// Source: sync-people.js pattern (lines 33-90)
// Add reverse sync section to existing sync report

async function generateReportWithReverseSync(options = {}) {
  const { logger } = options;

  // Run forward sync (existing)
  const forwardResult = await runForwardSync(options);

  // Run reverse sync (new)
  const reverseResult = await runReverseSync(options);

  // Log reverse sync summary
  logger.log('');
  logger.log('REVERSE SYNC (STADION → SPORTLINK)');
  logger.log('--------');

  if (reverseResult.synced === 0 && reverseResult.failed === 0) {
    logger.log('No changes to sync');
  } else {
    logger.log(`Synced: ${reverseResult.synced} members`);
    logger.log(`Failed: ${reverseResult.failed} members`);

    // Field-level detail if enabled
    const detailLevel = process.env.REVERSE_SYNC_DETAIL || 'summary';
    if (detailLevel === 'detailed' && reverseResult.results) {
      logger.log('');
      logger.log('FIELD-LEVEL CHANGES');
      for (const result of reverseResult.results) {
        logger.log(`- ${result.knvb_id}: ${result.changes.length} fields ${result.success ? 'synced' : 'FAILED'}`);
        if (detailLevel === 'detailed') {
          for (const change of result.changes) {
            logger.log(`    ${change.field_name}: "${change.old_value}" → "${change.new_value}"`);
          }
        }
      }
    }
  }

  // Existing email delivery
  // scripts/send-email.js will format all logged output into HTML
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No reverse sync | Bidirectional sync with conflict detection | Phase 20-22 | Stadion can now be authoritative for contact corrections |
| Manual form filling | Playwright browser automation | 2020+ | Reliable, testable, works without API |
| Fixed retry delays | Exponential backoff with jitter | Cloud-native best practice | Prevents thundering herd, better failure handling |
| Playwright fill() | fill() + inputValue() verification | 2024+ | Catches validation failures and save issues early |
| Global try/catch | Per-member retry with exponential backoff | Modern resilience pattern | Partial failures don't block entire sync |

**Deprecated/outdated:**
- Selenium WebDriver: Replaced by Playwright (better API, faster, more reliable)
- Fixed delays between operations: Use auto-waiting and exponential backoff
- Trusting form submission without verification: Always read back to verify save
- Parallel browser sessions for batch processing: Sequential is safer and easier to debug

## Open Questions

1. **Sportlink Form Field Selectors**
   - What we know: /general page has contact fields in edit mode
   - What's unclear: Exact CSS selectors for email, email2, mobile, phone fields and edit/save buttons
   - Recommendation: Manual inspection of Sportlink /general edit page before implementation, document selectors in FIELD_MAP constant

2. **Edit Mode Activation Method**
   - What we know: Sportlink shows read-only view by default
   - What's unclear: How to enter edit mode (button click? URL parameter? JavaScript?)
   - Recommendation: Inspect Sportlink UI, test with manual browser automation, document in pitfall section

3. **Save Confirmation Strategy**
   - What we know: Form submits to save changes
   - What's unclear: Does Sportlink use page reload, AJAX, or instant update? What success indicator exists?
   - Recommendation: Test multiple strategies (networkidle, success message selector, disabled state), use most reliable

4. **Partial Field Update Support**
   - What we know: Member may have changes to only 1-2 contact fields
   - What's unclear: Can we save individual fields or must we load/save all contact fields together?
   - Recommendation: Load all current values first, update only changed fields, save form (safest approach)

5. **Member ID Format for URL Navigation**
   - What we know: Need to navigate to specific member's /general page
   - What's unclear: Does Sportlink use KNVB ID, internal member ID, or other identifier in URL?
   - Recommendation: Inspect URL structure when viewing member in Sportlink, may need to search by KNVB ID first

6. **Sync Frequency**
   - What we know: Detection runs daily (matches nikki sync)
   - What's unclear: Should reverse sync run daily, 4x daily (like people sync), or on-demand?
   - Recommendation: Start with daily (matches detection frequency), can increase if needed

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns:
  - download-data-from-sportlink.js - Sportlink login flow (lines 52-96)
  - lib/detect-stadion-changes.js - Change detection API (complete file)
  - lib/stadion-db.js - Database schema and timestamp tracking (lines 316-323)
  - sync-people.js - Email report generation pattern (lines 33-90)
  - scripts/send-email.js - HTML formatting for reports (complete file)
- Phase 20-01 PLAN.md - Per-field timestamp schema
- Phase 22 RESEARCH.md - Change detection patterns

### Secondary (MEDIUM confidence)
- [Playwright Actions Documentation](https://playwright.dev/docs/input) - Form filling and input methods
- [Playwright Auto-waiting](https://playwright.dev/docs/actionability) - Wait strategies
- [How to check input field values in Playwright](https://playwrightsolutions.com/how-do-i-check-the-value-inside-an-input-field-with-playwright/)
- [Form automation with Playwright guide](https://blog.apify.com/playwright-how-to-automate-forms/)
- [Understanding Playwright Wait Types 2026](https://www.browserstack.com/guide/playwright-wait-types)
- [Effective Error Handling and Retries in Playwright](https://www.neovasolutions.com/2024/08/15/effective-error-handling-and-retries-in-playwright-tests/)
- [Playwright exponential backoff feature request](https://github.com/microsoft/playwright/issues/28857)
- [Rate Limiting Strategies (AWS Architecture Blog)](https://aws.amazon.com/blogs/architecture/rate-limiting-strategies-for-serverless-applications/)
- [Batch Processing Best Practices](https://www.acceldata.io/blog/batch-processing-demystified-tools-challenges-and-solutions)

### Tertiary (LOW confidence)
- Sportlink Club documentation - General product info, no specific API or automation docs found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright already in use, all other libraries present
- Architecture: HIGH - Direct reuse of existing Sportlink automation pattern, established retry patterns
- Pitfalls: MEDIUM - Sportlink UI selectors need verification, rest is based on Playwright best practices
- Form selectors: LOW - Need manual inspection of Sportlink /general page to confirm

**Research date:** 2026-01-29
**Valid until:** 60 days (Playwright API stable, Sportlink UI may change requiring selector updates)
