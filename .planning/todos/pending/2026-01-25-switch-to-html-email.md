---
created: 2026-01-25T12:40
title: Switch sync reports to HTML email format
area: automation
files:
  - scripts/send-email.js:57-71
  - sync-all.js:40-82
---

## Problem

Now that we're using Postmark for reliable email delivery, we're still sending plain text emails. HTML formatting would make the sync reports more readable with proper tables, color-coded status, and better structure.

## Solution

1. Update `printSummary()` in sync-all.js to output HTML (or create separate HTML formatter)
2. Update send-email.js to use `HtmlBody` instead of/alongside `TextBody` in Postmark API call
3. Design simple HTML template:
   - Header with timestamp
   - Summary stats in a table
   - Per-list breakdown
   - Color-coded errors (red) if any
   - Keep plain text version as fallback

Postmark supports both HtmlBody and TextBody in same request for multipart emails.
