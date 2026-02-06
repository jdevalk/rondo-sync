# Phase 5: Stadion Foundation - Research

**Researched:** 2026-01-25
**Domain:** WordPress REST API client with application password authentication
**Confidence:** HIGH

## Summary

Phase 5 creates a Stadion API client that authenticates to WordPress REST API using application passwords (WordPress 5.6+). The research examined WordPress REST API authentication patterns, error handling, and the existing Laposta integration to establish consistent patterns.

**Key findings:**
- Application passwords use HTTP Basic Authentication over HTTPS (standard since WordPress 5.6)
- Node.js built-in `https` module is sufficient (matches existing Laposta pattern)
- WordPress REST API returns structured JSON errors with HTTP status codes
- Existing codebase uses Node.js `https` module without external HTTP libraries

**Primary recommendation:** Follow the Laposta integration pattern in `submit-laposta-list.js` - use Node.js `https` module with Basic Auth, structured error responses, and integrate with existing `lib/logger.js`.

## Standard Stack

The established approach for WordPress REST API clients in Node.js:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `https` | Built-in | HTTP requests | Zero dependencies, matches existing codebase pattern |
| varlock | latest | Environment variables | Already used in codebase for credential loading |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | latest | State tracking | For hash-based change detection (Phase 6) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `https` | node-wpapi | node-wpapi adds 1.7k stars library but breaks codebase consistency; existing pattern works |
| Native `https` | axios/got | Adds external dependency; existing pattern uses built-in modules |
| Application passwords | JWT plugins | Application passwords are WordPress core since 5.6, no plugin needed |

**Installation:**
```bash
# No new dependencies needed for Phase 5
# varlock and better-sqlite3 already in package.json
```

**Source:** Codebase analysis shows consistent use of Node.js built-in modules (https, path, fs) without external HTTP libraries. The `submit-laposta-list.js` file demonstrates this pattern successfully.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── logger.js          # Existing dual-stream logger
└── stadion-client.js  # New: Stadion API client (Phase 5)

# Phase 6+ will add:
prepare-stadion-members.js  # Transform Sportlink → Stadion
submit-stadion-list.js      # Sync to Stadion API
```

### Pattern 1: Module/CLI Hybrid
**What:** Export async function for programmatic use, detect CLI mode with `require.main === module`
**When to use:** All main scripts in this codebase
**Example:**
```javascript
// Source: submit-laposta-list.js pattern
async function runSubmit(options = {}) {
  const { logger, verbose = false, force = false } = options;
  // Implementation
  return { success: true, data: {} };
}

module.exports = { runSubmit };

// CLI entry point
if (require.main === module) {
  const { verbose } = parseArgs(process.argv);
  runSubmit({ verbose })
    .then(result => {
      if (!result.success) process.exitCode = 1;
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exitCode = 1;
    });
}
```

### Pattern 2: Promise-Based HTTPS Requests
**What:** Wrap Node.js `https.request()` in Promise for async/await usage
**When to use:** All API calls (Laposta uses this, Stadion should match)
**Example:**
```javascript
// Source: submit-laposta-list.js lines 72-121
function stadionRequest(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RONDO_APP_PASSWORD;
    const username = process.env.RONDO_USERNAME;

    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');

    const options = {
      hostname: new URL(process.env.RONDO_URL).hostname,
      path: `/wp-json/wp/v2/${endpoint}`,
      method: method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: parsed });
        } else {
          const error = new Error(`WordPress API error (${res.statusCode})`);
          error.details = parsed;
          reject(error);
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}
```

### Pattern 3: Structured Error Response
**What:** Errors are objects with `message` and `details` properties, never crash the process
**When to use:** All error handling
**Example:**
```javascript
// Source: submit-laposta-list.js lines 320-325
try {
  const response = await stadionRequest(endpoint, 'POST', data);
  // Success path
} catch (error) {
  const errorMessage = error.details?.error?.message || error.message || String(error);
  result.errors.push({
    item: itemIdentifier,
    message: errorMessage
  });
  // Continue processing other items
}
```

### Pattern 4: Logger Integration
**What:** Accept optional logger in function options, provide fallback for standalone use
**When to use:** All functions that need logging
**Example:**
```javascript
// Source: submit-laposta-list.js lines 246-247
const { logger, verbose = false } = options;
const logVerbose = logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {});

// Usage:
logVerbose('Processing item 1/10');
logger?.log('Summary message');
logger?.error('Error occurred:', err.message);
```

### Pattern 5: Environment Variable Loading
**What:** Use `varlock/auto-load` at top of file, read with `process.env.VAR_NAME`
**When to use:** All scripts needing configuration
**Example:**
```javascript
// Source: submit-laposta-list.js line 1
require('varlock/auto-load');

// Later:
const apiKey = process.env.RONDO_APP_PASSWORD;
if (!apiKey) {
  throw new Error('RONDO_APP_PASSWORD not found in .env file');
}
```

### Anti-Patterns to Avoid
- **External HTTP libraries:** Don't add axios/node-fetch/got - breaks codebase consistency
- **Callback-based async:** Don't use callbacks - existing code uses Promises/async-await
- **Throwing in loops:** Don't throw errors - collect them and return in result object
- **Global loggers:** Don't use console.* directly - accept logger via options

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP Basic Auth | Manual header construction | `Buffer.from(user:pass).toString('base64')` | Standard pattern, no library needed |
| WordPress application passwords | JWT/OAuth plugins | WordPress core since 5.6 | No plugin needed, HTTPS-only requirement |
| Dual logging (stdout + file) | Custom logger | `lib/logger.js` (existing) | Already handles timestamps, file rotation, verbose mode |
| Environment variables | `fs.readFileSync('.env')` | varlock (existing) | Already in package.json, handles parsing |
| Promise wrapping | async callbacks | Pattern from submit-laposta-list.js | Proven, consistent with codebase |

**Key insight:** This codebase deliberately uses zero external HTTP libraries. The `https` module pattern in `submit-laposta-list.js` handles all edge cases (partial data, JSON parsing failures, error status codes).

## Common Pitfalls

### Pitfall 1: Application Password Spacing
**What goes wrong:** Users copy application passwords with spaces, causing "401 Unauthorized"
**Why it happens:** WordPress generates passwords with spaces for readability ("abcd 1234 efgh 5678"), but the actual password includes those spaces
**How to avoid:** Accept the password exactly as generated, including spaces - the Base64 encoding handles it correctly
**Warning signs:** 401 errors when credentials look correct
**Source:** [WordPress support forums](https://wordpress.org/support/topic/application-password-failing/) document this as the #1 user mistake

### Pitfall 2: Missing HTTPS Requirement
**What goes wrong:** Authentication fails silently or isn't available
**Why it happens:** WordPress disables application passwords on non-HTTPS sites by default for security
**How to avoid:** Verify `RONDO_URL` uses `https://` scheme, fail fast with clear error if not
**Warning signs:** Application password UI not available in WordPress admin
**Source:** [WordPress Application Passwords docs](https://developer.wordpress.org/rest-api/reference/application-passwords/) state HTTPS is required

### Pitfall 3: CGI Environment Header Stripping
**What goes wrong:** Authorization header never reaches WordPress
**Why it happens:** Some CGI/FastCGI web servers strip Authorization headers by default
**How to avoid:** Document this as potential hosting issue, test authentication early
**Warning signs:** Requests act as unauthenticated even with correct credentials
**Source:** [WordPress REST API FAQ](https://developer.wordpress.org/rest-api/frequently-asked-questions/) and [WordPress Trac #51939](https://core.trac.wordpress.org/ticket/51939)

### Pitfall 4: Staging Basic Auth Conflicts
**What goes wrong:** REST API returns 401 even with valid application password
**Why it happens:** If site already uses Basic Auth for staging protection, the web server processes that first
**How to avoid:** Either remove staging Basic Auth or whitelist IP addresses for API access
**Warning signs:** Works in production but fails in staging environments
**Source:** [WordPress Trac #51939](https://core.trac.wordpress.org/ticket/51939) - fixed in WP 5.6+ but hosting configs can reintroduce it

### Pitfall 5: Timeout Too Short
**What goes wrong:** Large responses or slow WordPress installations cause ETIMEDOUT
**Why it happens:** Node.js `https` module default timeout is no timeout, but explicit 5s can be too short
**How to avoid:** Set reasonable timeout (15-30 seconds), handle ETIMEDOUT gracefully
**Warning signs:** Intermittent timeouts, fails on large data sets
**Source:** WordPress HTTP API uses 5s default but [recommends 30s for API calls](https://www.robert-michalski.com/blog/wordpress-increase-http-timeout-for-plugins)

### Pitfall 6: Partial Response Handling
**What goes wrong:** JSON.parse() throws on incomplete response data
**Why it happens:** HTTP responses can arrive in multiple chunks
**Why existing pattern works:** Laposta client accumulates chunks with `data += chunk` before parsing
**How to avoid:** Use the chunk accumulation pattern from `submit-laposta-list.js`
**Warning signs:** Random "Unexpected end of JSON" errors

## Code Examples

Verified patterns from official sources and existing codebase:

### WordPress REST API Authentication Header
```javascript
// Source: WordPress developer docs
// https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
const username = 'admin';
const appPassword = 'abcd 1234 efgh 5678'; // Keep spaces as-is
const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Content-Type': 'application/json'
};
```

### Environment Variable Pattern
```javascript
// Source: Existing codebase pattern (submit-laposta-list.js lines 13-15)
require('varlock/auto-load');

function readEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

const stadionUrl = readEnv('RONDO_URL');
const stadionUsername = readEnv('RONDO_USERNAME');
const stadionPassword = readEnv('RONDO_APP_PASSWORD');

if (!stadionUrl || !stadionUsername || !stadionPassword) {
  throw new Error('RONDO_URL, RONDO_USERNAME, and RONDO_APP_PASSWORD required in .env');
}
```

### Test Connection Function
```javascript
// Source: Inferred from requirements STAD-03, STAD-04
// Pattern: Make simple GET request to validate credentials
async function testConnection() {
  try {
    // WordPress REST API root provides version info without auth
    const response = await stadionRequest('', 'GET', '');
    return { success: true, version: response.body.name };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.details
    };
  }
}
```

### WordPress Error Response Parsing
```javascript
// Source: WordPress REST API error format
// https://developer.wordpress.org/plugins/rest-api/responses-2/
// Example error response:
// {
//   "code": "rest_invalid_param",
//   "message": "Invalid parameter(s): email",
//   "data": {
//     "status": 400,
//     "params": {
//       "email": "Invalid email address."
//     }
//   }
// }

function parseWordPressError(errorBody) {
  if (typeof errorBody === 'object' && errorBody.code) {
    return {
      code: errorBody.code,
      message: errorBody.message || 'Unknown error',
      status: errorBody.data?.status || 500,
      params: errorBody.data?.params || {}
    };
  }
  return {
    code: 'unknown',
    message: String(errorBody),
    status: 500,
    params: {}
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cookie-based REST API auth | Application passwords | WordPress 5.6 (Dec 2020) | Enables stateless API clients, no session management |
| Plugin-based Basic Auth | WordPress core app passwords | WordPress 5.6 (Dec 2020) | No plugin dependency, more secure |
| Callback-based HTTP | Promise-based with async/await | Node.js 8+ (2017) | Existing codebase fully Promise-based |
| node-wpapi library | Native `https` module | N/A - project choice | Zero dependencies, full control |

**Deprecated/outdated:**
- **WP Basic Auth plugin:** No longer needed, application passwords are core
- **JWT plugins for REST API:** Complex setup, application passwords are simpler
- **Cookie auth for scripts:** Can't work in cron/headless environments

## Open Questions

Things that couldn't be fully resolved:

1. **Stadion Custom Post Type Name**
   - What we know: WordPress REST API exposes posts at `/wp/v2/posts`, custom post types at `/wp/v2/{type}`
   - What's unclear: The exact custom post type name for "person" records in Stadion
   - Recommendation: Phase 6 should query `/wp/v2/types` endpoint to discover available types, or user provides CPT name as env var

2. **Custom Field Structure**
   - What we know: WordPress REST API can expose custom fields via REST schema
   - What's unclear: Whether Stadion uses ACF, Meta Box, or custom REST fields for person data
   - Recommendation: Phase 6 research should examine actual Stadion API responses to determine field structure

3. **Rate Limiting**
   - What we know: WordPress doesn't have built-in REST API rate limiting
   - What's unclear: Whether Stadion has custom rate limiting or hosting provider limits
   - Recommendation: Start without rate limiting (Phase 5), add if needed after testing (Phase 6)

## Sources

### Primary (HIGH confidence)
- [WordPress REST API Authentication docs](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/) - Official authentication methods
- [WordPress REST API Responses docs](https://developer.wordpress.org/plugins/rest-api/responses-2/) - Error response structure
- [Application Passwords Integration Guide](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) - Official implementation guide
- Codebase file: `submit-laposta-list.js` - Existing proven pattern for API client
- Codebase file: `lib/logger.js` - Existing logger integration

### Secondary (MEDIUM confidence)
- [WordPress REST API Common Errors](https://wordpress.com/blog/2022/10/03/common-wordpress-rest-api-errors/) - Error handling patterns
- [Basic Authentication in Node.js](https://roadmap.sh/guides/http-basic-authentication) - HTTP Basic Auth format
- [WordPress HTTP timeout recommendations](https://www.robert-michalski.com/blog/wordpress-increase-http-timeout-for-plugins) - Timeout best practices

### Tertiary (LOW confidence)
- [node-wpapi GitHub](https://github.com/WP-API/node-wpapi) - Alternative library (decided against)
- Various WordPress support forum threads - Application password troubleshooting

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - WordPress application passwords are core since 5.6, existing codebase pattern is proven
- Architecture: HIGH - All patterns verified in existing submit-laposta-list.js
- Pitfalls: HIGH - Documented in official WordPress docs and support forums
- Stadion-specific details: LOW - Will be resolved in Phase 6 research/implementation

**Research date:** 2026-01-25
**Valid until:** 90 days (WordPress REST API is stable, application passwords unlikely to change)

**Requirements coverage:**
- STAD-03 (authentication): Covered - application password pattern identified
- STAD-04 (error handling): Covered - structured error pattern from Laposta client
- STAD-18 (environment variables): Covered - existing varlock pattern applies
