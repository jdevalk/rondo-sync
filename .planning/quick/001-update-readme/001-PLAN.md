---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true

must_haves:
  truths:
    - "README describes dual-system sync (Laposta + Stadion)"
    - "README documents all environment variables including RONDO_* and POSTMARK_*"
    - "README explains email delivery via Postmark (not local mail)"
    - "README covers all npm scripts including Stadion-specific ones"
  artifacts:
    - path: "README.md"
      provides: "Complete user documentation"
      contains: "Stadion WordPress"
  key_links: []
---

<objective>
Update README.md to comprehensively document the full Rondo Sync application.

Purpose: The current README only covers Laposta sync (v1.0). It's missing Stadion WordPress sync (v1.3), Postmark email delivery (v1.1), and several environment variables. Users need accurate documentation.

Output: Complete README.md that documents the entire application as it exists today.
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md (authoritative source - contains complete, accurate documentation)
@README.md (current file - incomplete, needs updating)
@package.json (npm scripts reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite README.md with complete documentation</name>
  <files>README.md</files>
  <action>
Rewrite README.md to match the scope and accuracy of CLAUDE.md while maintaining a user-friendly README style.

Key additions needed:
1. **Description**: Update to mention both Laposta AND Stadion WordPress sync
2. **Features section**: Add Stadion sync, Postmark email delivery, HTML reports
3. **Architecture section**: Add from CLAUDE.md (Sync Pipeline, Data Flow diagram)
4. **Environment Variables**: Complete list including:
   - RONDO_URL, RONDO_USERNAME, RONDO_APP_PASSWORD, RONDO_PERSON_TYPE
   - OPERATOR_EMAIL, POSTMARK_API_KEY, POSTMARK_FROM_EMAIL
5. **Stadion sync commands**: Add section covering:
   - npm run sync-stadion
   - npm run sync-stadion-verbose
   - npm run sync-stadion-parents
   - npm run sync-stadion-parents-verbose
6. **Cron section**: Update to mention Postmark (not local mail command)
7. **Setup requirements**: Remove "mail command" requirement, Postmark handles email

Structure to follow:
- Keep existing sections that are accurate
- Expand incomplete sections using CLAUDE.md as source
- Add new sections for Stadion sync
- Ensure .env example includes ALL required variables

Style: Keep it user-friendly with practical examples. Match the existing README tone but make it complete.
  </action>
  <verify>
Manual review: README.md contains:
- "Stadion WordPress" in description
- RONDO_* environment variables
- POSTMARK_* environment variables
- sync-stadion npm scripts
- Architecture/data flow section
  </verify>
  <done>README.md fully documents the application including Laposta sync, Stadion sync, Postmark email delivery, and all environment variables</done>
</task>

</tasks>

<verification>
- README.md mentions "Stadion WordPress" sync
- README.md documents all RONDO_* environment variables
- README.md documents all POSTMARK_* environment variables
- README.md includes sync-stadion commands
- README.md no longer mentions "mail command" requirement
</verification>

<success_criteria>
README.md is comprehensive and accurate, covering:
- Dual-system sync (Laposta + Stadion)
- All npm scripts (including Stadion-specific)
- All environment variables
- Postmark email delivery (not local mail)
- Architecture overview with data flow
</success_criteria>

<output>
After completion, create `.planning/quick/001-update-readme/001-SUMMARY.md`
</output>
