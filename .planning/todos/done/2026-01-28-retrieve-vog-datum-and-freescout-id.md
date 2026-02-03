---
created: 2026-01-28T10:30
title: Retrieve VOG datum and FreeScout ID from Sportlink
area: sync
files:
  - download-functions-from-sportlink.js
---

## Problem

For members with functions, we need to capture additional free-field data from Sportlink that isn't currently synced:

1. **FreeScout ID** (`Remarks3`) - Numeric ID linking to FreeScout helpdesk
2. **VOG Datum** (`Remarks8`) - Date of VOG (Verklaring Omtrent Gedrag) certificate

This data is available at:
- URL: `https://club.sportlink.com/member/member-details/<PublicPersonId>/other`
- API: `remarks/MemberFreeFields` response
- Structure: `{ FreeFields: { Remarks3: { Value: ... }, Remarks8: { Value: ... } } }`

## Solution

Extend the functions download to also capture the "other" tab data:

1. Navigate to `/other` tab for each member with functions
2. Capture `MemberFreeFields` API response
3. Extract `Remarks3.Value` → store as number in `freescout-id` custom field
4. Extract `Remarks8.Value` → store as date in `datum-vog` custom field
5. Sync to Stadion with the member's other data

Could be done during functions download (already visiting each member) or as separate pass.
