# Phase 3: Postmark Email Delivery - Research

**Researched:** 2026-01-25
**Domain:** Transactional email delivery via Postmark API
**Confidence:** HIGH

## Summary

Postmark is a transactional email service with an official Node.js library (npm package `postmark`, currently v4.0.5) that provides a simple API for sending emails. The standard approach for this phase is to create a standalone Node.js script that reads the sync log and sends it via Postmark's `sendEmail` API, then integrate this script into the existing cron-wrapper.sh bash script.

The Postmark API requires a Server API Token for authentication, a verified sender signature or domain, and supports both text and HTML email bodies. Error handling should be defensive: email failures must be logged but should not fail the sync operation, as per requirement EMAIL-05.

**Primary recommendation:** Use the official `postmark` npm package with promise-based error handling, read credentials from environment variables (.env file), and implement graceful degradation where email send failures are logged but don't block sync completion.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| postmark | 4.0.5 | Official Postmark API client for Node.js | Maintained by ActiveCampaign/Postmark, supports entire REST API, 213+ projects use it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | latest | Load environment variables from .env file | Not needed - Node.js 20+ has native .env support, project already uses `.env` sourcing in bash |
| fs | built-in | Read log file for email content | Always - standard Node.js module |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postmark | nodemailer with SMTP | More complexity, slower than API, requires SMTP setup |
| postmark | Direct fetch() to API | Hand-rolling HTTP client loses error handling, retry logic, TypeScript types |
| postmark | Postmark CLI | CLI not designed for programmatic use, harder to handle errors gracefully |

**Installation:**
```bash
npm install postmark
```

## Architecture Patterns

### Recommended Project Structure
```
sportlink-sync/
├── scripts/
│   ├── cron-wrapper.sh       # Modified to call send-email.js
│   ├── install-cron.sh       # Modified to prompt for Postmark credentials
│   └── send-email.js         # NEW: Standalone email sending script
├── .env                      # Add POSTMARK_API_KEY, POSTMARK_FROM_EMAIL
└── .env.example              # Document new env vars
```

### Pattern 1: Standalone Email Script
**What:** Create send-email.js as an independent script that can be called from bash or Node.js
**When to use:** When integrating email functionality into existing bash-based automation
**Example:**
```javascript
// Source: Based on Postmark official examples
// https://postmarkapp.com/send-email/node

const postmark = require('postmark');
const fs = require('fs');

// Read environment variables (already sourced by cron-wrapper.sh)
const API_KEY = process.env.POSTMARK_API_KEY;
const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL;
const TO_EMAIL = process.env.OPERATOR_EMAIL;

// Initialize Postmark client
const client = new postmark.ServerClient(API_KEY);

// Read log file path from command line argument
const logFilePath = process.argv[2];
const logContent = fs.readFileSync(logFilePath, 'utf8');

// Send email
client.sendEmail({
  From: FROM_EMAIL,
  To: TO_EMAIL,
  Subject: `Sportlink Sync Report - ${new Date().toISOString().split('T')[0]}`,
  TextBody: logContent
})
.then(() => {
  console.log('Email sent successfully');
  process.exit(0);
})
.catch((error) => {
  console.error('Failed to send email:', error.message);
  process.exit(1); // Email failure should be logged but not fail the sync
});
```

### Pattern 2: Graceful Degradation in Bash
**What:** Bash script handles email send failures without failing the sync
**When to use:** When email is supplementary to core functionality (matches EMAIL-05 requirement)
**Example:**
```bash
# Source: Bash best practices for Node.js integration

# Send email if credentials are configured
if [ -n "$POSTMARK_API_KEY" ] && [ -n "$POSTMARK_FROM_EMAIL" ] && [ -n "$OPERATOR_EMAIL" ]; then
    node "$PROJECT_DIR/scripts/send-email.js" "$LOG_FILE" || \
        echo "Warning: Failed to send email notification" >&2
    # Note: || prevents email failure from propagating via set -e
fi
```

### Pattern 3: Environment Variable Configuration
**What:** Store credentials in .env file, validate at runtime
**When to use:** Always - development and production use same pattern
**Example:**
```javascript
// Validate required environment variables
const required = ['POSTMARK_API_KEY', 'POSTMARK_FROM_EMAIL', 'OPERATOR_EMAIL'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
```

### Anti-Patterns to Avoid
- **Failing sync on email error:** Email is supplementary - sync should complete successfully even if email fails (violates EMAIL-05)
- **Hardcoding credentials:** Never commit API keys or email addresses to version control
- **Using `mail` command fallback:** Creates dual code paths that are hard to test; if Postmark is unavailable, log the error and continue
- **Retrying email sends:** For transactional sync reports, retrying creates duplicate emails; log the error and move on
- **Using HTML-only email body:** Always provide TextBody for accessibility and email client compatibility

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for Postmark API | Custom fetch() wrapper | `postmark` npm package | Handles authentication headers, error parsing, TypeScript types, retry logic |
| Email template rendering | Custom string concatenation | Postmark Templates API (future) | Handles escaping, styling, responsive design |
| Bounce handling | Custom webhook parser | Postmark bounce webhooks | Already integrated with Postmark, handles categorization |
| Rate limiting | Custom retry logic | `postmark` library built-in handling | Library handles 429 responses, exponential backoff |

**Key insight:** The Postmark API has nuanced error codes (10=bad token, 300=invalid email, 406=inactive recipient, 422=unprocessable) and authentication requirements that the official library handles correctly. Custom HTTP clients will miss edge cases.

## Common Pitfalls

### Pitfall 1: Unverified Sender Signature
**What goes wrong:** API returns HTTP 422 with "You must have a registered and confirmed sender signature" error
**Why it happens:** Postmark requires sender email addresses to be verified before sending
**How to avoid:** During setup (install-cron.sh), document that POSTMARK_FROM_EMAIL must be verified in Postmark dashboard first. Consider using domain verification instead of individual sender signatures for flexibility.
**Warning signs:** Error code 422 in logs, "sender signature" in error message

### Pitfall 2: Missing Required Environment Variables
**What goes wrong:** Script fails with "Cannot read property 'sendEmail' of undefined" or similar
**Why it happens:** POSTMARK_API_KEY not set, resulting in undefined client initialization
**How to avoid:** Validate all required env vars at script start (POSTMARK_API_KEY, POSTMARK_FROM_EMAIL, OPERATOR_EMAIL) and exit with clear error message
**Warning signs:** Script fails immediately, no API call logged

### Pitfall 3: Email Failure Breaks Sync
**What goes wrong:** Sync completes successfully but cron-wrapper.sh exits with code 1, triggering retry mechanism
**Why it happens:** Email send script exits with code 1, bash script uses `set -e` which propagates the error
**How to avoid:** Use `|| echo "Warning: email failed"` in bash to catch and log email failures without propagating error code
**Warning signs:** Retry flag (/tmp/sportlink-sync-retry) created even when sync succeeded

### Pitfall 4: Using Test API Token in Production
**What goes wrong:** Emails appear to send successfully but never arrive; no activity in Postmark dashboard
**Why it happens:** Using "POSTMARK_API_TEST" token validates API calls but doesn't send emails
**How to avoid:** Clearly document in .env.example that real Server API Token is required for production. Use test token only in development/testing.
**Warning signs:** Success messages but no emails received, empty Postmark activity log

### Pitfall 5: Log File Path Issues
**What goes wrong:** Email send script can't find log file, sends empty email or crashes
**Why it happens:** Relative vs absolute path mismatch between bash and Node.js script
**How to avoid:** Pass absolute path from bash script to Node.js script; validate file exists and is readable before attempting to send
**Warning signs:** Empty email body, "ENOENT: no such file" errors

### Pitfall 6: Environment Variable Scope in Cron
**What goes wrong:** Script works when run manually but fails in cron with "missing environment variables"
**Why it happens:** Cron has minimal environment; .env file not sourced correctly
**How to avoid:** cron-wrapper.sh already sources .env file (lines 27-31) - ensure POSTMARK variables added to .env file, not just exported in shell
**Warning signs:** Works in terminal, fails in cron; env var logging shows missing values

## Code Examples

Verified patterns from official sources:

### Basic Email Sending
```javascript
// Source: https://postmarkapp.com/send-email/node
const postmark = require('postmark');

const client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

client.sendEmail({
  From: 'sender@example.com',
  To: 'recipient@example.com',
  Subject: 'Test Email',
  TextBody: 'Hello from Postmark!',
  HtmlBody: '<strong>Hello</strong> from Postmark!' // Optional
})
.then(() => console.log('Email sent'))
.catch(error => console.error('Error:', error.message));
```

### Promise-Based Error Handling
```javascript
// Source: https://github.com/ActiveCampaign/postmark.js/wiki/Error-Handling
client.sendEmail(emailData)
  .catch(error => {
    if (error instanceof postmark.Errors.UnknownError) {
      console.error('Unknown error:', error.message);
    }
    if (error.name === 'ApiInputError') {
      console.error('Invalid input:', error.message, error.statusCode);
    }
    // Log but don't throw - graceful degradation
  });
```

### Reading Log File for Email
```javascript
// Standard Node.js pattern
const fs = require('fs');

function readLogFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Failed to read log file ${filePath}:`, error.message);
    process.exit(1);
  }
}
```

### Environment Variable Validation
```javascript
// Defensive programming for production scripts
function validateEnv() {
  const required = {
    POSTMARK_API_KEY: 'Postmark Server API Token',
    POSTMARK_FROM_EMAIL: 'Verified sender email address',
    OPERATOR_EMAIL: 'Recipient email address'
  };

  const missing = [];
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`${key} (${description})`);
    }
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(item => console.error(`  - ${item}`));
    process.exit(1);
  }
}
```

### Bash Integration Pattern
```bash
# Source: Bash best practices for Node.js exit code handling
# https://community.atlassian.com/forums/Bitbucket-questions/Attempting-to-fail-a-pipeline-conditionally-from-within-a-node/qaq-p/2286767

# Run Node.js script and handle failure gracefully
if [ -n "$POSTMARK_API_KEY" ]; then
    node "$PROJECT_DIR/scripts/send-email.js" "$LOG_FILE" || {
        EXIT_CODE=$?
        echo "Warning: Email notification failed with code $EXIT_CODE" >&2
        # Don't propagate error - email is supplementary
    }
fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Local `mail` command | Postmark API | 2024+ | Reliable delivery, tracking, better deliverability |
| SMTP integration | REST API via npm package | 2015+ (Postmark.js v2) | Faster, simpler, better error handling |
| Callback-based API | Promise-based API | 2018+ (Postmark.js v2) | async/await support, cleaner error handling |
| Single env var for email | Separate sender/recipient vars | Current best practice | Flexibility for different environments |

**Deprecated/outdated:**
- **Postmark.js v1.x (callback-based):** v2.0+ uses promises; minimum Node.js v14.0.0 required
- **`mail` command for transactional email:** Unreliable, no delivery tracking, poor deliverability
- **Hardcoded test tokens in code:** Use environment variables for all credentials

## Open Questions

Things that couldn't be fully resolved:

1. **Sender Domain Verification Status**
   - What we know: Postmark requires verified sender signatures or domain verification
   - What's unclear: Whether user has already verified their domain or needs individual sender signature
   - Recommendation: install-cron.sh should prompt for FROM_EMAIL and include instructions to verify it in Postmark dashboard before sending first email

2. **Email Format Preference**
   - What we know: Postmark supports TextBody, HtmlBody, or both (multipart)
   - What's unclear: Whether sync reports should be plain text only or include HTML formatting
   - Recommendation: Start with TextBody only (log files are plain text), add HTML formatting in future iteration if needed

3. **Retry Mechanism for Email**
   - What we know: Requirement EMAIL-05 says "Email failure is logged but does not fail the sync"
   - What's unclear: Should email send be retried on transient failures (network timeout) vs permanent failures (invalid sender)?
   - Recommendation: No retries - log the error and continue. Sync logs are saved to disk, operator can manually check logs/ directory if email doesn't arrive

## Sources

### Primary (HIGH confidence)
- [GitHub: ActiveCampaign/postmark.js](https://github.com/ActiveCampaign/postmark.js) - Official library repository
- [Postmark Error Handling Wiki](https://github.com/ActiveCampaign/postmark.js/wiki/Error-Handling) - Official error handling patterns
- [Postmark API Overview](https://postmarkapp.com/developer/api/overview) - Authentication, error codes, rate limits
- [Postmark Sending Email with API](https://postmarkapp.com/developer/user-guide/send-email-with-api) - Required fields, sender verification
- [Postmark Managing Sender Signatures](https://postmarkapp.com/developer/user-guide/managing-your-account/managing-sender-signatures) - Sender verification requirements

### Secondary (MEDIUM confidence)
- [Postmark Sandbox Mode](https://postmarkapp.com/developer/user-guide/sandbox-mode) - Testing with test@blackhole.postmarkapp.com
- [How to Send Transactional Emails with Postmark API in Node.js](https://www.suprsend.com/post/how-to-send-transactional-emails-with-postmark-api-in-node-js-w-codes-and-examples) - Code examples verified against official docs
- [Send emails with Node.js (Postmark)](https://postmarkapp.com/send-email/node) - Official quick start guide
- [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices) - Industry best practices

### Tertiary (LOW confidence)
- [Medium: Error Handling in Email APIs](https://www.emailservicebusiness.com/blog/error-handling-in-email-apis-best-practices/) - Generic best practices, not Postmark-specific
- [Medium: 5 Tips for Effective Retry Logic in Node.js APIs](https://article.arunangshudas.com/5-tips-for-effective-retry-logic-in-node-js-apis-cfb5cfb8dfab) - General Node.js patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official library, well-documented, maintained by Postmark
- Architecture: HIGH - Patterns verified with official docs and existing project structure
- Pitfalls: MEDIUM - Common issues documented in community sources, some inferred from error codes

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days) - Postmark API is stable, npm package updates infrequently
