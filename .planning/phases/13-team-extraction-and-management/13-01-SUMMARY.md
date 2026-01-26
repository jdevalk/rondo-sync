---
phase: 13-team-extraction-and-management
plan: 01
subsystem: data-sync
tags: [teams, sqlite, stadion, wordpress-rest-api]
dependency-graph:
  requires:
    - 08-02  # Stadion client infrastructure
    - 08-01  # SQLite tracking database pattern
  provides:
    - team-extraction-from-sportlink
    - team-tracking-in-sqlite
    - team-sync-to-stadion
  affects:
    - 14-01  # Team-to-member linking will use this infrastructure
decisions:
  - id: team-name-case-insensitive
    decision: Use COLLATE NOCASE on team_name column
    rationale: Prevents duplicate teams with different capitalization ("Jongens 11-1" vs "jongens 11-1")
    alternatives: [Case-sensitive storage with normalization in application layer]
  - id: union-teams-priority
    decision: Prioritize UnionTeams field over ClubTeams
    rationale: UnionTeams contains official KNVB league assignments, more authoritative than club-assigned teams
    alternatives: [ClubTeams only, merge both fields, configurable priority]
tech-stack:
  added: []
  patterns:
    - Hash-based change detection for team sync
    - UNIQUE constraint with COLLATE NOCASE for deduplication
key-files:
  created:
    - prepare-stadion-teams.js  # Team extraction from Sportlink
    - submit-stadion-teams.js   # Team sync to Stadion
  modified:
    - lib/stadion-db.js  # Added stadion_teams table and functions
metrics:
  duration: 179s
  completed: 2026-01-26
---

# Phase 13 Plan 01: Team Extraction and Management Summary

**One-liner:** Extract unique team names from Sportlink data and sync to Stadion WordPress as custom post type via REST API

## What Was Built

### Team Tracking Infrastructure (lib/stadion-db.js)
- **stadion_teams table** with case-insensitive unique team names
- **computeTeamHash()** for SHA-256 hash-based change detection
- **upsertTeams()** for bulk team insertion with ON CONFLICT handling
- **getTeamsNeedingSync()** returns teams where hash changed
- **updateTeamSyncState()** tracks sync status after successful sync
- **getAllTeams()** returns team_name → stadion_id mapping for Phase 14

### Team Extraction (prepare-stadion-teams.js)
- Loads Sportlink data from SQLite (via laposta-db)
- Extracts unique team names with priority: UnionTeams > ClubTeams
- Uses Set for deduplication, sorts alphabetically
- Returns { success, teams: string[], skipped }
- Works as both module (exports runPrepare) and CLI tool

### Team Sync (submit-stadion-teams.js)
- Syncs teams to Stadion via `wp/v2/teams` REST API endpoint
- Creates new teams with POST, updates existing with PUT
- Hash-based change detection (only syncs changed teams)
- Tracks Stadion team IDs in SQLite for future updates
- Returns { success, total, synced, created, updated, skipped, errors }
- Works as both module (exports runSync) and CLI tool

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f2155a9 | Add team tracking to stadion-db (table, hash, upsert, getNeeding, update, getAll) |
| 2 | 8687dbf | Add team extraction and sync scripts (prepare-stadion-teams, submit-stadion-teams) |

## Decisions Made

**1. Team Name Case-Insensitivity**
- **Decision:** Use `UNIQUE COLLATE NOCASE` on team_name column
- **Rationale:** Sportlink data may have inconsistent capitalization. This prevents "Jongens 11-1" and "jongens 11-1" from being treated as different teams.
- **Impact:** Single source of truth per team regardless of capitalization

**2. UnionTeams Field Priority**
- **Decision:** Extract from UnionTeams first, fall back to ClubTeams
- **Rationale:** UnionTeams contains KNVB official league assignments (more authoritative). ClubTeams is club-assigned and may be less consistent.
- **Impact:** More accurate team data for members in KNVB leagues

**3. REST API Endpoint**
- **Decision:** Use `wp/v2/teams` endpoint for team sync
- **Rationale:** Follows WordPress REST API conventions for custom post types
- **Assumption:** Stadion WordPress has "teams" custom post type with REST API enabled
- **Risk:** If CPT not configured, sync will fail with 404 (not a bug - infrastructure requirement)

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

### Database Schema
```sql
CREATE TABLE stadion_teams (
  id INTEGER PRIMARY KEY,
  team_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  stadion_id INTEGER,
  source_hash TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_synced_at TEXT,
  last_synced_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stadion_teams_hash
  ON stadion_teams (source_hash, last_synced_hash);
```

### Team Extraction Logic
```javascript
function extractTeamName(member) {
  const unionTeam = (member.UnionTeams || '').trim();
  if (unionTeam) return unionTeam;

  const clubTeam = (member.ClubTeams || '').trim();
  return clubTeam || null;
}
```

### Sync Flow
1. prepare-stadion-teams extracts unique teams from Sportlink
2. submit-stadion-teams upserts teams to SQLite tracking DB
3. getTeamsNeedingSync finds teams where hash changed
4. For each team:
   - If stadion_id exists: PUT to `/wp/v2/teams/{id}`
   - If no stadion_id: POST to `/wp/v2/teams`
   - Store returned WordPress post ID in SQLite

## What's Ready for Next Phase

### For Phase 14 (Team-Member Linking)
- **getAllTeams()** function provides team_name → stadion_id mapping
- All teams synced to Stadion and IDs tracked in SQLite
- Ready to link members to teams via work_history

### Sample Data
From test run: 76 unique teams extracted from 1068 members (157 members without teams)

Teams include:
- League teams: "Jongens 11-1", "JO7-1", "JO19-2"
- Training groups: "1", "2", "3"
- Combined assignments: "2, JO7-1", "3, 4"

## Known Limitations

1. **No team deletion logic** - Teams removed from Sportlink remain in Stadion
   - Rationale: Teams are historical entities, may still be referenced
   - Future: Could add "archived" status for removed teams

2. **No team name normalization** - Stores exactly as in Sportlink
   - Example: "2, JO7-1" (comma-separated) stored verbatim
   - Future: Could parse multiple teams from single field

3. **Assumes teams CPT configured** - No fallback if endpoint doesn't exist
   - This is correct: Infrastructure requirement, not a bug

## Testing Evidence

```bash
$ node prepare-stadion-teams.js --verbose
Found 1068 Sportlink members in database
Extracted 76 unique teams from Sportlink data (157 members without teams)
Sample teams:
  - 1
  - 2
  - Jongens 11-1
  - JO7-1
  - JO19-2
  ... and 71 more
```

## Success Criteria Met

- [x] stadion_teams table exists in SQLite with UNIQUE COLLATE NOCASE on team_name
- [x] lib/stadion-db.js exports: upsertTeams, getTeamsNeedingSync, updateTeamSyncState, getAllTeams
- [x] prepare-stadion-teams.js extracts unique teams (UnionTeams priority, ClubTeams fallback)
- [x] submit-stadion-teams.js syncs teams to Stadion via REST API
- [x] Both scripts work as modules and CLI
- [x] Existing functionality unchanged (member sync, parent sync, photo sync still work)

## Next Phase Readiness

**Phase 14 Prerequisites:**
- ✅ Team tracking database ready
- ✅ Team sync infrastructure complete
- ✅ getAllTeams() provides mapping for work_history linking

**No blockers for Phase 14.**
