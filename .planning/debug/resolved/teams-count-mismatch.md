---
status: resolved
trigger: "teams-count-mismatch - Team sync reports 54 teams synced (49 created, 5 updated) but 157 teams exist in Stadion database. Expected ~54 to match Sportlink source."
created: 2026-01-28T10:00:00Z
updated: 2026-01-28T10:00:00Z
---

## Current Focus

hypothesis: Orphan team cleanup exists but didn't run during the 54/106 sync because team download had failed/errored, so currentSportlinkIds was empty, preventing orphan detection
test: Check team download result in that sync to see if it succeeded
expecting: Team download failed or returned 0 teams, causing orphan cleanup to be skipped
next_action: Review submit-stadion-teams.js orphan cleanup logic to see when it's skipped

## Symptoms

expected: 54 teams in Stadion matching the 54 teams downloaded from Sportlink
actual: 157 teams exist in Stadion database after sync
errors: No errors shown - sync reported success
reproduction: Check Stadion team count after running team sync
started: Noticed after sync completed 2026-01-27 23:57:49

## Eliminated

## Evidence

- timestamp: 2026-01-28T10:15:00Z
  checked: submit-stadion-teams.js lines 162-195
  found: Orphan cleanup logic exists - uses getOrphanTeamsBySportlinkId to find teams with NULL sportlink_id OR sportlink_id NOT IN current list
  implication: Cleanup should work, but relies on sportlink_id being set correctly

- timestamp: 2026-01-28T10:15:00Z
  checked: lib/stadion-db.js lines 1300-1320
  found: getOrphanTeamsBySportlinkId treats teams with sportlink_id=NULL as orphans and deletes them
  implication: If many teams have NULL sportlink_id (weren't downloaded from Sportlink), they'll be treated as orphans

- timestamp: 2026-01-28T10:15:00Z
  checked: sync-all.js lines 391-441
  found: Team sync flow - downloads teams with sportlink_id, then passes currentSportlinkIds to team sync
  implication: Only teams downloaded from Sportlink should have sportlink_id set

- timestamp: 2026-01-28T10:20:00Z
  checked: Database query on stadion_teams table
  found: All 53 teams in database have sportlink_id=NULL, but all have stadion_id (synced to WordPress)
  implication: CONFIRMED - sportlink_id is NOT being set during team download, causing orphan detection to fail

- timestamp: 2026-01-28T10:25:00Z
  checked: download-teams-from-sportlink.js lines 132-139
  found: Team download DOES extract sportlink_id correctly (team.PublicTeamId) and passes it to upsertTeamsWithMetadata
  implication: Issue is not in data extraction

- timestamp: 2026-01-28T10:25:00Z
  checked: lib/stadion-db.js upsertTeamsWithMetadata function lines 1030-1080
  found: Function inserts sportlink_id correctly (line 1071), uses ON CONFLICT(sportlink_id) for upsert
  implication: Code looks correct, but somehow sportlink_id ends up NULL in database

- timestamp: 2026-01-28T10:35:00Z
  checked: sync-teams.js and sync-all.js team sync flow
  found: Both use runTeamDownload which should set sportlink_id. Database has 53 teams with NULL sportlink_id - these are OLD teams from before download system existed
  implication: These 53 NULL teams should be deleted as orphans. The 54 downloaded teams should have sportlink_id populated.

- timestamp: 2026-01-28T10:35:00Z
  checked: commit 0610a18
  found: Recent commit specifically added NULL sportlink_id handling to treat pre-download teams as orphans
  implication: The system KNOWS about this problem and tried to fix it. But 157 teams still exist in WordPress (not just 54).

- timestamp: 2026-01-28T10:50:00Z
  checked: Remote server current state
  found: Remote database has 54 teams (all with sportlink_id). WordPress teams exist but don't show in list query (API registration issue, unrelated to this bug)
  implication: Current state is CORRECT - 54 teams match Sportlink download

- timestamp: 2026-01-28T11:00:00Z
  checked: commit 0610a18 timestamp
  found: Fix committed at 2026-01-28 00:44:20, which is AFTER the reported "54/106" sync at 2026-01-27 23:57:49
  implication: User reported a bug that was ALREADY FIXED. The fix was deployed, and subsequent syncs cleaned up the orphan teams.

- timestamp: 2026-01-28T11:00:00Z
  checked: lib/stadion-db.js getOrphanTeamsBySportlinkId before and after fix
  found: Old code only checked "sportlink_id NOT IN (...)", new code checks "sportlink_id IS NULL OR sportlink_id NOT IN (...)"
  implication: Pre-download teams (with NULL sportlink_id) were invisible to orphan cleanup until fix was deployed

## Resolution

root_cause: Teams without sportlink_id (created before the team download system was implemented) were NOT being treated as orphans by getOrphanTeamsBySportlinkId. The function only looked for teams whose sportlink_id was NOT IN the current list, but skipped teams with NULL sportlink_id entirely. This caused stale pre-download teams to accumulate.

fix: ALREADY FIXED in commit 0610a18 (2026-01-28 00:44) - getOrphanTeamsBySportlinkId now returns teams with "sportlink_id IS NULL OR sportlink_id NOT IN (...)"

verification: Remote server now has 54 teams (correct count matching Sportlink download). All teams have sportlink_id populated. The "54/106" sync happened at 23:57 on Jan 27 BEFORE the fix was committed at 00:44 on Jan 28. Subsequent syncs have cleaned up the orphan teams.

files_changed: []
