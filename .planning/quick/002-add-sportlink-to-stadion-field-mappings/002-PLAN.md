---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [prepare-stadion-members.js]
autonomous: true

must_haves:
  truths:
    - "MemberSince syncs to Stadion as lid-sinds ACF field"
    - "AgeClassDescription syncs to Stadion as leeftijdsgroep ACF field"
    - "PersonImageDate syncs to Stadion as datum-foto ACF field"
    - "TypeOfMemberDescription syncs to Stadion as type-lid ACF field"
  artifacts:
    - path: "prepare-stadion-members.js"
      provides: "Extended field mappings in preparePerson function"
      contains: "lid-sinds"
  key_links:
    - from: "prepare-stadion-members.js"
      to: "Stadion API"
      via: "acf object in preparePerson return"
      pattern: "acf\\[.*(lid-sinds|leeftijdsgroep|datum-foto|type-lid)"
---

<objective>
Add 4 new Sportlink-to-Stadion field mappings in prepare-stadion-members.js

Purpose: Sync additional member metadata (membership date, age class, photo date, member type) to Stadion WordPress ACF fields
Output: Updated preparePerson function with 4 new ACF field assignments
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prepare-stadion-members.js (lines 96-126, preparePerson function)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 4 new ACF field mappings to preparePerson</name>
  <files>prepare-stadion-members.js</files>
  <action>
In the `preparePerson` function (around line 109-111 where optional fields are added conditionally), add 4 new field mappings following the existing pattern:

1. `MemberSince` -> `lid-sinds` (date field, add conditionally if value exists)
2. `AgeClassDescription` -> `leeftijdsgroep` (string field, add conditionally if value exists)
3. `PersonImageDate` -> `datum-foto` (already extracted as `personImageDate` on line 115, add to acf conditionally)
4. `TypeOfMemberDescription` -> `type-lid` (string field, add conditionally if value exists)

Pattern to follow (from existing code):
```javascript
// Only add optional fields if they have values
if (gender) acf.gender = gender;
if (birthYear) acf.birth_year = birthYear;
```

Add after the existing optional fields block:
```javascript
// Membership metadata fields
const memberSince = (sportlinkMember.MemberSince || '').trim() || null;
const ageClass = (sportlinkMember.AgeClassDescription || '').trim() || null;
const memberType = (sportlinkMember.TypeOfMemberDescription || '').trim() || null;

if (memberSince) acf['lid-sinds'] = memberSince;
if (ageClass) acf['leeftijdsgroep'] = ageClass;
if (personImageDate) acf['datum-foto'] = personImageDate;
if (memberType) acf['type-lid'] = memberType;
```

Note: `personImageDate` is already extracted on line 115, just needs to be added to the acf object.
  </action>
  <verify>
Run `node prepare-stadion-members.js --verbose` and verify:
1. No errors
2. Sample output shows new ACF fields when values exist
  </verify>
  <done>
preparePerson returns acf object with lid-sinds, leeftijdsgroep, datum-foto, type-lid fields when source values exist
  </done>
</task>

</tasks>

<verification>
- `node prepare-stadion-members.js --verbose` runs without errors
- Sample member in verbose output includes new ACF fields (if source data has values)
- No regression in existing field mappings
</verification>

<success_criteria>
- All 4 field mappings implemented in preparePerson function
- Fields only added when source values are non-empty (following existing pattern)
- Script runs successfully
</success_criteria>

<output>
After completion, create `.planning/quick/002-add-sportlink-to-stadion-field-mappings/002-SUMMARY.md`
</output>
