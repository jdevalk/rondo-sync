# Phase 14: Work History Sync - Research

**Researched:** 2026-01-26
**Domain:** WordPress ACF work_history repeater, SQLite change detection, many-to-many relationship tracking
**Confidence:** MEDIUM

## Summary

Work history sync links persons to teams via ACF repeater fields in Stadion WordPress. The system tracks team assignments in SQLite and detects changes to update work_history entries accordingly. The implementation follows the established hash-based change detection pattern used throughout the codebase, adapted for many-to-many relationships.

The standard approach uses ACF repeater fields with post_object references for team links. Change detection requires a junction table to track member-team pairs with hash-based comparison. Partial failure handling is critical since members sync independently.

**Primary recommendation:** Use a junction table (`stadion_work_history`) to track each member-team pairing separately with hash-based change detection. This enables granular updates when one team changes while others remain stable, and provides clear audit trail of sync-created work_history entries vs manually created ones.

## Standard Stack

The established libraries/tools already in use for this domain.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | Current | SQLite state tracking | Already used throughout codebase for members, parents, teams |
| stadion-client.js | Internal | WordPress REST API client | Established module with Basic Auth, error handling |
| stadion-db.js | Internal | SQLite operations | Centralized database schema and queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node.js) | Built-in | SHA-256 hashing | Change detection via computeSourceHash pattern |
| Date (JavaScript) | Built-in | Date formatting | Converting to ACF Ymd format (YYYYMMDD) |

### Alternatives Considered
None - this phase extends existing infrastructure rather than introducing new tools.

**Installation:**
No new dependencies required - all modules already in package.json.

## Architecture Patterns

### Recommended SQLite Schema
```sql
CREATE TABLE IF NOT EXISTS stadion_work_history (
  id INTEGER PRIMARY KEY,
  knvb_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  stadion_work_history_id INTEGER,
  source_hash TEXT NOT NULL,
  last_synced_hash TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(knvb_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_stadion_work_history_sync
  ON stadion_work_history (source_hash, last_synced_hash);

CREATE INDEX IF NOT EXISTS idx_stadion_work_history_member
  ON stadion_work_history (knvb_id);
```

**Key design decisions:**
- Composite UNIQUE constraint on `(knvb_id, team_name)` prevents duplicate pairings
- `stadion_work_history_id` stores the WordPress post ID of the work_history repeater row
- Separate hash per pairing enables granular change detection
- Index on knvb_id for efficient member-based queries

### Pattern 1: Junction Table for Many-to-Many Change Detection
**What:** Track each member-team pairing as a separate row with its own hash and sync state.

**When to use:** When members can belong to multiple teams simultaneously and you need to detect which specific relationships changed.

**Example:**
```javascript
// Source: Existing codebase pattern adapted for work_history
function computeWorkHistoryHash(knvbId, teamName) {
  const payload = stableStringify({
    knvb_id: knvbId,
    team_name: teamName
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function upsertWorkHistory(db, workHistoryRecords) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO stadion_work_history (
      knvb_id, team_name, source_hash, created_at
    )
    VALUES (@knvb_id, @team_name, @source_hash, @created_at)
    ON CONFLICT(knvb_id, team_name) DO UPDATE SET
      source_hash = excluded.source_hash
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = workHistoryRecords.map((record) => ({
    knvb_id: record.knvb_id,
    team_name: record.team_name,
    source_hash: computeWorkHistoryHash(record.knvb_id, record.team_name),
    created_at: now
  }));

  insertMany(rows);
}
```

### Pattern 2: ACF Repeater Field Updates via REST API
**What:** ACF repeater fields are arrays of objects. Each object contains subfield key-value pairs.

**When to use:** Updating work_history repeater field in Stadion WordPress.

**Example:**
```javascript
// Source: https://www.advancedcustomfields.com/resources/wp-rest-api-integration/
const workHistoryData = {
  acf: {
    work_history: [
      {
        job_title: "Speler",
        is_current: true,
        start_date: "20260126",     // MUST be Ymd format
        end_date: "",               // Empty string for no end date
        post_object: 789            // Team post ID (integer)
      }
    ]
  }
};

// PUT request to update person
await stadionRequest(
  `wp/v2/people/${personStadionId}`,
  'PUT',
  workHistoryData,
  options
);
```

**Critical field formats:**
- `job_title`: String - always "Speler" per requirements
- `is_current`: Boolean - true/false (ACF converts to '1'/'0' in DB)
- `start_date`: String in `Ymd` format (e.g., "20260126") - required by ACF
- `end_date`: String in `Ymd` format or empty string for null
- `post_object`: Integer - the WordPress post ID of the team

### Pattern 3: Preserving Manual Work History Entries
**What:** Fetch existing work_history array, filter to keep non-sync entries, merge with sync entries.

**When to use:** Updating a person who may have manually created work_history entries in WordPress.

**Example:**
```javascript
// Source: Existing relationships pattern from submit-stadion-sync.js lines 130-149
async function updatePersonWorkHistory(personId, syncWorkHistory, db, options) {
  // Get existing work_history array
  const existing = await stadionRequest(
    `wp/v2/people/${personId}`,
    'GET',
    null,
    options
  );

  const existingWorkHistory = existing.body.acf?.work_history || [];

  // Track sync-created IDs from database
  const syncCreatedIds = getSyncCreatedWorkHistoryIds(db, knvbId);

  // Keep only manually created entries (not in sync tracking)
  const manualEntries = existingWorkHistory.filter(entry =>
    !syncCreatedIds.has(entry.id)
  );

  // Merge manual + sync entries
  const mergedWorkHistory = [...manualEntries, ...syncWorkHistory];

  await stadionRequest(
    `wp/v2/people/${personId}`,
    'PUT',
    { acf: { work_history: mergedWorkHistory } },
    options
  );
}
```

### Pattern 4: Date-Based Work History Transitions
**What:** When team changes, end old entry and create new entry with date boundaries.

**When to use:** Implementing the "set end_date on old entry, create new entry with start_date" requirement.

**Example:**
```javascript
// Source: Phase 14 context requirements
function formatDateForACF(date) {
  // ACF requires Ymd format: YYYYMMDD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function computeStartEndDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    oldEntryEndDate: formatDateForACF(yesterday),  // e.g., "20260125"
    newEntryStartDate: formatDateForACF(today)     // e.g., "20260126"
  };
}

// When member leaves team: set end_date
const departedTeamEntry = {
  ...existingEntry,
  end_date: computeStartEndDates().oldEntryEndDate,
  is_current: false
};

// When member joins team: create with start_date
const newTeamEntry = {
  job_title: "Speler",
  is_current: true,
  start_date: computeStartEndDates().newEntryStartDate,
  end_date: "",
  post_object: newTeamStadionId
};
```

### Anti-Patterns to Avoid

- **Fetching team post IDs via REST API for verification:** Already have team cache in SQLite from Phase 13. Use `getAllTeams(db)` to get team_name → stadion_id mapping. REST calls are slow and unnecessary.

- **Updating all work_history entries when only one team changes:** Track each member-team pairing separately. Only update the specific entries that changed, preserving others.

- **Deleting and recreating entire work_history array:** Loses manually created entries in WordPress. Always fetch, filter, and merge.

- **Using YYYY-MM-DD format for dates:** ACF date picker REQUIRES Ymd format (YYYYMMDD) for REST API writes. Display format settings don't change input requirements.

## Don't Hand-Roll

Problems that look simple but have existing solutions.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Many-to-many change detection | Custom diff algorithm | Junction table + hash per pairing | Proven pattern; scales to thousands of pairings; enables SQL queries |
| Date formatting for ACF | Manual string manipulation | Dedicated format function | ACF has strict Ymd requirement; easy to get wrong; centralize logic |
| Preserving manual entries | Flag-based filtering | Track sync IDs in database | Clean separation; doesn't require WordPress field changes; audit trail |
| Partial failure handling | Stop on first error | Collect errors, continue | One member's failure shouldn't block others; report all errors at end |

**Key insight:** The codebase already has robust patterns for hash-based change detection, SQLite tracking, and partial failure handling. Extend these patterns rather than inventing new approaches. The junction table is the standard database pattern for many-to-many with change tracking.

## Common Pitfalls

### Pitfall 1: Date Format Confusion
**What goes wrong:** Using YYYY-MM-DD format for ACF date fields causes silent failures or data corruption.

**Why it happens:** Developers expect ISO 8601 format (YYYY-MM-DD) since it's common in JavaScript and REST APIs. ACF uses Ymd (YYYYMMDD) for database storage and requires this format for REST API writes.

**How to avoid:**
- Create a dedicated `formatDateForACF()` function that produces Ymd format
- Document format requirement in code comments
- Test with actual dates to verify format (wrong format may not throw errors)

**Warning signs:**
- Dates appear in WordPress admin with wrong values
- API accepts dates but they don't save correctly
- Date fields show empty when they should have values

### Pitfall 2: Post Object Field Return Format Mismatch
**What goes wrong:** Sending post objects instead of post IDs, or expecting full post objects in responses.

**Why it happens:** ACF post_object fields have a "Return Format" setting that can be "Post Object" or "Post ID". The REST API behavior differs from the PHP behavior.

**How to avoid:**
- Always send integer post IDs when updating post_object fields via REST API
- Don't expect nested post data in responses unless specifically configured
- Verify team exists in local SQLite cache before referencing its ID

**Warning signs:**
- TypeError: Cannot read property 'id' of undefined
- API rejects work_history updates with validation errors
- Team references don't appear in WordPress admin

### Pitfall 3: Race Conditions in Multi-Team Members
**What goes wrong:** Member belongs to teams A, B, C. Three separate updates try to write work_history simultaneously, causing conflicts or lost data.

**Why it happens:** Processing multiple work_history entries for one member without proper sequencing.

**How to avoid:**
- Update all work_history entries for a member in a single REST API call
- Fetch current state, merge changes, write once
- Use SQLite transactions for tracking updates

**Warning signs:**
- Intermittent missing work_history entries
- Some teams sync but others don't
- Sync state becomes inconsistent between SQLite and WordPress

### Pitfall 4: Losing Manual Work History Entries
**What goes wrong:** System overwrites work_history array, deleting entries that were manually created in WordPress.

**Why it happens:** Not fetching existing work_history before update, or not filtering out manual entries.

**How to avoid:**
- Always GET current person record before PUT
- Track `stadion_work_history_id` in SQLite for sync-created entries
- Filter existing array to keep entries NOT in sync tracking table
- Merge manual entries with sync-generated entries

**Warning signs:**
- WordPress admin users report lost work history data
- Entries with job_title other than "Speler" disappear
- Work history has fewer entries than expected

### Pitfall 5: Incomplete Change Detection
**What goes wrong:** Member was in teams [A, B], now in teams [A, C]. System detects "change" but doesn't properly end B's work_history or preserve A's.

**Why it happens:** Treating team list as a single unit instead of tracking each pairing independently.

**How to avoid:**
- Use junction table with one row per (member, team) pair
- Compare old team set with new team set to identify: added, removed, unchanged
- Only update work_history for added (create with start_date) and removed (set end_date)
- Leave unchanged teams alone

**Warning signs:**
- Work history shows duplicate entries for same team
- end_date not set when member leaves team
- Unchanged team associations get re-synced unnecessarily

## Code Examples

Verified patterns from existing codebase and official sources.

### Example 1: Extract Member Teams from Sportlink
```javascript
// Source: prepare-stadion-teams.js extractTeamName() function
function extractMemberTeams(sportlinkMember) {
  const teams = [];

  // Priority: UnionTeams first, ClubTeams fallback
  const unionTeam = (sportlinkMember.UnionTeams || '').trim();
  if (unionTeam) teams.push(unionTeam);

  const clubTeam = (sportlinkMember.ClubTeams || '').trim();
  if (clubTeam && clubTeam !== unionTeam) teams.push(clubTeam);

  return teams;
}
```

### Example 2: Build Team Name to Stadion ID Map
```javascript
// Source: stadion-db.js getAllTeams() function
function buildTeamMapping(db) {
  const teams = getAllTeams(db); // Returns [{team_name, stadion_id}]
  const teamMap = new Map();

  teams.forEach(team => {
    if (team.stadion_id) {
      teamMap.set(team.team_name, team.stadion_id);
    }
  });

  return teamMap;
}

// Usage: Verify team exists before creating work_history
const teamStadionId = teamMap.get(teamName);
if (!teamStadionId) {
  logVerbose(`Skipping work_history for ${knvbId}: team "${teamName}" not found in Stadion`);
  continue;
}
```

### Example 3: Detect Team Changes
```javascript
// Source: Pattern adapted from existing change detection logic
function detectTeamChanges(db, knvbId, currentTeams) {
  // Get previous teams from junction table
  const stmt = db.prepare(`
    SELECT team_name
    FROM stadion_work_history
    WHERE knvb_id = ?
  `);
  const previousTeams = new Set(stmt.all(knvbId).map(row => row.team_name));
  const currentTeamSet = new Set(currentTeams);

  // Calculate differences
  const added = currentTeams.filter(t => !previousTeams.has(t));
  const removed = Array.from(previousTeams).filter(t => !currentTeamSet.has(t));
  const unchanged = currentTeams.filter(t => previousTeams.has(t));

  return { added, removed, unchanged };
}
```

### Example 4: Format Work History Entry for ACF
```javascript
// Source: ACF REST API documentation + Phase 14 requirements
function buildWorkHistoryEntry(teamStadionId, isBackfill) {
  const today = new Date();
  const startDate = isBackfill
    ? ""  // Empty for historical data
    : formatDateForACF(today);  // Today's date for new entries

  return {
    job_title: "Speler",
    is_current: true,
    start_date: startDate,
    end_date: "",
    post_object: teamStadionId
  };
}
```

### Example 5: Partial Failure Error Collection
```javascript
// Source: submit-stadion-sync.js pattern (lines 393-398)
async function syncWorkHistoryForMembers(members, db, teamMap, options) {
  const result = {
    synced: 0,
    errors: []
  };

  for (const member of members) {
    try {
      await syncWorkHistoryForMember(member, db, teamMap, options);
      result.synced++;
    } catch (error) {
      result.errors.push({
        knvb_id: member.knvb_id,
        message: error.message
      });
      // Continue with next member - don't stop on error
    }
  }

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single hash for all relationships | Hash per relationship pair | Phase 14 (2026-01) | Enables granular change detection for many-to-many |
| Delete and recreate all entries | Fetch, filter, merge | Phase 8 (parent relationships) | Preserves manually created WordPress data |
| Stop on first error | Collect errors, continue | Phase 8 (member sync) | Partial failures don't block entire sync |
| REST API team verification | Local SQLite cache | Phase 13 (team tracking) | Eliminates N REST calls per member |

**Deprecated/outdated:**
- ACF date format `YYYY-MM-DD`: Appears to work but ACF internally requires `Ymd` (YYYYMMDD). Wrong format causes subtle bugs. Changed in ACF documentation emphasis around 2023-2024.

## Open Questions

Things that couldn't be fully resolved.

1. **ACF repeater row IDs for tracking**
   - What we know: ACF repeater rows have internal IDs in WordPress database
   - What's unclear: Whether these IDs are exposed consistently via REST API, or if they change on updates
   - Recommendation: Track by composite key (knvb_id + team_name) in SQLite rather than relying on ACF row IDs. Query existing work_history to match by post_object field value.

2. **Backfill performance for large datasets**
   - What we know: All existing persons need work_history backfilled
   - What's unclear: Whether 500+ person updates in one run will hit WordPress rate limits or timeout
   - Recommendation: Implement backfill as separate operation with progress tracking. Start with batch of 50-100, monitor performance, adjust batch size.

3. **Multiple teams with same name handling**
   - What we know: Phase 13 uses COLLATE NOCASE to prevent capitalization duplicates
   - What's unclear: What if there are legitimately different teams with similar names (e.g., "A1" youth team vs "A1" adult team)
   - Recommendation: Assume team names from Sportlink are unique. If duplicates discovered, Phase 15 should add team type/category disambiguation.

## Sources

### Primary (HIGH confidence)
- [ACF WP REST API Integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/) - Repeater field structure, update format
- [ACF Date Picker](https://www.advancedcustomfields.com/resources/date-picker/) - Ymd format requirement for REST API
- [ACF Post Object](https://www.advancedcustomfields.com/resources/post-object/) - Integer ID format for post_object fields
- Existing codebase patterns (submit-stadion-sync.js, stadion-db.js, prepare-stadion-teams.js)

### Secondary (MEDIUM confidence)
- [sqlite-history](https://github.com/simonw/sqlite-history) - Junction table pattern for change tracking
- [Hashing for Change Detection in SQL Server](https://telefonicatech.uk/blog/hashing-for-change-detection-in-sql-server/) - Hash-based change detection concepts
- [Node.js Error Handling Best Practices](https://sematext.com/blog/node-js-error-handling/) - Partial failure patterns
- [SQLite Many-to-Many Relationships](https://teamtreehouse.com/community/sqlite-manytomany-relationship-joining-2-tables-with-a-3-table-for-support-someone-can-help-me) - Junction table design

### Tertiary (LOW confidence)
- [ACF True/False Field](https://wplake.org/blog/acf-true-false-field/) - Boolean handling (stores as '1'/'0', returns as true/false)
- WebSearch results on date format handling - Confirmed Ymd requirement but not directly from 2026 source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, verified in codebase
- Architecture: MEDIUM - Patterns verified from codebase and ACF docs, junction table is standard but not tested in this specific context yet
- Pitfalls: MEDIUM - Based on ACF documentation and common database patterns, but specific edge cases may exist

**Research date:** 2026-01-26
**Valid until:** 60 days (architecture patterns are stable; ACF REST API is mature)
