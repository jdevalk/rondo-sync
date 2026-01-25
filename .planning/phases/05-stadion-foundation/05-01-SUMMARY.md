# Phase 05 Plan 01: Stadion API Client Summary

**One-liner:** WordPress REST API client with application password authentication and structured error handling

**Completed:** 2026-01-25
**Duration:** 2 minutes

---

## What Was Built

Created `lib/stadion-client.js` - a WordPress REST API client that establishes the foundation for Stadion synchronization. This module handles authentication using WordPress application passwords, makes HTTPS requests following established codebase patterns, and provides comprehensive error handling.

### Core Components

1. **stadionRequest(endpoint, method, body, options)** - Promise-based HTTPS request function
   - WordPress application password authentication via Basic Auth
   - 30 second timeout handling
   - JSON request/response handling
   - Structured error responses with details property
   - Logger integration for verbose output

2. **testConnection(options)** - Credential validation function
   - Tests connection to WordPress REST API root endpoint
   - Returns success/failure result objects (never throws)
   - Extracts site name and URL from response
   - WordPress error parsing and normalization

3. **CLI entry point** - Standalone testing capability
   - Module/CLI hybrid pattern matching codebase style
   - `--verbose` flag support
   - Clear success/failure output
   - Proper exit codes (0 for success, 1 for failure)

### Key Features

- **Credential validation** - Checks STADION_URL, STADION_USERNAME, STADION_APP_PASSWORD exist before making requests
- **HTTPS enforcement** - Requires STADION_URL to start with 'https://'
- **Error handling** - Network errors, timeouts, and API errors return structured objects
- **WordPress error parsing** - Normalizes various WordPress error formats to consistent structure
- **Pattern consistency** - Follows established patterns from submit-laposta-list.js (varlock, https module, Promise-based)

---

## Technical Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| WordPress application password auth | Avoids browser automation complexity, uses native WordPress feature | Simple, secure, maintainable authentication |
| Basic Auth header | Standard WordPress REST API authentication method | Compatible with all WordPress sites |
| 30 second timeout | Balances network latency tolerance with fail-fast behavior | Prevents hanging on slow/unresponsive sites |
| Structured error responses | Error objects with `details` property matching Laposta pattern | Consistent error handling across codebase |
| Promise-based async | Matches existing codebase pattern (not callbacks or async/await everywhere) | Consistency with Laposta client implementation |
| Logger integration via options | Optional logger parameter for verbose logging | Flexible logging in both CLI and programmatic use |

---

## Files Created/Modified

### Created
- `lib/stadion-client.js` (240 lines) - WordPress REST API client with authentication

### Modified
- None (net new functionality)

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Testing Performed

1. **Syntax validation** - `node --check lib/stadion-client.js` passed
2. **Module exports** - Verified `stadionRequest` and `testConnection` exported correctly
3. **CLI execution** - Tested standalone execution with missing env vars (graceful error handling)
4. **Pattern verification** - Confirmed varlock/auto-load usage and Basic Auth header construction

---

## Integration Points

**Consumed by:**
- Future Stadion sync operations (05-02 and beyond)
- Any code needing to interact with Stadion WordPress site

**Dependencies:**
- `varlock/auto-load` - Environment variable loading
- `https` (Node.js core) - HTTPS requests
- `url` (Node.js core) - URL parsing

**Environment variables:**
- `STADION_URL` - WordPress site URL (must start with https://)
- `STADION_USERNAME` - WordPress username
- `STADION_APP_PASSWORD` - Application password from WordPress Admin

---

## Next Steps

**Immediate (Plan 05-02):**
- Implement person record fetching from Stadion
- Use stadionRequest() to query WordPress REST API for person records
- Filter by KNVB ID custom field to find matching members

**Future phases:**
- Create person records in Stadion (parent sync)
- Update person records with Sportlink data
- Integrate Stadion sync into sync-all pipeline

---

## Lessons Learned

**What went well:**
- Following established patterns from submit-laposta-list.js made implementation straightforward
- WordPress application password authentication is much simpler than browser automation
- Module/CLI hybrid pattern provides excellent testability

**Gotchas:**
- WordPress REST API root endpoint is at `/wp-json/` (empty string endpoint in our implementation)
- Error response structure varies (must normalize to consistent format)
- Timeout must be set on request object (not just handled in error event)

**For future reference:**
- This client can be used as template for other WordPress REST API integrations
- parseWordPressError() handles multiple WordPress error formats consistently
- testConnection() pattern (returning result objects vs throwing) works well for credential validation

---

## Metadata

**Phase:** 05-stadion-foundation
**Plan:** 01
**Type:** foundation
**Subsystem:** stadion-integration

**Tags:** wordpress, rest-api, authentication, http-client, foundation

**Commits:**
- cb5c4e9: feat(05-01): create Stadion API client with authentication
- a5390ac: feat(05-01): add test connection and WordPress error parsing
- e6c1c42: feat(05-01): add CLI entry point for testing connection

**Dependencies:**
- Requires: Phase 0 (project setup), varlock configuration
- Provides: Stadion API client for all future Stadion operations
- Affects: Plans 05-02, 05-03, 06-*, 07-* (all Stadion sync plans)

**Tech Stack:**
- Added: None (uses existing Node.js core modules)
- Patterns: Promise-based HTTP client, module/CLI hybrid, structured error handling
