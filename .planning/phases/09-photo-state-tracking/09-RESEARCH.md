# Phase 9: Photo State Tracking - Research

**Researched:** 2026-01-26
**Domain:** SQLite state tracking and change detection
**Confidence:** HIGH

## Summary

Phase 9 implements photo state tracking in SQLite by extending the existing members table with photo-specific columns. The system will track PersonImageDate values from Sportlink data and detect three scenarios: new photos (PersonImageDate appears or changes), removed photos (PersonImageDate becomes NULL), and photo reappearance after deletion. Change detection integrates into the existing member import flow in prepare-laposta-members.js, comparing stored PersonImageDate values against incoming data during each sync run.

The codebase already has established patterns for SQLite state tracking via stadion-db.js and laposta-db.js, using hash-based change detection, transaction-wrapped bulk operations, and safe schema migrations via PRAGMA table_info checks. These patterns will be extended rather than replaced.

**Primary recommendation:** Add photo tracking columns to the existing members table using the established PRAGMA-based migration pattern, store PersonImageDate as TEXT for NULL handling, use a photo_state TEXT column with CHECK constraint for state machine enforcement, and integrate detection into upsertMembers during the prepare-laposta step.

## Standard Stack

The established libraries for this domain are already in the project.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | latest (12.6.2) | SQLite database operations | Fastest Node.js SQLite library, synchronous API, native performance |
| Node.js crypto | built-in | SHA-256 hash computation | Built-in, stable, used throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| varlock | (in use) | Environment variable loading | Already used for .env loading |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node-sqlite3 (callback-based) | Async API but slower, more complex error handling |
| better-sqlite3 | Sequelize ORM | Heavy abstraction, unnecessary for simple operations |
| SHA-256 hashing | Store full JSON | No change detection, wastes storage and bandwidth |

**Installation:**
```bash
# No new dependencies - already in package.json
npm install
```

## Architecture Patterns

### Recommended Column Structure

Extend existing `members` table in laposta-db.js:

```sql
ALTER TABLE members ADD COLUMN person_image_date TEXT;
ALTER TABLE members ADD COLUMN photo_state TEXT DEFAULT 'no_photo' CHECK(photo_state IN ('no_photo', 'pending_download', 'downloaded', 'pending_upload', 'synced', 'pending_delete'));
ALTER TABLE members ADD COLUMN photo_downloaded_at TEXT;
ALTER TABLE members ADD COLUMN photo_uploaded_at TEXT;
ALTER TABLE members ADD COLUMN photo_deleted_at TEXT;
```

**Rationale:**
- `person_image_date TEXT`: Store actual PersonImageDate value from Sportlink for debugging and audit (NULL represents no photo)
- `photo_state TEXT`: State machine column with CHECK constraint for validation
- Timestamp columns: Optional audit trail (Claude's discretion per user context)

### Pattern 1: Safe Schema Migration

**What:** Check for column existence before adding to prevent errors on repeated runs
**When to use:** Every database initialization (on every app start)
**Example:**
```javascript
// Source: Existing pattern in laposta-db.js line 69-73
function initDb(db) {
  // ... existing table creation ...

  const memberColumns = db.prepare('PRAGMA table_info(members)').all();

  if (!memberColumns.some(col => col.name === 'person_image_date')) {
    db.exec('ALTER TABLE members ADD COLUMN person_image_date TEXT');
  }

  if (!memberColumns.some(col => col.name === 'photo_state')) {
    db.exec(`ALTER TABLE members ADD COLUMN photo_state TEXT DEFAULT 'no_photo' CHECK(photo_state IN ('no_photo', 'pending_download', 'downloaded', 'pending_upload', 'synced', 'pending_delete'))`);
  }

  if (!memberColumns.some(col => col.name === 'photo_downloaded_at')) {
    db.exec('ALTER TABLE members ADD COLUMN photo_downloaded_at TEXT');
  }

  if (!memberColumns.some(col => col.name === 'photo_uploaded_at')) {
    db.exec('ALTER TABLE members ADD COLUMN photo_uploaded_at TEXT');
  }

  if (!memberColumns.some(col => col.name === 'photo_deleted_at')) {
    db.exec('ALTER TABLE members ADD COLUMN photo_deleted_at TEXT');
  }
}
```

### Pattern 2: State Detection During Member Import

**What:** Detect photo state changes while upserting member data
**When to use:** During prepare-laposta-members.js execution, after member data is processed
**Example:**
```javascript
// Integrate into upsertMembers in laposta-db.js
function upsertMembers(db, listIndex, listId, members) {
  const now = new Date().toISOString();

  // Existing upsert logic...
  const stmt = db.prepare(`
    INSERT INTO members (
      list_index,
      list_id,
      email,
      custom_fields_json,
      source_hash,
      last_seen_at,
      created_at,
      person_image_date,
      photo_state
    )
    VALUES (
      @list_index,
      @list_id,
      @email,
      @custom_fields_json,
      @source_hash,
      @last_seen_at,
      @created_at,
      @person_image_date,
      @photo_state
    )
    ON CONFLICT(list_index, email) DO UPDATE SET
      list_id = excluded.list_id,
      custom_fields_json = excluded.custom_fields_json,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at,
      person_image_date = excluded.person_image_date,
      photo_state = CASE
        WHEN excluded.person_image_date IS NOT NULL
             AND (members.person_image_date IS NULL
                  OR excluded.person_image_date != members.person_image_date)
          THEN 'pending_download'
        WHEN excluded.person_image_date IS NULL
             AND members.person_image_date IS NOT NULL
          THEN 'pending_delete'
        ELSE members.photo_state
      END
  `);

  // Transaction-wrapped bulk insert (existing pattern)
  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  insertMany(rows);
}
```

### Pattern 3: Query Members by Photo State

**What:** Retrieve members needing photo operations
**When to use:** Photo download, upload, and deletion phases
**Example:**
```javascript
// New function to add to laposta-db.js
function getMembersByPhotoState(db, listIndex, state) {
  const stmt = db.prepare(`
    SELECT email, custom_fields_json, person_image_date, photo_state
    FROM members
    WHERE list_index = ? AND photo_state = ?
    ORDER BY email ASC
  `);
  return stmt.all(listIndex, state).map((row) => ({
    email: row.email,
    custom_fields: JSON.parse(row.custom_fields_json),
    person_image_date: row.person_image_date,
    photo_state: row.photo_state
  }));
}
```

### Pattern 4: State Transition Updates

**What:** Update photo state after operations complete
**When to use:** After photo download, upload, or deletion
**Example:**
```javascript
// New function to add to laposta-db.js
function updatePhotoState(db, listIndex, email, newState, timestampColumn = null) {
  const now = new Date().toISOString();
  const timestampSet = timestampColumn ? `, ${timestampColumn} = ?` : '';
  const stmt = db.prepare(`
    UPDATE members
    SET photo_state = ?${timestampSet}
    WHERE list_index = ? AND email = ?
  `);

  if (timestampColumn) {
    stmt.run(newState, now, listIndex, email);
  } else {
    stmt.run(newState, listIndex, email);
  }
}
```

### Anti-Patterns to Avoid

- **Separate photo tracking table:** Creates complexity with foreign keys, joins, and potential sync issues. The existing members table already tracks member identity (email + list_index).
- **Hash-based detection for photos:** PersonImageDate is the natural change indicator. Hashing it adds complexity without benefit.
- **String empty vs NULL confusion:** Always use NULL for missing PersonImageDate. Empty string has different semantics in SQL comparisons.
- **State updates outside transactions:** Bulk operations must be transaction-wrapped to prevent partial updates on error.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite connection pooling | Custom pool manager | better-sqlite3 synchronous API | SQLite only allows one writer at a time; pooling adds complexity without benefit for single-process apps |
| Date storage format | Custom date format | ISO8601 TEXT (YYYY-MM-DD) | SQLite date functions expect ISO8601; string comparison works correctly |
| State validation | Runtime checks only | CHECK constraint in schema | Database-level validation prevents invalid states even from external tools |
| Schema version tracking | Custom version table | PRAGMA user_version or column existence checks | Standard SQLite mechanism; codebase uses PRAGMA table_info pattern |
| Transaction retry logic | Custom retry with delays | Fail fast, log error | SQLite locks are immediate; retries rarely help in single-process app |

**Key insight:** SQLite is not a client-server database. Patterns from PostgreSQL/MySQL (connection pooling, retry logic, advisory locks) don't apply. Synchronous operations and immediate failures are correct for SQLite.

## Common Pitfalls

### Pitfall 1: CHECK Constraint Cannot Reference Other Rows

**What goes wrong:** Attempting to create CHECK constraints that reference other table data fails with "no such column" errors.
**Why it happens:** CHECK constraints can only reference columns in the same row, not other rows or tables.
**How to avoid:** Use application logic for cross-row validations. Only use CHECK constraints for single-row invariants (e.g., state enum validation).
**Warning signs:** SQL errors mentioning "no such column" when the column clearly exists in another table.

### Pitfall 2: NULL vs Empty String in Comparisons

**What goes wrong:** WHERE person_image_date = '' doesn't match NULL values; state detection logic misses removed photos.
**Why it happens:** In SQL, NULL is not equal to anything, including empty string. NULL = NULL evaluates to NULL (unknown), not TRUE.
**How to avoid:** Always use IS NULL and IS NOT NULL for NULL checks. Store missing PersonImageDate as NULL, never as empty string.
**Warning signs:** Photo removals not detected; WHERE clause with = NULL instead of IS NULL.

### Pitfall 3: ALTER TABLE in Active Transaction

**What goes wrong:** ALTER TABLE inside a transaction can fail with "cannot alter table while another transaction is active."
**Why it happens:** better-sqlite3 may have implicit transactions from previous operations.
**How to avoid:** Run schema migrations outside of explicit db.transaction() calls. The initDb function in the codebase uses db.exec() directly, not within transaction().
**Warning signs:** Schema migration errors on second run; "database is locked" errors.

### Pitfall 4: TEXT Column Comparison Case Sensitivity

**What goes wrong:** PersonImageDate comparison misses changes due to case differences.
**Why it happens:** SQLite TEXT columns are case-sensitive by default (unless COLLATE NOCASE is specified).
**How to avoid:** PersonImageDate values from Sportlink should be consistent case. If uncertain, normalize to uppercase/lowercase before storing. Don't use COLLATE NOCASE for date strings.
**Warning signs:** Change detection inconsistent; same date treated as different.

### Pitfall 5: State Machine Transitions Without Validation

**What goes wrong:** Direct state updates allow invalid transitions (e.g., no_photo → synced without intermediate states).
**Why it happens:** UPDATE statements don't validate business logic by default.
**How to avoid:** Either enforce transitions via application logic or use CHECK constraint with allowed transitions (complex). Prefer application-level validation with clear error messages.
**Warning signs:** Photos in synced state without corresponding downloaded_at timestamp; impossible state combinations.

### Pitfall 6: ISO8601 Format Variations

**What goes wrong:** PersonImageDate comparisons fail because Sportlink sends "2024-01-15" but we store "2024-1-15".
**Why it happens:** Different systems format dates differently (zero-padded vs non-padded months/days).
**How to avoid:** Normalize all incoming dates to ISO8601 standard format (YYYY-MM-DD with zero padding) before storing. Use JavaScript Date parsing and toISOString().substring(0, 10).
**Warning signs:** String comparison shows difference but dates are semantically identical.

## Code Examples

Verified patterns from codebase analysis:

### Transaction-Wrapped Bulk Operations
```javascript
// Source: laposta-db.js line 113-130
const stmt = db.prepare(`INSERT INTO members (...) VALUES (...) ON CONFLICT(...) DO UPDATE SET ...`);

const insertMany = db.transaction((rows) => {
  rows.forEach((row) => stmt.run(row));
});

insertMany(rows); // Commits on success, rolls back on exception
```

### Hash-Based Change Detection
```javascript
// Source: laposta-db.js line 20-23, stadion-db.js line 11-31
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

function computeSourceHash(email, customFields) {
  const payload = stableStringify({ email, custom_fields: customFields || {} });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

### ISO8601 Timestamp Generation
```javascript
// Source: Throughout laposta-db.js and stadion-db.js
const now = new Date().toISOString(); // "2026-01-26T10:30:45.123Z"
// For date-only fields:
const dateOnly = new Date().toISOString().substring(0, 10); // "2026-01-26"
```

### Safe Column Addition Check
```javascript
// Source: laposta-db.js line 69-73
const memberColumns = db.prepare('PRAGMA table_info(members)').all();
const hasColumn = memberColumns.some((column) => column.name === 'column_name');
if (!hasColumn) {
  db.exec('ALTER TABLE members ADD COLUMN column_name TEXT');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Enum validation via app logic | CHECK constraints in schema | SQLite 3.3.0+ (2006) | Database enforces validity even from external tools |
| Separate audit tables with triggers | Timestamp columns in main table | N/A - depends on requirements | Simpler queries, less overhead for simple state tracking |
| user_version for migrations | PRAGMA table_info column checks | Codebase pattern | More flexible, no version number management |
| Julian Day for date storage | ISO8601 TEXT | Modern practice (2015+) | Human readable, string comparison works, date functions compatible |

**Deprecated/outdated:**
- **Storing dates as Unix timestamps (INTEGER):** ISO8601 TEXT is now preferred for readability and SQLite date function compatibility
- **REAL for dates (Julian Day):** Only needed for astronomical calculations
- **Callback-based node-sqlite3:** better-sqlite3 synchronous API is faster and simpler

## Open Questions

Things that couldn't be fully resolved:

1. **PersonImageDate Format from Sportlink**
   - What we know: PersonImageDate exists in field-mapping.json mapping to datumpasfoto
   - What's unclear: Exact format Sportlink provides (ISO8601? European DD-MM-YYYY? Timestamp?)
   - Recommendation: Log first 10 PersonImageDate values during testing to verify format, add normalization if needed

2. **Timestamp Granularity for State Transitions**
   - What we know: User context marks this as "Claude's discretion"
   - What's unclear: Whether to track all three timestamps (downloaded_at, uploaded_at, deleted_at) or minimal set
   - Recommendation: Include all three for debugging and audit purposes; disk space is negligible

3. **Malformed PersonImageDate Handling**
   - What we know: User context marks this as "Claude's discretion"
   - What's unclear: Should invalid dates be treated as NULL (no photo) or cause error/warning?
   - Recommendation: Log warning but treat as NULL; prevents sync failure from bad data

## Sources

### Primary (HIGH confidence)
- [better-sqlite3 GitHub API Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) - Transaction patterns, prepared statements
- [SQLite Official: Datatypes](https://www.sqlite.org/datatype3.html) - TEXT storage affinity, NULL handling
- [SQLite Official: ALTER TABLE](https://www.sqlite.org/lang_altertable.html) - ADD COLUMN syntax and limitations
- [SQLite Official: Date Functions](https://www.sqlite.org/lang_datefunc.html) - ISO8601 format requirements
- Codebase files: laposta-db.js, stadion-db.js, prepare-laposta-members.js - Existing patterns

### Secondary (MEDIUM confidence)
- [SQLite Tutorial: CHECK Constraints](https://www.sqlitetutorial.net/sqlite-check-constraint/) - Enum validation pattern
- [SQLite Tutorial: Date Handling](https://www.sqlitetutorial.net/sqlite-date/) - Best practices for TEXT date storage
- [Internotes: Working With SQLite Dates](https://www.internotes.net/sqlite-dates) - ISO8601 format recommendations
- [Use your database to power state machines](https://blog.lawrencejones.dev/state-machines/) - State machine column patterns
- [sqlite-history: tracking changes](https://simonwillison.net/2023/Apr/15/sqlite-history/) - Trigger-based audit trails

### Secondary (MEDIUM confidence - recent)
- [How to Build Offline-First SQLite Sync](https://dev.to/sathish_daggula/how-to-build-offline-first-sqlite-sync-in-expo-1lli) - State machine for pending/synced patterns
- [Local-First State Management With SQLite](https://www.powersync.com/blog/local-first-state-management-with-sqlite) - Outbox pattern for pending operations

### Tertiary (LOW confidence)
- Various Stack Overflow and forum discussions on SQLite patterns - Used for pattern validation, not primary guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - better-sqlite3 already in use, proven patterns in codebase
- Architecture: HIGH - Existing laposta-db.js and stadion-db.js provide clear precedent
- Pitfalls: HIGH - Verified via official SQLite documentation and codebase analysis

**Research date:** 2026-01-26
**Valid until:** 2026-04-26 (90 days - SQLite and better-sqlite3 are stable technologies)
