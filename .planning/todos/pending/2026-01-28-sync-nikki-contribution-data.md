---
created: 2026-01-28T12:50
title: Sync Nikki contribution data
area: sync
files: []
---

## Problem

We need to get contribution/payment data from Nikki (our contribution partner) and store it locally. This data shows the payment status for each member's yearly contributions.

Currently there's no integration with Nikki - member payment status must be checked manually.

## Solution

### Browser automation to fetch Nikki data

1. **Authentication:**
   - Login at https://mijn.nikki-online.nl/
   - Credentials: `NIKKI_USERNAME`, `NIKKI_PASSWORD`, `NIKKI_OTP_SECRET` from `.env`

2. **Navigate and scrape:**
   - Go to https://mijn.nikki-online.nl/leden
   - Extract datatable (one row per member per year)

3. **Data mapping:**

   | Nikki Column | Action | Store as |
   |--------------|--------|----------|
   | Jaar | Store | `year` |
   | Naam | Ignore | - |
   | Adres | Ignore | - |
   | Lidnr. | Match to Sportlink | `PublicPersonId` |
   | Team | Ignore | - |
   | Nikki ID | Store | `nikki_id` |
   | Saldo | Store | `saldo` (open amount) |
   | Status | Trim & store | `status` |

4. **Storage:**
   - Separate SQLite database (not mixed with sync tracking)
   - Schema: `nikki_contributions(PublicPersonId, year, nikki_id, saldo, status, synced_at)`

### Future use

Once collected, this data could be:
- Synced to Stadion as custom field
- Used for email segmentation in Laposta
- Displayed in reporting
