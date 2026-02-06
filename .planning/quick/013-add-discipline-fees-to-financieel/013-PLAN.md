---
phase: 013-add-discipline-fees-to-financieel
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - /Users/joostdevalk/Code/rondo/rondo-club/src/components/FinancesCard.jsx
autonomous: true
codebase: stadion

must_haves:
  truths:
    - "Fairplay users see discipline fee totals in Financieel card"
    - "Doorbelast fees appear under Contributie line"
    - "Non-doorbelast fees appear at bottom of card"
    - "Non-fairplay users see no discipline fee information"
  artifacts:
    - path: "src/components/FinancesCard.jsx"
      provides: "Updated FinancesCard with discipline fee display"
      contains: "usePersonDisciplineCases"
  key_links:
    - from: "src/components/FinancesCard.jsx"
      to: "hooks/useDisciplineCases.js"
      via: "usePersonDisciplineCases hook"
      pattern: "usePersonDisciplineCases"
---

<objective>
Add discipline administrative fees to the Financieel card for persons with discipline cases.

Purpose: Users with fairplay access need visibility into discipline-related costs for a member, split by whether the costs have been charged to the member (doorbelast) or not.

Output: Updated FinancesCard.jsx that shows:
1. Sum of administrative_fee for is_charged=true cases under the Contributie line
2. Sum of administrative_fee for is_charged=false cases at the bottom of the card
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/joostdevalk/Code/rondo/rondo-club/src/components/FinancesCard.jsx
@/Users/joostdevalk/Code/rondo/rondo-club/src/hooks/useDisciplineCases.js
@/Users/joostdevalk/Code/rondo/rondo-club/src/pages/People/PersonDetail.jsx (lines 71-85 for currentUser and discipline case pattern)
@/Users/joostdevalk/Code/rondo/rondo-club/acf-json/group_discipline_case_fields.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add discipline fees to FinancesCard</name>
  <files>/Users/joostdevalk/Code/rondo/rondo-club/src/components/FinancesCard.jsx</files>
  <action>
Modify FinancesCard.jsx to display discipline administrative fees:

1. Add imports:
   - `usePersonDisciplineCases` from `@/hooks/useDisciplineCases`
   - `useQuery` from `@tanstack/react-query`
   - `prmApi` from `@/api/client`
   - `Gavel` icon from `lucide-react`

2. Add hooks inside the component (after usePersonFee):
   ```javascript
   // Fetch current user for fairplay capability check
   const { data: currentUser } = useQuery({
     queryKey: ['current-user'],
     queryFn: async () => {
       const response = await prmApi.getCurrentUser();
       return response.data;
     },
   });

   const canAccessFairplay = currentUser?.can_access_fairplay ?? false;

   // Fetch discipline cases (only if user has fairplay access)
   const { data: disciplineCases } = usePersonDisciplineCases(personId, {
     enabled: canAccessFairplay,
   });
   ```

3. Add calculation logic (after hooks):
   ```javascript
   // Calculate discipline fee totals
   const disciplineTotals = useMemo(() => {
     if (!disciplineCases || disciplineCases.length === 0) {
       return { doorbelast: 0, notDoorbelast: 0 };
     }
     return disciplineCases.reduce(
       (acc, dc) => {
         const fee = parseFloat(dc.acf?.administrative_fee) || 0;
         if (fee > 0) {
           if (dc.acf?.is_charged) {
             acc.doorbelast += fee;
           } else {
             acc.notDoorbelast += fee;
           }
         }
         return acc;
       },
       { doorbelast: 0, notDoorbelast: 0 }
     );
   }, [disciplineCases]);
   ```
   Note: Add `useMemo` to imports from React.

4. Add discipline fee display AFTER the Contributie section (after the pt-2 border-t div that shows final_fee, around line 126):
   ```jsx
   {/* Discipline Fees - Doorbelast (only for fairplay users with doorbelast fees) */}
   {canAccessFairplay && disciplineTotals.doorbelast > 0 && (
     <div className="flex justify-between items-center">
       <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
         <Gavel className="w-3.5 h-3.5" />
         Tuchtzaken (doorbelast)
       </span>
       <span className="text-sm font-medium">
         {formatCurrency(disciplineTotals.doorbelast, 2)}
       </span>
     </div>
   )}
   ```

5. Add non-doorbelast section at the BOTTOM of the card (after the Nikki data section, before the closing div):
   ```jsx
   {/* Discipline Fees - Not Doorbelast (only for fairplay users with non-doorbelast fees) */}
   {canAccessFairplay && disciplineTotals.notDoorbelast > 0 && (
     <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
       <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
         <Gavel className="w-3.5 h-3.5" />
         Tuchtzaken (niet doorbelast)
       </span>
       <span className="text-sm text-amber-600 dark:text-amber-400">
         {formatCurrency(disciplineTotals.notDoorbelast, 2)}
       </span>
     </div>
   )}
   ```

Note: Use amber color for non-doorbelast to indicate these are costs the club is absorbing (warning/attention state).
  </action>
  <verify>
1. Run `npm run lint` in stadion directory - no errors
2. Manual verification: View a person with discipline cases as a fairplay user - should see fee totals
3. Manual verification: View same person as non-fairplay user - should NOT see discipline fee lines
  </verify>
  <done>
- Doorbelast discipline fees appear under Contributie line with Gavel icon
- Non-doorbelast discipline fees appear at bottom of card with amber color
- Only visible to users with can_access_fairplay capability
- Zero-value totals are not displayed (conditional rendering)
  </done>
</task>

</tasks>

<verification>
1. ESLint passes with no errors
2. FinancesCard renders correctly for:
   - Person with discipline cases (shows fee totals for fairplay users)
   - Person without discipline cases (no discipline lines shown)
   - Non-fairplay user viewing any person (no discipline lines shown)
</verification>

<success_criteria>
- FinancesCard shows doorbelast discipline fees under Contributie for fairplay users
- FinancesCard shows non-doorbelast discipline fees at bottom for fairplay users
- No discipline information visible to non-fairplay users
- Empty/zero values are not displayed
</success_criteria>

<output>
After completion, create `.planning/quick/013-add-discipline-fees-to-financieel/013-SUMMARY.md`
</output>
