---
created: 2026-01-28T15:45
title: Manually link 59 FreeScout orphan customers
area: sync
files:
  - submit-freescout-sync.js
  - freescout-sync.sqlite
---

## Problem

59 members could not be synced to FreeScout because their email addresses already exist in FreeScout's system (likely from support conversations they sent) but are not searchable as customer records via the API.

FreeScout returns 400 "Customers with such email(s) already exist" when trying to create these customers, but the email search API returns 0 results.

## Solution

Manual work in FreeScout UI:

1. Get the list of affected emails:
   ```bash
   sqlite3 freescout-sync.sqlite "SELECT email FROM freescout_customers WHERE freescout_id IS NULL"
   ```

2. For each email in FreeScout:
   - Search for conversations from this email
   - Create a customer record from the conversation
   - Or manually create a customer with this email

3. After customers exist in FreeScout, re-run sync:
   ```bash
   node submit-freescout-sync.js --verbose
   ```

The sync will find the customers by email search and link them automatically.
