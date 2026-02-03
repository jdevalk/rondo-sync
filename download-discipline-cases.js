require('varlock/auto-load');

const otplib = require('otplib');
const { chromium } = require('playwright');
const { openDb, upsertCases, getCaseCount } = require('./lib/discipline-db');
const { createSyncLogger } = require('./lib/logger');

function readEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function createDebugLogger(enabled) {
  return (...args) => {
    if (enabled) {
      console.log(...args);
    }
  };
}

function parseBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

/**
 * Download discipline case data from Sportlink
 * @param {Object} options
 * @param {Object} [options.logger] - Logger instance with log(), verbose(), error() methods
 * @param {boolean} [options.verbose=false] - Verbose mode (creates logger if not provided)
 * @returns {Promise<{success: boolean, caseCount: number, error?: string}>}
 */
async function runDownload(options = {}) {
  const { logger, verbose = false } = options;

  // Use provided logger or create a simple one
  const log = logger ? logger.log.bind(logger) : (verbose ? console.log : () => {});
  const logVerbose = logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {});
  const logError = logger ? logger.error.bind(logger) : console.error;

  const username = readEnv('SPORTLINK_USERNAME');
  const password = readEnv('SPORTLINK_PASSWORD');
  const otpSecret = readEnv('SPORTLINK_OTP_SECRET');

  if (!username || !password) {
    const errorMsg = 'Missing SPORTLINK_USERNAME or SPORTLINK_PASSWORD';
    logError(errorMsg);
    return { success: false, caseCount: 0, error: errorMsg };
  }

  const debugEnabled = parseBool(readEnv('DEBUG_LOG', 'false'));
  const logDebug = createDebugLogger(debugEnabled);

  let browser;
  let db;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      if (debugEnabled) {
        page.on('request', r => logDebug('>>', r.method(), r.url()));
        page.on('response', r => logDebug('<<', r.status(), r.url()));
      }

      // Login flow - same as download-data-from-sportlink.js
      await page.goto('https://club.sportlink.com/', { waitUntil: 'domcontentloaded' });
      await page.fill('#username', username);
      await page.fill('#password', password);
      await page.click('#kc-login');

      await page.waitForSelector('#otp', { timeout: 20000 });
      if (!otpSecret) {
        const errorMsg = 'Missing SPORTLINK_OTP_SECRET';
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }
      const otpCode = await otplib.generate({ secret: otpSecret });
      if (!otpCode) {
        const errorMsg = 'OTP is required to continue';
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }
      await page.fill('#otp', otpCode);
      await page.click('#kc-login');

      await page.waitForLoadState('networkidle');

      logDebug('Waiting for login success selector: #panelHeaderTasks');
      try {
        await page.waitForSelector('#panelHeaderTasks', { timeout: 30000 });
      } catch (error) {
        const errorMsg = 'Login failed: Could not find dashboard element';
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }

      logVerbose('Logged into Sportlink successfully');

      // Navigate to discipline cases page
      const disciplineCasesUrl = 'https://club.sportlink.com/competition-affairs/discipline-cases';
      logDebug('Navigating to discipline cases page:', disciplineCasesUrl);
      await page.goto(disciplineCasesUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      logVerbose('On discipline cases page');

      // Small delay to let the page settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Set up response listener BEFORE clicking the tab
      // Match specific API endpoint for discipline cases (GET request)
      logDebug('Setting up response listener for discipline cases API...');
      const responsePromise = page.waitForResponse(
        resp => {
          const url = resp.url();
          const isGet = resp.request().method() === 'GET';
          // Match the specific API endpoint, not broad patterns that catch analytics
          const isMatch = url.includes('/DisciplineClubCasesPlayer');
          if (debugEnabled && isMatch) {
            logDebug('Matched response URL:', url, 'Method:', resp.request().method());
          }
          return isMatch && isGet;
        },
        { timeout: 60000 }
      );

      // Click "Individuele tuchtzaken" tab
      // Try multiple selector strategies
      logDebug('Attempting to click "Individuele tuchtzaken" tab...');

      // Try text-based selector first
      const tabSelectors = [
        'button:has-text("Individuele tuchtzaken")',
        '[data-tab="individual"]',
        'text=Individuele tuchtzaken',
        '.tab-button:has-text("Individuele")',
        'button >> text=Individuele',
        '[role="tab"]:has-text("Individuele")'
      ];

      let tabClicked = false;
      for (const selector of tabSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click();
            logDebug('Clicked tab using selector:', selector);
            tabClicked = true;
            break;
          }
        } catch (e) {
          logDebug('Selector failed:', selector, e.message);
        }
      }

      if (!tabClicked) {
        // Try to find any tab-like element with "Individuele" text
        logDebug('Trying fallback: looking for any element with "Individuele" text...');
        try {
          await page.getByRole('tab', { name: /individuele/i }).click();
          tabClicked = true;
          logDebug('Clicked tab using getByRole');
        } catch (e) {
          logDebug('getByRole failed:', e.message);
        }
      }

      if (!tabClicked) {
        // Log available tabs for debugging
        const allTabs = await page.locator('button, [role="tab"]').allTextContents();
        logDebug('Available tab-like elements:', allTabs.join(', '));

        const errorMsg = 'Could not find or click "Individuele tuchtzaken" tab. Enable DEBUG_LOG=true for more info.';
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }

      logVerbose('Clicked "Individuele tuchtzaken" tab, waiting for API response...');

      // Wait for response
      let response;
      try {
        response = await responsePromise;
      } catch (e) {
        // If no response intercepted, maybe data is already loaded or different API pattern
        logDebug('Response wait timed out, checking for existing data...');

        // Try to extract data from page directly
        const pageContent = await page.content();
        if (pageContent.includes('DossierId') || pageContent.includes('dossier')) {
          logDebug('Page appears to have discipline data, trying direct extraction...');
        }

        const errorMsg = `No API response captured. The discipline cases page may use a different loading pattern. Enable DEBUG_LOG=true to observe network traffic. Error: ${e.message}`;
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }

      logDebug('Response received. Status:', response.status(), response.statusText());
      logDebug('Response URL:', response.url());

      if (!response.ok()) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          logDebug('Response body:', errorBody);
        } catch (e) {
          logDebug('Could not read response body:', e.message);
        }
        const errorMsg = `API request failed (${response.status()} ${response.statusText()}): ${errorBody || 'No error details'}`;
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }

      // Parse response
      const jsonData = await response.json();
      logDebug('Response JSON keys:', Object.keys(jsonData));

      // Try common response structures
      let cases = [];
      if (Array.isArray(jsonData)) {
        cases = jsonData;
      } else if (Array.isArray(jsonData.Cases)) {
        cases = jsonData.Cases;
      } else if (Array.isArray(jsonData.Results)) {
        cases = jsonData.Results;
      } else if (Array.isArray(jsonData.Items)) {
        cases = jsonData.Items;
      } else if (Array.isArray(jsonData.Data)) {
        cases = jsonData.Data;
      } else {
        // Log structure for debugging
        logDebug('Unknown response structure:', JSON.stringify(jsonData).substring(0, 500));
        const errorMsg = 'API response has unexpected structure. Enable DEBUG_LOG=true to inspect.';
        logError(errorMsg);
        return { success: false, caseCount: 0, error: errorMsg };
      }

      logVerbose(`Received ${cases.length} discipline cases from API`);

      if (cases.length > 0) {
        logDebug('First case sample:', JSON.stringify(cases[0]).substring(0, 500));
      }

      // Store in database
      db = openDb();
      if (cases.length > 0) {
        upsertCases(db, cases);
      }
      const caseCount = getCaseCount(db);

      log(`Downloaded ${cases.length} discipline cases (${caseCount} total in database)`);
      return { success: true, caseCount };
    } finally {
      await browser.close();
    }
  } catch (err) {
    const errorMsg = err.message || String(err);
    logError('Error:', errorMsg);
    return { success: false, caseCount: 0, error: errorMsg };
  } finally {
    if (db) {
      db.close();
    }
  }
}

module.exports = { runDownload };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');
  const logger = createSyncLogger({ verbose, prefix: 'discipline' });
  runDownload({ logger, verbose })
    .then(result => {
      logger.close();
      if (!result.success) process.exitCode = 1;
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exitCode = 1;
    });
}
