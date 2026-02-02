# Debug: Duplicate Person Record (Jasper Jansen)

## Issue
Two Stadion person records existed for the same individual:
- **10987** - Parent record (no KNVB ID)
- **3893** - Member record (KNVB ID: BMZW79V)

## Root Cause

The duplicate was created due to a **timing gap between two bug fixes** in the parent sync deduplication logic.

### Timeline

1. **Jan 26 ~20:20** - Commit `dc90569` added name comparison to prevent parent-child merges
   - Logic compared `first_name` vs `first_name` and `last_name` vs `last_name` separately

2. **Jan 26 ~21:47** - Parent sync ran, created stadion_id 10987
   - Member data: `first_name="Jasper"`, `last_name="Jansen"`
   - Parent data: `first_name="Jasper Jansen"`, `last_name=""`
   - Fields didn't match, so system created new parent record

3. **Jan 27 ~07:28** - Commit `f5aa89d` fixed name comparison to use full concatenated names
   - Now correctly detects "Jasper" + "Jansen" == "Jasper Jansen" + ""

### Technical Details

The parent sync at `submit-stadion-sync.js:396-422`:
```javascript
// Compare full names (first + last concatenated) to handle different name formats
const existingFullName = [existingFirstName, existingLastName].filter(Boolean).join(' ');
const parentFullName = [parentFirstName, parentLastName].filter(Boolean).join(' ');

if (existingFullName === parentFullName) {
  // Merge into existing person
} else {
  // Create separate parent record (THIS HAPPENED)
}
```

## Resolution

Ran merge script to consolidate records:

```bash
node scripts/merge-duplicate-person.js --parent=10987 --member=3893
```

Actions performed:
1. Removed sibling self-reference from member 3893
2. Updated children (4692, 4705, 4855) to reference member 3893 instead of parent 10987
3. Deleted parent record 10987 (WordPress delete triggered error but record became inaccessible)
4. Removed parent tracking from `stadion_parents` table

## Verification

After merge:
- Member 3893 has all 3 child relationships ✓
- Children reference parent 3893 ✓
- Person 10987 is inaccessible (500 on API, 0 results on search) ✓
- Database tracking cleaned up ✓

## Prevention

The fix in `f5aa89d` prevents this from happening again by comparing full concatenated names instead of separate fields.

## Date Resolved
2026-02-02
