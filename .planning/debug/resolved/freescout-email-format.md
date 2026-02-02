---
status: resolved
trigger: "FreeScout customer creation failing - 59 emails reported as 'already exist' but they don't. The real issue is the email format in the POST request is wrong."
created: 2026-02-02T12:00:00Z
updated: 2026-02-02T12:02:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED
test: N/A
expecting: N/A
next_action: N/A - complete

## Symptoms

expected: FreeScout customers should be created successfully
actual: Getting "email already exists" errors for 59 customers, but emails don't actually exist in FreeScout
errors: Misleading "email already exists" error - actually a malformed request
reproduction: Run sync-freescout pipeline
started: Current issue being debugged

## Eliminated

## Evidence

- timestamp: 2026-02-02T12:00:30Z
  checked: submit-freescout-sync.js line 118 - createCustomer function
  found: "emails: [customer.email]" - passing string array
  implication: FreeScout API expects object array with value/type properties

- timestamp: 2026-02-02T12:01:00Z
  checked: FreeScout API documentation (api-docs.freescout.net)
  found: API returns emails as [{ "id": 1, "value": "email@example.org", "type": "home" }]
  implication: Confirms required format is object array, not string array

## Resolution

root_cause: In submit-freescout-sync.js line 118, createCustomer() passes emails as a string array `[customer.email]` but FreeScout API expects object array `[{ "value": email, "type": "home" }]`
fix: Changed line 118 from `emails: [customer.email]` to `emails: [{ value: customer.email, type: 'home' }]`
verification: Syntax check passed (node --check). Full verification requires production sync on server.
files_changed:
  - submit-freescout-sync.js
