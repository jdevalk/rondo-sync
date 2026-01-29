# Phase 21: Conflict Resolution Infrastructure - Research

**Researched:** 2026-01-29
**Domain:** Bidirectional sync conflict detection, last-write-wins resolution, field-level merging, audit trails
**Confidence:** HIGH

## Summary

Phase 21 implements conflict detection and resolution infrastructure for bidirectional sync using last-write-wins (LWW) logic at the field level. Research confirms that LWW with timestamp comparison is the industry standard for bidirectional sync systems, though it requires careful clock synchronization and tolerance for drift. The codebase already has all necessary foundations from Phase 20 (timestamps, origin tracking) and established patterns for logging and email notifications.

**Key findings:**
- Last-write-wins is the standard conflict resolution strategy in distributed systems (Couchbase, Cassandra, Riak)
- Field-level conflict resolution (not whole-record) is critical for reducing data loss and merge complexity
- 5-second clock drift tolerance is industry standard (Couchbase monitors this threshold)
- Grace period behavior (Sportlink wins on near-ties) simplifies the most common scenario
- Audit trails should log: member KNVB ID, field name, old value, new value, winning system, both timestamps
- Email notifications should summarize conflicts detected and include audit trail for operator review
- No external libraries needed - conflict resolution logic is straightforward timestamp comparison

**Primary recommendation:** Build a conflict resolver module (`lib/conflict-resolver.js`) that uses the existing `compareTimestamps()` function from Phase 20 to detect conflicts and apply last-write-wins logic at field level. Log all conflict resolutions to SQLite audit table and include summary in existing email report infrastructure.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lib/sync-origin.js | Current | Timestamp comparison with tolerance | Already implemented in Phase 20 |
| lib/logger.js | Current | Dual-stream logging (stdout + file) | Existing codebase pattern |
| lib/stadion-db.js | Current | SQLite operations and migrations | Existing codebase pattern |
| scripts/send-email.js | Current | Email delivery via Postmark | Existing codebase pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | Current | Audit trail storage | Conflict resolution history tracking |
| postmark | Current | Email notifications | Conflict summary delivery |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Last-write-wins | CRDTs (Conflict-free Replicated Data Types) | CRDTs eliminate conflicts but add complexity. LWW is simpler and sufficient for this use case. |
| Timestamp comparison | Version vectors | Version vectors handle causality better but require more storage. Timestamps sufficient for two-system sync. |
| Automatic resolution | Manual resolution UI | Manual resolution ensures no data loss but blocks sync. LWW with audit trail provides safety net. |
| Field-level resolution | Whole-record resolution | Whole-record loses more data on conflicts. Field-level is standard best practice. |

**Installation:**
No new dependencies required. All capabilities exist in current stack.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── conflict-resolver.js   # NEW: Conflict detection and resolution logic
├── sync-origin.js         # Existing: Timestamp utilities
├── stadion-db.js          # Modified: Add conflict audit table
└── logger.js              # Existing: Logging infrastructure

.planning/phases/21-conflict-resolution-infrastructure/
├── 21-CONTEXT.md          # User decisions (grace period, NULL handling)
├── 21-RESEARCH.md         # This document
└── 21-PLAN.md             # Implementation tasks (to be created)
```

### Pattern 1: Field-Level Conflict Detection
**What:** Compare timestamps for each tracked field individually to identify conflicts
**When to use:** Before applying changes in bidirectional sync
**Example:**
```javascript
// Source: Industry standard pattern (Couchbase, StackSync)
const { TRACKED_FIELDS, getTimestampColumnNames, compareTimestamps } = require('./lib/sync-origin');

function detectConflicts(member, sportlinkData, stadionData) {
  const conflicts = [];

  for (const field of TRACKED_FIELDS) {
    const cols = getTimestampColumnNames(field);
    const sportlinkTs = member[cols.sportlink];
    const stadionTs = member[cols.stadion];

    // Only check if both systems have modified the field
    if (sportlinkTs && stadionTs) {
      const comparison = compareTimestamps(stadionTs, sportlinkTs, 5000);

      // 0 = within tolerance (grace period - Sportlink wins per 21-CONTEXT.md)
      // 1 = Stadion newer
      // -1 = Sportlink newer

      if (comparison !== 0 && sportlinkData[field] !== stadionData[field]) {
        // Actual conflict: both modified, values differ, timestamps differ
        conflicts.push({
          field,
          sportlinkValue: sportlinkData[field],
          stadionValue: stadionData[field],
          sportlinkModified: sportlinkTs,
          stadionModified: stadionTs,
          winner: comparison > 0 ? 'stadion' : 'sportlink'
        });
      }
    }
  }

  return conflicts;
}
```

### Pattern 2: Grace Period Handling
**What:** Treat near-simultaneous edits (within tolerance) as non-conflicting
**When to use:** Always during timestamp comparison
**Example:**
```javascript
// Source: Phase 21 CONTEXT.md decision + Couchbase 5-second threshold
// Within 5 seconds: Sportlink wins (forward sync takes precedence)
const comparison = compareTimestamps(stadionTs, sportlinkTs, 5000);

if (comparison === 0) {
  // Within grace period - use Sportlink value (forward sync preference)
  resolvedValue = sportlinkData[field];
  resolution = 'grace_period_sportlink_wins';
} else if (comparison > 0) {
  // Stadion is newer by >5 seconds
  resolvedValue = stadionData[field];
  resolution = 'stadion_newer';
} else {
  // Sportlink is newer by >5 seconds
  resolvedValue = sportlinkData[field];
  resolution = 'sportlink_newer';
}
```

### Pattern 3: NULL Timestamp Handling
**What:** Handle cases where one or both systems have NULL timestamps (no history)
**When to use:** Before conflict detection comparison
**Example:**
```javascript
// Source: Phase 21 CONTEXT.md decision + Phase 20 implementation
function resolveField(member, field, sportlinkData, stadionData) {
  const cols = getTimestampColumnNames(field);
  const sportlinkTs = member[cols.sportlink];
  const stadionTs = member[cols.stadion];

  // Case 1: Both NULL - use current value from forward sync (Sportlink)
  if (!sportlinkTs && !stadionTs) {
    return {
      value: sportlinkData[field],
      resolution: 'both_null_use_sportlink',
      conflict: false
    };
  }

  // Case 2: One NULL - system with timestamp wins
  if (!sportlinkTs) {
    return {
      value: stadionData[field],
      resolution: 'stadion_has_history',
      conflict: false
    };
  }

  if (!stadionTs) {
    return {
      value: sportlinkData[field],
      resolution: 'sportlink_has_history',
      conflict: false
    };
  }

  // Case 3: Both have timestamps - proceed with conflict detection
  // (handled by Pattern 1)
}
```

### Pattern 4: Conflict Audit Trail
**What:** Store conflict resolution decisions for operator review and debugging
**When to use:** Every time a conflict is detected and resolved
**Example:**
```javascript
// Source: Industry standard (Couchbase, StackSync audit patterns)
function logConflictResolution(db, knvbId, conflict, resolution) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO conflict_resolutions (
      knvb_id,
      field_name,
      sportlink_value,
      stadion_value,
      sportlink_modified,
      stadion_modified,
      winning_system,
      resolution_reason,
      resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    knvbId,
    conflict.field,
    conflict.sportlinkValue,
    conflict.stadionValue,
    conflict.sportlinkModified,
    conflict.stadionModified,
    conflict.winner,
    resolution,
    now
  );
}
```

### Pattern 5: Email Notification Summary
**What:** Include conflict summary in existing sync email reports
**When to use:** After sync completes if any conflicts were detected
**Example:**
```javascript
// Source: Existing codebase pattern (lib/logger.js + scripts/send-email.js)
function generateConflictSummary(conflicts) {
  if (conflicts.length === 0) {
    return null; // No conflicts section needed
  }

  const summary = [];
  summary.push('CONFLICTS DETECTED AND RESOLVED');
  summary.push('');
  summary.push(`Total conflicts: ${conflicts.length}`);

  // Group by member
  const byMember = {};
  for (const c of conflicts) {
    if (!byMember[c.knvbId]) byMember[c.knvbId] = [];
    byMember[c.knvbId].push(c);
  }

  summary.push('');
  for (const [knvbId, memberConflicts] of Object.entries(byMember)) {
    summary.push(`Member ${knvbId}:`);
    for (const c of memberConflicts) {
      summary.push(`  - ${c.field}: ${c.winner} won (${c.resolution})`);
      summary.push(`    Sportlink: "${c.sportlinkValue}" (${c.sportlinkModified})`);
      summary.push(`    Stadion: "${c.stadionValue}" (${c.stadionModified})`);
    }
    summary.push('');
  }

  return summary.join('\n');
}

// Add to existing logger output
logger.log(conflictSummary);
```

### Anti-Patterns to Avoid
- **Whole-record conflict detection:** Don't mark entire member as conflicted if only one field differs. Field-level resolution reduces data loss.
- **Ignoring grace period:** Don't treat every timestamp difference as a conflict. Clock drift is real and 5-second tolerance prevents false positives.
- **No audit trail:** Don't resolve conflicts without logging decisions. Operators need visibility into automated resolutions.
- **Blocking on conflicts:** Don't halt sync waiting for manual resolution. LWW is automatic - log and continue.
- **Comparing values instead of timestamps:** Don't use string comparison on field values. Timestamps are the source of truth for "newer."
- **Single timestamp per record:** Don't use modified_at for entire record. Per-field tracking is essential.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timestamp comparison with tolerance | Custom date math | compareTimestamps() from Phase 20 | Already implements 5-second tolerance and NULL handling correctly |
| Audit trail storage | Custom JSON logging | SQLite table with schema | Queryable, structured, integrates with existing db pattern |
| Email formatting | Custom HTML builder | Existing formatAsHtml() in scripts/send-email.js | Already handles structured text → HTML conversion |
| Conflict detection logic | Ad-hoc if/else chains | Dedicated conflict resolver module | Testable, reusable, maintainable |

**Key insight:** Phase 20 already provides all timestamp utilities. Phase 21 is about applying them systematically with audit trail and notifications. Don't reinvent timestamp comparison or storage patterns.

## Common Pitfalls

### Pitfall 1: False Conflicts from Clock Drift
**What goes wrong:** Production server and WordPress server clocks differ by 2-3 seconds. System detects "conflicts" on every sync even though no real conflict exists.
**Why it happens:** NTP sync is imperfect. Even with NTP, 1-10ms drift is normal. Without NTP, drift can reach seconds.
**How to avoid:**
- Use 5-second tolerance (already in compareTimestamps())
- Within tolerance: Sportlink wins (per 21-CONTEXT.md grace period decision)
- Log grace period resolutions separately from true conflicts
- Monitor clock drift: if >50% of "conflicts" are grace period, investigate NTP
**Warning signs:** Every sync reports conflicts. Conflicts always resolve to same system (indicating systematic clock offset, not random edits).

### Pitfall 2: Treating NULL as Conflict
**What goes wrong:** Comparison logic treats NULL timestamp as "missing data" and flags as conflict, even though it just means "modified before tracking started."
**Why it happens:** Existing data predates Phase 20 timestamp tracking (per 20-01-SUMMARY.md decision).
**How to avoid:**
- NULL means "untracked history" not "conflicted"
- If both NULL: use Sportlink value (forward sync default)
- If one NULL: system with timestamp wins (it has tracked modification)
- Only detect conflict when BOTH timestamps exist AND values differ
**Warning signs:** All existing members show conflicts after Phase 20 deployment. Conflicts on fields that haven't been edited.

### Pitfall 3: Comparing Values Instead of Timestamps
**What goes wrong:** Logic compares field values (sportlinkData.email !== stadionData.email) and treats difference as conflict, ignoring timestamps.
**Why it happens:** Intuitive but wrong. Value difference doesn't mean conflict - one system may legitimately be newer.
**How to avoid:**
- Always compare timestamps first
- Value comparison only confirms conflict exists (both modified AND values differ)
- Trust timestamps as source of truth for "which is newer"
**Warning signs:** Forward sync gets "stuck" because every difference is flagged as conflict. Reverse sync never happens because Sportlink always "wins."

### Pitfall 4: No Audit Trail Means No Debugging
**What goes wrong:** Conflicts are resolved silently. Operator reports "my edit in Stadion disappeared" but no log exists to explain why.
**Why it happens:** Implementing resolution logic without logging decisions.
**How to avoid:**
- Log every conflict detection to SQLite audit table
- Include: member ID, field, both values, both timestamps, winner, reason
- Include conflict summary in email report
- Audit table enables retroactive debugging: "what happened to this member's email?"
**Warning signs:** Operator complaints about lost edits. No way to verify if system worked correctly. Support requests require code inspection instead of audit log query.

### Pitfall 5: Blocking Sync on Conflicts
**What goes wrong:** System pauses sync and sends "manual intervention required" email when conflicts detected. Sync never completes automatically.
**Why it happens:** Conservative approach - fear of data loss. But defeats automation purpose.
**How to avoid:**
- LWW is automatic by design - always choose newer based on timestamp
- Log conflicts, don't block on them
- Operator reviews audit trail after sync completes
- Only block if resolution logic fails (invalid data, not conflict)
**Warning signs:** Cron jobs fail regularly. Sync requires manual operator action to complete. Email reports say "paused, waiting for resolution."

### Pitfall 6: Race Condition During Near-Simultaneous Edits
**What goes wrong:** User edits field in Stadion, forward sync runs 1 second later from Sportlink, both timestamps within grace period. Which value is "right"?
**Why it happens:** Real-world timing - syncs happen while users work.
**How to avoid:**
- Grace period decision is explicit: Sportlink wins (per 21-CONTEXT.md)
- Rationale: forward sync is primary data flow, reverse sync is corrections
- User edits in Stadion during sync window will be overwritten by next sync
- This is acceptable - Stadion is not source of truth for most fields
- Critical edits should wait for sync to complete (operator workflow, not system limitation)
**Warning signs:** User reports "my edit disappeared immediately." Support requests about timing. This is expected behavior, document in operator guide.

## Code Examples

Verified patterns from existing codebase and official sources:

### Existing Timestamp Comparison (Phase 20)
```javascript
// Source: lib/sync-origin.js lines 66-80
function compareTimestamps(ts1, ts2, toleranceMs = 5000) {
  // NULL is treated as infinitely old (epoch)
  const time1 = ts1 ? new Date(ts1).getTime() : 0;
  const time2 = ts2 ? new Date(ts2).getTime() : 0;

  const diff = time1 - time2;

  if (diff > toleranceMs) {
    return 1;  // ts1 is newer by more than tolerance
  } else if (diff < -toleranceMs) {
    return -1; // ts2 is newer by more than tolerance
  } else {
    return 0;  // Within tolerance, too close to call
  }
}
```

### Existing Email Summary Pattern
```javascript
// Source: scripts/send-email.js formatAsHtml() function
// Supports section headers, key-value pairs, lists
logger.log('CONFLICTS DETECTED AND RESOLVED');
logger.log('');
logger.log(`Total conflicts: ${conflictCount}`);
logger.log(`Members affected: ${Object.keys(byMember).length}`);
logger.log('');
logger.log('RESOLUTION DETAILS');
logger.log('');
for (const [knvbId, conflicts] of Object.entries(byMember)) {
  logger.log(`- ${knvbId}: ${conflicts.length} field(s)`);
}

// formatAsHtml() will parse this into structured HTML:
// <h2>CONFLICTS DETECTED AND RESOLVED</h2>
// <p><strong>Total conflicts:</strong> 3</p>
// <ul>
//   <li>VGPP426: 2 field(s)</li>
// </ul>
```

### Existing Database Insert Pattern
```javascript
// Source: lib/stadion-db.js upsertMembers() pattern
db.prepare(`
  INSERT INTO conflict_resolutions (
    knvb_id, field_name, sportlink_value, stadion_value,
    sportlink_modified, stadion_modified, winning_system,
    resolution_reason, resolved_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  knvbId,
  'email',
  'old@example.com',
  'new@example.com',
  '2026-01-29T10:00:00.000Z',
  '2026-01-29T10:05:00.000Z',
  'stadion',
  'stadion_newer',
  new Date().toISOString()
);
```

### Complete Conflict Resolution Flow
```javascript
// Pseudocode showing full pattern
const { TRACKED_FIELDS, getTimestampColumnNames, compareTimestamps } = require('./lib/sync-origin');
const { openDb } = require('./lib/stadion-db');

async function resolveConflicts(member, sportlinkData, stadionData, logger) {
  const db = openDb();
  const conflicts = [];
  const resolutions = {};

  for (const field of TRACKED_FIELDS) {
    const cols = getTimestampColumnNames(field);
    const sportlinkTs = member[cols.sportlink];
    const stadionTs = member[cols.stadion];

    // Handle NULL timestamps
    if (!sportlinkTs && !stadionTs) {
      resolutions[field] = {
        value: sportlinkData[field],
        reason: 'both_null_sportlink_default'
      };
      continue;
    }

    if (!sportlinkTs) {
      resolutions[field] = {
        value: stadionData[field],
        reason: 'only_stadion_has_history'
      };
      continue;
    }

    if (!stadionTs) {
      resolutions[field] = {
        value: sportlinkData[field],
        reason: 'only_sportlink_has_history'
      };
      continue;
    }

    // Both have timestamps - check for conflict
    const comparison = compareTimestamps(stadionTs, sportlinkTs, 5000);

    if (comparison === 0) {
      // Grace period - Sportlink wins
      resolutions[field] = {
        value: sportlinkData[field],
        reason: 'grace_period_sportlink_wins'
      };
    } else {
      // Check if values actually differ
      if (sportlinkData[field] !== stadionData[field]) {
        // Real conflict - log it
        const winner = comparison > 0 ? 'stadion' : 'sportlink';
        const winningValue = winner === 'stadion' ? stadionData[field] : sportlinkData[field];

        conflicts.push({
          knvbId: member.knvb_id,
          field,
          sportlinkValue: sportlinkData[field],
          stadionValue: stadionData[field],
          sportlinkModified: sportlinkTs,
          stadionModified: stadionTs,
          winner,
          reason: comparison > 0 ? 'stadion_newer' : 'sportlink_newer'
        });

        // Log to audit trail
        db.prepare(`
          INSERT INTO conflict_resolutions (
            knvb_id, field_name, sportlink_value, stadion_value,
            sportlink_modified, stadion_modified, winning_system,
            resolution_reason, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          member.knvb_id, field,
          sportlinkData[field], stadionData[field],
          sportlinkTs, stadionTs,
          winner, comparison > 0 ? 'stadion_newer' : 'sportlink_newer',
          new Date().toISOString()
        );

        resolutions[field] = {
          value: winningValue,
          reason: comparison > 0 ? 'stadion_newer' : 'sportlink_newer'
        };
      } else {
        // Timestamps differ but values same - no conflict
        resolutions[field] = {
          value: sportlinkData[field],
          reason: 'values_match_no_conflict'
        };
      }
    }
  }

  return { conflicts, resolutions };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual conflict resolution | Automatic LWW with audit | Industry standard since ~2012 (Cassandra, Couchbase) | Enables true automation while maintaining accountability |
| Whole-record timestamps | Per-field timestamps | Best practice since ~2015 | Reduces data loss - only conflicted fields overwritten |
| No clock drift tolerance | 5-second grace period | Couchbase standard, widely adopted 2020+ | Prevents false positives from NTP imperfections |
| Silent conflict resolution | Audit trail + notifications | Modern compliance requirement | Debugging, accountability, operator awareness |
| Synchronous resolution | Asynchronous with logging | Cloud-native pattern 2018+ | Non-blocking sync, conflicts logged after fact |

**Deprecated/outdated:**
- **Vector clocks for two-system sync:** Overkill - timestamps sufficient when only two systems involved
- **Three-way merge:** Complex, requires common ancestor tracking. LWW simpler and sufficient.
- **Prompt user for resolution:** Breaks automation, requires UI. LWW with audit trail provides safety net.

## Open Questions

Things that couldn't be fully resolved:

1. **Conflict Resolution Performance**
   - What we know: Field-level comparison requires checking 7 fields × 2 timestamps per member. With 1000+ members, this is 14,000+ comparisons per sync.
   - What's unclear: Whether this adds measurable latency to sync operations.
   - Recommendation: Implement and measure. If slow, add index on timestamp columns. Most syncs will have zero conflicts (early exit).

2. **Conflict Frequency Baseline**
   - What we know: LWW assumes conflicts are rare. If conflicts are frequent, audit table grows quickly.
   - What's unclear: In practice, how often do Stadion users edit fields while Sportlink also updates them?
   - Recommendation: Add conflict rate metric to email report. If >5% of members have conflicts, investigate workflow (users editing during sync windows?).

3. **Audit Trail Retention**
   - What we know: Conflict resolutions accumulate in SQLite over time. Indefinite retention means database grows unbounded.
   - What's unclear: How long to retain conflict history? Days? Weeks? Forever?
   - Recommendation: Start with no retention policy (store forever). Review after 3 months of Phase 24 operation. If audit table is large, implement 90-day retention with archive option.

4. **Grace Period Notification Verbosity**
   - What we know: Grace period resolutions (within 5 seconds) are handled silently per 21-CONTEXT.md.
   - What's unclear: Should grace period resolutions appear in audit trail? In email summary?
   - Recommendation: Log to audit trail (for debugging) but exclude from email summary (reduces noise). Operator only sees true conflicts (>5 second difference).

## Sources

### Primary (HIGH confidence)
- [Conflict Resolution | Couchbase Docs](https://docs.couchbase.com/sync-gateway/current/conflict-resolution.html) - LWW conflict resolution
- [Monitor Clock Drift | Couchbase Docs](https://docs.couchbase.com/server/current/manage/monitor/xdcr-monitor-timestamp-conflict-resolution.html) - 5 second drift threshold
- [Last Writer Wins in Distributed Systems | Number Analytics](https://www.numberanalytics.com/blog/last-writer-wins-distributed-systems) - LWW best practices
- [Deep Dive: Stacksync's Conflict Resolution Engine for Bidirectional CRM Integration](https://www.stacksync.com/blog/deep-dive-stacksyncs-conflict-resolution-engine-for-bidirectional-crm-integration) - Field-level conflict detection
- [Two-Way Sync Demystified: Key Principles And Best Practices | StackSync](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices) - Bidirectional sync overview

### Secondary (MEDIUM confidence)
- [Tracking SQLite table history using a JSON audit log | Simon Willison's TILs](https://til.simonwillison.net/sqlite/json-audit-log) - SQLite audit patterns
- [Creating Audit Tables with SQLite and SQL Triggers | Medium](https://medium.com/@dgramaciotti/creating-audit-tables-with-sqlite-and-sql-triggers-751f8e13cf73) - Audit table design
- [Mastering Two-Way Sync: Key Concepts and Implementation Strategies | StackSync](https://www.stacksync.com/blog/mastering-two-way-sync-key-concepts-and-implementation-strategies) - Implementation patterns
- [Conflict Resolution: Using Last-Write-Wins vs. CRDTs | DZone](https://dzone.com/articles/conflict-resolution-using-last-write-wins-vs-crdts) - LWW vs alternatives

### Tertiary (LOW confidence)
- [Challenges with Data Synchronization | SyncML | InformIT](https://www.informit.com/articles/article.aspx?p=31064&seqNum=4) - General sync challenges

### Codebase Reference
- lib/sync-origin.js - compareTimestamps() implementation (Phase 20)
- lib/stadion-db.js lines 256-319 - Bidirectional timestamp columns (Phase 20)
- lib/logger.js - Dual-stream logging pattern
- scripts/send-email.js - Email formatting and delivery
- .planning/phases/20-foundation/20-01-SUMMARY.md - Timestamp tracking decisions
- .planning/phases/21-conflict-resolution-infrastructure/21-CONTEXT.md - Grace period and NULL handling decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 20 provides all utilities, no new libraries needed
- Architecture: HIGH - Patterns proven in production systems (Couchbase, StackSync) and align with existing codebase
- Pitfalls: HIGH - Documented in Couchbase and StackSync sources, validated against Phase 20 implementation
- Audit trail: MEDIUM - Pattern is standard but exact schema needs design (straightforward SQLite table)
- Email format: HIGH - Existing formatAsHtml() pattern supports needed structure

**Research date:** 2026-01-29
**Valid until:** 2026-04-29 (90 days - conflict resolution patterns are stable, LWW is mature approach)

**Context integration:**
Research successfully integrated user decisions from 21-CONTEXT.md:
- ✅ Grace period behavior: 5-second tolerance, Sportlink wins on near-ties
- ✅ NULL timestamp handling: Current value wins, no waiting for both sides
- ✅ Silent handling: Grace period resolutions don't generate special notifications
- 🔧 Comparison logic: Use existing compareTimestamps() from Phase 20
- 🔧 Audit trail: SQLite table with conflict details for operator review
- 🔧 Email notifications: Extend existing email report with conflict summary section
