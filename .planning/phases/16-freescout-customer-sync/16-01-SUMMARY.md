---
phase: 16
plan: 01
subsystem: freescout
tags: [freescout, api, database, sqlite, sync]
completed: 2026-01-28
duration: ~5 minutes
requires: []
provides:
  - "FreeScout database tracking module (lib/freescout-db.js)"
  - "FreeScout API client (lib/freescout-client.js)"
affects:
  - "16-02: Will use freescout-client.js for API calls"
  - "16-02: Will use freescout-db.js for sync state tracking"
tech-stack:
  added:
    - freescout-sync.sqlite (new database for FreeScout sync tracking)
  patterns:
    - Hash-based change detection (same as stadion-db.js)
    - Native https module for API requests (same as stadion-client.js)
key-files:
  created:
    - lib/freescout-db.js
    - lib/freescout-client.js
    - freescout-sync.sqlite (on first run)
decisions:
  - id: use-native-https
    choice: "Use native https module instead of axios/got"
    reason: "Consistent with existing stadion-client.js pattern"
  - id: knvb-id-as-key
    choice: "Use KNVB ID as primary key for customer tracking"
    reason: "KNVB ID is stable identifier, email can change"
metrics:
  tasks-completed: 2
  tasks-total: 2
  commits: 2
---

# Phase 16 Plan 01: FreeScout Foundation Summary

SQLite database module and API client for FreeScout customer sync, following established codebase patterns from Stadion sync.

## What Was Built

### 1. Database Module (lib/freescout-db.js)

Created `freescout-sync.sqlite` with `freescout_customers` table:

| Column | Type | Purpose |
|--------|------|---------|
| knvb_id | TEXT UNIQUE | Stable member identifier |
| email | TEXT | Customer email for FreeScout |
| freescout_id | INTEGER | FreeScout customer ID (after first sync) |
| data_json | TEXT | Prepared customer payload |
| source_hash | TEXT | SHA-256 hash for change detection |
| last_synced_hash | TEXT | Hash at last successful sync |
| last_seen_at | TEXT | Last time member was in Sportlink data |
| last_synced_at | TEXT | Last successful sync timestamp |

**Exported functions:**
- `openDb(dbPath)` - Open/initialize database
- `upsertCustomers(db, customers)` - Bulk insert/update
- `getCustomersNeedingSync(db, force)` - Get changed customers
- `updateSyncState(db, knvbId, sourceHash, freescoutId)` - Mark synced
- `getCustomerByKnvbId(db, knvbId)` - Single customer lookup
- `getCustomerByFreescoutId(db, freescoutId)` - Reverse lookup
- `getCustomersNotInList(db, knvbIds)` - Delete detection
- `deleteCustomer(db, knvbId)` - Remove from tracking
- `getAllTrackedCustomers(db)` - Get all records

### 2. API Client (lib/freescout-client.js)

HTTP client for FreeScout REST API:

**Environment variables required:**
- `FREESCOUT_API_KEY` - API key from FreeScout Settings
- `FREESCOUT_BASE_URL` - FreeScout installation URL

**Exported functions:**
- `freescoutRequest(endpoint, method, body, options)` - Authenticated API calls
- `testConnection(options)` - Verify credentials work
- `checkCredentials()` - Check if env vars are set

**CLI usage:**
```bash
# Test connection (requires env vars)
node lib/freescout-client.js --verbose

# Without env vars - shows clear error
node lib/freescout-client.js
# Output: FreeScout connection FAILED: Missing FREESCOUT_API_KEY and/or FREESCOUT_BASE_URL
```

## Verification Results

| Check | Status |
|-------|--------|
| freescout-db.js loads | Pass |
| freescout-client.js loads | Pass |
| Database file created | Pass |
| CLI without env vars exits 1 | Pass |
| CLI with valid env vars exits 0 | Pending (user setup required) |

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

Before using FreeScout sync, add to `.env`:

```bash
FREESCOUT_API_KEY=your-api-key-here
FREESCOUT_BASE_URL=https://support.yourclub.nl
```

Get API key from: FreeScout Settings -> API Keys -> Create new key

## Commits

| Hash | Type | Description |
|------|------|-------------|
| fd9f5ee | feat | Create FreeScout database module |
| fb2c709 | feat | Create FreeScout API client |

## Next Steps

Plan 16-02 will build on this foundation to:
1. Prepare customer data from Sportlink members
2. Sync customers to FreeScout API
3. Handle create/update/delete operations
