---
task: 006-update-docs-for-sync-split
type: quick
wave: 1
autonomous: true
files_modified:
  - CLAUDE.md
  - README.md
  - scripts/cron-wrapper.sh
---

<objective>
Update documentation to reflect the new sync architecture: split syncs (people, photos, teams, functions) instead of monolithic sync-all.

Purpose: Documentation is out of date. It references the old sync-all approach when the sync has been split into four separate pipelines with a unified sync.sh wrapper.
Output: Updated CLAUDE.md and README.md reflecting current architecture.
</objective>

<context>
@CLAUDE.md - Current docs (outdated, references sync-all as primary)
@README.md - User-facing docs (outdated, same issue)
@scripts/sync.sh - New unified wrapper (supports people|photos|teams|functions|all)
@scripts/install-cron.sh - Updated cron installer
@sync-people.js - Hourly people sync
@sync-photos.js - Daily photo sync
@sync-teams.js - Weekly team sync
@sync-functions.js - Weekly functions sync
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update CLAUDE.md for new sync architecture</name>
  <files>CLAUDE.md</files>
  <action>
Update CLAUDE.md to reflect the split sync architecture:

1. Quick Reference section - Change from:
   ```
   npm run sync-all          # Full sync pipeline
   ```
   To:
   ```
   scripts/sync.sh people    # Hourly: members, parents, birthdays
   scripts/sync.sh photos    # Daily: photo download + upload
   scripts/sync.sh teams     # Weekly: team sync + work history
   scripts/sync.sh functions # Weekly: commissies + work history
   scripts/sync.sh all       # Full sync (all steps)
   ```

2. Sync Pipeline section - Document the four separate pipelines:
   - People sync: download-data → prepare-laposta → submit-laposta → submit-stadion → sync-important-dates
   - Photo sync: download-photos → upload-photos
   - Team sync: download-teams → submit-teams → submit-work-history
   - Functions sync: download-functions → submit-commissies → submit-commissie-work-history

3. Cron Automation section - Update to show four schedules:
   - People: hourly
   - Photos: daily 6:00 AM
   - Teams: weekly Sunday 6:00 AM
   - Functions: weekly Sunday 7:00 AM

4. Update references to cron-wrapper.sh → sync.sh throughout.

5. Keep sync-all.js mentioned but clarify it runs everything (not the default cron approach anymore).
  </action>
  <verify>Read CLAUDE.md and confirm:
- sync.sh is documented as the primary sync method
- Four separate pipelines are documented
- Cron schedules match install-cron.sh (hourly, daily 6am, weekly Sunday 6am/7am)
- No stale references to "just run sync-all"</verify>
  <done>CLAUDE.md accurately reflects split sync architecture with sync.sh as primary interface</done>
</task>

<task type="auto">
  <name>Task 2: Update README.md for new sync architecture</name>
  <files>README.md</files>
  <action>
Update README.md to match the new architecture:

1. Quick Reference section - Update to show sync.sh commands:
   ```
   scripts/sync.sh people    # Hourly sync (members → Laposta + Stadion)
   scripts/sync.sh photos    # Daily photo sync
   scripts/sync.sh teams     # Weekly team sync
   scripts/sync.sh functions # Weekly functions/commissies sync
   scripts/sync.sh all       # Full sync (all pipelines)
   npm run install-cron      # Set up automated sync schedules
   ```

2. Architecture > Sync Pipeline section - Restructure to show four pipelines:
   - People Pipeline (hourly): download → prepare-laposta → submit-laposta → submit-stadion → birthdays
   - Photo Pipeline (daily): download-photos → upload-photos
   - Team Pipeline (weekly): download-teams → submit-teams → work-history
   - Functions Pipeline (weekly): download-functions → commissies → commissie-work-history

3. Update "One-step full sync" section - Rename to "Running syncs" and document:
   - Individual pipeline commands
   - The sync.sh wrapper
   - npm scripts (sync-people, sync-photos, etc.) as alternatives

4. Automated daily sync section - Update to reflect four schedules (hourly, daily, weekly x2)

5. Data Flow diagram - Update to show parallel pipelines, not one linear flow.

6. Keep npm run sync-all mentioned but as "full sync" option, not the default.
  </action>
  <verify>Read README.md and confirm:
- Quick Reference shows sync.sh commands
- Four pipelines are clearly documented
- Cron section shows correct schedules
- Data flow diagram updated
- No misleading "sync-all is the main way"</verify>
  <done>README.md accurately reflects split sync architecture for end users</done>
</task>

<task type="auto">
  <name>Task 3: Delete obsolete cron-wrapper.sh</name>
  <files>scripts/cron-wrapper.sh</files>
  <action>
Delete scripts/cron-wrapper.sh as it's been superseded by scripts/sync.sh.

The cron-wrapper.sh:
- Still references sync-all.js directly
- Has been replaced by sync.sh which supports all sync types
- Is no longer referenced by install-cron.sh

Use: rm scripts/cron-wrapper.sh
  </action>
  <verify>ls scripts/ shows no cron-wrapper.sh, only sync.sh</verify>
  <done>Obsolete cron-wrapper.sh removed, only sync.sh remains as the cron wrapper</done>
</task>

</tasks>

<verification>
1. `grep -l "sync-all" CLAUDE.md README.md` - Should still find sync-all but in context of "full sync" option
2. `grep -l "sync.sh" CLAUDE.md README.md` - Both files should mention sync.sh
3. `grep "cron-wrapper" CLAUDE.md README.md` - Should find nothing (removed references)
4. `ls scripts/cron-wrapper.sh` - Should not exist
5. Quick scan of both docs for accuracy
</verification>

<success_criteria>
- CLAUDE.md documents sync.sh as primary sync interface
- README.md documents four pipelines clearly
- Both docs show correct cron schedules (hourly, daily, weekly x2)
- cron-wrapper.sh deleted
- No broken references in documentation
</success_criteria>

<output>
After completion, create `.planning/quick/006-update-docs-for-sync-split/006-SUMMARY.md`
</output>
