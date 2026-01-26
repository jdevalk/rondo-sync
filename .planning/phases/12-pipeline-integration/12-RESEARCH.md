# Phase 12: Pipeline Integration - Research

**Researched:** 2026-01-26
**Domain:** Node.js pipeline orchestration, error handling, email reporting
**Confidence:** HIGH

## Summary

Pipeline integration connects existing photo sync functionality (download + upload/delete) into the sync-all.js orchestrator with email reporting. This phase builds on established patterns from the existing pipeline architecture.

The codebase already demonstrates mature patterns for this exact scenario: sync-all.js orchestrates sequential steps (download → prepare → submit → stadion), collects statistics from each step, generates formatted email reports, and handles partial failures gracefully. Photo sync follows the same architectural pattern with two exported functions (`runPhotoDownload`, `runPhotoSync`) that return structured results.

**Primary recommendation:** Follow the existing sync-all.js orchestration pattern exactly. Add photo sync as two new sequential steps after Stadion sync, accumulate statistics in the stats object, extend printSummary() to include photo section, and handle errors with the same best-effort approach used for Stadion sync.

## Standard Stack

This phase uses the **existing codebase stack** - no new libraries needed.

### Core Dependencies (Already Installed)
| Library | Version | Purpose | Usage in Phase |
|---------|---------|---------|----------------|
| Node.js | 18+ | Runtime | Pipeline orchestration |
| better-sqlite3 | latest | State tracking | Photo state queries |
| Playwright | latest | Browser automation | Session reuse (optional) |
| Postmark | ^4.0.5 | Email delivery | Report formatting unchanged |

### Supporting Modules
| Module | Location | Purpose | How Phase Uses It |
|--------|----------|---------|-------------------|
| createSyncLogger | lib/logger.js | Dual-stream logging | Pass to photo functions |
| stadion-db | lib/stadion-db.js | Photo state tracking | Already used by photo scripts |
| send-email.js | scripts/ | Email formatting | Parses extended report format |

### No Installation Required
All dependencies already installed. No `npm install` needed.

## Architecture Patterns

### Pattern 1: Pipeline Orchestration (Established in sync-all.js)

**What:** Sequential async functions called from main orchestrator, each returns structured result
**When to use:** Exact pattern for this phase - proven in existing code
**Example:**
```javascript
// Source: sync-all.js lines 133-245
async function runSyncAll(options = {}) {
  const stats = { /* initialize all counters */ };

  try {
    // Step 1: Download from Sportlink
    const downloadResult = await runDownload({ logger, verbose });
    if (!downloadResult.success) {
      // Log error, populate stats, return early
      return { success: false, stats, error: errorMsg };
    }
    stats.downloaded = downloadResult.memberCount;

    // Step 2: Prepare members
    const prepareResult = await runPrepare({ logger, verbose });
    // ... accumulate stats ...

    // Step 3: Submit to Laposta
    const submitResult = await runSubmit({ logger, verbose, force });
    // ... accumulate stats, collect errors ...

    // Step 4: Stadion sync (NON-BLOCKING)
    try {
      const stadionResult = await runStadionSync({ logger, verbose, force });
      // ... accumulate stats ...
    } catch (err) {
      // Stadion failure is non-critical - log error but continue
      stats.stadion.errors.push({ message: err.message });
    }

    // Print summary
    printSummary(logger, stats);

    return { success: stats.errors.length === 0, stats };
  } catch (err) {
    // Fatal error handling
  }
}
```

**Key principles from existing code:**
1. Each step receives `{ logger, verbose, force }` options
2. Each step returns `{ success, ...stats }` object
3. Critical steps (download, prepare, submit) fail fast and return early
4. Non-critical steps (Stadion, soon photos) use try-catch to continue on error
5. Stats accumulate in single object
6. Single printSummary() call at end

### Pattern 2: Module/CLI Hybrid Exports (Established Pattern)

**What:** Every script exports functions AND works as standalone CLI
**When to use:** Photo sync scripts already follow this - no changes needed
**Example:**
```javascript
// Source: download-photos-from-sportlink.js lines 231-329
async function runPhotoDownload(options = {}) {
  const { logger: providedLogger, verbose = false } = options;
  const logger = providedLogger || createSyncLogger({ verbose });

  const result = {
    success: true,
    total: 0,
    downloaded: 0,
    failed: 0,
    errors: []
  };

  // ... implementation ...

  return result;
}

module.exports = { runPhotoDownload };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');
  runPhotoDownload({ verbose })
    .then(result => {
      if (!result.success) process.exitCode = 1;
    });
}
```

**Pattern verified in:**
- download-data-from-sportlink.js (lines 24-180)
- upload-photos-to-stadion.js (lines 260-445)
- submit-stadion-sync.js (similar pattern)

### Pattern 3: Stats Object Structure (Established Pattern)

**What:** Nested object with counters and error arrays
**When to use:** Extend existing stats object for photos
**Example:**
```javascript
// Source: sync-all.js lines 111-131
const stats = {
  completedAt: '',
  duration: '',
  downloaded: 0,
  prepared: 0,
  // ... other counters ...
  lists: [],
  stadion: {
    total: 0,
    synced: 0,
    created: 0,
    updated: 0,
    errors: []
  }
};

// RECOMMENDED EXTENSION FOR PHOTOS:
const stats = {
  // ... existing fields ...
  photos: {
    download: {
      total: 0,
      downloaded: 0,
      failed: 0,
      errors: []
    },
    upload: {
      total: 0,
      synced: 0,
      skipped: 0,
      errors: []
    },
    delete: {
      total: 0,
      deleted: 0,
      errors: []
    },
    coverage: {
      members_with_photos: 0,
      total_members: 0
    }
  }
};
```

### Pattern 4: Error Collection and Reporting

**What:** Errors collected in arrays with context, reported in summary
**When to use:** Photo errors should follow same pattern
**Example:**
```javascript
// Source: sync-all.js lines 83-93
const allErrors = [...stats.errors, ...stats.stadion.errors];
if (allErrors.length > 0) {
  logger.log(`ERRORS (${allErrors.length})`);
  logger.log(minorDivider);
  allErrors.forEach(error => {
    const identifier = error.knvb_id || error.email || 'system';
    const system = error.system ? ` [${error.system}]` : '';
    logger.log(`- ${identifier}${system}: ${error.message}`);
  });
}
```

**Photo errors should include:**
- `knvb_id` for member identification
- `message` for error details
- `system: 'photo-download'` or `'photo-upload'` for grouping

### Pattern 5: Email Report HTML Formatting

**What:** Plain text parsed and converted to semantic HTML
**When to use:** Extend printSummary() output; send-email.js will auto-format
**Example:**
```javascript
// Source: scripts/send-email.js lines 47-209
function formatAsHtml(textContent) {
  const lines = textContent.split('\n');

  // Section headers (all caps) become <h2>
  if (/^[A-Z][A-Z\s()-]+$/.test(trimmed)) {
    htmlParts.push(`<h2>${escapeHtml(trimmed)}</h2>`);
  }

  // Key-value lines (containing :) become <p><strong>
  if (trimmed.includes(':')) {
    const key = trimmed.slice(0, colonIndex);
    const value = trimmed.slice(colonIndex + 1).trim();
    htmlParts.push(`<p><strong>${key}:</strong> ${value}</p>`);
  }

  // List items (starting with -) become <li>
  if (trimmed.startsWith('- ')) {
    htmlParts.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
  }
}
```

**Implication:** Photo stats should use same text format patterns:
- `PHOTO SYNC` section header (all caps)
- `Downloaded: 5` (key: value)
- `Coverage: 45 of 120 members` (key: value)
- `- 12345: network timeout` (list item for errors)

### Anti-Patterns to Avoid

**1. Don't create separate email summary**
- Existing: Single printSummary() outputs all sections
- Bad: Separate `printPhotoSummary()` that duplicates logging
- Good: Extend printSummary() with photos section

**2. Don't fail fast on photo errors**
- Existing: Stadion errors use try-catch and continue
- Bad: `if (!photoResult.success) return { success: false }`
- Good: Collect errors, continue pipeline, affect exit code

**3. Don't duplicate logger creation**
- Existing: Single logger created in runSyncAll, passed to all steps
- Bad: Each step creates its own logger
- Good: Pass logger option to all functions

**4. Don't manually construct HTML email**
- Existing: send-email.js parses plain text into HTML
- Bad: Build HTML strings in printSummary
- Good: Output plain text sections; formatter handles HTML

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser session reuse | Custom session manager | Pass browser instance between functions OR launch new browser | Session reuse adds complexity with minimal benefit (2 logins vs 1) for 2-step photo pipeline |
| Email HTML generation | Manual HTML string building | Existing formatAsHtml() in send-email.js | Already handles all format patterns (headers, key-value, lists, escaping) |
| Error aggregation | Custom error formatter | Existing allErrors collection pattern | Proven pattern used for Laposta + Stadion errors |
| Photo coverage calculation | Manual queries | Query stadion_members table with SQL | SQLite handles aggregation efficiently |
| Statistics accumulation | Complex state management | Simple object mutation in try-catch blocks | Existing stats object pattern is clear and testable |

**Key insight:** This phase requires ZERO custom solutions. Every problem has a proven solution in the existing codebase. The primary skill is **pattern recognition and replication**, not novel implementation.

## Common Pitfalls

### Pitfall 1: Treating Photo Sync as Single Operation
**What goes wrong:** Calling one "photo sync" function and trying to unpack download + upload results
**Why it happens:** Natural to think of "photo sync" as one step
**How to avoid:** Recognize two distinct operations with different failure modes:
- Download phase: Browser automation, can fail due to network/Sportlink
- Upload/delete phase: API calls, can fail due to Stadion errors
**Warning signs:** Result object has mixed `downloaded` and `uploaded` stats; unclear what failed

**Correct approach:**
```javascript
// Step 5: Photo download
const downloadPhotoResult = await runPhotoDownload({ logger, verbose });
stats.photos.download = { ...downloadPhotoResult };

// Step 6: Photo upload/delete
const uploadPhotoResult = await runPhotoSync({ logger, verbose });
stats.photos.upload = { ...uploadPhotoResult.upload };
stats.photos.delete = { ...uploadPhotoResult.delete };
```

### Pitfall 2: Photo Errors Blocking Member Sync
**What goes wrong:** Pipeline returns early when photo download fails
**Why it happens:** Copy-paste from download/prepare error handling without understanding criticality
**How to avoid:** Use try-catch pattern from Stadion sync (lines 199-245 in sync-all.js)
**Warning signs:** Photo network error causes entire sync to fail; Laposta members not synced

**Correct approach:**
```javascript
// Photo sync is NON-CRITICAL - use try-catch like Stadion
try {
  const photoResult = await runPhotoDownload({ logger, verbose });
  stats.photos.download = { ...photoResult };
} catch (err) {
  logger.error(`Photo download failed: ${err.message}`);
  stats.photos.download.errors.push({ message: err.message, system: 'photo-download' });
}
```

### Pitfall 3: Session Reuse Complexity
**What goes wrong:** Attempting to pass Playwright browser instance from member download to photo download
**Why it happens:** Seems efficient to reuse login session (1 login vs 2)
**How to avoid:** Recognize that download-data-from-sportlink.js closes browser in finally block (line 158). Changing this requires modifying a working module. Cost > benefit.
**Warning signs:** Refactoring runDownload to return browser; adding browser lifecycle management

**Correct approach (two options):**

**Option A: Launch fresh browser for photos (RECOMMENDED)**
```javascript
// Simplest: let photo functions handle their own browser
const photoResult = await runPhotoDownload({ logger, verbose });
// runPhotoDownload launches browser, logs in, downloads, closes browser
```

**Option B: Session reuse with storage state (ADVANCED - probably overkill)**
```javascript
// Only if performance testing shows unacceptable delay
// Requires modifying download-data-from-sportlink.js to save auth state
const downloadResult = await runDownload({
  logger,
  verbose,
  saveAuthState: 'auth-state.json'
});
const photoResult = await runPhotoDownload({
  logger,
  verbose,
  authStatePath: 'auth-state.json'
});
```

**Recommendation:** Start with Option A. Profile if needed. Session reuse saves ~3-5 seconds but adds ~50 lines of complexity.

### Pitfall 4: Coverage Calculation in Wrong Place
**What goes wrong:** Querying database in printSummary() to calculate coverage
**Why it happens:** Coverage stat (X of Y members have photos) needs database query
**How to avoid:** Calculate coverage in photo sync step, store in stats object
**Warning signs:** printSummary() opens database connection; errors during summary printing

**Correct approach:**
```javascript
// In runPhotoSync or after both photo phases:
const db = openDb();
const totalMembers = db.prepare('SELECT COUNT(*) as count FROM stadion_members').get().count;
const membersWithPhotos = db.prepare(
  'SELECT COUNT(*) as count FROM stadion_members WHERE photo_state = "synced"'
).get().count;
db.close();

stats.photos.coverage = {
  members_with_photos: membersWithPhotos,
  total_members: totalMembers
};
```

### Pitfall 5: Exit Code Logic
**What goes wrong:** Success determination doesn't account for photo errors
**Why it happens:** Copy-paste `return { success: stats.errors.length === 0 }` without updating
**How to avoid:** Include photo errors in success calculation
**Warning signs:** Photo upload fails but script exits 0; cron doesn't detect failure

**Correct approach:**
```javascript
// Source: sync-all.js line 261
return {
  success: stats.errors.length === 0 &&
           stats.stadion.errors.length === 0 &&
           stats.photos.download.errors.length === 0 &&
           stats.photos.upload.errors.length === 0 &&
           stats.photos.delete.errors.length === 0,
  stats
};
```

## Code Examples

### Example 1: Extending sync-all.js with Photo Steps

```javascript
// Source: sync-all.js lines 197-245 (Stadion sync pattern)
// AFTER Stadion sync, BEFORE timing completion:

// Step 5: Photo Download (NON-CRITICAL)
logger.verbose('Downloading photos from Sportlink...');
try {
  const photoDownloadResult = await runPhotoDownload({ logger, verbose });

  stats.photos.download = {
    total: photoDownloadResult.total,
    downloaded: photoDownloadResult.downloaded,
    skipped: photoDownloadResult.skipped,
    failed: photoDownloadResult.failed,
    errors: photoDownloadResult.errors || []
  };

  if (photoDownloadResult.failed > 0) {
    logger.log(`Photo download completed with ${photoDownloadResult.failed} failures`);
  }
} catch (err) {
  logger.error(`Photo download failed: ${err.message}`);
  stats.photos.download.errors.push({
    message: `Photo download failed: ${err.message}`,
    system: 'photo-download'
  });
}

// Step 6: Photo Upload/Delete (NON-CRITICAL)
logger.verbose('Syncing photos to Stadion...');
try {
  const photoSyncResult = await runPhotoSync({ logger, verbose });

  stats.photos.upload = {
    total: photoSyncResult.upload.total,
    synced: photoSyncResult.upload.synced,
    skipped: photoSyncResult.upload.skipped,
    errors: photoSyncResult.upload.errors || []
  };

  stats.photos.delete = {
    total: photoSyncResult.delete.total,
    deleted: photoSyncResult.delete.deleted,
    errors: photoSyncResult.delete.errors || []
  };

  if (!photoSyncResult.success) {
    logger.log(`Photo sync completed with errors`);
  }
} catch (err) {
  logger.error(`Photo sync failed: ${err.message}`);
  stats.photos.upload.errors.push({
    message: `Photo sync failed: ${err.message}`,
    system: 'photo-upload'
  });
}

// Calculate photo coverage
const db = openDb();
try {
  const totalMembers = db.prepare('SELECT COUNT(*) as count FROM stadion_members').get().count;
  const membersWithPhotos = db.prepare(
    'SELECT COUNT(*) as count FROM stadion_members WHERE photo_state = "synced"'
  ).get().count;

  stats.photos.coverage = {
    members_with_photos: membersWithPhotos,
    total_members: totalMembers
  };
} catch (err) {
  logger.verbose(`Could not calculate photo coverage: ${err.message}`);
  stats.photos.coverage = { members_with_photos: 0, total_members: 0 };
} finally {
  db.close();
}

// Complete timing (existing code continues here)
const endTime = Date.now();
stats.completedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
stats.duration = formatDuration(endTime - startTime);
```

### Example 2: Extending printSummary() with Photo Section

```javascript
// Source: sync-all.js lines 42-96
// AFTER STADION SYNC section, BEFORE ERRORS section:

logger.log('PHOTO SYNC');
logger.log(minorDivider);

// Download stats
if (stats.photos.download.total > 0) {
  logger.log(`Photos downloaded: ${stats.photos.download.downloaded}/${stats.photos.download.total}`);
  if (stats.photos.download.failed > 0) {
    logger.log(`  Failed: ${stats.photos.download.failed}`);
  }
} else {
  logger.log('Photo download: 0 changes');
}

// Upload stats
if (stats.photos.upload.total > 0) {
  logger.log(`Photos uploaded: ${stats.photos.upload.synced}/${stats.photos.upload.total}`);
  if (stats.photos.upload.skipped > 0) {
    logger.log(`  Skipped: ${stats.photos.upload.skipped}`);
  }
} else {
  logger.log('Photo upload: 0 changes');
}

// Delete stats
if (stats.photos.delete.total > 0) {
  logger.log(`Photos deleted: ${stats.photos.delete.deleted}/${stats.photos.delete.total}`);
} else {
  logger.log('Photo deletion: 0 changes');
}

// Coverage stat
logger.log(`Coverage: ${stats.photos.coverage.members_with_photos} of ${stats.photos.coverage.total_members} members have photos`);
logger.log('');

// ERRORS section (existing code)
const allErrors = [
  ...stats.errors,
  ...stats.stadion.errors,
  ...stats.photos.download.errors,
  ...stats.photos.upload.errors,
  ...stats.photos.delete.errors
];
```

### Example 3: Stats Object Initialization

```javascript
// Source: sync-all.js lines 111-131
// Add to stats initialization:

const stats = {
  completedAt: '',
  duration: '',
  downloaded: 0,
  prepared: 0,
  excluded: 0,
  synced: 0,
  added: 0,
  updated: 0,
  errors: [],
  lists: [],
  stadion: {
    total: 0,
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    errors: []
  },
  photos: {
    download: {
      total: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      errors: []
    },
    upload: {
      total: 0,
      synced: 0,
      skipped: 0,
      errors: []
    },
    delete: {
      total: 0,
      deleted: 0,
      errors: []
    },
    coverage: {
      members_with_photos: 0,
      total_members: 0
    }
  }
};
```

### Example 4: Updated Success Calculation

```javascript
// Source: sync-all.js line 261
// Before (existing):
return {
  success: stats.errors.length === 0 && stats.stadion.errors.length === 0,
  stats
};

// After (with photos):
return {
  success: stats.errors.length === 0 &&
           stats.stadion.errors.length === 0 &&
           stats.photos.download.errors.length === 0 &&
           stats.photos.upload.errors.length === 0 &&
           stats.photos.delete.errors.length === 0,
  stats
};
```

### Example 5: Import Statements

```javascript
// Source: sync-all.js lines 3-7
// Add photo sync imports:

const { createSyncLogger } = require('./lib/logger');
const { runDownload } = require('./download-data-from-sportlink');
const { runPrepare } = require('./prepare-laposta-members');
const { runSubmit } = require('./submit-laposta-list');
const { runSync: runStadionSync } = require('./submit-stadion-sync');
const { runPhotoDownload } = require('./download-photos-from-sportlink');
const { runPhotoSync } = require('./upload-photos-to-stadion');
const { openDb } = require('./lib/stadion-db');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual HTML email construction | Plain text parsed to semantic HTML | Already implemented (send-email.js) | Email formatting is declarative; photo stats just add text sections |
| Separate sync scripts | Orchestrated pipeline | Already implemented (sync-all.js) | Photo sync follows established pattern |
| Individual error handling | Centralized error collection | Node.js best practice (2020+) | Photo errors collected in arrays, reported in summary |
| Blocking failures | Best-effort with error reporting | Already implemented for Stadion | Photo failures don't block member sync |

**No deprecated patterns to avoid** - codebase already follows current best practices.

## Open Questions

### Question 1: Session Reuse Performance
- **What we know:** Launching new browser for photo download adds ~3-5 seconds for login
- **What's unclear:** Whether this is acceptable for daily automated sync
- **Recommendation:** Start without session reuse. Profile if needed. Decision criteria: if total runtime > 5 minutes, consider optimization.

### Question 2: --no-photos Skip Flag
- **What we know:** User marked this as "Claude's discretion"
- **What's unclear:** Whether operators need ability to skip photo sync
- **Recommendation:** Defer to planning phase. If added, follow existing `--force` and `--dry-run` pattern from parseArgs().

### Question 3: Photo Retry Behavior
- **What we know:** Cron has retry job at 8:00 AM if primary sync fails
- **What's unclear:** Whether photo failures should trigger retry (they affect exit code)
- **Recommendation:** Include photo errors in exit code (maintain consistency). Cron retry will re-run entire pipeline including photos.

### Question 4: Photo Error Grouping in Report
- **What we know:** Existing code groups all errors together: `[...stats.errors, ...stats.stadion.errors]`
- **What's unclear:** Whether to group photo errors separately or integrate with main error list
- **Recommendation:** Integrate with main error list (add `system: 'photo-download'` tag). Matches existing Stadion pattern with `[stadion]` tag.

## Sources

### Primary (HIGH confidence)
- Codebase files (verified by reading):
  - sync-all.js - Pipeline orchestration pattern
  - download-photos-from-sportlink.js - Photo download function signature and result structure
  - upload-photos-to-stadion.js - Photo sync function signature and result structure
  - scripts/send-email.js - Email formatting patterns (parseAsHtml function)
  - lib/logger.js - Logger creation and usage
  - lib/stadion-db.js - Photo state tracking schema and queries
  - scripts/cron-wrapper.sh - Email delivery integration

### Secondary (MEDIUM confidence)
- [Error Handling in Node.js Streams: Best Practices - DEV Community](https://dev.to/ruben_alapont/error-handling-in-nodejs-streams-best-practices-dhb) - Sequential pipeline error patterns
- [GitHub - goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices) - Node.js best practices (2024)
- [A comprehensive guide to error handling In Node.js - Honeybadger Developer Blog](https://www.honeybadger.io/blog/errors-nodejs/) - Error propagation patterns
- [Authentication | Playwright](https://playwright.dev/docs/auth) - Session reuse via storage state
- [Using Persistent Context in Playwright for Browser Sessions | BrowserStack](https://www.browserstack.com/guide/playwright-persistent-context) - Persistent context pattern

### Tertiary (LOW confidence)
- Web search results on browser session reuse - general guidance, not project-specific
- Error handling articles from 2025-2026 - validated against codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already installed, verified in package.json
- Architecture: HIGH - Patterns extracted from working code, line references provided
- Pitfalls: HIGH - Based on common mistakes when extending pipelines (industry knowledge + codebase analysis)
- Code examples: HIGH - Directly adapted from existing sync-all.js patterns with photo-specific extensions

**Research date:** 2026-01-26
**Valid until:** 2026-02-25 (30 days - stable domain, unlikely to change)
