# Phase 19: Photo API Optimization - Research

**Phase:** 19-photo-api-optimization
**Research Date:** 2026-01-28
**Objective:** Replace browser-based photo download with direct API URL fetch

## Executive Summary

Phase 19 eliminates browser automation for photo downloads by using `Photo.Url` and `Photo.PhotoDate` from the MemberHeader API (captured in Phase 17). The browser-based `download-photos-from-sportlink.js` will be deleted and photo downloading will be integrated into the hourly people sync pipeline using simple HTTP fetch.

**Key Finding:** Photo.Url and Photo.PhotoDate are already captured and stored in `sportlink_member_free_fields` table (columns: `photo_url`, `photo_date`) via Phase 17, so we only need to:
1. Create new photo download logic using HTTP fetch
2. Update change detection to use PhotoDate instead of PersonImageDate
3. Integrate into people sync pipeline
4. Delete old browser-based script

## Current Architecture

### Photo Download Flow (Browser-Based)

**File:** `download-photos-from-sportlink.js` (298 lines)

**Current Process:**
1. Query `stadion_members` table for rows with `photo_state = 'pending_download'`
2. Launch Playwright browser and login to Sportlink
3. For each member:
   - Navigate to `https://club.sportlink.com/member/member-details/{knvbId}/general`
   - Wait for page load
   - Find photo element via complex DOM scraping:
     - Try header avatar `img` element
     - Fall back to avatar `div` background-image CSS
     - Click modal icon if needed
   - Extract image URL from DOM
   - Fetch image via `context.request.get(imgUrl)`
   - Save to `photos/{knvbId}.{ext}` (MIME type determines extension)
4. Update `photo_state` to `'downloaded'` in database

**Performance:** Sequential processing with 1-3 second delays between members, requires browser overhead.

**Change Detection:** Uses `person_image_date` field in `stadion_members` table. When member data is upserted, photo state changes based on PersonImageDate comparison (see `lib/stadion-db.js` lines 376-399).

### Photo Upload Flow (Unchanged)

**File:** `upload-photos-to-stadion.js` (446 lines)

**Process:**
1. Query members with `photo_state = 'downloaded'`
2. Find photo file in `photos/` directory (try extensions: jpg, jpeg, png, webp, gif)
3. Upload via multipart/form-data POST to `/wp-json/rondo/v1/people/{stadion_id}/photo`
4. Update `photo_state` to `'synced'`

**Also handles deletion:**
1. Query members with `photo_state = 'pending_delete'`
2. DELETE from Stadion API + delete local file
3. Clear photo state to `'no_photo'`

### Photo Sync Pipeline

**File:** `sync-photos.js` (250 lines)

**Current orchestrator:**
1. Runs `runPhotoDownload()` from browser script
2. Runs `runPhotoSync()` for upload/delete
3. Calculates coverage statistics
4. Prints summary report

**Schedule:** Daily at 6:00 AM (separate cron job)

## Phase 17 Foundation

Phase 17 (MemberHeader Data Capture) already provides the foundation:

### Database Schema

**Table:** `sportlink_member_free_fields`

```sql
CREATE TABLE sportlink_member_free_fields (
  knvb_id TEXT PRIMARY KEY,
  freescout_id INTEGER,
  vog_datum TEXT,
  has_financial_block INTEGER DEFAULT 0,
  photo_url TEXT,        -- Photo.Url from MemberHeader
  photo_date TEXT,       -- Photo.PhotoDate from MemberHeader
  source_hash TEXT,
  last_seen_at TEXT,
  created_at TEXT
);
```

**Data Capture:** `download-functions-from-sportlink.js` fetches MemberHeader API during `/other` page visit (lines 17-01 from Phase 17). The data is available for ~500 members with functions/committees.

**Gap:** Members WITHOUT functions/committees don't have photo_url/photo_date captured yet. We need to either:
- Extend MemberHeader capture to ALL members (during people sync)
- OR use the existing PersonImageDate field as fallback for members not in free_fields table

### Photo State Machine

**Table:** `stadion_members`

```sql
-- Photo tracking columns
person_image_date TEXT,           -- Currently used for change detection
photo_state TEXT DEFAULT 'no_photo',
photo_state_updated_at TEXT
```

**Valid states:**
- `'no_photo'` - Member has no photo
- `'pending_download'` - Photo needs to be downloaded
- `'downloaded'` - Photo downloaded, pending upload
- `'pending_upload'` - Deprecated (unused)
- `'synced'` - Photo uploaded to Stadion
- `'pending_delete'` - Photo removed, needs deletion

**State transitions** (from `upsertMembers()` in stadion-db.js lines 376-399):
```javascript
photo_state = CASE
  -- Photo added or changed: trigger download
  WHEN excluded.person_image_date IS NOT NULL
       AND (stadion_members.person_image_date IS NULL
            OR excluded.person_image_date != stadion_members.person_image_date)
    THEN 'pending_download'
  -- Photo removed: trigger deletion
  WHEN excluded.person_image_date IS NULL
       AND stadion_members.person_image_date IS NOT NULL
    THEN 'pending_delete'
  -- No change: keep current state
  ELSE stadion_members.photo_state
END
```

## Required Changes

### 1. Data Capture Extension

**Problem:** Only ~500 members (with functions/committees) have photo_url/photo_date captured.

**Solution:** Extend MemberHeader API capture to ALL members during people sync.

**Location:** `prepare-stadion-members.js` or create new step in sync-people pipeline

**Approach:**
- After downloading member data, batch-fetch MemberHeader for all members
- Store photo_url/photo_date in stadion_members table (add new columns OR join with free_fields)
- Alternative: Keep using person_image_date for change detection, only fetch photo_url when needed

**Recommendation:** Add columns to `stadion_members`:
```sql
ALTER TABLE stadion_members ADD COLUMN photo_url TEXT;
ALTER TABLE stadion_members ADD COLUMN photo_date TEXT;
```

This keeps all photo data in one table and avoids JOIN complexity.

### 2. Photo Download Replacement

**Create:** New function `downloadPhotoFromUrl()` to replace browser method

**Inputs:**
- `photoUrl` - Direct HTTP URL to photo (from Photo.Url)
- `knvbId` - Member KNVB ID for filename
- `photosDir` - Target directory path

**Implementation:**
```javascript
async function downloadPhotoFromUrl(photoUrl, knvbId, photosDir, logger, retries = 3) {
  const https = require('https');
  const fs = require('fs/promises');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(photoUrl);  // Or use https.get

      if (!response.ok) {
        if (attempt < retries) continue;
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type');
      const ext = mimeToExtension(contentType);

      const filepath = path.join(photosDir, `${knvbId}.${ext}`);
      await fs.writeFile(filepath, Buffer.from(buffer));

      return { success: true, path: filepath, bytes: buffer.byteLength };
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}
```

**Key differences from browser method:**
- No Playwright dependency
- Direct HTTP fetch (much faster)
- No DOM scraping
- No navigation/page load delays
- Parallel downloads possible (with rate limiting)

### 3. Change Detection Update

**Current logic:** Compare `person_image_date` field

**New logic:** Compare `photo_url` AND `photo_date`

**Rationale:** PhotoDate is more accurate than PersonImageDate. Also detect URL changes (member uploaded different photo).

**Update location:** `lib/stadion-db.js` in `upsertMembers()` function

**New comparison:**
```javascript
photo_state = CASE
  -- Photo added or changed (URL or date differs)
  WHEN excluded.photo_url IS NOT NULL
       AND (stadion_members.photo_url IS NULL
            OR excluded.photo_url != stadion_members.photo_url
            OR excluded.photo_date != stadion_members.photo_date)
    THEN 'pending_download'
  -- Photo removed
  WHEN excluded.photo_url IS NULL
       AND stadion_members.photo_url IS NOT NULL
    THEN 'pending_delete'
  -- No change
  ELSE stadion_members.photo_state
END
```

### 4. Pipeline Integration

**Delete:**
- `download-photos-from-sportlink.js` (298 lines)
- `sync-photos.js` (250 lines)

**Modify:** `sync-people.js` to include photo download step

**New flow:**
```javascript
async function runPeopleSync() {
  // 1. Download from Sportlink (existing)
  await runDownload();

  // 2. Prepare Laposta (existing)
  await runPrepare();

  // 3. Submit Laposta (existing)
  await runSubmit();

  // 4. Sync to Stadion (existing)
  await runStadionSync();

  // 5. Birthday sync (existing)
  await runBirthdaySync();

  // NEW: 6. Photo download (HTTP fetch)
  await runPhotoDownload();  // New implementation

  // NEW: 7. Photo upload
  await runPhotoUpload();    // Reuse from upload-photos-to-stadion.js
}
```

**Performance impact:** Minimal - photo downloads run in parallel with rate limiting (vs sequential browser navigation).

### 5. Cron Schedule Update

**Remove:** Daily photo sync cron job (6:00 AM)

**Keep:** Hourly people sync now includes photos

**Benefit:** Photos sync more frequently (hourly vs daily), faster fixes when photos change.

## Data Flow Analysis

### Current Flow (Browser-Based)

```
Member Data Download (hourly)
  ↓
stadion_members.person_image_date updated
  ↓
photo_state = 'pending_download' (if date changed)
  ↓
Photo Download (daily, 6 AM)
  ↓
Browser navigates to member-details/{knvbId}/general
  ↓
DOM scraping finds photo element
  ↓
Extract img URL from DOM
  ↓
Fetch via Playwright context.request
  ↓
Save to photos/{knvbId}.{ext}
  ↓
photo_state = 'downloaded'
  ↓
Photo Upload (daily, 6 AM)
  ↓
Upload to Stadion via multipart/form-data
  ↓
photo_state = 'synced'
```

### New Flow (API-Based)

```
Member Data Download (hourly)
  ↓
MemberHeader API captured (NEW - all members)
  ↓
stadion_members.photo_url and photo_date updated (NEW)
  ↓
photo_state = 'pending_download' (if URL or date changed)
  ↓
Photo Download (hourly, integrated)
  ↓
Direct HTTP fetch from photo_url
  ↓
Save to photos/{knvbId}.{ext}
  ↓
photo_state = 'downloaded'
  ↓
Photo Upload (hourly, integrated)
  ↓
Upload to Stadion via multipart/form-data
  ↓
photo_state = 'synced'
```

**Key improvements:**
- All members get photo metadata (not just function holders)
- Faster download (no browser overhead)
- More frequent sync (hourly vs daily)
- Better change detection (URL + date vs just date)

## Error Handling Patterns

### Current Browser Method

**Errors handled:**
- Login failure (throws, stops sync)
- Photo element not found (logged, continues to next member)
- Image fetch failure (logged, continues)
- File write failure (logged, continues)

**Recovery:** None - failed photos stay in 'pending_download' state indefinitely.

### Proposed HTTP Method

**Errors to handle:**
1. **Invalid photo_url** (null, empty, malformed)
   - Skip download, log warning
   - Mark as 'no_photo' state

2. **HTTP errors** (404, 500, 403)
   - Retry 2-3 times with exponential backoff
   - If all retries fail: log error, keep 'pending_download' state
   - Next sync will retry

3. **Timeout** (connection timeout, slow download)
   - Set timeout (10 seconds)
   - Retry on timeout
   - Log error if all retries fail

4. **Invalid image data** (corrupted, empty, wrong MIME type)
   - Don't save to disk
   - Log error with member ID
   - Keep 'pending_download' state

5. **Disk errors** (write failure, permissions)
   - Log error with full path
   - Keep 'pending_download' state

**Error reporting:** Collect all errors during sync, display summary at end:

```
PHOTOS (ERROR)
- 12345678: HTTP 404 (photo not found)
- 23456789: Timeout after 3 retries
- 34567890: Invalid image data (0 bytes)
```

## Database Schema Updates

### Option A: Add to stadion_members (Recommended)

```sql
ALTER TABLE stadion_members ADD COLUMN photo_url TEXT;
ALTER TABLE stadion_members ADD COLUMN photo_date TEXT;
```

**Pros:**
- All photo data in one table
- No JOIN needed
- Simpler queries
- Matches existing person_image_date location

**Cons:**
- Duplicates photo_url/photo_date already in free_fields for ~500 members
- Larger stadion_members table

### Option B: Use existing sportlink_member_free_fields

**Pros:**
- Data already captured for ~500 members
- No schema changes

**Cons:**
- JOIN required for photo queries
- Only covers members with functions/committees
- Need separate capture for other members

**Recommendation:** Use Option A (add to stadion_members) for simplicity and completeness.

## Migration Strategy

### Phase Transition

**Before Phase 19:**
- `sync-photos.js` runs daily at 6 AM
- `download-photos-from-sportlink.js` uses browser automation
- Change detection uses `person_image_date`

**After Phase 19:**
- Photo sync runs hourly (integrated in people sync)
- HTTP fetch replaces browser
- Change detection uses `photo_url` and `photo_date`

### Cutover Plan

1. **Prepare:**
   - Add photo_url/photo_date columns to stadion_members
   - Extend MemberHeader capture to all members
   - Test HTTP download with sample members

2. **Deploy:**
   - Delete `download-photos-from-sportlink.js`
   - Delete `sync-photos.js`
   - Update `sync-people.js` to include photo steps
   - Remove photo sync from cron

3. **First Run:**
   - All photos with photo_url will be marked 'pending_download' (missing stored URL = changed)
   - HTTP download will process all pending photos
   - Existing photos/{knvbId}.{ext} files can be reused (skip download if file exists and date unchanged)

### Rollback Plan

If HTTP download fails:
- Restore `download-photos-from-sportlink.js` and `sync-photos.js` from git
- Re-add cron job
- Old browser method still works (uses person_image_date)

## Performance Comparison

### Current (Browser-Based)

**Per-member cost:**
- Page navigation: 2-5 seconds
- DOM wait/scraping: 0.5-2 seconds
- Image fetch: 0.5-1 second
- Delay between members: 1-3 seconds
- **Total: ~4-11 seconds per member**

**Typical batch:** 20-50 photos per day
**Total time:** 80-550 seconds (1.3-9 minutes)

### Proposed (HTTP Fetch)

**Per-member cost:**
- HTTP fetch: 0.5-1 second
- File write: 0.1 seconds
- Rate limit delay: 0.2-0.5 seconds
- **Total: ~0.8-1.6 seconds per member**

**With parallelization:** 5 concurrent downloads = 0.16-0.32 seconds per member

**Typical batch:** 20-50 photos per run (but runs hourly now)
**Total time:** 16-80 seconds (vs 80-550 for browser)

**Speedup: 5-35x faster** (or 10-100x with parallelization)

## Logging & Reporting Changes

### Current Output (sync-photos.js)

```
PHOTO DOWNLOAD
- Photos downloaded: 12/15
- Failed: 3

PHOTO UPLOAD
- Photos uploaded: 10/12
- Skipped: 2

COVERAGE
- 245 of 500 members have photos
```

### Proposed Output (integrated in sync-people.js)

```
PHOTO SYNC
- Total members: 500
- Downloaded: 12 (new/changed)
- Skipped: 220 (unchanged)
- No photo: 265
- Uploaded: 10
- Errors: 3

ERRORS (PHOTOS)
- 12345678 [download]: HTTP 404
- 23456789 [download]: Timeout
- 34567890 [upload]: Invalid stadion_id
```

### Verbose Mode

**Normal mode:** Summary counts only
**Verbose mode:** Log each photo operation
```
  Photo 12345678: downloading from https://...
  Photo 12345678: saved (45KB)
  Photo 23456789: skipped (unchanged)
```

## File Deletion Checklist

**Delete entirely:**
- `download-photos-from-sportlink.js` (298 lines) - browser automation replaced by HTTP fetch
- `sync-photos.js` (250 lines) - integrated into sync-people.js

**Keep (reuse):**
- `upload-photos-to-stadion.js` - photo upload logic unchanged
- `lib/stadion-db.js` - update photo state logic, add new columns

**Modify:**
- `sync-people.js` - add photo download/upload steps
- `scripts/sync.sh` - remove 'photos' case (or make it alias to 'people')
- `scripts/install-cron.sh` - remove daily photo cron job

## Testing Strategy

### Unit Tests (Manual)

1. **Photo download from URL:**
   - Valid photo URL → downloads and saves
   - 404 URL → logs error, keeps pending state
   - Timeout URL → retries, then logs error
   - Invalid MIME type → logs error

2. **Change detection:**
   - New photo URL → marks pending_download
   - Changed PhotoDate → marks pending_download
   - Same URL and date → keeps current state
   - Null photo URL → marks pending_delete (if had photo)

3. **Photo upload (existing):**
   - Verify still works after integration

### Integration Tests (Server)

1. **Full people sync with photos:**
   ```bash
   ssh root@46.202.155.16 "cd /home/sportlink && node sync-people.js --verbose"
   ```
   - Verify photo download runs
   - Check photos/ directory for new files
   - Verify upload to Stadion
   - Check database photo_state updates

2. **Email report:**
   - Contains photo summary section
   - Errors listed at bottom
   - Counts are accurate

3. **Performance:**
   - Time full sync before/after
   - Verify photo step doesn't block other operations
   - Check memory usage with parallel downloads

## Dependencies & Prerequisites

**Phase 17 (COMPLETE):**
- MemberHeader API response captured
- photo_url and photo_date stored for function holders
- Database schema supports financial block + photos

**This Phase (19) needs:**
- Extend MemberHeader capture to ALL members (not just function holders)
- Add photo_url/photo_date to stadion_members table
- Implement HTTP download logic
- Integrate into people sync
- Remove old files and cron job

**Enables:**
- Faster photo sync (hourly vs daily)
- More reliable change detection
- Reduced infrastructure complexity (no browser dependency for photos)

## Risk Assessment

### High Risk

**None identified** - HTTP fetch is simpler and more reliable than browser automation.

### Medium Risk

1. **Photo URLs expire or change format**
   - Mitigation: Error handling + retry logic
   - Fallback: Keep old browser script in git history

2. **Rate limiting by Sportlink**
   - Mitigation: Add delays between downloads, respect any rate limit headers
   - Impact: Slower downloads, but still faster than browser

### Low Risk

1. **Missing photo_url for some members**
   - Mitigation: Graceful handling of null URLs
   - Detection: Log warning for null URLs

2. **Migration glitches (first run)**
   - Mitigation: Test on dev before production
   - Rollback: Restore old scripts from git

## Open Questions for Planning

1. **Parallelization strategy?**
   - Sequential (safest, ~1 second per photo)
   - Parallel with limit (faster, need to tune concurrency)
   - Recommendation: Start sequential, add parallelization later if needed

2. **Extend MemberHeader capture - when and how?**
   - Option A: New step in download-data-from-sportlink.js (batch API call)
   - Option B: New step in prepare-stadion-members.js (before sync)
   - Option C: During upsertMembers, fetch on-demand
   - Recommendation: Option B - fetch during prepare step

3. **Handle missing photo_url for members?**
   - Option A: Leave photo_state as 'no_photo'
   - Option B: Try to fetch MemberHeader on-demand
   - Recommendation: Option A - simpler, fewer API calls

4. **Reuse existing photos if URL unchanged?**
   - Check if file exists before download
   - Compare file timestamp with photo_date
   - Recommendation: Yes - skip download if file exists and date matches

5. **Delete photos when member removed?**
   - Current: handled by 'pending_delete' state
   - Keep same behavior: delete from Stadion + local file

## Summary for Planning

**What works today:**
- Photo upload to Stadion (multipart/form-data)
- Photo deletion from Stadion
- Photo state machine in database
- Photo.Url and Photo.PhotoDate captured for ~500 members

**What needs to change:**
- Replace browser automation with HTTP fetch
- Extend photo_url/photo_date to ALL members (add to stadion_members table)
- Update change detection to use photo_url + photo_date
- Integrate photo download into hourly people sync
- Delete old browser script and separate photo sync pipeline

**Complexity level:** Medium
- Schema change (add columns)
- HTTP download logic (new code)
- Pipeline integration (modify sync-people.js)
- File deletion (2 scripts)
- Cron update

**Estimated effort:**
- Implementation: 4-6 hours
- Testing: 2-3 hours
- Deployment: 1 hour

**Key success metric:** Photo sync runs hourly with <1 minute overhead, 0 browser dependency.

---

*Research completed: 2026-01-28*
*Ready for: Plan creation*
