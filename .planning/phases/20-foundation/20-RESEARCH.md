# Phase 20: Foundation (Database & Origin Tracking) - Research

**Researched:** 2026-01-29
**Domain:** SQLite schema migration, bidirectional sync timestamp tracking, origin attribution
**Confidence:** HIGH

## Summary

This phase establishes the database foundation for bidirectional sync by adding per-field timestamp tracking and origin attribution to prevent infinite sync loops. The research confirms that SQLite's ALTER TABLE ADD COLUMN is safe for production use with zero downtime, and the codebase already has established patterns for incremental migrations.

**Key findings:**
- SQLite's ALTER TABLE ADD COLUMN is one of the safest schema operations, with no data loss risk and execution time independent of table size
- The codebase already uses PRAGMA table_info() pattern for safe incremental migrations (see lib/stadion-db.js lines 233-292)
- Per-field timestamp tracking is standard for bidirectional sync, with each syncable field storing modification timestamps for both source systems
- Origin tracking (user vs sync-initiated) is critical and must be implemented before any reverse sync code runs
- UTC normalization is mandatory for timestamp comparisons to avoid timezone-induced errors
- Node.js Date().toISOString() produces RFC 3339 / ISO 8601 format in UTC (already used throughout codebase)

**Primary recommendation:** Add per-field timestamp columns to stadion_members using the existing incremental migration pattern. Store all timestamps in UTC using the current Date().toISOString() approach. Implement origin tracking through a dedicated column (sync_origin) to distinguish user edits from sync-initiated changes.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | Current | SQLite database access | Already in use, synchronous API, fastest Node.js SQLite library |
| Node.js Date | ES6+ | UTC timestamp generation | Native, Date().toISOString() produces RFC 3339/ISO 8601 format in UTC |
| PRAGMA table_info() | SQLite native | Schema inspection for migrations | Standard SQLite introspection, no external dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| NTP/Chrony | System | Clock synchronization | Production server time accuracy (required for timestamp-based conflict resolution) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-field columns | JSON metadata column | Per-field columns provide better query performance and type safety; JSON would be harder to query and validate |
| UTC timestamps | Unix epoch integers | ISO 8601 strings are human-readable, sortable, and consistent with existing codebase patterns |
| Inline migrations | Separate migration scripts | Inline migrations (current pattern) provide automatic schema evolution without manual steps |

**Installation:**
No new dependencies required. All capabilities exist in current stack.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── stadion-db.js        # Migration logic in initDb() function (lines 233-350)
└── logger.js            # Logging for migration success/failure

.planning/phases/20-foundation/
├── 20-CONTEXT.md        # User decisions (per-field naming convention)
├── 20-RESEARCH.md       # This document
└── 20-PLAN.md           # Implementation tasks (to be created)
```

### Pattern 1: Incremental Schema Migration
**What:** Check for column existence before adding, allowing idempotent migrations
**When to use:** Every time schema needs to evolve in production
**Example:**
```javascript
// Source: Existing pattern in lib/stadion-db.js lines 233-254
const memberColumns = db.prepare('PRAGMA table_info(stadion_members)').all();

if (!memberColumns.some(col => col.name === 'email_stadion_modified')) {
  db.exec('ALTER TABLE stadion_members ADD COLUMN email_stadion_modified TEXT');
}

if (!memberColumns.some(col => col.name === 'email_sportlink_modified')) {
  db.exec('ALTER TABLE stadion_members ADD COLUMN email_sportlink_modified TEXT');
}
```

### Pattern 2: Per-Field Timestamp Tracking
**What:** Store modification timestamps for each syncable field in both systems
**When to use:** Bidirectional sync requiring conflict detection and resolution
**Example:**
```javascript
// Fields to track (from 20-CONTEXT.md):
// Contact fields: email, email2, mobile, phone
// Free fields: datum-vog, freescout-id, financiele-blokkade
//
// Naming convention: {field}_stadion_modified, {field}_sportlink_modified
// Example columns:
// - email_stadion_modified TEXT
// - email_sportlink_modified TEXT
// - mobile_stadion_modified TEXT
// - mobile_sportlink_modified TEXT
```

### Pattern 3: UTC Timestamp Creation
**What:** Generate timestamps in UTC using ISO 8601 format
**When to use:** Every sync operation that records modification time
**Example:**
```javascript
// Source: Existing pattern throughout codebase (lib/stadion-db.js line 356, etc.)
const now = new Date().toISOString();
// Produces: "2026-01-29T14:23:45.678Z" (RFC 3339 / ISO 8601 UTC format)

// Store in database:
db.prepare(`UPDATE stadion_members SET email_stadion_modified = ? WHERE knvb_id = ?`)
  .run(now, knvbId);
```

### Pattern 4: Origin Tracking
**What:** Mark each change with its origin (user_edit, sync_sportlink_to_stadion, sync_stadion_to_sportlink)
**When to use:** Every sync operation, before any reverse sync code runs
**Example:**
```javascript
// Pattern from bidirectional sync research
// Add origin column to track change source
const SYNC_ORIGIN = {
  USER_EDIT: 'user_edit',                      // Manual edit in WordPress
  SYNC_FORWARD: 'sync_sportlink_to_stadion',   // Forward sync from Sportlink
  SYNC_REVERSE: 'sync_stadion_to_sportlink'    // Reverse sync to Sportlink
};

// When syncing from Sportlink to Stadion:
db.prepare(`
  UPDATE stadion_members
  SET email = ?,
      email_sportlink_modified = ?,
      sync_origin = ?
  WHERE knvb_id = ?
`).run(newEmail, now, SYNC_ORIGIN.SYNC_FORWARD, knvbId);

// Loop prevention: Don't reverse-sync if origin was forward sync
const member = db.prepare(`SELECT * FROM stadion_members WHERE knvb_id = ?`).get(knvbId);
if (member.sync_origin === SYNC_ORIGIN.SYNC_FORWARD) {
  // Skip reverse sync - this was just synced FROM Sportlink
  return;
}
```

### Pattern 5: Timestamp Comparison for Conflict Detection
**What:** Compare modification timestamps to detect conflicts (both systems modified same field)
**When to use:** Before applying changes in bidirectional sync
**Example:**
```javascript
// All timestamps already in UTC (Date().toISOString()), direct comparison is safe
const stadionModified = new Date(member.email_stadion_modified);
const sportlinkModified = new Date(member.email_sportlink_modified);

if (sportlinkModified > stadionModified) {
  // Sportlink has newer data, use it
  applyChangeFromSportlink(member);
} else if (stadionModified > sportlinkModified) {
  // Stadion has newer data, push to Sportlink
  applyChangeToSportlink(member);
} else {
  // Timestamps equal - no conflict (or both unchanged)
}
```

### Anti-Patterns to Avoid
- **Local timestamp storage:** Never store timestamps in local timezone. Always use UTC to avoid daylight saving issues and comparison errors.
- **Whole-record timestamps:** Don't use single modified_at for entire record. Per-field tracking is essential for fine-grained conflict resolution.
- **No origin tracking:** Never implement reverse sync without origin attribution. Leads to infinite loops.
- **String timestamp comparison:** Never compare timestamp strings directly ("2026-01-29" vs "2026-01-30" works, but breaks with times). Always parse to Date objects first.
- **Assuming clock synchronization:** Never assume server clocks are perfectly synchronized. Implement tolerance for small clock drift (see Common Pitfalls section).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone conversion | Custom timezone math | Node.js Date().toISOString() | Handles all edge cases (DST, leap seconds, timezone offsets). Already in use throughout codebase. |
| Migration versioning | user_version pragma | Incremental PRAGMA table_info() checks | Simpler pattern already proven in codebase. No version tracking needed when migrations are idempotent. |
| Clock synchronization | Custom NTP client | System NTP/Chrony | Production-grade time sync with sub-millisecond accuracy. Critical for distributed timestamp comparisons. |
| Conflict resolution | Custom merge logic | Last Writer Wins (LWW) | Standard pattern for timestamp-based bidirectional sync. Proven in Couchbase, Azure Cosmos DB, SQL Server. |

**Key insight:** Timestamp comparison looks trivial but has subtle failure modes (timezone mismatches, clock drift, string vs Date comparison). The codebase's existing UTC ISO 8601 approach is correct—extend it consistently.

## Common Pitfalls

### Pitfall 1: Timezone Mismatch in Comparisons
**What goes wrong:** Storing UTC in database but comparing against local time in Node.js, or vice versa, leading to incorrect conflict resolution decisions.
**Why it happens:** JavaScript Date objects without explicit timezone are interpreted as local time. SQLite has no native timezone support.
**How to avoid:**
- Always use Date().toISOString() for storage (produces UTC)
- Always parse stored timestamps with new Date(isoString) before comparison
- Never use Date.now() or Date() without .toISOString()
**Warning signs:** Conflicts detected incorrectly during specific hours (e.g., only during DST transitions). Timestamps appearing to go backwards.

### Pitfall 2: Clock Drift Between Systems
**What goes wrong:** Production server and WordPress server have clocks off by seconds/minutes. Last Writer Wins picks wrong version.
**Why it happens:** Servers without NTP sync can drift 6ms per 30 seconds (Google's 200ppm assumption). Without NTP, drift can reach minutes per week.
**How to avoid:**
- Verify NTP/Chrony is configured on production server (46.202.155.16)
- Verify WordPress server time synchronization
- Implement tolerance threshold for "close enough" timestamps (5-second window per Couchbase standards)
**Warning signs:** Conflicts where "newer" timestamp is actually older by context. Users reporting their changes being overwritten by older data.

### Pitfall 3: Missing Origin Tracking Causes Infinite Loops
**What goes wrong:** Change syncs from A→B, then B thinks it's a new user edit and syncs back B→A, creating infinite loop.
**Why it happens:** Without origin tracking, system can't distinguish "this came from a sync" vs "user edited this".
**How to avoid:**
- Add sync_origin column BEFORE implementing any reverse sync
- Set origin on every write: SYNC_FORWARD, SYNC_REVERSE, or USER_EDIT
- Never reverse-sync a change that originated from forward sync
**Warning signs:** Rapid alternating updates between systems. Database update storms. Logs showing same record syncing repeatedly.

### Pitfall 4: NULL Timestamp Handling
**What goes wrong:** New columns default to NULL. Comparisons fail (NULL > timestamp is always false). All conflicts resolve incorrectly.
**Why it happens:** SQLite ALTER TABLE ADD COLUMN defaults to NULL. Existing rows have no initial timestamp.
**How to avoid:**
- Accept NULL as valid state meaning "never modified in this system"
- NULL < any timestamp (old/unmodified data loses to any explicit timestamp)
- Backfill only if business logic requires (usually unnecessary—let first sync populate)
**Warning signs:** All existing records show conflicts. Comparisons throwing errors on NULL values.

### Pitfall 5: Forgetting Photo URL/Date Already Tracked
**What goes wrong:** Duplicating photo tracking with new timestamp columns when photo_url/photo_date already exist in stadion_members (Phase 19).
**Why it happens:** Not reviewing existing schema before adding columns.
**How to avoid:**
- Review current schema: photo_url and photo_date columns exist (lines 249-254 in lib/stadion-db.js)
- Photo URL is pulled from Sportlink MemberHeader API, doesn't need bidirectional tracking
- Only contact and free fields need bidirectional timestamps
**Warning signs:** Duplicate columns. Photo data tracked in two places with conflicting states.

## Code Examples

Verified patterns from existing codebase and official sources:

### Current Timestamp Generation
```javascript
// Source: lib/stadion-db.js line 356 (and 12 other locations)
const now = new Date().toISOString();
// Output: "2026-01-29T14:23:45.678Z"
// Format: RFC 3339 / ISO 8601
// Timezone: UTC (indicated by 'Z' suffix)
```

### Existing Migration Pattern
```javascript
// Source: lib/stadion-db.js lines 233-254
function initDb(db) {
  // ... table creation ...

  // Incremental migration: check column existence before adding
  const memberColumns = db.prepare('PRAGMA table_info(stadion_members)').all();

  if (!memberColumns.some(col => col.name === 'person_image_date')) {
    db.exec('ALTER TABLE stadion_members ADD COLUMN person_image_date TEXT');
  }

  if (!memberColumns.some(col => col.name === 'photo_state')) {
    db.exec(`ALTER TABLE stadion_members ADD COLUMN photo_state TEXT DEFAULT 'no_photo' CHECK(photo_state IN ('no_photo', 'pending_download', 'downloaded', 'pending_upload', 'synced', 'pending_delete'))`);
  }

  // Pattern: Idempotent, safe for production, zero downtime
}
```

### Timestamp Comparison (Safe UTC Handling)
```javascript
// Parse ISO 8601 strings from database to Date objects
const stadionModifiedDate = new Date(row.email_stadion_modified); // "2026-01-29T10:00:00Z"
const sportlinkModifiedDate = new Date(row.email_sportlink_modified); // "2026-01-29T11:00:00Z"

// Direct comparison works because both are UTC
if (sportlinkModifiedDate > stadionModifiedDate) {
  // Sportlink version is newer
} else if (stadionModifiedDate > sportlinkModifiedDate) {
  // Stadion version is newer
} else {
  // Equal - no conflict
}

// Handle NULL timestamps (unmodified fields)
const stadionModified = row.email_stadion_modified
  ? new Date(row.email_stadion_modified)
  : new Date(0); // Epoch = infinitely old
const sportlinkModified = row.email_sportlink_modified
  ? new Date(row.email_sportlink_modified)
  : new Date(0);

// Now comparison always works (NULL loses to any real timestamp)
```

### Complex Migration Example (Table Recreation)
```javascript
// Source: lib/stadion-db.js lines 294-350
// Example of complex migration when ALTER TABLE isn't sufficient
// (Only needed for constraint changes; adding columns is simple)

const needsMigration = /* check if old schema exists */;
if (needsMigration) {
  db.exec(`
    BEGIN TRANSACTION;

    -- Create new table with updated schema
    CREATE TABLE IF NOT EXISTS stadion_teams_new (
      id INTEGER PRIMARY KEY,
      team_name TEXT NOT NULL COLLATE NOCASE,
      sportlink_id TEXT UNIQUE,  -- New constraint
      stadion_id INTEGER,
      /* ... rest of columns ... */
    );

    -- Copy data from old table
    INSERT INTO stadion_teams_new
    SELECT * FROM stadion_teams;

    -- Drop old table
    DROP TABLE stadion_teams;

    -- Rename new table
    ALTER TABLE stadion_teams_new RENAME TO stadion_teams;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_stadion_teams_hash
      ON stadion_teams (source_hash, last_synced_hash);

    COMMIT;
  `);
}

// Note: For Phase 20, simple ALTER TABLE ADD COLUMN is sufficient
// This pattern shown for reference if future phases need constraint changes
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whole-record timestamps | Per-field timestamps | Industry standard since ~2015 | Fine-grained conflict detection. Required for bidirectional sync. |
| Local timezone storage | UTC everywhere | Industry standard since ~2010 | Eliminates timezone comparison bugs. Current codebase already follows this. |
| version_number conflict resolution | Hybrid Logical Clocks (HLC) | Google Spanner 2012, mainstream 2020+ | More accurate than pure timestamps. But overkill for this project—timestamps sufficient. |
| Manual migration scripts | Inline incremental migrations | Codebase established pattern | Zero-downtime deployments. Idempotent schema evolution. |
| ntpd | Chrony | Modern Linux default (RHEL 8+, Ubuntu 25.10+) | Better for VMs and unstable networks. Current production setup should be verified. |

**Deprecated/outdated:**
- **ntpd:** Replaced by Chrony in modern Linux distributions. Chrony handles VMs and network instability better.
- **timestamp WITHOUT timezone (PostgreSQL):** Always use timestamptz. Applies to this project: always use UTC in SQLite TEXT columns.
- **User-managed schema versions:** Codebase uses idempotent PRAGMA checks instead. Simpler and more reliable.

## Open Questions

Things that couldn't be fully resolved:

1. **Production Server NTP Configuration**
   - What we know: Research shows Chrony is standard on modern Linux. Typical accuracy 1-10ms on internet, microseconds on LAN.
   - What's unclear: Whether production server (46.202.155.16) has NTP/Chrony configured and running.
   - Recommendation: Add task to verify `systemctl status chronyd` or `timedatectl status` on production server. If not configured, enable and configure Chrony before implementing conflict resolution.

2. **WordPress Server Clock**
   - What we know: Stadion WordPress server needs accurate time for bidirectional sync timestamps.
   - What's unclear: WordPress hosting environment (shared hosting, VPS, dedicated?) and whether NTP is available/configured.
   - Recommendation: Document WordPress server timezone and NTP status. If shared hosting without NTP access, implement 5-second tolerance window for clock drift (per Couchbase standards).

3. **Clock Drift Tolerance Threshold**
   - What we know: Couchbase uses 5000ms (5 seconds) alert threshold. Google TrueTime achieves 1-7ms but requires specialized hardware. Even 3ms drift can cause incorrect LWW decisions.
   - What's unclear: What tolerance threshold makes sense for this project given hosting environment constraints.
   - Recommendation: Start with 5-second tolerance (Couchbase standard). Flag conflicts where timestamps differ by less than 5 seconds as "too close to call" and require manual resolution or use hash-based detection.

4. **Backfill Strategy for Existing Data**
   - What we know: New timestamp columns default to NULL. NULL can mean "never modified" or "modified before tracking started". SQLite ALTER TABLE is safe without explicit defaults.
   - What's unclear: Whether to backfill existing rows with current timestamp or leave as NULL.
   - Recommendation: Leave as NULL. Treat NULL as "unmodified in this system". First sync will populate timestamps. Simpler than backfilling and more accurate (avoids false "modified now" signals).

## Sources

### Primary (HIGH confidence)
- [SQLite Official: ALTER TABLE Documentation](https://sqlite.org/lang_altertable.html) - Verified ADD COLUMN safety
- [How to Safely Modify Table Columns in SQLite with Production Data | SYNKEE](https://synkee.com.sg/blog/safely-modify-sqlite-table-columns-with-production-data/) - Production migration best practices
- [SQLite Versioning and Migration Strategies for Evolving Applications](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies) - Migration patterns
- [Why You Should Always Store Timestamps in UTC | Medium](https://shadhujan.medium.com/why-you-should-always-store-timestamps-in-utc-timestamp-vs-timestamptz-explained-5a1444814539) - UTC storage rationale
- [Best practices for timestamps and time zones in databases | Tinybird](https://www.tinybird.co/blog/database-timestamps-timezones) - Database timestamp patterns
- [Handling Timestamps in SQLite](https://sqlitecloud.hashnode.dev/handling-timestamps-in-sqlite) - SQLite-specific timestamp handling
- [How to Configure Time Synchronization on Ubuntu with NTP/Chrony](https://oneuptime.com/blog/post/2026-01-07-ubuntu-time-synchronization-ntp-chrony/view) - Modern NTP/Chrony setup
- [Conflict Resolution | Couchbase Docs](https://docs.couchbase.com/sync-gateway/current/conflict-resolution.html) - LWW conflict resolution
- [XDCR Conflict Resolution | Couchbase Docs](https://docs.couchbase.com/server/current/learn/clusters-and-availability/xdcr-conflict-resolution.html) - Timestamp-based conflict resolution

### Secondary (MEDIUM confidence)
- [How To Stop Infinite Loops In Bidirectional Syncs — Valence](https://docs.valence.app/en/latest/guides/stop-infinite-loops.html) - Origin tracking patterns
- [How to prevent infinite loops in bi-directional data syncs | Workato](https://www.workato.com/product-hub/how-to-prevent-infinite-loops-in-bi-directional-data-syncs/) - Loop prevention strategies
- [Monitor Clock Drift | Couchbase Docs](https://docs.couchbase.com/server/current/manage/monitor/xdcr-monitor-timestamp-conflict-resolution.html) - 5 second drift threshold
- [Implement Bidirectional Calendar Sync - Developer Guide 2025 | CalendHub](https://calendhub.com/blog/implement-bidirectional-calendar-sync-2025/) - Bidirectional sync patterns
- [Notes on Timezones in Node.js & SQLite Applications · GitHub](https://gist.github.com/leafac/b0e156e312043f3f121fe2f7f8771665) - Node.js + SQLite timezone handling
- [Two-Way Sync Demystified: Key Principles And Best Practices | StackSync](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices) - Bidirectional sync overview
- [Supabase Multi-Tenancy CRM Integration Guide | StackSync](https://www.stacksync.com/blog/supabase-multi-tenancy-crm-integration) - Per-field timestamp tracking

### Tertiary (LOW confidence)
- [SQLite Default Values: Complete Guide 2026](https://copyprogramming.com/howto/how-to-add-default-value-in-sqlite) - Default value handling (not verified with official docs)
- [Bidirectional Database synchronization | DBConvert](https://dbconvert.com/blog/bidirectional-database-synchronization/) - Commercial perspective on bidirectional sync

### Codebase Reference
- lib/stadion-db.js lines 233-350 - Existing migration patterns
- lib/stadion-db.js lines 356+ - Timestamp generation pattern (Date().toISOString())
- laposta-db.js lines 69-74 - Alternative migration pattern example

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified with official SQLite docs and existing codebase patterns
- Architecture: HIGH - Patterns proven in production systems (Couchbase, Azure Cosmos DB) and already partially used in codebase
- Pitfalls: HIGH - Documented in official sources and corroborated across multiple systems
- Clock sync: MEDIUM - NTP configuration not verified on production server (needs validation)
- Conflict tolerance: MEDIUM - Industry standards found (5 seconds) but project-specific threshold needs decision

**Research date:** 2026-01-29
**Valid until:** 2026-04-29 (90 days - stable domain, SQLite and NTP practices evolve slowly)

**Context integration:**
Research successfully integrated user decisions from 20-CONTEXT.md:
- ✅ Per-field timestamps (not per-record) - Confirmed as industry standard
- ✅ Two timestamps per field (stadion_modified, sportlink_modified) - Confirmed as standard pattern
- ✅ Fields to track: contact fields (email, email2, mobile, phone) + free fields (datum-vog, freescout-id, financiele-blokkade) - Scope confirmed
- ✅ Storage: new columns in stadion_members - Migration pattern verified safe
- ✅ Naming: system names (stadion_modified, sportlink_modified) - Clearer than directional names
- 🔧 Origin attribution: Researched approach using sync_origin column with enum values
- 🔧 Migration script: Identified codebase pattern (PRAGMA table_info checks in initDb)
- 🔧 UTC normalization: Confirmed Date().toISOString() pattern already used throughout codebase
