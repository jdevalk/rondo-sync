---
phase: 07-parent-sync
plan: 02
subsystem: stadion-sync
tags: [parent-extraction, deduplication, data-transformation]
requires: [07-01-parent-dedupe, laposta-db, prepare-stadion-members]
provides:
  - prepare-stadion-parents.js script
  - stadion_parents table in stadion-db
  - Parent tracking and deduplication infrastructure
affects: [07-03-stadion-parent-sync]
tech-stack:
  added: []
  patterns: [map-based-deduplication, bulk-phone-merging]
decisions:
  - Parents keyed by email (no KNVB ID available)
  - Same parent email across children = single parent record
  - Phone numbers merged from all children (Set for deduplication)
  - Parents without email skipped (can't dedupe without identifier)
  - Parent name fallback to "Ouder/verzorger van {child}"
  - Address copied from child's Sportlink record
  - childKnvbIds array tracks relationships for linking in sync phase
key-files:
  created: [prepare-stadion-parents.js]
  modified: [lib/stadion-db.js]
metrics:
  duration: 2 minutes
  completed: 2026-01-25
---

# Phase 07 Plan 02: Stadion Parent Preparation Summary

**One-liner:** Parent extraction with email-based deduplication, phone merging from multiple children, and transformation to Stadion person format.

## What Was Built

Created parent preparation infrastructure for Stadion sync:

### 1. Extended stadion-db.js with Parent Tracking

Added `stadion_parents` table with email as unique key:
- `computeParentHash()` - SHA-256 hash for change detection
- `upsertParents()` - Bulk insert/update with conflict resolution
- `getParentsNeedingSync()` - Returns parents where source_hash != last_synced_hash
- `updateParentSyncState()` - Records successful sync with Stadion ID
- `deleteParent()` - Removes parent from tracking
- `getParentsNotInList()` - Orphan detection for cleanup
- `getAllTrackedMembers()` - Returns all members for relationship mapping

### 2. Created prepare-stadion-parents.js

Parent extraction and transformation script:
- Reads from Sportlink SQLite data (via laposta-db)
- Extracts up to 2 parents per child member
- Deduplicates by normalized email (lowercase, trimmed)
- Merges phone numbers from all children with same parent email
- Tracks child KNVB IDs for relationship linking in sync phase
- Transforms to Stadion person format with `is_parent: true` flag

### Parent Data Flow

```
Sportlink members (1,068)
  └─> Extract parent fields (EmailAddressParent1/2, etc.)
      └─> Deduplicate by email (Map<email, data>)
          └─> Merge phones from multiple children (Set)
              └─> 509 unique parent records
```

### Parent Record Structure

```javascript
{
  email: "parent@example.com",
  childKnvbIds: ["QLNZ95C", "SQWV56N"],  // For relationship linking
  data: {
    title: "Parent Name",
    status: "publish",
    meta: {
      knvb_id: "",        // Empty - parents are not members
      first_name: "Parent",
      last_name: "Name",
      gender: "",         // Not available for parents
      is_parent: true     // Custom field to identify parents
    },
    acf: {
      contact_info: [
        { type: "email", value: "parent@example.com" },
        { type: "phone", value: "0612345678" },
        { type: "phone", value: "0687654321" }  // Merged from multiple children
      ],
      addresses: [...]  // Copied from child's address
    }
  }
}
```

## Deduplication Results

From 1,068 Sportlink members:
- **509 unique parents** extracted (47.7% of members have parent data)
- **99 parents with multiple children** (19.4% of parents)
- **18 parents with multiple phone numbers** (3.5% of parents)
- **All parents have valid email** (requirement for deduplication)

## Field Mapping

| Sportlink Field        | Stadion Field                | Notes                                    |
| ---------------------- | ---------------------------- | ---------------------------------------- |
| EmailAddressParent1/2  | email (key), contact_info    | Normalized, dedupe key                   |
| TelephoneParent1/2     | contact_info (type: phone)   | Merged via Set (no duplicates)           |
| NameParent1/2          | first_name                   | Fallback: "Ouder/verzorger van {child}"  |
| (from child)           | last_name                    | Child's infix + last name                |
| (from child)           | addresses                    | Child's StreetName, City, etc.           |
| (from child)           | childKnvbIds                 | PublicPersonId for relationship tracking |
| (constant)             | is_parent                    | true (identifies parent records)         |
| (empty)                | knvb_id                      | '' (parents have no membership)          |

## Decisions Made

1. **Email as unique key**: Parents don't have KNVB IDs, so email is the only stable identifier for deduplication
2. **Skip parents without email**: Can't dedupe or track without unique identifier
3. **Phone merging with Set**: Multiple children may provide different phone numbers for same parent
4. **Name fallback strategy**: When NameParent field empty, use "Ouder/verzorger van {child first name} {child last name}"
5. **Address from child**: Parent address fields not available in Sportlink, copy from child
6. **childKnvbIds tracking**: Needed for establishing parent-child relationships in Stadion during sync phase

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Parents without email are skipped - may miss some parent records
- Address copied from first child - may be inaccurate if parents live separately
- Parent name fallback uses child's full name - visible in Stadion UI

**Dependencies satisfied:**
- ✅ lib/parent-dedupe.js available (from 07-01)
- ✅ Sportlink data in SQLite (laposta-db)
- ✅ Parent tracking infrastructure (stadion-db)

**Ready for:**
- 07-03: Stadion parent sync (submit to WordPress API)
- Parent-child relationship linking via childKnvbIds array

## Testing Notes

Verification confirmed:
- ✅ All parent functions exported from stadion-db
- ✅ Script runs without errors
- ✅ 509 parents = 509 unique emails (no duplicates)
- ✅ Phone numbers merged (18 parents with multiple phones)
- ✅ Child tracking (99 parents with multiple children)

Sample output:
```
Found 1068 Sportlink members in database
Prepared 509 parents for Stadion sync (deduplicated by email)
```

## Deviations from Plan

None - plan executed exactly as written.

---

**Status:** ✅ Complete
