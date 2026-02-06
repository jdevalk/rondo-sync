---
phase: quick
plan: 009
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - CLAUDE.md
autonomous: true

must_haves:
  truths:
    - "README documents all 6 sync pipelines (people, photos, teams, functions, nikki, all)"
    - "README documents FreeScout customer sync integration"
    - "README lists all 4 SQLite databases"
    - "CLAUDE.md includes documentation update requirement"
  artifacts:
    - path: "README.md"
      provides: "User-facing documentation"
      contains: "FreeScout"
    - path: "CLAUDE.md"
      provides: "AI assistant instructions"
      contains: "documentation update"
---

<objective>
Update documentation to reflect all changes made today: FreeScout customer sync integration, Nikki sync pipeline, and the expanded sync architecture.

Purpose: Keep documentation accurate so future developers (human and AI) understand the current system
Output: Updated README.md and CLAUDE.md with complete, accurate information
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@CLAUDE.md
@sync-all.js
@sync-nikki.js
@scripts/sync.sh
@scripts/install-cron.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update README.md with FreeScout, Nikki, and database info</name>
  <files>README.md</files>
  <action>
Update README.md to document all current functionality:

1. **Features section** - Add:
   - FreeScout customer sync (syncs Stadion members to FreeScout helpdesk as customers)
   - Nikki contribution sync (downloads contribution data, updates Stadion ACF fields)

2. **Quick Reference** - Add nikki to the sync commands:
   ```bash
   scripts/sync.sh nikki     # Daily: Nikki contributions to Stadion
   npm run sync-nikki        # Same as scripts/sync.sh nikki
   ```

3. **Architecture section** - Add two new pipelines:

   **5. Nikki Pipeline (daily via sync-nikki.js):**
   - download-nikki-contributions.js - Downloads contribution data from Nikki
   - sync-nikki-to-stadion.js - Updates Stadion person ACF fields with contribution status
   - Produces email-ready HTML summary

   **6. FreeScout Pipeline (runs as part of sync-all):**
   - prepare-freescout-customers.js - Transforms Stadion members for FreeScout
   - submit-freescout-sync.js - Creates/updates customers in FreeScout via API
   - Tracks sync state in freescout-sync.sqlite

4. **Data Flow diagram** - Add:
   ```
   Nikki Pipeline (daily):
   Nikki API → nikki-sync.sqlite → Stadion WordPress API (ACF fields)
                                → Email report (Postmark)

   FreeScout Pipeline (with full sync):
   Stadion members → freescout-sync.sqlite → FreeScout API (customers)
   ```

5. **Environment Variables** - Add new section for FreeScout and Nikki:
   ```bash
   # FreeScout
   FREESCOUT_API_KEY=         # FreeScout API key
   FREESCOUT_URL=             # FreeScout instance URL

   # Nikki
   NIKKI_API_KEY=             # Nikki API key
   NIKKI_URL=                 # Nikki API URL
   ```

6. **Database section** - Update to list all 4 databases:
   - `laposta-sync.sqlite` - Laposta sync tracking
   - `rondo-sync.sqlite` - Stadion WordPress sync tracking
   - `freescout-sync.sqlite` - FreeScout customer sync tracking
   - `nikki-sync.sqlite` - Nikki contribution sync tracking

7. **Cron Automation section** - Update to show 5 schedules:
   - People sync: Hourly
   - Photo sync: Daily at 6:00 AM
   - Nikki sync: Daily at 7:00 AM
   - Team sync: Weekly on Sunday at 6:00 AM
   - Functions sync: Weekly on Sunday at 7:00 AM
  </action>
  <verify>grep -E "FreeScout|Nikki|freescout-sync.sqlite|nikki-sync.sqlite" README.md should return matches for all</verify>
  <done>README.md documents all 6 sync pipelines, all 4 databases, and all required environment variables</done>
</task>

<task type="auto">
  <name>Task 2: Update CLAUDE.md with FreeScout, Nikki, and documentation policy</name>
  <files>CLAUDE.md</files>
  <action>
Update CLAUDE.md with:

1. **Quick Reference section** - Add nikki:
   ```bash
   scripts/sync.sh nikki     # Daily: Nikki contributions to Stadion
   ```

2. **Architecture section** - Add the two new pipelines (same as README):
   - Nikki Pipeline (daily via sync-nikki.js)
   - FreeScout Pipeline (runs with sync-all)

3. **Data Flow** - Add Nikki and FreeScout to the diagram

4. **Environment Variables** - Add FreeScout and Nikki env vars

5. **Database section** - Add:
   - `freescout-sync.sqlite` - FreeScout customer sync tracking
   - `nikki-sync.sqlite` - Nikki contribution sync tracking

6. **Cron Automation** - Update to show 5 schedules including Nikki

7. **Add NEW SECTION before "Code Patterns"**:

   ## Documentation Maintenance

   **After making any functional change, update documentation:**
   - README.md - User-facing docs (features, usage, setup)
   - CLAUDE.md - AI assistant instructions (architecture, patterns, gotchas)

   Both files should stay in sync. Changes to add:
   - New sync pipelines or scripts
   - New environment variables
   - New database tables or files
   - New API integrations
   - Cron schedule changes
   - Important gotchas discovered
  </action>
  <verify>grep -E "Documentation Maintenance|FreeScout|Nikki|freescout-sync.sqlite" CLAUDE.md should return matches</verify>
  <done>CLAUDE.md documents all current functionality and includes documentation update policy</done>
</task>

</tasks>

<verification>
- Both README.md and CLAUDE.md mention FreeScout integration
- Both README.md and CLAUDE.md mention Nikki sync pipeline
- Both files list all 4 SQLite databases
- CLAUDE.md contains "Documentation Maintenance" section with update policy
- Both files show 5 cron schedules (people, photos, nikki, teams, functions)
</verification>

<success_criteria>
- README.md fully documents all 6 sync pipelines and integrations
- CLAUDE.md includes documentation maintenance policy
- Both files are consistent with each other and current codebase
</success_criteria>

<output>
After completion, create `.planning/quick/009-update-readme-and-claude-md/009-SUMMARY.md`
</output>
