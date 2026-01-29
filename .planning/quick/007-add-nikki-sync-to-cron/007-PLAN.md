---
phase: quick
plan: 007
type: execute
wave: 1
depends_on: []
files_modified:
  - sync-nikki.js
  - scripts/sync.sh
  - scripts/install-cron.sh
autonomous: true

must_haves:
  truths:
    - "Nikki sync can run via scripts/sync.sh nikki"
    - "Nikki sync runs daily on cron"
    - "Nikki sync produces email reports"
  artifacts:
    - path: "sync-nikki.js"
      provides: "Nikki sync orchestration"
      exports: ["runNikkiSync"]
    - path: "scripts/sync.sh"
      provides: "Unified sync wrapper with nikki case"
      contains: "nikki)"
    - path: "scripts/install-cron.sh"
      provides: "Cron installation with Nikki schedule"
      contains: "nikki"
  key_links:
    - from: "scripts/sync.sh"
      to: "sync-nikki.js"
      via: "node command"
      pattern: "sync-nikki.js"
---

<objective>
Add Nikki contribution sync to the cron automation.

Purpose: Nikki contributions should sync automatically once per day, like photos.
Output: sync-nikki.js orchestration script + cron integration
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Existing scripts to follow as patterns:
- sync-functions.js (orchestration pattern)
- download-nikki-contributions.js (exports runNikkiDownload)
- sync-nikki-to-stadion.js (exports runNikkiStadionSync)
- scripts/sync.sh (add nikki case)
- scripts/install-cron.sh (add nikki to schedule)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create sync-nikki.js orchestration script</name>
  <files>sync-nikki.js</files>
  <action>
Create sync-nikki.js following the sync-functions.js pattern:
1. Import runNikkiDownload from download-nikki-contributions.js
2. Import runNikkiStadionSync from sync-nikki-to-stadion.js
3. Create runNikkiSync function that:
   - Creates logger with prefix 'nikki'
   - Runs download, captures stats (count, success)
   - Runs stadion sync, captures stats (updated, skipped, errors, noStadionId)
   - Prints summary report
   - Returns { success, stats }
4. Export runNikkiSync
5. Add CLI entry point with --verbose flag support

Summary report format:
```
========================================
NIKKI SYNC SUMMARY
========================================

Completed: {timestamp}
Duration: {duration}

NIKKI DOWNLOAD
----------------------------------------
Contributions downloaded: {count}

STADION SYNC
----------------------------------------
Members updated: {updated}
Skipped (no changes): {skipped}
Skipped (no Stadion ID): {noStadionId}
Errors: {errors}

========================================
```
  </action>
  <verify>node sync-nikki.js --verbose runs without error (may need NIKKI_* env vars)</verify>
  <done>sync-nikki.js exists and follows orchestration pattern</done>
</task>

<task type="auto">
  <name>Task 2: Add nikki case to sync.sh and install-cron.sh</name>
  <files>scripts/sync.sh, scripts/install-cron.sh</files>
  <action>
In scripts/sync.sh:
1. Add 'nikki' to the usage comment at top
2. Add 'nikki' to the case statement for SYNC_TYPE validation (line ~34)
3. Add nikki case in the script selection (around line 85):
   nikki)
       SYNC_SCRIPT="sync-nikki.js"
       ;;

In scripts/install-cron.sh:
1. Update the intro message (line ~11) to include:
   "  - Nikki sync:      daily at 7:00 AM (after photos)"
2. Add cron entry after the photo sync entry:
   # Nikki sync: daily at 7:00 AM (after photos)
   0 7 * * * $PROJECT_DIR/scripts/sync.sh nikki
3. Update the "Scheduled jobs" echo section to include nikki
4. Update the manual sync help text to include nikki
  </action>
  <verify>
scripts/sync.sh nikki --help shows usage with nikki option
grep nikki scripts/install-cron.sh shows nikki entries
  </verify>
  <done>Nikki sync integrated into sync.sh and cron installation</done>
</task>

<task type="auto">
  <name>Task 3: Add npm script for manual nikki sync</name>
  <files>package.json</files>
  <action>
Add to scripts section in package.json:
"sync-nikki": "node sync-nikki.js",
"sync-nikki-verbose": "node sync-nikki.js --verbose"

Place near other sync-* scripts for organization.
  </action>
  <verify>npm run sync-nikki --help shows the script exists</verify>
  <done>npm run sync-nikki available as shortcut</done>
</task>

</tasks>

<verification>
- [ ] sync-nikki.js exists and exports runNikkiSync
- [ ] scripts/sync.sh accepts 'nikki' as sync type
- [ ] scripts/install-cron.sh includes nikki in schedule (daily 7 AM)
- [ ] npm run sync-nikki runs the orchestration script
</verification>

<success_criteria>
Nikki sync:
- Can be run manually: npm run sync-nikki
- Can be run via wrapper: scripts/sync.sh nikki
- Will be scheduled daily at 7 AM when install-cron.sh is run
- Produces email-ready summary like other sync types
</success_criteria>

<output>
After completion, create `.planning/quick/007-add-nikki-sync-to-cron/007-SUMMARY.md`
</output>
