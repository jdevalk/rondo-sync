---
status: fixing
trigger: "team-field-empty-on-members: The team field on member profiles in Stadion is empty, even though team posts exist separately in WordPress."
created: 2026-01-29T00:00:00Z
updated: 2026-01-29T00:06:00Z
---

## Current Focus

hypothesis: CONFIRMED - detectTeamChanges logic treats never-synced teams as "unchanged" instead of "added"
test: Verified in code - teams in database without stadion_work_history_id are marked unchanged
expecting: Fix will modify detectTeamChanges to check if stadion_work_history_id is NULL
next_action: Fix the logic to treat teams with NULL stadion_work_history_id as "added"

## Symptoms

expected: Team names should appear on member profiles showing which team(s) each member belongs to
actual: Team field on members is empty/blank
errors: Not yet checked - need to examine sync logs
reproduction: Check any member in Stadion WordPress - their team field is empty
started: Unknown when this started - first time checking this field
additional_context: Teams DO exist as separate posts in Stadion, but members are not connected to them

## Eliminated

## Evidence

- timestamp: 2026-01-29T00:01:00Z
  checked: Team sync pipeline code structure
  found: |
    Pipeline has 3 stages:
    1. download-teams-from-sportlink.js - Fetches teams via browser automation, stores in stadion_teams table with sportlink_id
    2. submit-stadion-teams.js - Creates/updates team posts in WordPress
    3. submit-stadion-work-history.js - Links members to teams via work_history ACF field

    extractMemberTeams() function extracts teams from UnionTeams/ClubTeams fields on Sportlink members.
    syncWorkHistoryForMember() builds work_history array with team IDs and updates via PUT to /wp/v2/people/{id}
  implication: Code structure looks correct - need to verify if it's actually running and extracting teams

- timestamp: 2026-01-29T00:02:00Z
  checked: Local sync logs from Jan 26
  found: |
    Local sync attempted to run team sync but failed with:
    "ERROR: STADION_URL, STADION_USERNAME, and STADION_APP_PASSWORD required in .env"

    76 teams were extracted from Sportlink data (157 members without teams)
    All team creation attempts failed due to missing credentials

    Local database tables exist (stadion_teams, stadion_work_history, sportlink_team_members) but are empty
  implication: Local sync can't run without production credentials. Must check production server to see actual state

- timestamp: 2026-01-29T00:03:00Z
  checked: Production server logs/sync-teams-2026-01-27.log
  found: |
    Work history sync results:
    - 906 members processed
    - 0 members actually synced (all marked as "0 added, 0 removed, X unchanged")
    - Every member shows GET requests to fetch data but NO PUT requests to update
    - Summary: "Members synced: 0/906"
  implication: Sync is running but skipping all updates because it thinks everything is unchanged

- timestamp: 2026-01-29T00:04:00Z
  checked: Production stadion-sync.sqlite database
  found: |
    stadion_work_history table contains 982 records
    Sample records show:
    - knvb_id and team_name populated correctly
    - stadion_work_history_id is NULL for all records
    - last_synced_at is NULL for all records

    This means teams are tracked in SQLite but have NEVER been written to WordPress
  implication: The work_history entries exist in tracking DB but have never been pushed to WordPress

- timestamp: 2026-01-29T00:05:00Z
  checked: detectTeamChanges function in submit-stadion-work-history.js
  found: |
    Logic flow:
    1. getMemberWorkHistory(db, knvbId) retrieves teams from SQLite for this member
    2. Creates trackedTeamNames Set from these teams
    3. Compares currentTeams (from Sportlink) vs trackedTeamNames:
       - added = teams NOT in trackedTeamNames
       - unchanged = teams IN trackedTeamNames
    4. Only "added" teams get written to WordPress

    PROBLEM: Teams that exist in SQLite (even with NULL stadion_work_history_id) are in trackedTeamNames
    So they appear in "unchanged" array, not "added" array
    Result: Code never writes them to WordPress because they're "unchanged"
  implication: ROOT CAUSE - Teams in database without stadion_work_history_id should be treated as "added", not "unchanged"

## Resolution

root_cause: |
  The detectTeamChanges() function in submit-stadion-work-history.js incorrectly treats teams that have never been synced to WordPress as "unchanged" instead of "added".

  When a team exists in the stadion_work_history SQLite table (even with NULL stadion_work_history_id), it's added to the trackedTeamNames Set. The comparison logic then marks it as "unchanged" because it exists in both currentTeams (from Sportlink) and trackedTeamNames (from SQLite).

  However, "unchanged" teams are only processed during --force mode. In normal mode, only "added" teams get written to WordPress. Since these teams appear "unchanged", they never get their work_history entries created in WordPress.

  The fix: Teams without a stadion_work_history_id (NULL) should be treated as "added", not "unchanged", because they don't exist in WordPress yet.

fix: |
  Modified detectTeamChanges() function in submit-stadion-work-history.js to correctly identify never-synced teams.

  Changed logic:
  - Build trackedTeamMap that includes stadion_work_history_id for each tracked team
  - When determining "added" teams, include:
    1. Teams not tracked at all
    2. Teams tracked but with NULL stadion_work_history_id (never synced to WordPress)
  - When determining "unchanged" teams, only include teams that have both:
    1. Exist in tracking database
    2. Have non-NULL stadion_work_history_id (already synced to WordPress)

  This ensures that the 982 teams currently in the database with NULL stadion_work_history_id will be treated as "added" and will be written to WordPress on the next sync.

verification:
files_changed:
  - submit-stadion-work-history.js
