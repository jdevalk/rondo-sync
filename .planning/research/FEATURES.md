# Feature Landscape: Bidirectional Sync with Browser Automation

**Domain:** Bidirectional data synchronization with last-edit-wins conflict resolution
**Researched:** 2026-01-29
**Confidence:** MEDIUM (verified with multiple sources for general patterns, project-specific details need validation)

## Executive Summary

Bidirectional sync systems require robust change detection, conflict resolution, rollback capabilities, and comprehensive audit logging. When implemented via browser automation (rather than APIs), additional reliability patterns become critical: verification of form submission success, retry mechanisms with exponential backoff, and state validation after updates.

For this project's reverse sync (Stadion → Sportlink), the core challenge is implementing reliable browser automation to update contact fields, free fields, and toggle states in Sportlink while maintaining data integrity through change detection and conflict resolution.

## Table Stakes

Features users expect. Missing = sync feels incomplete or unreliable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Change Detection** | Only sync what changed | Medium | Timestamp-based or hash-based; prevents unnecessary writes |
| **Conflict Detection** | Identify simultaneous edits | Medium | Compare modification timestamps; flag conflicts before resolution |
| **Last-Edit-Wins Resolution** | Resolve conflicts automatically | Low | Timestamp comparison; simpler than merge strategies |
| **Modification Timestamp Tracking** | Enable conflict detection | Medium | Track last_modified in both systems; requires schema additions |
| **Verification After Update** | Confirm write succeeded | Medium | Read-back verification via browser automation; critical for reliability |
| **Rollback on Partial Failure** | Maintain consistency | High | If 2 of 4 fields fail, rollback all; prevents inconsistent state |
| **Audit Trail** | Track who changed what when | Medium | Log all sync operations with timestamps; compliance requirement |
| **Retry on Transient Failure** | Handle network/timeout errors | Medium | Exponential backoff (2s, 4s, 8s); distinguishes transient vs permanent failures |
| **Dry Run Mode** | Preview changes before applying | Low | Show what would be synced without writing; essential for testing |
| **Sync Status Reporting** | Communicate success/failure | Low | Email reports with counts; already exists for forward sync |
| **Field-Level Granularity** | Update only changed fields | Medium | Avoid overwriting unchanged data; reduces conflict surface |
| **Idempotent Operations** | Safe to retry sync | Medium | Same input produces same output; critical for retry logic |

## Differentiators

Features that set good implementations apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Pre-Sync Validation** | Catch errors before writing | Low | Validate email format, phone format, field constraints before submission |
| **Field-Specific Conflict Policies** | Granular resolution rules | Medium | E.g., always prefer Stadion for datum-vog, Sportlink for membership status |
| **Change Preview with Diff** | Show before/after for review | Medium | Visual diff of pending changes; builds confidence |
| **Conflict Notification** | Alert on unresolvable conflicts | Low | Email when last-edit-wins makes questionable choice |
| **Success Message Detection** | Confirm form submission | Medium | Parse Sportlink success messages; stronger than element presence |
| **Multi-Step Verification** | Verify across page transitions | High | Confirm /general page save, then verify on /other page |
| **Batch Update Optimization** | Update multiple fields atomically | Medium | Submit all changed fields in one page save; reduces sync time |
| **Graceful Degradation** | Continue on non-critical failure | Medium | E.g., if freescout-id fails, still sync contact details |
| **State Reconciliation** | Detect and fix drift | High | Periodic full comparison of Stadion vs Sportlink; identifies missed updates |
| **Change Attribution** | Track sync vs manual changes | Medium | Distinguish operator edits from sync edits in audit log |
| **Rate Limiting** | Prevent overwhelming Sportlink | Low | 2-second delay between member updates; already exists for Stadion |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-Time Sync** | Adds complexity, no business need | Use scheduled batch sync (e.g., hourly); member data changes infrequently |
| **Three-Way Merge** | Complex conflict resolution | Use last-edit-wins; simpler and predictable |
| **Delete Sync** | Dangerous, no recovery | Never delete in Sportlink based on Stadion; manual deletion only |
| **Bidirectional Photo Sync** | Photos don't originate in Stadion | Only sync Sportlink → Stadion; one-way is correct |
| **Automatic Conflict Resolution Without Logging** | Silent data loss | Always log conflicts even when auto-resolved; enables audit |
| **Sync on Every Field Change** | Chatty, inefficient | Batch changes; sync on schedule or manual trigger |
| **Optimistic Updates** | Assumes write succeeded | Always verify; browser automation can fail silently |
| **Global Last-Write-Wins** | Wrong for all data types | Use field-level resolution; some fields have clear authority |
| **Retry Without Backoff** | Hammers failing system | Use exponential backoff; prevents cascading failures |
| **Sync Without Change Detection** | Updates everything every time | Only sync changed data; reduces load and conflict surface |

## Feature Dependencies

```
Change Detection
  ↓
Conflict Detection
  ↓
Last-Edit-Wins Resolution
  ↓
Browser Form Update
  ↓
Success Verification
  ↓
Audit Logging
```

**Critical Path:**
1. Modification timestamps must exist before conflict detection works
2. Conflict detection must run before resolution
3. Verification must succeed before marking as synced
4. Rollback requires transaction-like semantics (all or nothing per member)

**Parallel Concerns:**
- Retry logic applies to any browser automation step
- Audit logging runs for all operations (success, failure, conflict)
- Dry run mode bypasses actual writes but exercises all other logic

## Edge Cases and Failure Modes

### Simultaneous Edit Conflicts

**Scenario:** Operator edits email in Stadion at 10:00. Member updates same email in Sportlink at 10:02. Sync runs at 10:05.

**Resolution:** Last-edit-wins sees Sportlink change (10:02) is newer than Stadion change (10:00). Sportlink → Stadion overwrites Stadion edit in next forward sync.

**Mitigation:** Track modification times in both directions. If Stadion change (10:00) hasn't synced yet when Sportlink change arrives (10:02), flag as conflict in audit log.

### Partial Update Failures

**Scenario:** Updating member X. Email field saves successfully. Mobile field submission times out. Phone field not attempted.

**Current Risk:** Member has inconsistent state (new email, old mobile/phone).

**Resolution:** Requires rollback pattern:
1. Read current state before any writes
2. Track which fields were written
3. On failure, restore previous values to written fields
4. Mark sync as failed for this member

**Complexity:** HIGH - browser automation doesn't have native transactions. Must implement manually with read-before-write snapshots.

### Browser Automation Failure Modes

| Failure Type | Detection | Retry? | Resolution |
|--------------|-----------|--------|------------|
| Network timeout | No response within 30s | YES | Exponential backoff, max 3 attempts |
| Element not found | Selector fails | YES | Self-healing selectors; fallback patterns |
| Form validation error | Error message appears | NO | Log validation error; flag for manual review |
| Session expired | Redirect to login | YES | Re-authenticate; retry operation |
| Rate limiting | HTTP 429 or slow response | YES | Longer backoff (60s); respect server limits |
| Success message absent | Can't confirm save | NO | Unsafe to mark as synced; flag for verification |

### Change Detection Edge Cases

**Hash Collision:** Astronomically unlikely with SHA-256, but could cause missed updates.

**Timestamp Skew:** Server clocks differ by >1 minute. Last-edit-wins makes wrong choice.

**Normalization Differences:** "555-1234" vs "5551234" hash differently but are same value.

**Mitigations:**
- Use stable stringification for hashing (already implemented)
- Use NTP time sync on server
- Normalize phone numbers before hashing

## Stadion-Specific Patterns

### Existing Change Detection (Forward Sync)

Current implementation uses **hash-based change detection** with SHA-256:
- Compute hash from `{ knvb_id, data }`
- Compare `source_hash` vs `last_synced_hash`
- Only sync if hashes differ

**Advantage:** Timestamp-independent; reliable even if clocks drift.

**Limitation:** Doesn't track WHO made the change or WHEN. Can't distinguish Stadion operator edit from sync update.

### Required Schema Additions for Reverse Sync

To support bidirectional sync with last-edit-wins:

```sql
ALTER TABLE stadion_members ADD COLUMN stadion_modified_at TEXT;
ALTER TABLE stadion_members ADD COLUMN stadion_modified_fields TEXT; -- JSON array
ALTER TABLE stadion_members ADD COLUMN sportlink_modified_at TEXT;
ALTER TABLE stadion_members ADD COLUMN reverse_sync_state TEXT; -- 'pending', 'synced', 'failed', 'conflict'
ALTER TABLE stadion_members ADD COLUMN reverse_sync_error TEXT;
```

**Purpose:**
- `stadion_modified_at`: Timestamp when Stadion was last edited (from WordPress)
- `stadion_modified_fields`: Which fields changed in Stadion (enables field-level resolution)
- `sportlink_modified_at`: Last modification time in Sportlink (from MemberHeader API)
- `reverse_sync_state`: Track sync progress for Stadion → Sportlink direction
- `reverse_sync_error`: Store error details for failed reverse syncs

### Stadion WordPress Modification Tracking

WordPress posts have `post_modified` timestamp. For ACF fields:
- Query `wp/v2/people/{id}` returns `modified` timestamp
- Timestamp updates on any field change
- No field-level granularity (can't see which ACF field changed)

**Workaround:** Store hash of target fields (email, email2, mobile, phone, datum-vog, freescout-id, financiele-blokkade) and compare on each sync run to detect changes.

## Sportlink Browser Automation Patterns

### Target Pages and Fields

| Field | Sportlink Page | Element | Type | Notes |
|-------|---------------|---------|------|-------|
| email | /general | `#inputEmail` | text input | Primary email address |
| email2 | /general | `#inputEmail2` | text input | Secondary email |
| mobile | /general | `#inputMobile` | text input | Mobile phone |
| phone | /general | `#inputPhone` | text input | Landline |
| datum-vog | /other | `#inputRemarks8` | text input | Free field - VOG certificate date |
| freescout-id | /other | `#inputRemarks3` | text input | Free field - FreeScout customer ID |
| financiele-blokkade | /financial | Toggle buttons | button group | Financial block status |

### Verification Patterns

**After /general page save:**
1. Wait for success message element
2. Read back `#inputEmail`, `#inputEmail2`, `#inputMobile`, `#inputPhone` values
3. Compare with intended values
4. If mismatch, mark as failed

**After /other page save:**
1. Wait for success message
2. Read back `#inputRemarks8`, `#inputRemarks3`
3. Verify against intended values

**After /financial page toggle:**
1. Check which button has active state
2. Verify matches intended state

### Form Submission Reliability

Based on 2026 best practices:

1. **Fill fields:** `await page.fill('#inputEmail', newValue)`
2. **Blur to trigger validation:** `await page.evaluate(() => document.activeElement.blur())`
3. **Check for validation errors:** Look for `.error` class or error text
4. **Click save button:** `await page.click('#btnSave')`
5. **Wait for success indicator:** `await page.waitForSelector('.alert-success', { timeout: 10000 })`
6. **Verify via read-back:** Re-query field values
7. **Log outcome:** Success message or error details

**Retry Logic:**
- Network timeout: Retry with exponential backoff
- Validation error: Do NOT retry; log for manual review
- Session expired: Re-authenticate, then retry
- Success message absent: Wait additional 5s, then mark as unverified

## MVP Recommendation

For initial bidirectional sync (v2.0 MVP), prioritize:

### Phase 1: Foundation (Must Have)
1. **Modification timestamp tracking** - Add stadion_modified_at and sportlink_modified_at columns
2. **Reverse change detection** - Hash-based detection of Stadion → Sportlink changes
3. **Basic conflict detection** - Compare timestamps to identify conflicts
4. **Last-edit-wins resolution** - Simple timestamp comparison; newest wins
5. **Audit logging** - Log all reverse sync operations with timestamps

### Phase 2: Reliability (Must Have)
6. **Browser automation for /general page** - Update email, email2, mobile, phone fields
7. **Success verification** - Read-back confirmation after save
8. **Retry on transient failure** - Exponential backoff for network errors
9. **Email reporting** - Add reverse sync stats to existing reports

### Phase 3: Advanced Fields (Should Have)
10. **Browser automation for /other page** - Update datum-vog, freescout-id free fields
11. **Browser automation for /financial page** - Toggle financiele-blokkade status
12. **Rollback on partial failure** - Restore previous values if update fails mid-way

### Defer to Post-MVP:

- **Dry run mode with preview** - Useful but not blocking; can test in dev first
- **Conflict notification emails** - Can use audit log to investigate conflicts initially
- **State reconciliation** - Full Stadion vs Sportlink comparison; needed eventually but not MVP
- **Field-specific conflict policies** - Start with global last-edit-wins; refine later
- **Multi-step verification** - Verify across page transitions; adds complexity
- **Change attribution** - Distinguish sync vs manual changes; nice-to-have for audit

## Implementation Checklist

Before reverse sync can work:

- [ ] Schema: Add modification timestamp columns to stadion_members table
- [ ] Schema: Add reverse_sync_state tracking columns
- [ ] Detection: Implement Stadion change detection (hash or timestamp-based)
- [ ] Conflict: Compare stadion_modified_at vs sportlink_modified_at
- [ ] Resolution: Implement last-edit-wins logic (prefer newer timestamp)
- [ ] Automation: Browser login to Sportlink (already exists)
- [ ] Automation: Navigate to member /general page
- [ ] Automation: Fill email/email2/mobile/phone fields
- [ ] Automation: Submit form and wait for success message
- [ ] Verification: Read back field values to confirm write
- [ ] Retry: Implement exponential backoff for transient failures
- [ ] Rollback: Snapshot current values before update; restore on failure
- [ ] Audit: Log all reverse sync operations to database or file
- [ ] Reporting: Add reverse sync stats to email reports

## Sources

**Bidirectional Sync Patterns:**
- [Two-Way Sync Demystified: Key Principles And Best Practices](https://www.stacksync.com/blog/two-way-sync-demystified-key-principles-and-best-practices)
- [Bidirectional synchronization: what it is and how it works](https://www.workato.com/the-connector/bidirectional-synchronization/)
- [The Engineering Challenges of Bi-Directional Sync](https://www.stacksync.com/blog/the-engineering-challenges-of-bi-directional-sync-why-two-one-way-pipelines-fail)

**Conflict Resolution:**
- [Conflict Resolution: Using Last-Write-Wins vs. CRDTs](https://dzone.com/articles/conflict-resolution-using-last-write-wins-vs-crdts)
- [Last Write Wins - A Conflict Resolution Strategy](https://dev.to/danyson/last-write-wins-a-conflict-resolution-strategy-2al6)

**Browser Automation Reliability:**
- [2026 Outlook: AI-Driven Browser Automation](https://www.browserless.io/blog/state-of-ai-browser-automation-2026)
- [Enhancing Automation Reliability with Retry Patterns](https://www.thegreenreport.blog/articles/enhancing-automation-reliability-with-retry-patterns/enhancing-automation-reliability-with-retry-patterns.html)
- [Automating Form Submissions - Browserbase Documentation](https://docs.browserbase.com/use-cases/automating-form-submissions)

**Change Detection:**
- [The Architect's Guide to Data Integration Patterns](https://medium.com/@prayagvakharia/the-architects-guide-to-data-integration-patterns-migration-broadcast-bi-directional-a4c92b5f908d)
- [Build-Systems Should Use Hashes Over Timestamps](https://medium.com/@buckaroo.pm/build-systems-should-use-hashes-over-timestamps-54d09f6f2c4)

**Rollback and Error Handling:**
- [Building a Reliable Rollback System with SAGA, Event Sourcing and Outbox Patterns](https://medium.com/@mehhmetoz/building-a-reliable-rollback-system-with-saga-event-sourcing-and-outbox-patterns-0477e713b010)
- [Database Updates: Roll Back or Fix Forward?](https://www.red-gate.com/hub/product-learning/flyway/database-updates-rolling-back-and-fixing-forward)

**Audit Logging:**
- [CIS Control 8: Audit Log Management](https://cas.docs.cisecurity.org/en/latest/source/Controls8/)
- [Security log retention: Best practices and compliance guide](https://auditboard.com/blog/security-log-retention-best-practices-guide)

**Dry Run and Testing:**
- [Sync Dry Runs | Census Docs](https://docs.getcensus.com/syncs/sync-monitoring/sync-dry-runs)
- [Rsync Best Practices Always Test New Options With Dry-Run](https://eduvola.com/blog/rsync-best-practices-always-test)
