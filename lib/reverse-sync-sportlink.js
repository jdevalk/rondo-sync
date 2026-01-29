require('varlock/auto-load');

const otplib = require('otplib');
const { chromium } = require('playwright');
const { openDb, getUnsyncedContactChanges, markChangesSynced } = require('./stadion-db');
const { SYNC_ORIGIN, createTimestamp, getTimestampColumnNames } = require('./sync-origin');

/**
 * Mapping of Stadion field names to Sportlink form selectors.
 * These selectors need verification against actual Sportlink UI.
 */
const SPORTLINK_FIELD_MAP = {
  'email': 'input[name="Email"]',      // TODO: Verify actual selector
  'email2': 'input[name="Email2"]',    // TODO: Verify actual selector
  'mobile': 'input[name="Mobile"]',    // TODO: Verify actual selector
  'phone': 'input[name="Phone"]'       // TODO: Verify actual selector
};

/**
 * Login to Sportlink with credentials and OTP.
 * @param {Object} page - Playwright page instance
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.username - Sportlink username
 * @param {string} credentials.password - Sportlink password
 * @param {string} credentials.otpSecret - TOTP secret for 2FA
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<void>}
 */
async function loginToSportlink(page, credentials, options = {}) {
  const { logger } = options;
  const { username, password, otpSecret } = credentials;

  logger?.verbose('Navigating to Sportlink login page...');
  await page.goto('https://club.sportlink.com/', { waitUntil: 'domcontentloaded' });

  logger?.verbose('Filling login credentials...');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login');

  logger?.verbose('Waiting for OTP prompt...');
  await page.waitForSelector('#otp', { timeout: 20000 });

  if (!otpSecret) {
    throw new Error('Missing SPORTLINK_OTP_SECRET');
  }

  const otpCode = await otplib.generate({ secret: otpSecret });
  if (!otpCode) {
    throw new Error('Failed to generate OTP code');
  }

  logger?.verbose('Submitting OTP...');
  await page.fill('#otp', otpCode);
  await page.click('#kc-login');

  await page.waitForLoadState('networkidle');

  logger?.verbose('Verifying login success...');
  try {
    await page.waitForSelector('#panelHeaderTasks', { timeout: 30000 });
    logger?.verbose('Login successful');
  } catch (error) {
    throw new Error('Login failed: Could not find dashboard element');
  }
}

/**
 * Sync a single member's contact fields to Sportlink.
 * @param {Object} page - Playwright page instance
 * @param {string} knvbId - Member KNVB ID
 * @param {Array<Object>} fieldChanges - Array of field change objects
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<void>}
 */
async function syncMemberToSportlink(page, knvbId, fieldChanges, options = {}) {
  const { logger } = options;

  // Navigate to member's general page
  const memberUrl = `https://club.sportlink.com/member/${knvbId}/general`;
  logger?.verbose(`Navigating to member page: ${memberUrl}`);
  await page.goto(memberUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  // Enter edit mode (TODO: verify actual selector)
  logger?.verbose('Entering edit mode...');
  const editButtonSelector = 'button[data-action="edit"], .edit-button, #btnEdit';
  try {
    await page.waitForSelector(editButtonSelector, { timeout: 10000 });
    await page.click(editButtonSelector);
  } catch (error) {
    throw new Error(`Could not find edit button with selector: ${editButtonSelector}`);
  }

  // Wait for form to be editable
  await page.waitForLoadState('networkidle');

  // Fill each changed field
  for (const change of fieldChanges) {
    const selector = SPORTLINK_FIELD_MAP[change.field_name];
    if (!selector) {
      logger?.error(`No selector mapping for field: ${change.field_name}`);
      continue;
    }

    logger?.verbose(`Filling ${change.field_name}: ${change.new_value}`);
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.fill(selector, change.new_value || '');
    } catch (error) {
      throw new Error(`Could not find or fill field ${change.field_name} with selector: ${selector}`);
    }
  }

  // Save the form (TODO: verify actual selector)
  logger?.verbose('Saving changes...');
  const saveButtonSelector = 'button[type="submit"], button[data-action="save"], .save-button, #btnSave';
  try {
    await page.waitForSelector(saveButtonSelector, { timeout: 10000 });
    await page.click(saveButtonSelector);
  } catch (error) {
    throw new Error(`Could not find save button with selector: ${saveButtonSelector}`);
  }

  await page.waitForLoadState('networkidle');

  // Verify saved values by reading them back
  logger?.verbose('Verifying saved values...');
  for (const change of fieldChanges) {
    const selector = SPORTLINK_FIELD_MAP[change.field_name];
    if (!selector) continue;

    try {
      const savedValue = await page.inputValue(selector);
      if (savedValue !== (change.new_value || '')) {
        throw new Error(
          `Verification failed for ${change.field_name}: ` +
          `expected "${change.new_value}", got "${savedValue}"`
        );
      }
      logger?.verbose(`Verified ${change.field_name}: ${savedValue}`);
    } catch (error) {
      throw new Error(`Verification failed for ${change.field_name}: ${error.message}`);
    }
  }

  logger?.verbose(`Successfully synced ${fieldChanges.length} field(s) for member ${knvbId}`);
}

/**
 * Sync a member with retry logic and exponential backoff.
 * @param {Object} page - Playwright page instance
 * @param {string} knvbId - Member KNVB ID
 * @param {Array<Object>} fieldChanges - Array of field change objects
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @returns {Promise<{success: boolean, attempts: number, error?: string}>}
 */
async function syncMemberWithRetry(page, knvbId, fieldChanges, options = {}) {
  const { logger, maxRetries = 3 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await syncMemberToSportlink(page, knvbId, fieldChanges, options);
      return { success: true, attempts: attempt + 1 };
    } catch (error) {
      if (attempt === maxRetries - 1) {
        return { success: false, attempts: attempt + 1, error: error.message };
      }
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      logger?.verbose(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${error.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Run reverse sync from Stadion to Sportlink for contact fields.
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{success: boolean, synced: number, failed: number, results: Array}>}
 */
async function runReverseSync(options = {}) {
  const { logger } = options;

  // Get credentials from environment
  const username = process.env.SPORTLINK_USERNAME;
  const password = process.env.SPORTLINK_PASSWORD;
  const otpSecret = process.env.SPORTLINK_OTP_SECRET;

  if (!username || !password) {
    throw new Error('Missing SPORTLINK_USERNAME or SPORTLINK_PASSWORD');
  }

  // Open database and get unsynced changes
  const db = openDb();
  const changes = getUnsyncedContactChanges(db);

  if (changes.length === 0) {
    logger?.log('No unsynced contact field changes found');
    db.close();
    return { success: true, synced: 0, failed: 0, results: [] };
  }

  // Group changes by knvb_id
  const changesByMember = new Map();
  for (const change of changes) {
    if (!changesByMember.has(change.knvb_id)) {
      changesByMember.set(change.knvb_id, []);
    }
    changesByMember.get(change.knvb_id).push(change);
  }

  logger?.log(`Found ${changes.length} unsynced change(s) for ${changesByMember.size} member(s)`);

  // Launch browser and login
  let browser;
  const results = [];
  let synced = 0;
  let failed = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Login once at the start
    await loginToSportlink(page, { username, password, otpSecret }, { logger });

    // Process each member sequentially
    for (const [knvbId, memberChanges] of changesByMember) {
      logger?.verbose(`Processing member ${knvbId} with ${memberChanges.length} change(s)...`);

      const result = await syncMemberWithRetry(page, knvbId, memberChanges, { logger, maxRetries: 3 });

      if (result.success) {
        // Mark changes as synced in database
        const fieldNames = memberChanges.map(c => c.field_name);
        markChangesSynced(db, knvbId, fieldNames);

        // Update Sportlink modification timestamps
        const now = createTimestamp();
        for (const fieldName of fieldNames) {
          const { sportlink } = getTimestampColumnNames(fieldName);
          const updateStmt = db.prepare(`
            UPDATE stadion_members
            SET ${sportlink} = ?, sync_origin = ?
            WHERE knvb_id = ?
          `);
          updateStmt.run(now, SYNC_ORIGIN.SYNC_REVERSE, knvbId);
        }

        synced++;
        logger?.log(`✓ Synced ${memberChanges.length} field(s) for member ${knvbId}`);
      } else {
        failed++;
        logger?.error(`✗ Failed to sync member ${knvbId}: ${result.error}`);
      }

      results.push({
        knvbId,
        success: result.success,
        attempts: result.attempts,
        fieldCount: memberChanges.length,
        error: result.error
      });

      // Add delay between members to avoid rate limiting
      const delay = 1000 + Math.random() * 1000; // 1-2 seconds
      await new Promise(r => setTimeout(r, delay));
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    db.close();
  }

  const success = failed === 0;
  logger?.log(`Reverse sync complete: ${synced} synced, ${failed} failed`);

  return { success, synced, failed, results };
}

module.exports = {
  loginToSportlink,
  syncMemberToSportlink,
  runReverseSync
};
