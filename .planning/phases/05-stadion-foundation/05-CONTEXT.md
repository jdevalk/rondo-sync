# Phase 5: Stadion Foundation - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a Stadion API client that authenticates to WordPress REST API using application password and handles errors gracefully. This phase builds the foundation — actual member sync logic is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User indicated all areas are Claude's discretion. The following will be determined during research and planning, following patterns established in existing codebase (Laposta client):

**Error handling:**
- Structured error responses with status codes and messages
- No crashes — always return actionable error info
- Match existing error handling patterns in submit-laposta-list.js

**Logging & debugging:**
- Integrate with existing logger (lib/logger.js)
- Verbose mode for detailed request/response logging
- Standard logging for operations and errors

**Connection behavior:**
- Reasonable timeouts appropriate for REST API calls
- No connection pooling needed (simple HTTP requests)
- No rate limiting initially (Stadion is private instance)

**Credential validation:**
- Load from environment variables (STADION_* prefix)
- Fail early with clear message if credentials missing
- Test connection on first use

</decisions>

<specifics>
## Specific Ideas

No specific requirements — follow patterns established in existing Laposta integration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-stadion-foundation*
*Context gathered: 2026-01-25*
