# Phase 17: MemberHeader Data Capture - Research

**Researched:** 2026-01-28
**Domain:** Playwright API interception, SQLite schema evolution, JavaScript async patterns
**Confidence:** HIGH

## Summary

This phase extends the existing `download-functions-from-sportlink.js` script to capture additional API data from the MemberHeader endpoint. The codebase already has well-established patterns for intercepting API responses during Playwright page navigation (see `fetchMemberFreeFields` function). The implementation adds a parallel `waitForResponse` promise for the `member/MemberHeader` endpoint and extracts three fields: `HasFinancialTransferBlockOwnClub` (boolean), `Photo.Url` (string), and `Photo.PhotoDate` (date string).

The database schema evolution follows the existing `PRAGMA table_info` pattern in `lib/stadion-db.js` for conditional column additions. New fields will be added to the `sportlink_member_free_fields` table which already stores per-member metadata from the `/other` page.

**Primary recommendation:** Add MemberHeader response capture alongside MemberFreeFields in `fetchMemberFreeFields()`, store extracted fields in existing table using established migration patterns.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright | 1.40+ | Browser automation and API interception | Already used throughout codebase, `waitForResponse()` pattern established |
| better-sqlite3 | 9.x | SQLite database operations | Already used, synchronous API matches codebase patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All required libraries already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `sportlink_member_free_fields` | New table `sportlink_member_header` | Extra table complexity; existing table already holds per-member Sportlink metadata from `/other` page, logically fits |
| Parallel waitForResponse | Sequential requests | Slower; parallel is already proven pattern in codebase |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
  stadion-db.js        # Add columns and upsert function
download-functions-from-sportlink.js  # Extend fetchMemberFreeFields
```

### Pattern 1: Parallel API Response Capture
**What:** Set up multiple `waitForResponse()` promises before navigation, await all with `Promise.all()`
**When to use:** When a single page load triggers multiple API calls you need to capture
**Example:**
```javascript
// Source: download-functions-from-sportlink.js lines 215-232
const freeFieldsPromise = page.waitForResponse(
  resp => resp.url().includes('/remarks/MemberFreeFields?'),
  { timeout: 15000 }
).catch(() => null);

const memberHeaderPromise = page.waitForResponse(
  resp => resp.url().includes('/member/MemberHeader?'),
  { timeout: 15000 }
).catch(() => null);

await page.goto(otherUrl, { waitUntil: 'networkidle' });

const [freeFieldsResponse, memberHeaderResponse] = await Promise.all([
  freeFieldsPromise,
  memberHeaderPromise
]);
```

### Pattern 2: Conditional Column Migration
**What:** Check if column exists using PRAGMA before ALTER TABLE
**When to use:** Adding new columns to existing tables without breaking existing installs
**Example:**
```javascript
// Source: lib/stadion-db.js lines 233-244
const columns = db.prepare('PRAGMA table_info(sportlink_member_free_fields)').all();

if (!columns.some(col => col.name === 'has_financial_block')) {
  db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN has_financial_block INTEGER');
}

if (!columns.some(col => col.name === 'photo_url')) {
  db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN photo_url TEXT');
}

if (!columns.some(col => col.name === 'photo_date')) {
  db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN photo_date TEXT');
}
```

### Pattern 3: Safe JSON Field Access
**What:** Use optional chaining to extract nested fields from API responses
**When to use:** When API fields may be null/missing (like Photo object for members without photos)
**Example:**
```javascript
// Handle null Photo object gracefully
const photoUrl = data?.Photo?.Url || null;
const photoDate = data?.Photo?.PhotoDate || null;
const hasFinancialBlock = data?.HasFinancialTransferBlockOwnClub === true;
```

### Anti-Patterns to Avoid
- **Accessing nested properties without null checks:** Photo object can be null for members without photos, always use `?.`
- **Sequential waitForResponse after navigation:** Set up promises BEFORE `page.goto()`, not after
- **Hardcoding URL patterns without query param consideration:** Use `includes('/member/MemberHeader?')` with the `?` to ensure you match the specific endpoint

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API interception | Custom network interceptors | Playwright's `waitForResponse()` | Race conditions, timing issues handled by Playwright |
| Schema migrations | Manual SQL detection | `PRAGMA table_info` + conditional ALTER | Pattern already established in codebase |
| Null-safe JSON access | Try-catch everywhere | Optional chaining (`?.`) | Cleaner, already used throughout codebase |

**Key insight:** This phase is entirely about extending existing patterns, not creating new ones. The codebase already solves all the technical challenges.

## Common Pitfalls

### Pitfall 1: Missing Photo Object Handling
**What goes wrong:** Accessing `Photo.Url` when `Photo` is null causes runtime errors
**Why it happens:** Members without photos return null for the Photo property
**How to avoid:** Always use optional chaining: `data?.Photo?.Url || null`
**Warning signs:** TypeError: Cannot read property 'Url' of null

### Pitfall 2: URL Pattern Not Matching
**What goes wrong:** `waitForResponse()` never resolves, times out
**Why it happens:** URL pattern string doesn't match actual API endpoint
**How to avoid:** Include query param marker `?` in pattern (e.g., `/member/MemberHeader?`), check DEBUG_LOG output for actual URLs
**Warning signs:** "No API response captured" messages in logs

### Pitfall 3: Response Promise Set Up Too Late
**What goes wrong:** Response arrives before promise is set up, never captured
**Why it happens:** `waitForResponse()` called after `page.goto()` completes
**How to avoid:** Always set up response promise BEFORE navigation
**Warning signs:** Intermittent failures, sometimes captures response, sometimes doesn't

### Pitfall 4: Boolean vs Integer Storage in SQLite
**What goes wrong:** JavaScript boolean stored as string or inconsistently
**Why it happens:** SQLite has no native boolean, uses INTEGER 0/1
**How to avoid:** Explicitly convert: `has_financial_block: data?.HasFinancialTransferBlockOwnClub ? 1 : 0`
**Warning signs:** Comparison issues when reading back from database

### Pitfall 5: Forgetting Hash Update
**What goes wrong:** New fields captured but hash doesn't change, no re-sync triggered
**Why it happens:** `computeMemberFreeFieldsHash()` doesn't include new fields
**How to avoid:** Add new fields to hash computation function
**Warning signs:** Fields change in Sportlink but Stadion never updates

## Code Examples

Verified patterns from existing codebase:

### Capture MemberHeader Response
```javascript
// Based on: download-functions-from-sportlink.js lines 179-204
async function fetchMemberDataFromOtherPage(page, knvbId, logger) {
  const otherUrl = `https://club.sportlink.com/member/member-details/${knvbId}/other`;

  // Set up promises BEFORE navigation
  const freeFieldsPromise = page.waitForResponse(
    resp => resp.url().includes('/remarks/MemberFreeFields?'),
    { timeout: 15000 }
  ).catch(() => null);

  const memberHeaderPromise = page.waitForResponse(
    resp => resp.url().includes('/member/MemberHeader?'),
    { timeout: 15000 }
  ).catch(() => null);

  logger.verbose(`  Navigating to ${otherUrl}...`);
  await page.goto(otherUrl, { waitUntil: 'networkidle' });

  const [freeFieldsResponse, memberHeaderResponse] = await Promise.all([
    freeFieldsPromise,
    memberHeaderPromise
  ]);

  // Parse responses (null-safe)
  let freeFieldsData = null;
  let memberHeaderData = null;

  if (freeFieldsResponse && freeFieldsResponse.ok()) {
    try {
      freeFieldsData = await freeFieldsResponse.json();
    } catch (err) {
      logger.verbose(`  Error parsing MemberFreeFields: ${err.message}`);
    }
  }

  if (memberHeaderResponse && memberHeaderResponse.ok()) {
    try {
      memberHeaderData = await memberHeaderResponse.json();
    } catch (err) {
      logger.verbose(`  Error parsing MemberHeader: ${err.message}`);
    }
  }

  return { freeFieldsData, memberHeaderData };
}
```

### Parse MemberHeader Response
```javascript
// Expected MemberHeader structure based on project documentation:
// {
//   HasFinancialTransferBlockOwnClub: boolean,
//   Photo: { Url: string, PhotoDate: string } | null,
//   ...other fields
// }
function parseMemberHeaderResponse(data, knvbId) {
  // Handle null/missing Photo object gracefully
  const photoUrl = data?.Photo?.Url || null;
  const photoDate = data?.Photo?.PhotoDate || null;

  // Boolean to integer for SQLite
  const hasFinancialBlock = data?.HasFinancialTransferBlockOwnClub === true ? 1 : 0;

  return {
    knvb_id: knvbId,
    has_financial_block: hasFinancialBlock,
    photo_url: photoUrl,
    photo_date: photoDate
  };
}
```

### Database Migration Pattern
```javascript
// Source: lib/stadion-db.js initDb function pattern
function initDb(db) {
  // ... existing table creation ...

  // Add new columns to sportlink_member_free_fields if they don't exist
  const freeFieldColumns = db.prepare('PRAGMA table_info(sportlink_member_free_fields)').all();

  if (!freeFieldColumns.some(col => col.name === 'has_financial_block')) {
    db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN has_financial_block INTEGER DEFAULT 0');
  }

  if (!freeFieldColumns.some(col => col.name === 'photo_url')) {
    db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN photo_url TEXT');
  }

  if (!freeFieldColumns.some(col => col.name === 'photo_date')) {
    db.exec('ALTER TABLE sportlink_member_free_fields ADD COLUMN photo_date TEXT');
  }
}
```

### Updated Upsert Function
```javascript
// Extend existing upsertMemberFreeFields to include new columns
function upsertMemberFreeFields(db, records) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO sportlink_member_free_fields (
      knvb_id,
      freescout_id,
      vog_datum,
      has_financial_block,
      photo_url,
      photo_date,
      source_hash,
      last_seen_at,
      created_at
    )
    VALUES (
      @knvb_id,
      @freescout_id,
      @vog_datum,
      @has_financial_block,
      @photo_url,
      @photo_date,
      @source_hash,
      @last_seen_at,
      @created_at
    )
    ON CONFLICT(knvb_id) DO UPDATE SET
      freescout_id = excluded.freescout_id,
      vog_datum = excluded.vog_datum,
      has_financial_block = excluded.has_financial_block,
      photo_url = excluded.photo_url,
      photo_date = excluded.photo_date,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at
  `);

  // ... transaction logic (existing pattern) ...
}
```

### Updated Hash Computation
```javascript
// Extend to include new fields for change detection
function computeMemberFreeFieldsHash(knvbId, freescoutId, vogDatum, hasFinancialBlock, photoUrl, photoDate) {
  const payload = stableStringify({
    knvb_id: knvbId,
    freescout_id: freescoutId,
    vog_datum: vogDatum,
    has_financial_block: hasFinancialBlock,
    photo_url: photoUrl,
    photo_date: photoDate
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser DOM scraping for photos | API URL from MemberHeader | Phase 17+ (this milestone) | Faster, more reliable photo sync |
| No financial block tracking | MemberHeader.HasFinancialTransferBlockOwnClub | Phase 17+ (this milestone) | New Stadion field sync capability |

**Deprecated/outdated:**
- Browser-based photo download (`download-photos-from-sportlink.js`) will be replaced in Phase 19 after this foundation is complete

## Open Questions

Things that couldn't be fully resolved:

1. **Exact MemberHeader API Response Structure**
   - What we know: Contains `HasFinancialTransferBlockOwnClub` (boolean) and `Photo` object with `Url` and `PhotoDate`
   - What's unclear: Complete field list, exact date format for PhotoDate
   - Recommendation: Add DEBUG_LOG output during development to capture sample response, document actual structure

2. **Photo URL Authentication**
   - What we know: `Photo.Url` contains direct URL to photo
   - What's unclear: Whether URL requires auth cookies or is publicly accessible
   - Recommendation: Test URL fetch in Phase 19, may need to use browser context for authenticated fetch

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `download-functions-from-sportlink.js` - Existing `fetchMemberFreeFields` pattern (lines 179-204)
- Codebase analysis: `lib/stadion-db.js` - Schema migration patterns (lines 232-267)
- Codebase analysis: `download-teams-from-sportlink.js` - Parallel waitForResponse pattern (lines 153-163)
- Project documentation: `.planning/todos/done/2026-01-28-use-memberheader-api-for-photos-and-financial-block.md`

### Secondary (MEDIUM confidence)
- Project documentation: `.planning/REQUIREMENTS.md` - v1.7 requirements
- Project documentation: `.planning/ROADMAP.md` - Phase descriptions
- Debug documentation: `.planning/debug/download-functions-no-api-response.md` - URL pattern matching lessons learned

### Tertiary (LOW confidence)
- MemberHeader API structure - Based on project documentation mentions, not directly verified against API response

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns established in existing codebase
- Architecture: HIGH - Direct extension of proven patterns
- Pitfalls: HIGH - Based on documented bugs and fixes in codebase
- API response structure: MEDIUM - Field names from project docs, not verified against live API

**Research date:** 2026-01-28
**Valid until:** Indefinitely (internal codebase patterns, not external libraries)
