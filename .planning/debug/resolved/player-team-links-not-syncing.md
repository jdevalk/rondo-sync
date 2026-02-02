---
status: resolved
trigger: "Players are not getting linked to their teams in Stadion after running team sync"
created: 2026-01-30T12:00:00Z
updated: 2026-01-30T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Team name mismatch was the root cause
test: Ran work history sync on server after fix
expecting: Team lookups succeed for short names
next_action: RESOLVED - archive debug session

## Symptoms

expected: Players should have their team assigned in the work_history field in Stadion after team sync runs
actual: Teams sync correctly to Stadion, but players don't get linked to their teams
errors: Unknown - user hasn't checked logs recently
reproduction: Run `scripts/sync.sh teams` on server, check Stadion frontend - team pages don't show players or player pages don't show team
started: Not sure if it ever worked

## Eliminated

## Evidence

- timestamp: 2026-01-30T12:05:00Z
  checked: Code flow in team sync pipeline
  found: |
    1. download-teams-from-sportlink.js extracts team names from Sportlink's UnionTeams API
       - Uses team.TeamName or team.Name field
       - Stores to stadion_teams table with sportlink_id
    2. submit-stadion-work-history.js extracts member teams from Sportlink member data
       - Uses member.UnionTeams and member.ClubTeams fields (comma-separated strings)
       - Builds workHistoryRecords with knvb_id and team_name
    3. runSync() in work history builds teamMap from getAllTeams(stadionDb)
       - Maps team_name -> stadion_id
       - If teamMap.get(teamName) returns undefined, the team is skipped
    4. In syncWorkHistoryForMember(), line 227-230:
       const teamStadionId = teamMap.get(teamName);
       if (!teamStadionId) {
         logVerbose('Warning: Team not found in Stadion, skipping');
         continue;
       }
  implication: If UnionTeams/ClubTeams field values differ from TeamName values, all players will be skipped

- timestamp: 2026-01-30T12:10:00Z
  checked: Server database - compared stadion_teams.team_name vs member UnionTeams values
  found: |
    stadion_teams contains: "AWC JO19-1", "AWC JO17-4", "AWC JO13-1JM", etc.
    member.UnionTeams contains: "JO19-1", "JO17-4", "JO8-4", "JO15-2", etc.

    MISMATCH: Teams in stadion_teams have "AWC " prefix from TeamName field
    but UnionTeams field values in member data do NOT have the prefix.

    Some entries DO have prefix: "AWC JO14-1 (disp.)" appears in both places.
    The inconsistency is in the Sportlink data itself - TeamName has club prefix
    but UnionTeams field typically does not.
  implication: ROOT CAUSE IDENTIFIED - team name format mismatch causes teamMap.get(teamName) to return undefined, skipping all work_history entries

- timestamp: 2026-01-30T12:15:00Z
  checked: stadion_work_history table on server
  found: |
    Most entries have team_name WITHOUT "AWC " prefix:
    - "JO19-1" (no stadion_work_history_id - NOT synced)
    - "JO17-4" (no stadion_work_history_id - NOT synced)
    - "AWC JO14-1 (disp.)" (has stadion_work_history_id=0 - WAS synced!)

    The entries WITH the prefix were synced successfully.
    The entries WITHOUT the prefix were never synced.
  implication: Confirms root cause - only team names that exactly match stadion_teams get synced

## Resolution

root_cause: |
  Team name mismatch between Sportlink data sources:
  1. download-teams-from-sportlink.js uses TeamName field which includes club prefix (e.g., "AWC JO17-1")
  2. submit-stadion-work-history.js uses UnionTeams/ClubTeams fields from member data, which often LACK the prefix (e.g., "JO17-1")
  3. When building teamMap from getAllTeams(), keys are full team names like "AWC JO17-1"
  4. When looking up teamMap.get("JO17-1"), it returns undefined
  5. The work_history entry is skipped with "Warning: Team not found in Stadion"

  Fix approach: Build a secondary lookup map that maps short team names (without prefix) to stadion_id.
  This allows matching "JO17-1" to "AWC JO17-1" team.

fix: |
  Added lookupTeamStadionId() helper function that tries exact match first,
  then falls back to normalized (short name without "AWC " prefix) lookup.

  Changes to submit-stadion-work-history.js:
  1. Added lookupTeamStadionId() helper function (lines 33-45)
  2. Build teamMapNormalized in runSync() (lines 393-400)
  3. Updated syncWorkHistoryForMember() signature to accept teamMapNormalized
  4. Updated team lookups to use lookupTeamStadionId()

verification: |
  Ran work history sync on server after fix:
  - Before: Only 2 work history records had stadion_work_history_id set
  - After: 864 out of 982 work history records synced (88%)
  - 713 members synced with 730 team assignments created
  - Remaining unsynced are "recreanten zondag" team (different naming pattern, not an AWC prefix issue)

files_changed:
  - submit-stadion-work-history.js
