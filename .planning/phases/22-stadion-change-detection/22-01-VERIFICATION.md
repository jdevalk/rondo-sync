---
phase: 22-stadion-change-detection
verified: 2026-01-29T19:00:00Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Hash comparison identifies actual field changes in tracked fields"
    status: failed
    reason: "Hash comparison identifies that SOMETHING changed, but then logs ALL 7 tracked fields as changed instead of comparing individual field values"
    artifacts:
      - path: "lib/detect-stadion-changes.js"
        issue: "Lines 225-258 loop through ALL tracked fields and log them all when hash differs, without comparing old vs new values per field"
    missing:
      - "Extract old field value from stored data_json (lines 229-235 fetch it but never use it)"
      - "Compare old value vs new value for each field individually"
      - "Only log field as changed if old_value !== new_value"
      - "Set old_value in change object (currently always null at line 248)"
---

# Phase 22: Stadion Change Detection Verification Report

**Phase Goal:** System identifies which Stadion members have modifications newer than Sportlink for reverse sync

**Verified:** 2026-01-29T19:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | System queries Stadion API for members modified since last detection | ✓ VERIFIED | fetchModifiedMembers() uses modified_after parameter (line 119) with pagination |
| 2 | Hash comparison identifies actual field changes in tracked fields | ✗ FAILED | Logs ALL 7 fields when hash differs, doesn't compare individual old vs new values |
| 3 | Detected changes logged to SQLite audit table | ✓ VERIFIED | logChangeDetection() writes to stadion_change_detections table (line 254) |
| 4 | Detection run timestamp tracked for incremental detection | ✓ VERIFIED | updateLastDetectionTime() stores timestamp in reverse_sync_state (line 262) |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/detect-stadion-changes.js` | Change detection logic module | ⚠️ PARTIAL | Exists (362 lines), exports correct functions, but flawed field comparison logic |
| `detect-stadion-changes.js` | CLI entry point | ✓ VERIFIED | 43 lines, executable, shebang present, module/CLI hybrid pattern |
| `lib/stadion-db.js` | Database schema additions | ✓ VERIFIED | Tables created, tracked_fields_hash column added, 4 helper functions exported |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| lib/detect-stadion-changes.js | lib/stadion-client.js | stadionRequest for API queries | ✓ WIRED | Line 119 calls stadionRequest with modified_after parameter |
| lib/detect-stadion-changes.js | lib/sync-origin.js | TRACKED_FIELDS constant | ✓ WIRED | Line 9 imports, lines 95, 225 use TRACKED_FIELDS |
| lib/detect-stadion-changes.js | lib/stadion-db.js | database operations | ✓ WIRED | Line 8 imports all 4 functions, used at lines 156, 160, 254, 262 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| RSYNC-01: System queries Stadion to detect members with modifications newer than Sportlink | ✓ SATISFIED | None - modified_after API parameter works correctly |
| INTEG-01: All reverse sync operations logged with timestamps and field values for audit | ⚠️ PARTIAL | Logging works but old_value always null, logs ALL fields not just changed ones |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/detect-stadion-changes.js | 225-258 | Logs all fields without comparison | 🛑 Blocker | False positives: reports 7 field changes when only 1 changed |
| lib/detect-stadion-changes.js | 248 | old_value hardcoded to null | 🛑 Blocker | Audit trail incomplete, can't determine what actually changed |
| lib/detect-stadion-changes.js | 229-241 | Fetches data but never uses it | ⚠️ Warning | Dead code: queries database but result unused |

### Gaps Summary

**Critical Gap: False positive field change detection**

The implementation correctly:
1. ✓ Queries Stadion API with modified_after parameter
2. ✓ Computes hash of tracked fields for each member
3. ✓ Compares hash against stored tracked_fields_hash
4. ✓ Detects THAT something changed

But then incorrectly:
- ✗ Logs ALL 7 tracked fields as changed (lines 225-258 loop through TRACKED_FIELDS)
- ✗ Never compares individual old vs new field values
- ✗ Leaves old_value as null in audit record (line 248)
- ✗ Fetches old data_json but never extracts values from it (lines 229-235)

**Impact:**
- If email changes on a member, detection logs: email, email2, mobile, phone, datum_vog, freescout_id, financiele_blokkade as ALL changed
- Phase 23 (reverse sync) would attempt to sync ALL fields back to Sportlink, not just the one that changed
- Audit trail shows old_value: null for all changes (can't determine what the previous value was)

**Fix required:**
```javascript
// After line 226 (const newValue = extractFieldValue(member, field);)
// Add:
const oldValue = extractFieldValue(parsedOldData, field);
if (oldValue === newValue) continue; // Skip unchanged fields

// Then at line 248, use:
old_value: oldValue !== null ? String(oldValue) : null,
```

This would:
1. Extract old value from stored data_json
2. Compare old vs new for each field
3. Only log fields that actually changed
4. Populate old_value in audit record

---

_Verified: 2026-01-29T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
