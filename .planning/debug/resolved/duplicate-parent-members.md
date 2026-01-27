---
status: resolved
trigger: "duplicate-parent-members - Fresh sync creates duplicate persons when a parent is also a member themselves. Need to deduplicate by comparing lowercase name + lowercase email."
created: 2026-01-27T10:00:00Z
updated: 2026-01-27T10:25:00Z
---

## Current Focus

hypothesis: Fix complete - full name comparison will prevent duplicates
test: Code review of fix logic with edge cases
expecting: All edge cases handled correctly
next_action: Document verification and complete debug session

## Symptoms

expected: Parent who is also a member should exist as one person in Stadion (single record)
actual: Fresh sync creates two separate person records - one as member, one as parent
errors: None - sync completes successfully but creates duplicates
reproduction: Run sync-all on empty Stadion database, duplicates appear immediately
started: New issue being investigated

## Eliminated

## Evidence

- timestamp: 2026-01-27T10:05:00Z
  checked: submit-stadion-sync.js lines 163-203 (syncParent function)
  found: Parent deduplication logic exists BUT only checks email via findPersonByEmail, then verifies name match
  implication: Logic seems correct - should prevent duplicates if working properly

- timestamp: 2026-01-27T10:06:00Z
  checked: submit-stadion-sync.js lines 30-80 (syncPerson function for members)
  found: Member sync has NO deduplication logic - creates/updates based solely on local stadion_id tracking
  implication: Members are created first without checking for existing records by email

- timestamp: 2026-01-27T10:10:00Z
  checked: prepare-stadion-members.js lines 96-136 (preparePerson function)
  found: Member email is NOT sent to Stadion API! Line 129 stores email in returned object but line 131-134 shows data.acf only contains name, knvb-id, contact_info, addresses. Email goes in contact_info array (line 55) as contact_type='email'
  implication: Email is not a field on the person record - it's in a repeater field within contact_info

- timestamp: 2026-01-27T10:15:00Z
  checked: ~/Code/stadion/includes/class-rest-api.php find_person_by_email implementation
  found: API endpoint normalizes email with strtolower(trim()) and searches contact_info repeater field. It compares lowercase trimmed emails.
  implication: findPersonByEmail should work correctly if emails are stored properly

- timestamp: 2026-01-27T10:16:00Z
  checked: prepare-stadion-members.js line 55 (buildContactInfo)
  found: Email value stored is member.Email trimmed but NOT lowercased in contact_info array
  implication: Actually OK - API lowercases both sides during comparison (false lead)

- timestamp: 2026-01-27T10:20:00Z
  checked: prepare-stadion-parents.js lines 12-17 (buildParentName function)
  found: Parent name from NameParent1 field is stored as { first_name: "Full Name", last_name: "" }
  implication: Parent has full name in first_name, empty last_name

- timestamp: 2026-01-27T10:21:00Z
  checked: prepare-stadion-members.js lines 31-40 (buildName function)
  found: Member name is split as { first_name: "First", last_name: "Infix Last" }
  implication: ROOT CAUSE FOUND - Name formats don't match! Parent "John Doe" + "" vs Member "John" + "Doe" fail the comparison at submit-stadion-sync.js line 193, causing duplicate creation

## Resolution

root_cause: Parent and member name formats are incompatible. When a member lists themselves as a parent in Sportlink (NameParent1 field), the parent name is stored with the full name in first_name and empty last_name (prepare-stadion-parents.js line 17). But member names split first/last names properly (prepare-stadion-members.js lines 31-40). The deduplication logic compares both first_name AND last_name (submit-stadion-sync.js line 193), so "John Doe" + "" never matches "John" + "Doe", causing duplicates.

fix: Modified submit-stadion-sync.js lines 184-201 to compare full names instead of separate first/last fields. The fix concatenates first_name + last_name (filtering out empty strings) and compares the normalized full names: "john doe" === "john doe" works regardless of whether it came from "John Doe" + "" or "John" + "Doe".

verification: Code review completed with edge case analysis:
- Scenario 1 (primary bug): Member "John" + "Doe" vs Parent "John Doe" + "" → Both become "john doe" → Match ✓
- Edge case 1: Single name (Madonna) → "madonna" === "madonna" → Match ✓
- Edge case 2: Different names, same email → "john doe" !== "jane doe" → No match (correct, intentional separate records) ✓
- Edge case 3: Middle names/initials → "john a. doe" === "john a. doe" → Match ✓
- filter(Boolean) removes empty strings, join(' ') handles spacing
- toLowerCase().trim() handles case and whitespace normalization
- Email match is prerequisite (already tested before name comparison)

Fix is minimal, targeted, and handles all identified edge cases correctly.

files_changed: [submit-stadion-sync.js]
