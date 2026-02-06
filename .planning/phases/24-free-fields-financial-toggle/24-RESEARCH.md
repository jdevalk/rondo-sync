# Phase 24: Free Fields & Financial Toggle Reverse Sync - Research

**Researched:** 2026-01-29
**Domain:** Multi-page browser automation for reverse sync across /general, /other, and /financial pages
**Confidence:** HIGH

## Summary

Phase 24 extends reverse sync to the remaining target fields: datum-vog and freescout-id (from Stadion to Sportlink /other page) and financiele-blokkade toggle (from Stadion to Sportlink /financial page). This completes the bidirectional sync infrastructure for all 7 tracked fields.

The key technical challenge is **multi-page navigation within a single browser session**. Phase 23 only required visiting the /general page. Phase 24 requires navigating to potentially three pages per member (/general, /other, /financial) while maintaining session state and implementing fail-fast logic to prevent partial updates.

The standard approach is:
1. Group detected changes by member and determine which pages each member needs (not all members have changes on all pages)
2. Login once, then for each member: visit needed pages in order (/general → /other → /financial)
3. If any page fails after retries, skip the entire member (fail-fast prevents partial state)
4. On session timeout detection (redirect to login), re-authenticate and continue with next member
5. Update Sportlink timestamps only after ALL pages for a member succeed

**Primary recommendation:** Extend Phase 23's infrastructure with multi-page navigation logic, add page-specific field mappings, implement session timeout detection via URL monitoring, and run on separate 15-minute cron schedule as specified in requirements.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright | existing | Browser automation with Chromium | Already proven for Phase 23 contact field sync |
| lib/reverse-sync-sportlink.js | existing | Reverse sync orchestration and retry logic | Phase 23 foundation to build upon |
| lib/stadion-db.js | existing | Change detection query and timestamp updates | Already tracking all field changes from Phase 22 |
| lib/detect-stadion-changes.js | existing | Detects changes for datum-vog, freescout-id, financiele-blokkade | Phase 22 infrastructure provides detection |
| lib/logger.js | existing | Logging infrastructure | Standard pattern for all sync operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| otplib | existing | TOTP 2FA for Sportlink login | Re-authentication on session timeout |
| scripts/sync.sh | existing | Unified sync wrapper with flock locking | Wrap new reverse sync schedule |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sequential page visits per member | Visit all /general pages, then all /other pages | Sequential per-member prevents partial state, easier to verify |
| Fail-fast on page error | Partial updates with rollback | No rollback mechanism in Sportlink; fail-fast is safer |
| Session timeout retry | Abandon member on timeout | Re-auth and continue prevents wasting work already done |

**Installation:**
No new dependencies required - all infrastructure exists from Phase 23.

## Architecture Patterns

### Recommended Project Structure
```
lib/
└── reverse-sync-sportlink.js  # MODIFY: Add multi-page sync logic

reverse-sync-free-fields.js    # NEW: CLI wrapper for new fields (optional - could extend existing)

.planning/phases/24-free-fields-financial-toggle/
├── 24-CONTEXT.md
├── 24-RESEARCH.md (this file)
└── 24-PLAN.md (to be created by planner)
```

### Pattern 1: Determine Required Pages Per Member
**What:** Not all members need updates on all pages - calculate which pages to visit
**When to use:** Before starting multi-page navigation for a member
**Example:**
```javascript
// Group changes by member and page
function groupChangesByMemberAndPage(changes) {
  const memberPages = new Map();

  for (const change of changes) {
    if (!memberPages.has(change.knvb_id)) {
      memberPages.set(change.knvb_id, {
        general: [],
        other: [],
        financial: []
      });
    }

    const pages = memberPages.get(change.knvb_id);

    // Map fields to pages
    if (['email', 'email2', 'mobile', 'phone'].includes(change.field_name)) {
      pages.general.push(change);
    } else if (['datum-vog', 'freescout-id'].includes(change.field_name)) {
      pages.other.push(change);
    } else if (change.field_name === 'financiele-blokkade') {
      pages.financial.push(change);
    }
  }

  return memberPages;
}
```

### Pattern 2: Multi-Page Sequential Navigation
**What:** Visit multiple pages in predictable order within same browser session
**When to use:** When member has changes across multiple pages
**Example:**
```javascript
// Single browser context shares session across all pages
async function syncMemberMultiPage(page, knvbId, pageChanges, options = {}) {
  const { logger } = options;
  const syncedPages = [];

  // Visit pages in order: /general -> /other -> /financial
  const pageOrder = [
    { name: 'general', url: `/member/${knvbId}/general`, changes: pageChanges.general },
    { name: 'other', url: `/member/member-details/${knvbId}/other`, changes: pageChanges.other },
    { name: 'financial', url: `/member/member-details/${knvbId}/financial`, changes: pageChanges.financial }
  ];

  for (const pageInfo of pageOrder) {
    // Skip pages with no changes
    if (pageInfo.changes.length === 0) {
      logger?.verbose(`Skipping ${pageInfo.name} page (no changes)`);
      continue;
    }

    logger?.verbose(`Navigating to ${pageInfo.name} page...`);

    try {
      await syncSinglePage(page, pageInfo.url, pageInfo.changes, options);
      syncedPages.push(pageInfo.name);
    } catch (error) {
      // Fail-fast: if any page fails, stop and return error
      throw new Error(
        `Failed on ${pageInfo.name} page (synced: ${syncedPages.join(', ')}): ${error.message}`
      );
    }

    // Small delay between pages
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }

  return syncedPages;
}
```

**Sources:**
- [Playwright Navigations](https://playwright.dev/docs/navigations) - Navigation order and session continuity
- [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext) - Session sharing across pages

### Pattern 3: Session Timeout Detection and Re-authentication
**What:** Detect when Sportlink redirects to login page mid-sync, re-authenticate, continue
**When to use:** After any navigation that might trigger session expiry
**Example:**
```javascript
async function navigateWithTimeoutDetection(page, url, credentials, options = {}) {
  const { logger } = options;

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Check if we were redirected to login page
  const currentUrl = page.url();

  if (currentUrl.includes('/auth/realms/') || currentUrl.includes('kc-login')) {
    logger?.log('Session timeout detected - re-authenticating...');

    // Re-authenticate (login flow already exists from Phase 23)
    await loginToSportlink(page, credentials, options);

    // Navigate to intended page again
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Verify we're not still on login page
    if (page.url().includes('/auth/realms/')) {
      throw new Error('Re-authentication failed');
    }
  }
}
```

**Sources:**
- [How to Maintain Authentication State in Playwright](https://roundproxies.com/blog/authentication-playwright/) - Session state management
- [Handling Session timeouts in Playwright](https://www.browserstack.com/docs/automate/playwright/troubleshooting/timeouts) - Timeout detection patterns

### Pattern 4: Page-Specific Field Mapping
**What:** Each page has different form fields and selectors
**When to use:** When filling fields on /other and /financial pages
**Example:**
```javascript
// Extend existing SPORTLINK_FIELD_MAP with page context
const SPORTLINK_FIELD_MAP = {
  // /general page (existing from Phase 23)
  'email': { page: 'general', selector: 'input[name="Email"]' },
  'email2': { page: 'general', selector: 'input[name="Email2"]' },
  'mobile': { page: 'general', selector: 'input[name="Mobile"]' },
  'phone': { page: 'general', selector: 'input[name="Phone"]' },

  // /other page (NEW for Phase 24)
  'freescout-id': { page: 'other', selector: 'input[name="Remarks3"]' },  // TODO: Verify selector
  'datum-vog': { page: 'other', selector: 'input[name="Remarks8"]' },     // TODO: Verify selector

  // /financial page (NEW for Phase 24)
  'financiele-blokkade': { page: 'financial', selector: 'input[type="checkbox"][name="HasFinancialTransferBlockOwnClub"]' }  // TODO: Verify selector
};

// Use field mapping to determine page
function getPageForField(fieldName) {
  return SPORTLINK_FIELD_MAP[fieldName]?.page || null;
}
```

**Note:** Actual Sportlink form selectors need verification by inspecting /other and /financial pages. The selectors above are based on API field names from download-functions-from-sportlink.js:
- freescout-id → FreeFields.Remarks3 (line 143)
- datum-vog → FreeFields.Remarks8 (line 147)
- financiele-blokkade → HasFinancialTransferBlockOwnClub (line 185)

### Pattern 5: Checkbox Handling for Boolean Fields
**What:** Financial block is a boolean toggle, not a text input
**When to use:** When syncing financiele-blokkade field
**Example:**
```javascript
async function fillFieldByType(page, fieldName, value, selector) {
  if (fieldName === 'financiele-blokkade') {
    // Boolean field - check or uncheck checkbox
    const shouldBeChecked = Boolean(value);
    const isChecked = await page.isChecked(selector);

    if (shouldBeChecked !== isChecked) {
      await page.check(selector);
    } else if (!shouldBeChecked && isChecked) {
      await page.uncheck(selector);
    }

    // Verify
    const finalState = await page.isChecked(selector);
    if (finalState !== shouldBeChecked) {
      throw new Error(`Checkbox verification failed: expected ${shouldBeChecked}, got ${finalState}`);
    }
  } else {
    // Text field - use fill()
    await page.fill(selector, value || '');

    // Verify
    const savedValue = await page.inputValue(selector);
    if (savedValue !== (value || '')) {
      throw new Error(`Field verification failed: expected "${value}", got "${savedValue}"`);
    }
  }
}
```

**Sources:**
- [Playwright Input Actions](https://playwright.dev/docs/input) - check() and uncheck() for checkboxes

### Pattern 6: Fail-Fast on Partial Failure
**What:** If any page fails for a member, skip entire member and don't update timestamps
**When to use:** Always - prevents inconsistent state between Sportlink and Stadion
**Example:**
```javascript
async function syncMemberWithFailFast(page, knvbId, pageChanges, options = {}) {
  const { logger, maxRetries = 3 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to sync all pages
      const syncedPages = await syncMemberMultiPage(page, knvbId, pageChanges, options);

      // Success - all pages synced
      return {
        success: true,
        attempts: attempt + 1,
        syncedPages: syncedPages
      };

    } catch (error) {
      if (attempt === maxRetries - 1) {
        // Max retries reached - fail entire member
        logger?.error(`Failed ${knvbId} after ${maxRetries} attempts: ${error.message}`);
        return {
          success: false,
          attempts: attempt + 1,
          error: error.message,
          syncedPages: []  // None - partial sync is discarded
        };
      }

      // Retry with exponential backoff
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      logger?.verbose(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

**Sources:**
- [Playwright Retries](https://playwright.dev/docs/test-retries) - Retry patterns
- [Fast Fail in Playwright](https://aaideas.com/posts/2024/playwright-fast-fail/) - Fail-fast patterns

### Pattern 7: Separate Cron Schedule (Every 15 Minutes)
**What:** Reverse sync runs independently from forward sync on its own schedule
**When to use:** Production deployment with cron automation
**Example:**
```bash
# In scripts/install-cron.sh or manual crontab
# Reverse sync: every 15 minutes
*/15 * * * * /usr/bin/flock -n /tmp/rondo-sync-reverse.lock bash -c 'cd /home/sportlink && scripts/sync.sh reverse >> logs/cron/sync-reverse-$(date +\%Y\%m\%d-\%H\%M).log 2>&1 && scripts/send-email.js logs/cron/sync-reverse-$(date +\%Y\%m\%d-\%H\%M).log'

# Or using scripts/sync.sh wrapper:
*/15 * * * * cd /home/sportlink && scripts/sync.sh reverse
```

**Note:** Requirements specify "every 15 minutes" (INTEG-03). This is more frequent than people sync (4x daily) because reverse sync is time-sensitive - manual corrections in Stadion should propagate to Sportlink quickly.

**Sources:**
- Existing scripts/sync.sh pattern from codebase (uses flock for locking)
- INTEG-03 requirement: "Reverse sync runs on separate cron schedule (every 15 minutes)"

### Anti-Patterns to Avoid
- **Updating timestamps after partial success:** If /general succeeds but /other fails, DON'T update any timestamps - member will retry completely next run
- **Parallel page visits:** Navigate sequentially to maintain predictable state and easier debugging
- **Ignoring session timeout:** Always check URL after navigation - redirect to login means session expired
- **Hardcoding page order per member:** Calculate which pages needed based on field changes - don't visit unnecessary pages
- **Mixing field types in same fill logic:** Checkboxes need check()/uncheck(), text fields need fill() - branch on field type

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-page session management | Custom cookie/token handling | Playwright BrowserContext | BrowserContext automatically shares cookies, localStorage across all page.goto() calls |
| Session timeout retry | Custom authentication state machine | URL-based detection + existing loginToSportlink() | Simple, proven pattern - just check if URL contains login page markers |
| Page-to-page navigation | New browser instance per page | Sequential page.goto() in same context | Same session, faster, uses less resources |
| Change grouping by page | Manual loops and conditionals | Map-based grouping function | Cleaner, easier to test, self-documenting |
| Field type detection | Runtime type checking | Field mapping with metadata | Compile-time verification, explicit about expectations |

**Key insight:** Playwright's BrowserContext handles session continuity automatically. The main work is organizing which pages to visit and implementing fail-fast logic.

## Common Pitfalls

### Pitfall 1: Form Selectors Differ Between Pages
**What goes wrong:** Code assumes all pages use same selector pattern (e.g., input[name="FieldName"])
**Why it happens:** Sportlink's /general, /other, and /financial pages may have different form structures
**How to avoid:** Create page-specific selector mappings verified against actual Sportlink UI
**Warning signs:** "Selector not found" errors on /other or /financial pages despite fields being visible

**Verification steps:**
1. Manually login to Sportlink
2. Navigate to member's /other page, open DevTools, inspect Remarks3 and Remarks8 fields
3. Navigate to member's /financial page, inspect HasFinancialTransferBlockOwnClub checkbox
4. Document actual selectors in SPORTLINK_FIELD_MAP before implementation

### Pitfall 2: Financial Block Requires Different Interaction Pattern
**What goes wrong:** Using fill() on checkbox field throws error or doesn't work
**Why it happens:** financiele-blokkade is boolean toggle, not text input
**How to avoid:** Branch on field type - use page.check()/uncheck() for checkboxes, fill() for text
**Warning signs:** No error but checkbox state doesn't change, or "Element is not an input" error

**Example fix:**
```javascript
if (fieldMapping.type === 'checkbox') {
  const shouldCheck = Boolean(value);
  if (shouldCheck) {
    await page.check(selector);
  } else {
    await page.uncheck(selector);
  }
  // Verify with isChecked()
} else {
  await page.fill(selector, value || '');
  // Verify with inputValue()
}
```

### Pitfall 3: Session Timeout Mid-Member Sync
**What goes wrong:** Login succeeds, first member syncs, but session expires during second member
**Why it happens:** Sportlink sessions expire after inactivity (typical: 15-30 minutes)
**How to avoid:** After every page.goto(), check if URL redirected to login page, re-auth if needed
**Warning signs:** Navigation succeeds but selectors not found, or navigation takes you to login page

**Detection strategy:**
```javascript
async function safeNavigate(page, url, credentials, options) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Session expired if redirected to auth realm
  if (page.url().includes('/auth/realms/')) {
    await loginToSportlink(page, credentials, options);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}
```

### Pitfall 4: Partial Updates Create Inconsistent State
**What goes wrong:** /general page updates succeed, /other page fails, timestamps updated anyway
**Why it happens:** Not implementing fail-fast - updating timestamps after each page instead of after all pages
**How to avoid:** Only call updateSportlinkTimestamps() AFTER all pages succeed for a member
**Warning signs:** Database shows synced_at for fields, but Sportlink doesn't have the values

**Correct pattern:**
```javascript
// WRONG - updates after each page
await syncGeneralPage(page, knvbId, generalChanges);
updateSportlinkTimestamps(db, knvbId, generalChanges.map(c => c.field_name));
await syncOtherPage(page, knvbId, otherChanges);  // If this fails, general is inconsistent

// RIGHT - updates only after all pages succeed
await syncGeneralPage(page, knvbId, generalChanges);
await syncOtherPage(page, knvbId, otherChanges);
await syncFinancialPage(page, knvbId, financialChanges);
// All succeeded - now update timestamps for ALL fields
const allFields = [...generalChanges, ...otherChanges, ...financialChanges].map(c => c.field_name);
updateSportlinkTimestamps(db, knvbId, allFields);
```

### Pitfall 5: Visiting Unnecessary Pages Wastes Time
**What goes wrong:** Code visits all three pages for every member regardless of which fields changed
**Why it happens:** Not filtering pages based on actual field changes
**How to avoid:** Calculate required pages per member - only visit pages with pending changes
**Warning signs:** Sync takes much longer than expected, logs show visiting /financial for members with only email changes

**Optimization:**
```javascript
// Group changes by member AND page
const memberPages = groupChangesByMemberAndPage(changes);

for (const [knvbId, pages] of memberPages) {
  // Only visit pages with changes
  const pagesToVisit = [];
  if (pages.general.length > 0) pagesToVisit.push('general');
  if (pages.other.length > 0) pagesToVisit.push('other');
  if (pages.financial.length > 0) pagesToVisit.push('financial');

  logger.log(`Member ${knvbId}: visiting ${pagesToVisit.join(', ')} pages`);

  // Visit only necessary pages
  // ...
}
```

### Pitfall 6: Edit Mode May Differ Between Pages
**What goes wrong:** /general has "Edit" button, code assumes same button exists on /other and /financial
**Why it happens:** Sportlink UI may use different edit activation patterns per page
**How to avoid:** Verify edit mode activation per page type during manual inspection
**Warning signs:** Fields are disabled/readonly even after clicking "Edit" button

**Research needed:**
- Does /other page require edit mode activation?
- Does /financial page require edit mode activation?
- Are field selectors the same in view vs edit mode?

Document findings during manual Sportlink inspection phase.

### Pitfall 7: Date Format Mismatch for VOG Datum
**What goes wrong:** Stadion stores date as YYYY-MM-DD, Sportlink expects DD-MM-YYYY (or vice versa)
**Why it happens:** Different systems use different date conventions
**How to avoid:** Inspect actual Sportlink form field, test with both formats, implement conversion if needed
**Warning signs:** Date saves but appears wrong in Sportlink UI, or validation error on save

**From codebase analysis:**
download-functions-from-sportlink.js (lines 148-163) shows Sportlink uses multiple date formats and normalizes to YYYY-MM-DD for storage. For reverse sync, may need to convert back to Sportlink's expected format.

**Recommendation:** Test with actual Sportlink form to determine expected format, implement conversion if needed.

## Code Examples

Verified patterns from Phase 23 and official Playwright sources:

### Multi-Page Sync Orchestration
```javascript
// Source: Phase 23 pattern extended with multi-page logic
const { chromium } = require('playwright');
const { openDb, getUnsyncedChanges, markChangesSynced, updateSportlinkTimestamps } = require('./lib/stadion-db');
const { loginToSportlink } = require('./lib/reverse-sync-sportlink');

async function runReverseSyncMultiPage(options = {}) {
  const { logger } = options;

  // Get credentials
  const credentials = {
    username: process.env.SPORTLINK_USERNAME,
    password: process.env.SPORTLINK_PASSWORD,
    otpSecret: process.env.SPORTLINK_OTP_SECRET
  };

  // Get all unsynced changes (contact + free fields + financial)
  const db = openDb();
  const changes = getUnsyncedChanges(db);  // Returns all unsynced changes

  if (changes.length === 0) {
    logger?.log('No unsynced changes found');
    db.close();
    return { success: true, synced: 0, failed: 0, results: [] };
  }

  // Group changes by member and page
  const memberPages = groupChangesByMemberAndPage(changes);
  logger?.log(`Syncing ${memberPages.size} members (${changes.length} total changes)`);

  // Launch browser and login
  let browser;
  const results = [];
  let synced = 0;
  let failed = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    // Login once at start
    await loginToSportlink(page, credentials, { logger });

    // Process each member sequentially
    for (const [knvbId, pageChanges] of memberPages) {
      logger?.verbose(`Processing member ${knvbId}...`);

      const result = await syncMemberWithFailFast(page, knvbId, pageChanges, {
        logger,
        credentials,
        maxRetries: 3
      });

      if (result.success) {
        // Update timestamps only after ALL pages succeeded
        const allFields = [
          ...pageChanges.general,
          ...pageChanges.other,
          ...pageChanges.financial
        ].map(c => c.field_name);

        markChangesSynced(db, knvbId, allFields);
        updateSportlinkTimestamps(db, knvbId, allFields);

        synced++;
        logger?.log(`✓ Synced ${allFields.length} field(s) across ${result.syncedPages.length} page(s) for ${knvbId}`);
      } else {
        failed++;
        logger?.error(`✗ Failed ${knvbId}: ${result.error}`);
      }

      results.push({
        knvbId,
        success: result.success,
        attempts: result.attempts,
        syncedPages: result.syncedPages,
        error: result.error
      });

      // Delay between members
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }
  } finally {
    if (browser) await browser.close();
    db.close();
  }

  logger?.log(`Reverse sync complete: ${synced} synced, ${failed} failed`);
  return { success: failed === 0, synced, failed, results };
}

function groupChangesByMemberAndPage(changes) {
  const memberPages = new Map();

  for (const change of changes) {
    if (!memberPages.has(change.knvb_id)) {
      memberPages.set(change.knvb_id, {
        general: [],
        other: [],
        financial: []
      });
    }

    const pages = memberPages.get(change.knvb_id);

    // Map fields to pages based on where they live in Sportlink
    if (['email', 'email2', 'mobile', 'phone'].includes(change.field_name)) {
      pages.general.push(change);
    } else if (['datum-vog', 'freescout-id'].includes(change.field_name)) {
      pages.other.push(change);
    } else if (change.field_name === 'financiele-blokkade') {
      pages.financial.push(change);
    }
  }

  return memberPages;
}

module.exports = { runReverseSyncMultiPage };
```

### Page-Specific Sync with Session Timeout Detection
```javascript
// Source: Playwright navigation patterns + Phase 23 retry logic
async function syncSinglePage(page, pageUrl, fieldChanges, credentials, options = {}) {
  const { logger } = options;

  // Navigate with timeout detection
  await page.goto(`https://club.sportlink.com${pageUrl}`, { waitUntil: 'domcontentloaded' });

  // Check for session timeout (redirected to login)
  if (page.url().includes('/auth/realms/')) {
    logger?.verbose('Session timeout detected - re-authenticating...');
    await loginToSportlink(page, credentials, { logger });
    await page.goto(`https://club.sportlink.com${pageUrl}`, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForLoadState('networkidle');

  // Enter edit mode (if needed - verify per page type)
  // TODO: Verify if /other and /financial require edit mode
  const editButtonSelector = 'button[data-action="edit"], .edit-button, #btnEdit';
  const hasEditButton = await page.locator(editButtonSelector).count() > 0;

  if (hasEditButton) {
    await page.click(editButtonSelector);
    await page.waitForLoadState('networkidle');
  }

  // Fill fields
  for (const change of fieldChanges) {
    const fieldMapping = SPORTLINK_FIELD_MAP[change.field_name];
    if (!fieldMapping) {
      logger?.error(`No mapping for field: ${change.field_name}`);
      continue;
    }

    await fillFieldByType(page, change.field_name, change.new_value, fieldMapping.selector);
  }

  // Save form
  const saveButtonSelector = 'button[type="submit"], button[data-action="save"], #btnSave';
  await page.click(saveButtonSelector);
  await page.waitForLoadState('networkidle');

  // Verify all fields saved (re-read values)
  for (const change of fieldChanges) {
    const fieldMapping = SPORTLINK_FIELD_MAP[change.field_name];
    if (!fieldMapping) continue;

    let savedValue;
    if (change.field_name === 'financiele-blokkade') {
      savedValue = await page.isChecked(fieldMapping.selector);
      if (savedValue !== Boolean(change.new_value)) {
        throw new Error(`Verification failed for ${change.field_name}`);
      }
    } else {
      savedValue = await page.inputValue(fieldMapping.selector);
      if (savedValue !== (change.new_value || '')) {
        throw new Error(`Verification failed for ${change.field_name}: expected "${change.new_value}", got "${savedValue}"`);
      }
    }
  }

  logger?.verbose(`Successfully synced ${fieldChanges.length} field(s) on page`);
}
```

### Field Type-Aware Fill
```javascript
// Source: Playwright input documentation
async function fillFieldByType(page, fieldName, value, selector) {
  if (fieldName === 'financiele-blokkade') {
    // Boolean checkbox field
    const shouldBeChecked = Boolean(value);
    const isCurrentlyChecked = await page.isChecked(selector);

    if (shouldBeChecked && !isCurrentlyChecked) {
      await page.check(selector);
    } else if (!shouldBeChecked && isCurrentlyChecked) {
      await page.uncheck(selector);
    }
    // else: already in correct state, no action needed

  } else {
    // Text input field
    await page.fill(selector, value || '');
  }
}
```

### Email Report Integration
```javascript
// Source: Phase 23 integration pattern
// In sync-people.js or new reverse-sync wrapper

async function generateReportWithMultiPageSync(options = {}) {
  const { logger } = options;

  // ... existing forward sync ...

  // Run multi-page reverse sync
  logger.log('');
  logger.log('REVERSE SYNC (STADION → SPORTLINK)');
  logger.log('--------');

  const reverseResult = await runReverseSyncMultiPage(options);

  if (reverseResult.synced === 0 && reverseResult.failed === 0) {
    logger.log('No changes to sync');
  } else {
    logger.log(`Synced: ${reverseResult.synced} members`);
    if (reverseResult.failed > 0) {
      logger.log(`Failed: ${reverseResult.failed} members`);
    }

    // Optional: page-level breakdown
    const detailLevel = process.env.REVERSE_SYNC_DETAIL || 'summary';
    if (detailLevel === 'detailed' && reverseResult.results) {
      for (const result of reverseResult.results.filter(r => r.success)) {
        logger.log(`  ${result.knvbId}: ${result.syncedPages.join(', ')} pages`);
      }
    }
  }

  // Existing email delivery logic handles all logged output
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-page reverse sync | Multi-page reverse sync | Phase 24 (2026) | Completes bidirectional sync for all 7 tracked fields |
| Manual page-by-page sync | Calculated page visits based on changes | Modern automation pattern | Reduces unnecessary navigations, faster sync |
| Ignore session timeout | Detect and re-authenticate mid-sync | Playwright best practice (2024+) | Handles long-running syncs without manual intervention |
| Partial update tolerance | Fail-fast on any page failure | Distributed systems pattern | Prevents inconsistent state between systems |
| Text-only field handling | Type-aware field interactions | Playwright API | Supports checkboxes, text inputs, etc. with correct methods |

**Deprecated/outdated:**
- Single-field-at-a-time page visits: Now batch all changes per member per page
- Assuming session persistence: Always check for timeout after navigation
- Uniform fill() for all fields: Use type-specific methods (check/uncheck for booleans)
- Manual selector verification only: Add automated verification via read-back after save

## Open Questions

1. **Sportlink /other Page Form Selectors**
   - What we know: /other page loads MemberFreeFields API with Remarks3 (freescout-id) and Remarks8 (datum-vog)
   - What's unclear: Actual form input selectors when in edit mode
   - Recommendation: Manual inspection of /other page edit mode, document selectors in FIELD_MAP before implementation

2. **Sportlink /financial Page Form Selectors**
   - What we know: /financial page loads MemberHeader API with HasFinancialTransferBlockOwnClub field
   - What's unclear: Actual checkbox selector and surrounding form structure
   - Recommendation: Manual inspection of /financial page, verify if edit mode needed, document selector

3. **Edit Mode Required Per Page?**
   - What we know: /general page requires clicking edit button (Phase 23 verified)
   - What's unclear: Do /other and /financial pages also require edit mode activation?
   - Recommendation: Test navigation to each page, check if fields are immediately editable or require edit button click

4. **Date Format for VOG Datum**
   - What we know: Sportlink accepts multiple date formats, normalizes to YYYY-MM-DD for storage (download-functions-from-sportlink.js lines 148-163)
   - What's unclear: What format does Sportlink /other page form expect as input?
   - Recommendation: Test with both YYYY-MM-DD and DD-MM-YYYY formats, implement conversion if needed

5. **Save Confirmation Per Page Type**
   - What we know: /general page uses networkidle wait for save confirmation (Phase 23 pattern)
   - What's unclear: Do /other and /financial pages use same save pattern or different?
   - Recommendation: Test save flow on each page type, document any page-specific wait strategies

6. **Scheduling Integration**
   - What we know: Requirements specify every 15 minutes (INTEG-03), separate from people sync
   - What's unclear: Should this be a new CLI entry point (reverse-sync-all.js) or extend existing reverse-sync-contact-fields.js?
   - Recommendation: Create unified reverse-sync.js that handles all fields (contacts + free fields + financial), called by scripts/sync.sh reverse

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns:
  - lib/reverse-sync-sportlink.js - Phase 23 implementation (complete file)
  - download-functions-from-sportlink.js - Field extraction from /other page (lines 139-170, 179-192)
  - lib/detect-stadion-changes.js - Change detection for new fields (lines 71-79)
  - prepare-stadion-members.js - Field mapping to Stadion ACF (lines 131-136)
  - scripts/sync.sh - Unified sync wrapper pattern (existing)
  - scripts/install-cron.sh - Cron scheduling pattern (existing)
- Phase 23 RESEARCH.md - Contact field reverse sync patterns
- Phase 23-02 PLAN.md - Email report integration pattern

### Secondary (MEDIUM confidence)
- [Playwright Navigations](https://playwright.dev/docs/navigations) - Navigation and session handling
- [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext) - Session sharing across pages
- [Playwright Input Actions](https://playwright.dev/docs/input) - check(), uncheck(), fill() methods
- [How to Maintain Authentication State in Playwright](https://roundproxies.com/blog/authentication-playwright/) - Session state management 2026
- [Handling Session timeouts in Playwright](https://www.browserstack.com/docs/automate/playwright/troubleshooting/timeouts) - Timeout detection
- [Playwright Retries](https://playwright.dev/docs/test-retries) - Retry patterns
- [Fast Fail in Playwright](https://aaideas.com/posts/2024/playwright-fast-fail/) - Fail-fast patterns 2024

### Tertiary (LOW confidence)
- Sportlink /other and /financial page form structure - Needs manual verification
- Date format expectations on Sportlink forms - Needs testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries and patterns proven in Phase 23
- Architecture: HIGH - Direct extension of Phase 23 patterns with well-documented multi-page navigation
- Multi-page navigation: HIGH - Playwright BrowserContext handles session automatically
- Session timeout detection: MEDIUM - Pattern is simple (URL check) but needs testing with actual Sportlink timeout
- Form selectors: LOW - /other and /financial page selectors need manual verification
- Field type handling: HIGH - Checkbox vs text input is straightforward with Playwright API

**Research date:** 2026-01-29
**Valid until:** 60 days (Playwright API stable, Sportlink UI may change requiring selector updates)
