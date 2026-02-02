---
phase: quick
plan: 011
type: execute
wave: 1
depends_on: []
files_modified:
  - submit-stadion-sync.js
  - lib/logger.js
autonomous: true

must_haves:
  truths:
    - "People sync email does not show DEBUG lines"
    - "Photo Upload Phase and Photo Delete Phase headers render as HTML h2"
  artifacts:
    - path: "submit-stadion-sync.js"
      provides: "Parent sync without debug output"
    - path: "lib/logger.js"
      provides: "Section method compatible with email HTML conversion"
---

<objective>
Remove debug console.error statements from parent sync and fix photo phase headers to render as HTML in sync emails.

Purpose: Clean up sync email output so it shows only relevant information without debug noise, and photo sections are properly formatted as HTML headers.

Output: Modified `submit-stadion-sync.js` without DEBUG statements, modified `lib/logger.js` with section format that matches email HTML conversion.
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@submit-stadion-sync.js (lines 440-495 contain DEBUG statements)
@lib/logger.js (section method on lines 125-128)
@scripts/send-email.js (email HTML conversion logic, lines 60-100)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove DEBUG statements from parent sync</name>
  <files>submit-stadion-sync.js</files>
  <action>
Remove the four console.error statements that output DEBUG messages in the parent sync logic:

1. Line 442: `console.error(\`[DEBUG] GET failed for parent ${email}...`
2. Line 444: `console.error(\`[DEBUG] Resetting parent ${email}...`
3. Line 484: `console.error(\`[DEBUG] About to PUT parent ${email}...`
4. Line 491: `console.error(\`[DEBUG] PUT succeeded for parent ${email}\`);`

These lines should be completely removed. The surrounding logic should remain intact - only delete the console.error calls themselves.

Note: The existing `logVerbose()` calls on lines 445, 449, 473 are intentional and should remain.
  </action>
  <verify>
Run `grep -n "\[DEBUG\]" submit-stadion-sync.js` - should return no matches.
  </verify>
  <done>No DEBUG statements remain in submit-stadion-sync.js</done>
</task>

<task type="auto">
  <name>Task 2: Fix logger.section() output format for email HTML conversion</name>
  <files>lib/logger.js</files>
  <action>
Modify the `section()` method (lines 125-128) to output format compatible with email HTML conversion.

Current format (line 127):
```javascript
writeOutput('', `${divider} ${title.toUpperCase()} ${divider}`);
```
Outputs: `========== PHOTO UPLOAD PHASE ==========`

This doesn't match the email regex `^[A-Z][A-Z\s()-]+$` on scripts/send-email.js line 92.

Change to output three separate lines like printSummary does:
1. A divider line (=====)
2. The title in uppercase
3. A minor divider line (-----)

New implementation:
```javascript
section(title) {
  const divider = '='.repeat(40);
  const minorDivider = '-'.repeat(40);
  writeOutput('', '');
  writeOutput('', divider);
  writeOutput('', title.toUpperCase());
  writeOutput('', minorDivider);
}
```

This matches the pattern used in sync-people.js printSummary() and will:
- Have the `=====` line skipped by send-email.js line 71
- Have the UPPERCASE TITLE converted to h2 by line 97
- Have the `-----` line converted to `<hr class="minor">` by line 81
  </action>
  <verify>
Run a quick test: `node -e "const {createSyncLogger} = require('./lib/logger'); const l = createSyncLogger(); l.section('Test Section'); l.close();"` - output should show three separate lines, not one line with equals signs around the title.
  </verify>
  <done>logger.section() outputs three lines: divider, TITLE, minor divider - matching email HTML conversion expectations</done>
</task>

</tasks>

<verification>
1. `grep -n "\[DEBUG\]" submit-stadion-sync.js` returns no matches
2. `grep -A5 "section(title)" lib/logger.js` shows the new multi-line format
3. No syntax errors: `node -c submit-stadion-sync.js && node -c lib/logger.js`
</verification>

<success_criteria>
- DEBUG statements removed from parent sync code
- logger.section() outputs three-line format compatible with email HTML conversion
- Both files pass syntax check
</success_criteria>

<output>
After completion, create `.planning/quick/011-remove-debug-output-fix-photo-headers/011-SUMMARY.md`
</output>
