---
created: 2026-02-04T15:30
title: Fetch invoice addresses and email from Sportlink financial tab
area: sync
files:
  - download-functions-from-sportlink.js
  - lib/stadion-db.js
---

## Problem

We need to capture alternative invoice email addresses and invoice addresses from Sportlink to support proper invoicing workflows. Currently this data is not being synced.

The data is available on the Sportlink financial tab:
`https://club.sportlink.com/member/member-details/{knvbId}/financial`

Two API responses need to be intercepted:

### MemberPaymentInvoiceAddress
Contains an `Address` object with:
- `StreetName`
- `AddressNumber`
- `AddressNumberAppendix`
- `ZipCode`
- `City`
- `CountryName`
- `IsDefault`

### MemberPaymentInvoiceInformation
Contains a `PaymentInvoiceInformation` object with:
- `LastName`
- `Infix`
- `Initials`
- `EmailAddress`
- `ExternalInvoiceCode`

## Solution

1. **Sportlink-sync changes:**
   - Add new page visit to `/member/member-details/{knvbId}/financial` in download-functions-from-sportlink.js
   - Intercept `MemberPaymentInvoiceAddress` and `MemberPaymentInvoiceInformation` responses
   - Store captured data in stadion-sync.sqlite (new table or extend existing)
   - Sync to Stadion via REST API

2. **Stadion changes (separate PRD needed):**
   - Add ACF fields for invoice address and email on person CPT
   - Expose fields via REST API
   - Display in admin UI (possibly on Financieel card)

## Notes

This follows the same pattern as the `/other` and `/functions` tab data capture in download-functions-from-sportlink.js.
