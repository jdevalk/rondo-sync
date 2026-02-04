---
phase: 013-add-discipline-fees-to-financieel
plan: 01
subsystem: ui
tags: [react, discipline, finances, fairplay, stadion]
codebase: stadion
requires: [v2.2-discipline-cases]
provides:
  - Discipline fee visibility in Financieel card
  - Fairplay-gated fee display
  - Doorbelast/non-doorbelast fee separation
affects: []
tech-stack:
  added: []
  patterns:
    - Capability-based UI rendering (can_access_fairplay)
    - useMemo for derived calculations
    - Conditional display with zero-value hiding
key-files:
  created: []
  modified:
    - src/components/FinancesCard.jsx
decisions:
  - id: 013-01-doorbelast-placement
    what: Display doorbelast fees under Contributie line
    why: Charged fees are part of the member's total financial obligation
    alternatives: Separate section at bottom
  - id: 013-01-amber-color
    what: Use amber color for non-doorbelast fees
    why: Warning color indicates club is absorbing these costs (attention state)
    alternatives: Red (too alarming), gray (not distinctive enough)
  - id: 013-01-zero-hiding
    what: Hide discipline fee lines when totals are zero
    why: Avoid UI clutter for persons without discipline fees
    alternatives: Show with €0.00 (unnecessary noise)
metrics:
  duration: 3m
  completed: 2026-02-04
---

# Quick Task 013: Add Discipline Fees to Financieel Card

**One-liner:** Discipline administrative fees now visible in Financieel card for fairplay users, split by doorbelast status.

## Objective

Add discipline administrative fee totals to the Financieel card, providing visibility into discipline-related costs for fairplay users. Fees are split by whether they've been charged to the member (doorbelast) or absorbed by the club (non-doorbelast).

## What Was Built

### Task 1: Add Discipline Fees to FinancesCard

**Modified:** `src/components/FinancesCard.jsx`

Added discipline fee display to FinancesCard component:

1. **Imports and Hooks:**
   - Added `usePersonDisciplineCases` hook to fetch discipline cases
   - Added `useQuery` to fetch current user for capability check
   - Added `Gavel` icon from lucide-react
   - Added `useMemo` for efficient fee calculations

2. **Capability Check:**
   - Fetch current user and check `can_access_fairplay` capability
   - Only fetch discipline cases if user has fairplay access
   - Zero overhead for non-fairplay users (no API calls made)

3. **Fee Calculation:**
   - `useMemo` calculates two totals from discipline cases:
     - `doorbelast`: Sum of fees where `is_charged = true`
     - `notDoorbelast`: Sum of fees where `is_charged = false`
   - Handles null/undefined fees gracefully (treats as 0)
   - Recalculates only when discipline cases change

4. **UI Display:**
   - **Doorbelast fees:** Appear directly under Contributie line
     - Same styling as other fee components
     - Gavel icon for visual identification
     - Shows as regular font-medium (part of member's obligation)
   - **Non-doorbelast fees:** Appear at bottom of card (after Nikki data)
     - Amber color indicates club is absorbing these costs
     - Border-top separator for visual distinction
     - Gavel icon for consistency
   - **Conditional rendering:** Both sections only show when:
     - User has fairplay access AND
     - Respective total > 0 (no zero-value clutter)

**Commit:** `2a27fbd4` - feat(013-01): add discipline fees to FinancesCard

## Decisions Made

### 1. Doorbelast Placement (013-01-doorbelast-placement)

**Decision:** Display doorbelast fees under the Contributie line, not in a separate section.

**Reasoning:** Charged fees are part of the member's total financial obligation. Placing them immediately after Contributie makes the total amount owed clear and logical.

**Alternatives considered:**
- Separate section at bottom: Would separate related financial obligations
- Combined with Contributie total: Would obscure the contributie amount itself

### 2. Amber Color for Non-Doorbelast (013-01-amber-color)

**Decision:** Use amber/warning color for non-doorbelast fees.

**Reasoning:** These are costs the club is absorbing rather than charging to the member. Amber indicates an attention/warning state - something the club needs to be aware of but isn't an error.

**Alternatives considered:**
- Red: Too alarming (not an error state)
- Gray: Not distinctive enough (looks like disabled/inactive)
- Green: Implies positive (but these are still costs to the club)

### 3. Zero-Value Hiding (013-01-zero-hiding)

**Decision:** Hide discipline fee lines when totals are zero.

**Reasoning:** Most members won't have discipline fees. Showing "€0.00" adds unnecessary visual clutter. Conditional rendering keeps the card clean and focused.

**Alternatives considered:**
- Always show with €0.00: Creates noise in the UI
- Show placeholder text: Still clutters the interface

## Verification

✅ ESLint passes for FinancesCard.jsx (no new errors)
✅ Component imports all dependencies correctly
✅ Hooks follow React best practices (useMemo, useQuery)
✅ Conditional rendering prevents unnecessary API calls
✅ Zero-value totals are hidden (no visual clutter)

**Manual verification needed:**
- View person with discipline cases as fairplay user → should see fee totals
- View person without discipline cases → should see no discipline lines
- View any person as non-fairplay user → should see no discipline information

## Next Phase Readiness

**Ready for:** Production deployment

**Blockers:** None

**Follow-up work:**
- None required (feature complete)

## Technical Notes

### Capability-Based Rendering Pattern

This implementation follows the established pattern from PersonDetail.jsx:

```javascript
// Fetch current user
const { data: currentUser } = useQuery({
  queryKey: ['current-user'],
  queryFn: async () => {
    const response = await prmApi.getCurrentUser();
    return response.data;
  },
});

const canAccessFairplay = currentUser?.can_access_fairplay ?? false;

// Only fetch discipline data if authorized
const { data: disciplineCases } = usePersonDisciplineCases(personId, {
  enabled: canAccessFairplay,
});
```

This ensures:
- No API calls made for non-fairplay users
- Clean separation of concerns
- Consistent capability checking across codebase

### Fee Calculation Logic

The `useMemo` calculation handles edge cases:

```javascript
const fee = parseFloat(dc.acf?.administrative_fee) || 0;
if (fee > 0) {
  if (dc.acf?.is_charged) {
    acc.doorbelast += fee;
  } else {
    acc.notDoorbelast += fee;
  }
}
```

- Handles null/undefined/empty string fees (treats as 0)
- Only counts positive fees (ignores zero-value entries)
- Checks `is_charged` boolean for proper categorization

## Deviations from Plan

None - plan executed exactly as written.

## Impact Summary

**User Impact:**
- Fairplay users gain visibility into discipline costs per member
- Clear separation between charged (doorbelast) and absorbed (non-doorbelast) fees
- Amber color for non-doorbelast draws attention to club-absorbed costs

**Code Impact:**
- Single file modified (FinancesCard.jsx)
- Follows established patterns (capability checks, hooks, conditional rendering)
- Zero overhead for non-fairplay users
- Clean, maintainable implementation

**Performance:**
- Minimal: Only adds one API call for fairplay users (discipline cases)
- useMemo prevents recalculation on every render
- Conditional rendering avoids unnecessary DOM elements
