---
created: 2026-01-25T12:35
title: Remove npm script header from email output
area: automation
files:
  - scripts/cron-wrapper.sh:38
---

## Problem

Email reports start with npm's script execution header:

```
> sportlink-downloader@0.1.0 sync-all
> node sync-all.js
```

This is noise that clutters the email and isn't useful to the operator.

## Solution

Options:
1. Run `node sync-all.js` directly instead of `npm run sync-all` in cron-wrapper.sh
2. Use `npm run sync-all --silent` to suppress npm output
3. Filter out the first 2-3 lines from the log before emailing

Option 1 or 2 is cleanest.
