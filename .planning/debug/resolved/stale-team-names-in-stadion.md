# Debug: Stale Team Names in Stadion

**Status:** RESOLVED
**Date:** 2026-01-28

## Symptoms
- Team names synced to Stadion WordPress were outdated
- Running `node submit-stadion-teams.js --force` synced old names

## Root Cause
`getOrphanTeamsBySportlinkId()` in `lib/stadion-db.js` had this condition:
```sql
WHERE sportlink_id IS NOT NULL
  AND sportlink_id NOT IN (...)
```

This meant teams with NULL sportlink_id (52 out of 57 teams - legacy entries from before the download system) were **never treated as orphans** and never cleaned up.

## Fix
Changed the condition to:
```sql
WHERE sportlink_id IS NULL
   OR sportlink_id NOT IN (...)
```

Now teams without sportlink_id are properly identified as orphans and deleted.

## Commit
`0610a18` - fix: treat teams without sportlink_id as orphans for cleanup

## Lessons Learned
- Running `submit-stadion-teams.js` alone doesn't download fresh data - use `sync-teams.js` instead
- Legacy data without proper identifiers needs explicit cleanup logic
