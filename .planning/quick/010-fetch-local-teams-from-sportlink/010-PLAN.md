---
phase: 010-fetch-local-teams-from-sportlink
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - download-teams-from-sportlink.js
autonomous: true

must_haves:
  truths:
    - "ClubTeams are fetched alongside UnionTeams during team download"
    - "Teams with TeamCode starting with 'AWC ' are excluded"
    - "ClubTeam members (players and staff) are fetched for each team"
    - "All teams sync to Stadion via existing submit-stadion-teams.js flow"
  artifacts:
    - path: "download-teams-from-sportlink.js"
      provides: "Extended team download with ClubTeams support"
      contains: "ClubTeams"
  key_links:
    - from: "download-teams-from-sportlink.js"
      to: "stadion-sync.sqlite"
      via: "upsertTeamsWithMetadata and upsertTeamMembers"
      pattern: "ClubTeams.*filter"
---

<objective>
Extend the team download script to also fetch ClubTeams (local/recreational teams) from Sportlink, in addition to the existing UnionTeams (competition teams).

Purpose: Include local teams in the sync to Stadion so all club teams are represented.
Output: Modified download-teams-from-sportlink.js that fetches both team types.
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@download-teams-from-sportlink.js
@lib/stadion-db.js (upsertTeamsWithMetadata, upsertTeamMembers functions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ClubTeams fetch after UnionTeams in download script</name>
  <files>download-teams-from-sportlink.js</files>
  <action>
Modify runTeamDownload() to fetch ClubTeams after UnionTeams:

1. After the existing UnionTeams fetch and processing (around line 124), add a new section to fetch ClubTeams:

2. Navigate to club teams page and capture API response:
   ```javascript
   // Step 1b: Navigate to club teams page and capture club teams list
   logVerbose('Fetching club teams list...');

   const clubTeamsResponsePromise = page.waitForResponse(
     resp => resp.url().includes('/navajo/entity/common/clubweb/team/ClubTeams') &&
             !resp.url().includes('Players') &&
             !resp.url().includes('NonPlayers') &&
             resp.request().method() === 'GET',
     { timeout: 60000 }
   );

   await page.goto('https://club.sportlink.com/teams/club-teams', { waitUntil: 'domcontentloaded' });

   const clubTeamsResponse = await clubTeamsResponsePromise;
   ```

3. Parse and filter ClubTeams response:
   - Extract teams from clubTeamsData.Team array
   - Filter out teams where TeamCode starts with "AWC " (these are external teams, not ours)
   - Map to same teamRecords structure as UnionTeams

4. Append ClubTeam records to the existing teamRecords array (so both team types share the same array and get processed together)

5. For member fetching loop, detect team type by checking the URL pattern used when navigating:
   - For teams from ClubTeams: use `/teams/club-team-details/{id}/members` URL
   - Use `ClubTeamPlayers` and `ClubTeamNonPlayers` response patterns for member data
   - Add a `source` property to teamRecords ('union' or 'club') to track which member endpoints to use

6. Update the member fetch loop to use correct URLs/patterns based on team source:
   ```javascript
   const isClubTeam = team.source === 'club';
   const teamMembersUrl = isClubTeam
     ? `https://club.sportlink.com/teams/club-team-details/${team.sportlink_id}/members`
     : `https://club.sportlink.com/teams/team-details/${team.sportlink_id}/members`;

   const playersPattern = isClubTeam ? '/ClubTeamPlayers' : '/UnionTeamPlayers';
   const nonPlayersPattern = isClubTeam ? '/ClubTeamNonPlayers' : '/UnionTeamNonPlayers';
   ```

7. Update log messages to indicate total teams from both sources.

Important: The existing database functions (upsertTeamsWithMetadata, upsertTeamMembers) work for both team types since they use sportlink_id (PublicTeamId) as the unique key.
  </action>
  <verify>
Run with verbose flag:
```bash
node download-teams-from-sportlink.js --verbose
```
Should show:
- "Fetching union teams list..." followed by count
- "Fetching club teams list..." followed by count (with AWC filtered)
- Member fetching for both team types
- Final count includes both union and club teams
  </verify>
  <done>
- ClubTeams API response captured from /teams/club-teams page
- Teams with "AWC " prefix in TeamCode are excluded
- Club team members fetched using ClubTeamPlayers/ClubTeamNonPlayers endpoints
- Both team types stored in database with correct metadata
- Total team count in output includes both sources
  </done>
</task>

<task type="auto">
  <name>Task 2: Test full team sync pipeline</name>
  <files>None (testing only)</files>
  <action>
Test the complete team sync flow on the server to verify ClubTeams are properly synced to Stadion:

1. SSH to the server:
   ```bash
   ssh root@46.202.155.16
   cd /home/sportlink
   ```

2. Pull latest code:
   ```bash
   git pull
   ```

3. Run team download with verbose:
   ```bash
   node download-teams-from-sportlink.js --verbose
   ```
   Verify output shows both union and club teams being processed.

4. Run team sync to Stadion:
   ```bash
   node submit-stadion-teams.js --verbose
   ```
   Verify new club teams are created in Stadion.

5. Verify in Stadion WordPress admin that club teams appear alongside union teams.
  </action>
  <verify>
- Team download logs show both union teams and club teams (without AWC prefix)
- Database contains teams from both sources (check via sqlite3 or logs)
- Stadion sync creates/updates the club teams
- Club teams visible in WordPress admin under Teams
  </verify>
  <done>
Full pipeline tested: Sportlink ClubTeams -> SQLite -> Stadion WordPress
  </done>
</task>

</tasks>

<verification>
After implementation:
1. `node download-teams-from-sportlink.js --verbose` shows both team types being fetched
2. No teams with "AWC " prefix appear in logs or database
3. `node submit-stadion-teams.js --verbose` syncs all teams to Stadion
4. Club teams appear in Stadion WordPress admin
</verification>

<success_criteria>
- ClubTeams fetched from Sportlink API via /teams/club-teams navigation
- Teams starting with "AWC " in TeamCode are filtered out
- Club team members (players/staff) fetched correctly
- All teams stored in SQLite and synced to Stadion
- Existing UnionTeams flow unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/010-fetch-local-teams-from-sportlink/010-SUMMARY.md`
</output>
