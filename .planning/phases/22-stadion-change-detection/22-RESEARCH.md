# Phase 22: Stadion Change Detection - Research

**Researched:** 2026-01-29
**Domain:** WordPress REST API querying and change detection
**Confidence:** HIGH

## Summary

This phase implements detection of Stadion member changes for reverse sync. The system queries the WordPress REST API for members modified since the last detection run, then uses field-level hash comparison to identify actual changes in the 7 tracked fields. The research confirms that WordPress REST API provides `modified_after` query parameter for efficient filtering, the existing hash-based change detection pattern can be adapted, and pagination follows established patterns from team/commissie sync.

The standard approach is:
1. Query Stadion API with `modified_after={last_detection_timestamp}` and pagination
2. For each returned member, compare field hashes against local database
3. Filter out false positives (Stadion-only fields, sync_origin=forward)
4. Store detected changes in SQLite audit table
5. Track last detection timestamp for incremental runs

**Primary recommendation:** Use WordPress REST API `modified_after` parameter with incremental timestamp tracking, hash-based field comparison, and SQLite audit table storage following existing codebase patterns.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lib/stadion-client.js | existing | WordPress REST API client with auth | Already used for all Stadion interactions |
| lib/stadion-db.js | existing | SQLite operations and schema | Existing database with timestamp columns |
| lib/sync-origin.js | existing | Tracked fields constants and utilities | Phase 20/21 infrastructure |
| better-sqlite3 | existing | Fast SQLite database | Used throughout codebase for state tracking |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (built-in) | Node.js | SHA-256 hashing for field change detection | Reuse computeSourceHash pattern |
| lib/logger.js | existing | Dual-stream logging | All sync operations log to stdout + files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| modified_after API filter | Fetch all members and filter locally | API filter is much more efficient (reduces data transfer, server processing) |
| Hash comparison | Direct value comparison | Hashing provides consistency with existing change detection and handles complex nested objects |
| SQLite audit table | In-memory detection only | Audit table provides history, enables email reports, and supports debugging |

**Installation:**
No new dependencies required - all libraries already present.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── stadion-client.js       # Existing REST API client
├── stadion-db.js           # Existing DB with timestamp columns
├── sync-origin.js          # Existing tracked fields + utilities
└── detect-stadion-changes.js  # NEW: Change detection logic

detect-stadion-changes.js   # NEW: CLI wrapper + main function
```

### Pattern 1: Incremental Detection with Timestamp Tracking
**What:** Store last detection run timestamp, query only members modified since then
**When to use:** Every detection run (reduces API load, focuses on recent changes)
**Example:**
```javascript
// Store in SQLite table or file
const lastDetection = db.prepare(
  'SELECT last_detection_at FROM reverse_sync_state LIMIT 1'
).get();

const since = lastDetection?.last_detection_at || '2026-01-01T00:00:00Z';

// Query Stadion API (modified_after is WordPress REST API standard parameter)
const endpoint = `wp/v2/people?per_page=100&page=${page}&modified_after=${since}&_fields=id,modified_gmt,acf`;
```

**Source:** Existing pagination pattern from submit-stadion-teams.js (line 25) and submit-stadion-commissies.js (line 26)

### Pattern 2: Hash-Based Field Change Detection
**What:** Compute hash of tracked field values, compare against stored hash
**When to use:** For every member returned by modified_after query
**Example:**
```javascript
// Source: lib/stadion-db.js computeSourceHash() pattern (lines 28-31)
const { TRACKED_FIELDS } = require('./sync-origin');

function computeTrackedFieldsHash(knvbId, memberData) {
  const trackedData = {};
  for (const field of TRACKED_FIELDS) {
    // Extract field value from Stadion ACF structure
    trackedData[field] = extractFieldValue(memberData.acf, field);
  }

  const payload = stableStringify({ knvb_id: knvbId, data: trackedData });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Source:** Existing pattern in lib/stadion-db.js (lines 8-31)

### Pattern 3: Pagination for Large Datasets
**What:** Fetch 100 members per API call, iterate until empty response
**When to use:** Always (Stadion may have hundreds of members)
**Example:**
```javascript
// Source: submit-stadion-teams.js (lines 23-31)
let page = 1;
const allMembers = [];

while (true) {
  const response = await stadionRequest(
    `wp/v2/people?per_page=100&page=${page}&modified_after=${since}`,
    'GET',
    null,
    options
  );

  const pageMembers = response.body;
  if (pageMembers.length === 0) break;

  allMembers.push(...pageMembers);
  page++;
}
```

### Pattern 4: Audit Logging for Detected Changes
**What:** Store detected changes in SQLite table for history and email reports
**When to use:** For every detected change
**Example:**
```javascript
// Similar to conflict_resolutions table pattern (Phase 21)
db.prepare(`
  INSERT INTO stadion_change_detections
    (knvb_id, field_name, old_value, new_value, detected_at, stadion_modified_gmt)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(knvbId, field, oldValue, newValue, now, modifiedGmt);
```

**Source:** Phase 21 conflict_resolutions pattern (lib/stadion-db.js lines 322-341)

### Anti-Patterns to Avoid
- **Querying all members every time:** Use `modified_after` filter to reduce API load
- **Ignoring modified_gmt timestamp:** Always check against local timestamps to avoid re-detecting same changes
- **Not filtering false positives:** Changes to Stadion-only fields (photo, work_history) should not trigger reverse sync
- **Comparing full objects:** Only compare the 7 tracked fields to avoid noise from Stadion-specific data

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field value extraction from WordPress ACF | Custom parser for contact_info array | Existing field mapping pattern | ACF repeater fields (contact_info) require specific logic to extract email/mobile/phone; reuse existing extraction from prepare-stadion-members.js |
| Timestamp comparison | String comparison of ISO dates | sync-origin.js compareTimestamps() | Already handles NULL timestamps, 5-second grace period, and ISO 8601 parsing |
| Hash computation | MD5 or custom hash | stadion-db.js computeSourceHash() pattern | Uses stable JSON serialization and SHA-256; consistent with existing change detection |
| SQLite transactions | Manual BEGIN/COMMIT | better-sqlite3 transaction() | Prevents partial writes on error, significantly faster for bulk operations |

**Key insight:** The existing codebase has mature patterns for all required operations. The biggest risk is inconsistency with existing patterns, not missing functionality.

## Common Pitfalls

### Pitfall 1: WordPress REST API Date Filter Limitations
**What goes wrong:** Using `modified_gmt` directly in query parameter causes 400 error
**Why it happens:** WordPress REST API uses `modified_after` and `modified_before` (not `modified_gmt_after`)
**How to avoid:** Use `modified_after` parameter with ISO 8601 timestamp
**Warning signs:** API returns 400 with "rest_invalid_param" error code

**Sources:**
- [WordPress REST API Posts reference](https://developer.wordpress.org/rest-api/reference/posts/)
- [GitHub issue on modified date filtering](https://github.com/WP-API/WP-API/issues/472)

### Pitfall 2: False Positives from Stadion-Only Fields
**What goes wrong:** Every member with photo uploads triggers reverse sync detection
**Why it happens:** WordPress updates `modified_gmt` for ANY field change, including photos
**How to avoid:**
1. Only hash the 7 TRACKED_FIELDS for comparison (ignore photo, work_history, etc.)
2. Check if hash of tracked fields actually changed
3. Verify `sync_origin` column - skip if last change was from forward sync
**Warning signs:** Excessive detections immediately after photo sync runs

**Example filter logic:**
```javascript
// Compute hash ONLY of tracked fields
const currentHash = computeTrackedFieldsHash(member.knvb_id, stadionData);
const storedHash = dbRow.tracked_fields_hash; // New column needed

// FALSE POSITIVE: modified_gmt changed but tracked fields unchanged
if (currentHash === storedHash) {
  logger.verbose(`Skipping ${knvbId}: modified_gmt changed but tracked fields unchanged`);
  continue;
}

// FALSE POSITIVE: last change was from forward sync
if (dbRow.sync_origin === SYNC_ORIGIN.SYNC_FORWARD) {
  logger.verbose(`Skipping ${knvbId}: last change was from forward sync`);
  continue;
}
```

### Pitfall 3: Missing Field Extraction from ACF Contact Info
**What goes wrong:** email/mobile/phone comparison fails despite values being different
**Why it happens:** Stadion stores contact info as ACF repeater array, not direct fields
**How to avoid:** Reuse existing extraction logic from prepare-stadion-members.js
**Warning signs:** Detection logs show "null !== actual_value" comparisons

**Example extraction:**
```javascript
// Stadion ACF structure:
{
  "contact_info": [
    {"contact_type": "email", "contact_value": "user@example.com"},
    {"contact_type": "mobile", "contact_value": "+31612345678"}
  ]
}

// Must extract like prepare-stadion-members.js does:
function extractContactField(contactInfo, type) {
  const entry = contactInfo?.find(c => c.contact_type === type);
  return entry?.contact_value || null;
}

const email = extractContactField(stadionData.acf.contact_info, 'email');
const mobile = extractContactField(stadionData.acf.contact_info, 'mobile');
```

**Source:** prepare-stadion-members.js field extraction pattern

### Pitfall 4: Not Tracking Last Detection Timestamp
**What goes wrong:** Every detection run re-processes all members modified since epoch
**Why it happens:** No persistent storage of last successful detection timestamp
**How to avoid:** Store `last_detection_at` in SQLite after successful detection run
**Warning signs:** Detection runs take longer over time as more members accumulate modifications

**Example schema:**
```sql
CREATE TABLE IF NOT EXISTS reverse_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton row
  last_detection_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- After successful detection:
INSERT OR REPLACE INTO reverse_sync_state (id, last_detection_at, updated_at)
VALUES (1, ?, ?);
```

## Code Examples

Verified patterns from official sources and existing codebase:

### Query Stadion API with Pagination and Modified Filter
```javascript
// Source: submit-stadion-teams.js (lines 23-31), WordPress REST API reference
const { stadionRequest } = require('./lib/stadion-client');

async function fetchModifiedMembers(since, options) {
  const members = [];
  let page = 1;

  while (true) {
    // _fields parameter reduces response size (only fetch what we need)
    const endpoint = `wp/v2/people?per_page=100&page=${page}&modified_after=${since}&_fields=id,modified_gmt,acf`;

    try {
      const response = await stadionRequest(endpoint, 'GET', null, options);
      const pageMembers = response.body;

      if (pageMembers.length === 0) break;

      members.push(...pageMembers);
      page++;
    } catch (error) {
      if (error.message.includes('400')) {
        // Invalid modified_after format or other parameter error
        throw new Error(`Invalid API query: ${error.message}`);
      }
      throw error;
    }
  }

  return members;
}
```

### Hash-Based Field Change Detection
```javascript
// Source: lib/stadion-db.js (lines 8-31), lib/sync-origin.js
const crypto = require('crypto');
const { TRACKED_FIELDS } = require('./sync-origin');

/**
 * Deterministic JSON serialization for hash computation.
 * Same pattern as lib/stadion-db.js
 */
function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compute hash of ONLY tracked fields for change detection.
 * Ignores Stadion-only fields (photo, work_history, etc.)
 */
function computeTrackedFieldsHash(knvbId, stadionData) {
  const trackedData = {};

  // Extract only the 7 tracked fields
  for (const field of TRACKED_FIELDS) {
    trackedData[field] = extractFieldValue(stadionData, field);
  }

  const payload = stableStringify({ knvb_id: knvbId, data: trackedData });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Extract field value from Stadion ACF structure.
 * Handles both direct fields and contact_info repeater.
 */
function extractFieldValue(stadionData, field) {
  // Direct ACF fields
  if (['datum_vog', 'freescout_id', 'financiele_blokkade'].includes(field)) {
    return stadionData.acf?.[field] || null;
  }

  // Contact info fields (email, email2, mobile, phone)
  if (['email', 'email2', 'mobile', 'phone'].includes(field)) {
    const contactInfo = stadionData.acf?.contact_info || [];

    // Map field names to contact_type values
    const typeMap = {
      'email': 'email',
      'email2': 'email2', // Note: Stadion may use 'email' with different labels
      'mobile': 'mobile',
      'phone': 'phone'
    };

    const entry = contactInfo.find(c => c.contact_type === typeMap[field]);
    return entry?.contact_value || null;
  }

  return null;
}
```

### Audit Table for Detected Changes
```javascript
// Source: Phase 21 conflict_resolutions pattern (lib/stadion-db.js lines 322-341)

// In lib/stadion-db.js initDb():
db.exec(`
  CREATE TABLE IF NOT EXISTS stadion_change_detections (
    id INTEGER PRIMARY KEY,
    knvb_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    detected_at TEXT NOT NULL,
    stadion_modified_gmt TEXT NOT NULL,
    detection_run_id TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_stadion_change_detections_knvb
    ON stadion_change_detections (knvb_id);

  CREATE INDEX IF NOT EXISTS idx_stadion_change_detections_detected
    ON stadion_change_detections (detected_at);

  CREATE TABLE IF NOT EXISTS reverse_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_detection_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Helper function to log detected change:
function logChangeDetection(db, detection) {
  const stmt = db.prepare(`
    INSERT INTO stadion_change_detections
      (knvb_id, field_name, old_value, new_value, detected_at, stadion_modified_gmt, detection_run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    detection.knvb_id,
    detection.field_name,
    String(detection.old_value || ''),
    String(detection.new_value || ''),
    new Date().toISOString(),
    detection.stadion_modified_gmt,
    detection.detection_run_id
  );
}

// Update last detection timestamp after successful run:
function updateLastDetectionTime(db, timestamp) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO reverse_sync_state (id, last_detection_at, updated_at)
    VALUES (1, ?, ?)
  `);

  stmt.run(timestamp, new Date().toISOString());
}

// Get last detection timestamp:
function getLastDetectionTime(db) {
  const row = db.prepare(
    'SELECT last_detection_at FROM reverse_sync_state WHERE id = 1'
  ).get();

  return row?.last_detection_at || null;
}
```

### Main Detection Logic
```javascript
// detect-stadion-changes.js
const { openDb, getLastDetectionTime, updateLastDetectionTime, logChangeDetection } = require('./lib/stadion-db');
const { TRACKED_FIELDS } = require('./lib/sync-origin');
const { createSyncLogger } = require('./lib/logger');

async function detectChanges(options = {}) {
  const logger = createSyncLogger(options);
  const db = openDb();

  // Get last detection timestamp (incremental detection)
  const lastDetection = getLastDetectionTime(db) || '2026-01-01T00:00:00Z';
  const detectionRunId = new Date().toISOString();

  logger.log(`Detecting Stadion changes since ${lastDetection}`);

  // Fetch members modified since last detection
  const modifiedMembers = await fetchModifiedMembers(lastDetection, options);
  logger.log(`Found ${modifiedMembers.length} members with modified_gmt > ${lastDetection}`);

  const detectedChanges = [];

  for (const stadionMember of modifiedMembers) {
    const knvbId = stadionMember.acf?.['knvb-id'];
    if (!knvbId) continue;

    // Get local database record
    const localMember = db.prepare(
      'SELECT * FROM stadion_members WHERE knvb_id = ?'
    ).get(knvbId);

    if (!localMember) {
      logger.verbose(`Skipping ${knvbId}: not in local database`);
      continue;
    }

    // FILTER: Skip if last change was from forward sync
    if (localMember.sync_origin === 'sync_sportlink_to_stadion') {
      logger.verbose(`Skipping ${knvbId}: last change was from forward sync`);
      continue;
    }

    // Compute hash of tracked fields only
    const currentHash = computeTrackedFieldsHash(knvbId, stadionMember);
    const storedHash = localMember.tracked_fields_hash; // Note: new column needed

    // FILTER: Skip if tracked fields haven't changed
    if (currentHash === storedHash) {
      logger.verbose(`Skipping ${knvbId}: tracked fields unchanged`);
      continue;
    }

    // Detect field-level changes
    const localData = JSON.parse(localMember.data_json);

    for (const field of TRACKED_FIELDS) {
      const oldValue = extractFieldValue(localData, field);
      const newValue = extractFieldValue(stadionMember, field);

      if (oldValue !== newValue) {
        const change = {
          knvb_id: knvbId,
          field_name: field,
          old_value: oldValue,
          new_value: newValue,
          stadion_modified_gmt: stadionMember.modified_gmt,
          detection_run_id: detectionRunId
        };

        logChangeDetection(db, change);
        detectedChanges.push(change);

        logger.verbose(`Detected change: ${knvbId}.${field}: "${oldValue}" -> "${newValue}"`);
      }
    }
  }

  // Update last detection timestamp
  updateLastDetectionTime(db, new Date().toISOString());

  logger.log(`Detection complete: ${detectedChanges.length} field changes across ${new Set(detectedChanges.map(c => c.knvb_id)).size} members`);

  return detectedChanges;
}

module.exports = { detectChanges };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');

  detectChanges({ verbose })
    .then((changes) => {
      console.log(`\nDetected ${changes.length} changes`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('Detection failed:', err.message);
      if (verbose) {
        console.error(err.stack);
      }
      process.exitCode = 1;
    });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No modified date filtering | WordPress REST API `modified_after` parameter | WordPress 4.7+ | Efficiently filter posts by modification date |
| Direct value comparison | Hash-based change detection | Phase 6 (member sync) | Handles complex nested objects, consistent with existing pattern |
| Manual SQL queries | better-sqlite3 prepared statements | Initial implementation | Type-safe, prevents SQL injection, better performance |
| No bidirectional tracking | Per-field timestamps + sync_origin | Phase 20-21 | Enables conflict detection and loop prevention |

**Deprecated/outdated:**
- `modified_gmt` direct filter: Not supported by WordPress REST API, use `modified_after` instead
- Fetching all members for change detection: Use incremental timestamp-based detection
- Global modification timestamps: Use field-level timestamps for granular conflict detection

## Open Questions

1. **Contact Info Email2 Mapping**
   - What we know: Stadion uses contact_info repeater with contact_type values
   - What's unclear: How Stadion distinguishes "email" vs "email2" (both may use contact_type="email" with different labels)
   - Recommendation: Examine existing prepare-stadion-members.js logic, test with actual Stadion data, document mapping

2. **Initial Detection Run Timestamp**
   - What we know: Need a baseline timestamp for first detection run
   - What's unclear: Should we use "now" (ignore historical changes) or "epoch" (detect all existing differences)?
   - Recommendation: Use "now" for first run (only detect future changes), provide --backfill flag for full historical scan

3. **Detection Frequency**
   - What we know: Detection feeds Phase 23-24 reverse sync
   - What's unclear: How often should detection run? Daily? Hourly? On-demand?
   - Recommendation: Start with daily (matches nikki sync frequency), tune based on actual change volume

4. **Tracked Fields Hash Storage**
   - What we know: Need to store hash of tracked fields separately from full member hash
   - What's unclear: Add new column `tracked_fields_hash` or reuse existing columns?
   - Recommendation: Add new column for clarity and to avoid breaking existing hash-based sync detection

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns:
  - lib/stadion-client.js - REST API client (lines 38-135)
  - lib/stadion-db.js - Hash computation (lines 8-31), pagination pattern references
  - lib/sync-origin.js - TRACKED_FIELDS constant (line 24-32), compareTimestamps (lines 66-80)
  - submit-stadion-teams.js - Pagination pattern (lines 23-31)
  - Phase 21 plan - conflict_resolutions audit table pattern
  - Phase 20 plan - Timestamp column schema

### Secondary (MEDIUM confidence)
- [WordPress REST API Posts Reference](https://developer.wordpress.org/rest-api/reference/posts/) - `modified_after` parameter documentation
- [GitHub: WP-API modified date filtering issue](https://github.com/WP-API/WP-API/issues/472) - Community discussion on modified_gmt limitations

### Tertiary (LOW confidence)
- [WP REST API Filter Posts Plugin](https://wordpress.com/plugins/wp-rest-api-filter-posts-date-wise-using-given-column) - Alternative approach using plugin (not needed for our use case)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, patterns proven
- Architecture: HIGH - Direct reuse of existing patterns from 4 different sync operations
- Pitfalls: HIGH - Based on known WordPress REST API limitations and existing codebase gotchas

**Research date:** 2026-01-29
**Valid until:** 90 days (stable WordPress REST API, mature codebase patterns)
