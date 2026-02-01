# Phase 28: Per-Year SQLite Storage - Research

**Researched:** 2026-02-01
**Domain:** SQLite historical data retention and year-based upsert operations
**Confidence:** HIGH

## Summary

Phase 28 modifies the existing Nikki sync to preserve 2-3 years of historical contribution data instead of wiping all data on each sync. The current schema in `lib/nikki-db.js` already stores per-year data with a `UNIQUE(knvb_id, year)` constraint, making it well-suited for year-based upserts. The primary changes are:

1. **Remove the destructive `clearContributions()` call** - Currently line 510 in `download-nikki-contributions.js` wipes all data before each sync
2. **Add retention logic** - Prune data older than the configured window (4 years per user decision: current + 3 previous)
3. **Verify upsert behavior** - Existing `ON CONFLICT DO UPDATE` correctly replaces data for matching (knvb_id, year) pairs

The schema already meets all STORE-01 requirements (year, knvb_id, saldo, hoofdsom as total, status columns). The existing transaction-wrapped bulk upsert pattern is optimal for performance.

**Primary recommendation:** Remove `clearContributions()`, add year-based retention DELETE, verify existing upsert handles current year updates correctly.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | latest | Synchronous SQLite3 bindings for Node.js | Fastest SQLite library for Node, already used in codebase |
| Node.js Date | Built-in | Current year calculation | Native JavaScript date handling, zero dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (built-in) | N/A | SHA-256 hashing for change detection | Already used in nikki-db.js for source_hash |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node-sqlite3 (async) | Async version adds complexity with no benefit for batch operations wrapped in transactions |
| INTEGER year | TEXT year | INTEGER provides better performance for range queries (<, >) and uses less storage |

**Installation:**
No new dependencies required - all libraries already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── nikki-db.js              # Database operations (already exists)
download-nikki-contributions.js  # Sync orchestrator (modify)
```

### Pattern 1: Year-Based Upsert with Retention

**What:** Use SQLite's `ON CONFLICT(knvb_id, year) DO UPDATE` to replace data for existing (member, year) pairs while preserving historical years. Delete rows outside retention window.

**When to use:** When storing time-series data where each year should be updated atomically, but historical data must persist across syncs.

**Example:**
```javascript
// Source: nikki-db.js (already implemented)
const stmt = db.prepare(`
  INSERT INTO nikki_contributions (
    knvb_id, year, nikki_id, saldo, hoofdsom, status,
    source_hash, last_seen_at, created_at
  )
  VALUES (
    @knvb_id, @year, @nikki_id, @saldo, @hoofdsom, @status,
    @source_hash, @last_seen_at, @created_at
  )
  ON CONFLICT(knvb_id, year) DO UPDATE SET
    nikki_id = excluded.nikki_id,
    saldo = excluded.saldo,
    hoofdsom = excluded.hoofdsom,
    status = excluded.status,
    source_hash = excluded.source_hash,
    last_seen_at = excluded.last_seen_at
`);

const insertMany = db.transaction((rows) => {
  rows.forEach((row) => stmt.run(row));
});
```

**Key points:**
- `UNIQUE(knvb_id, year)` constraint enables year-based upserts
- `excluded.column` references the value that would have been inserted
- Transaction wrapping is critical for performance (10x+ speedup)

### Pattern 2: Year Window Retention

**What:** Calculate retention window from current year, then delete rows outside that window.

**When to use:** After bulk upsert completes, to enforce data retention policy.

**Example:**
```javascript
// Source: Research findings
function pruneOldContributions(db, retentionYears = 4) {
  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - retentionYears + 1;

  const stmt = db.prepare(
    'DELETE FROM nikki_contributions WHERE year < ?'
  );
  const info = stmt.run(cutoffYear);

  return info.changes; // Number of rows deleted
}
```

**Key points:**
- Use `new Date().getFullYear()` to get 4-digit year (2026)
- **Never** use deprecated `getYear()` which returns year minus 1900
- For 4-year retention in 2026: keep 2023-2026, delete < 2023
- Run retention AFTER upsert to avoid deleting then re-inserting

### Pattern 3: Transaction-Wrapped Bulk Operations

**What:** Use `db.transaction()` to wrap multiple statement executions into a single atomic operation.

**When to use:** For any bulk insert/update/delete operations. Critical for performance.

**Example:**
```javascript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
const insertMany = db.transaction((rows) => {
  const stmt = db.prepare('INSERT INTO ... VALUES (...)');
  rows.forEach(row => stmt.run(row));
});

insertMany(dataArray); // Automatically begins/commits transaction
```

**Key points:**
- Transactions provide ~10x performance improvement for bulk operations
- Transaction automatically commits on return, rolls back on exception
- Nested transaction calls become savepoints
- **CRITICAL:** Async functions incompatible - transactions commit after first `await`

### Pattern 4: Current Year Detection

**What:** Dynamically determine the current year for retention window calculations and filtering.

**When to use:** When you need to distinguish "current year" data from historical data.

**Example:**
```javascript
// Source: https://futurestud.io/tutorials/get-the-current-year-in-javascript-or-node-js
const currentYear = new Date().getFullYear(); // 2026 (4-digit integer)

// Filter for current year only
const currentData = contributions.filter(c => c.year === currentYear);

// Calculate retention window
const keepYears = Array.from(
  { length: 4 },
  (_, i) => currentYear - i
); // [2026, 2025, 2024, 2023]
```

**Key points:**
- `getFullYear()` returns 4-digit integer matching schema type
- Works identically in Node.js and browser
- Calculate once per sync, not per row

### Anti-Patterns to Avoid

- **DELETE then INSERT**: Never delete all data then re-insert. Use UPSERT to update in place while preserving historical rows.
- **Row-by-row operations without transaction**: Causes disk sync after each row (~75 inserts/sec vs ~950 inserts/sec with transaction)
- **Over-indexing on year**: Single-column index on `year` is rarely useful. The existing `UNIQUE(knvb_id, year)` constraint provides an implicit index for lookups.
- **TEXT year column**: Avoid storing year as TEXT ('2026'). INTEGER provides better range query performance and uses less storage.
- **Using getYear()**: Deprecated method returns year minus 1900 (126 for 2026). Always use `getFullYear()`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bulk insert performance | Loop with individual inserts | db.transaction() wrapper | Transaction provides 10x+ speedup, automatic rollback on error |
| Year-based upsert logic | Manual SELECT-then-UPDATE-or-INSERT | ON CONFLICT DO UPDATE | Single atomic operation, handles concurrency correctly |
| Current year calculation | Manual date parsing or external libraries | new Date().getFullYear() | Built-in, zero dependencies, works in all environments |
| Multi-column uniqueness | Application-level duplicate checking | UNIQUE(col1, col2) constraint | Database enforces atomically, prevents race conditions |

**Key insight:** SQLite's UPSERT and transaction features are specifically designed for bulk time-series updates. The existing nikki-db.js implementation already uses best practices - Phase 28 only needs to remove the destructive `clearContributions()` call and add retention pruning.

## Common Pitfalls

### Pitfall 1: Deleting Before Upserting

**What goes wrong:** Code calls `clearContributions()` then `upsertContributions()`, losing all historical data.

**Why it happens:** Pattern copied from initial implementation that didn't require history.

**How to avoid:**
- Remove `clearContributions()` call from download-nikki-contributions.js line 510
- Add `pruneOldContributions()` AFTER upsert to enforce retention policy
- Verify with query: `SELECT DISTINCT year FROM nikki_contributions ORDER BY year` should show multiple years after sync

**Warning signs:**
- Database only contains current year data after each sync
- `SELECT COUNT(DISTINCT year)` returns 1 instead of 2-4
- Historical queries return no results

### Pitfall 2: Retention Window Off-By-One Errors

**What goes wrong:** Retention logic deletes current year or keeps too many years.

**Why it happens:** Confusion between "4 years of data" vs "data older than 4 years ago".

**How to avoid:**
```javascript
// WRONG: This deletes current year data!
const cutoff = currentYear - 4;
DELETE FROM nikki_contributions WHERE year <= cutoff;

// WRONG: This keeps 5 years instead of 4
const cutoff = currentYear - 4;
DELETE FROM nikki_contributions WHERE year < cutoff;

// CORRECT: Keep current year + 3 previous (4 total)
const retentionYears = 4;
const cutoff = currentYear - retentionYears + 1;
DELETE FROM nikki_contributions WHERE year < cutoff;

// Example: 2026 - 4 + 1 = 2023
// Keeps: 2023, 2024, 2025, 2026 (4 years)
// Deletes: < 2023
```

**Warning signs:**
- After sync in 2026, current year data missing
- `SELECT COUNT(DISTINCT year)` returns 5 instead of 4
- Retention window grows unbounded

### Pitfall 3: Range Query Index Inefficiency

**What goes wrong:** Adding a single-column index on `year` doesn't improve performance for multi-column queries.

**Why it happens:** Misunderstanding SQLite's "stops at the first range" rule.

**How to avoid:**
- Don't create `CREATE INDEX idx_year ON nikki_contributions(year)`
- The existing `UNIQUE(knvb_id, year)` constraint creates an implicit multi-column index
- For queries like `WHERE knvb_id = ? AND year >= ?`, the unique constraint index is sufficient
- Use `EXPLAIN QUERY PLAN` to verify index usage before adding new indexes

**Source:** [Common Mistakes in Indexing and How to Avoid Them in SQLite](https://www.slingacademy.com/article/common-mistakes-in-indexing-and-how-to-avoid-them-in-sqlite/)

**Warning signs:**
- Query plan shows SCAN TABLE instead of SEARCH TABLE USING INDEX
- Adding year index doesn't improve query performance

### Pitfall 4: Forgetting Transactions for Retention Delete

**What goes wrong:** Year-based DELETE runs slowly because it's not in a transaction.

**Why it happens:** Assuming transactions only benefit INSERT/UPDATE operations.

**How to avoid:**
```javascript
// WRONG: No transaction wrapper
function pruneOldContributions(db, retentionYears) {
  const cutoff = new Date().getFullYear() - retentionYears + 1;
  const stmt = db.prepare('DELETE FROM nikki_contributions WHERE year < ?');
  return stmt.run(cutoff).changes;
}

// CORRECT: Wrap in transaction for bulk deletes
function pruneOldContributions(db, retentionYears) {
  const pruneTransaction = db.transaction(() => {
    const cutoff = new Date().getFullYear() - retentionYears + 1;
    const stmt = db.prepare('DELETE FROM nikki_contributions WHERE year < ?');
    return stmt.run(cutoff).changes;
  });
  return pruneTransaction();
}
```

**Source:** [better-sqlite3 documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

**Warning signs:**
- Retention delete takes multiple seconds for thousands of rows
- Database file grows during delete operation (rollback journal overhead)

### Pitfall 5: Assuming Missing Data Means Data Corruption

**What goes wrong:** Implementing "cleanup" logic that deletes members not in latest sync, losing historical data when members leave the club.

**Why it happens:** Conflating "member disappeared from Nikki" with "data is stale/corrupt".

**How to avoid:**
- **Never** delete contributions for members not in current sync
- Assume missing member = member left club, not data corruption
- Use `last_seen_at` timestamp to track when member last appeared in sync
- Only delete via year-based retention window, never by member presence/absence

**Per user decision (CONTEXT.md):**
> "Members who disappear from Nikki sync retain their historical data in SQLite. Assume missing = member left club, not data corruption. No cleanup job — manual intervention only if needed."

**Warning signs:**
- Historical data disappearing for members who left club
- Database size shrinking unexpectedly after syncs
- Queries for past years returning fewer members than expected

## Code Examples

Verified patterns from official sources:

### Bulk Upsert with Transaction (Already Implemented)

```javascript
// Source: lib/nikki-db.js lines 89-147
function upsertContributions(db, contributions) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO nikki_contributions (
      knvb_id, year, nikki_id, saldo, hoofdsom, status,
      source_hash, last_seen_at, created_at
    )
    VALUES (
      @knvb_id, @year, @nikki_id, @saldo, @hoofdsom, @status,
      @source_hash, @last_seen_at, @created_at
    )
    ON CONFLICT(knvb_id, year) DO UPDATE SET
      nikki_id = excluded.nikki_id,
      saldo = excluded.saldo,
      hoofdsom = excluded.hoofdsom,
      status = excluded.status,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = contributions.map((contrib) => ({
    knvb_id: contrib.knvb_id,
    year: contrib.year,
    nikki_id: contrib.nikki_id,
    saldo: contrib.saldo,
    hoofdsom: contrib.hoofdsom ?? null,
    status: contrib.status || null,
    source_hash: computeContributionHash(
      contrib.knvb_id, contrib.year, contrib.nikki_id,
      contrib.saldo, contrib.hovedsom, contrib.status
    ),
    last_seen_at: now,
    created_at: now
  }));

  insertMany(rows);
}
```

**This implementation is already optimal** - no changes needed for Phase 28.

### Year-Based Retention Pruning (New)

```javascript
// Source: Research findings - add to lib/nikki-db.js
/**
 * Delete contributions older than retention window.
 * @param {Database} db - SQLite database instance
 * @param {number} retentionYears - Number of years to keep (default: 4)
 * @returns {number} Number of rows deleted
 */
function pruneOldContributions(db, retentionYears = 4) {
  const pruneTransaction = db.transaction(() => {
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - retentionYears + 1;

    const stmt = db.prepare(
      'DELETE FROM nikki_contributions WHERE year < ?'
    );
    const info = stmt.run(cutoffYear);

    return info.changes;
  });

  return pruneTransaction();
}
```

### Modified Sync Flow (Update download-nikki-contributions.js)

```javascript
// Source: Current implementation with modifications
async function runNikkiDownload(options = {}) {
  // ... existing login and scrape logic ...

  if (contributions.length > 0) {
    // REMOVE THIS LINE:
    // clearContributions(db);

    // Store to database (upserts based on knvb_id + year)
    upsertContributions(db, contributions);

    // NEW: Prune data older than retention window
    const deletedCount = pruneOldContributions(db, 4); // Keep 4 years
    logger.verbose(`Pruned ${deletedCount} old contribution records`);

    result.count = contributions.length;
  }

  return result;
}
```

### Verify Retention Window

```javascript
// Source: Research findings - debugging query
const db = require('better-sqlite3')('nikki-sync.sqlite');

// Check year distribution
const yearStats = db.prepare(`
  SELECT
    year,
    COUNT(*) as member_count,
    SUM(saldo) as total_outstanding
  FROM nikki_contributions
  GROUP BY year
  ORDER BY year DESC
`).all();

console.log('Year distribution:', yearStats);
// Expected: 4 years (current + 3 previous)

// Check current year calculation
const currentYear = new Date().getFullYear();
const cutoffYear = currentYear - 4 + 1;
console.log(`Current year: ${currentYear}`);
console.log(`Retention cutoff: ${cutoffYear} (keeping >= ${cutoffYear})`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DELETE all then INSERT | UPSERT with ON CONFLICT | SQLite 3.24.0 (2018) | 2x+ performance, preserves historical data |
| Row-by-row inserts | Transaction-wrapped bulk operations | better-sqlite3 v5+ (2018) | 10x+ performance improvement |
| Application-level duplicate checking | Database UNIQUE constraint | Always available | Atomic enforcement, prevents race conditions |
| getYear() for year values | getFullYear() | getYear() deprecated 1999 | Returns correct 4-digit year |

**Deprecated/outdated:**
- `getYear()`: Returns year minus 1900 (126 for 2026). Replaced by `getFullYear()` which returns the actual year.
- `INSERT OR REPLACE`: Still works but deprecated in favor of explicit `ON CONFLICT DO UPDATE` for clarity and control.
- `clearContributions()` before upsert: Destroys historical data. Use year-based retention pruning instead.

## Open Questions

Things that couldn't be fully resolved:

1. **Should retention happen before or after upsert?**
   - What we know: Both work correctly
   - What's unclear: Whether one ordering has performance advantage
   - Recommendation: Prune AFTER upsert to avoid deleting then potentially re-inserting same year data

2. **Should retention be configurable via environment variable?**
   - What we know: User decided on 4 years in CONTEXT.md
   - What's unclear: Whether this should be RETENTION_YEARS=4 in .env
   - Recommendation: Start with hardcoded `pruneOldContributions(db, 4)`, add env var if user requests configurability

3. **Should we log year distribution in sync summary?**
   - What we know: Would help verify retention working correctly
   - What's unclear: Whether it adds value vs noise to sync reports
   - Recommendation: Add verbose logging for year counts, not in standard summary

## Sources

### Primary (HIGH confidence)

- [SQLite UPSERT Documentation](https://sqlite.org/lang_upsert.html) - Official syntax and semantics
- [better-sqlite3 API Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) - Transaction usage and prepared statements
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html) - INTEGER vs TEXT for year storage
- Existing codebase: lib/nikki-db.js - Current implementation already uses optimal patterns

### Secondary (MEDIUM confidence)

- [PDQ: Improving Bulk Insert Speed in SQLite](https://www.pdq.com/blog/improving-bulk-insert-speed-in-sqlite-a-comparison-of-transactions/) - Transaction performance benchmarks (10x improvement)
- [Future Studio: Get Current Year in Node.js](https://futurestud.io/tutorials/get-the-current-year-in-javascript-or-node-js) - getFullYear() usage
- [Sling Academy: Common Mistakes in Indexing](https://www.slingacademy.com/article/common-mistakes-in-indexing-and-how-to-avoid-them-in-sqlite/) - Range query index pitfalls

### Tertiary (LOW confidence)

- WebSearch results on year-based retention patterns - No definitive "best practice", synthesized from multiple sources
- Community examples of DELETE with WHERE - Syntax verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use, well-documented
- Architecture: HIGH - Existing implementation follows best practices, minimal changes needed
- Pitfalls: HIGH - Verified against official docs and existing codebase patterns

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - SQLite and better-sqlite3 are stable, slow-moving projects)

**Key finding:** The current nikki-db.js implementation already uses optimal patterns for year-based upserts. Phase 28 only requires:
1. Remove line 510 `clearContributions(db)` from download-nikki-contributions.js
2. Add `pruneOldContributions(db, 4)` after upsert
3. Export new function from lib/nikki-db.js
4. Verify with `SELECT DISTINCT year` query after first sync
