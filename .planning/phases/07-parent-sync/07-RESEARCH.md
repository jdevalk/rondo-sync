# Phase 7: Parent Sync - Research

**Researched:** 2026-01-25
**Domain:** Parent deduplication, bidirectional relationship management, and ACF relationship field synchronization
**Confidence:** MEDIUM

## Summary

Phase 7 syncs parent data to Stadion as separate person records linked to their children via bidirectional relationships. Research examined: (1) Laposta's existing parent deduplication logic for extraction into shared module, (2) ACF relationship field format via WordPress REST API, (3) bidirectional relationship handling patterns, and (4) email normalization best practices for deduplication.

**Key findings:**
- Laposta parent deduplication uses email normalization (`toLowerCase()` + `trim()`) with Maps for within-run tracking
- ACF relationship fields accept array of post IDs `[123, 456]` via REST API (`acf.field_name: [id1, id2]`)
- ACF 6.2+ supports native bidirectional relationships via field setting (updates both sides automatically)
- Stadion uses ACF repeater for contact_info, allowing multiple phone numbers to be merged across children
- Hash-based change detection pattern from stadion-db.js applies to parent records (use email as stable identifier)

**Primary recommendation:** Extract Laposta's `normalizeEmail()`, parent name building, and deduplication Maps into `lib/parent-dedupe.js` shared module. Sync parents after children (ensures child post IDs exist for relationship linking). Use ACF bidirectional setting if available in Stadion, otherwise manually update both sides via API.

## Standard Stack

The established approach for parent deduplication and relationship synchronization:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | latest | Parent state tracking | Already used for member sync in stadion-db.js |
| crypto (Node.js) | Built-in | SHA-256 hash for parent change detection | Same pattern as member sync |
| lib/stadion-client.js | Phase 5 | WordPress REST API client | All Stadion API calls |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lib/stadion-db.js | Phase 6 | Hash computation patterns | Reuse for parent hashing |
| lib/logger.js | Existing | Dual-stream logging | Parent sync progress tracking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared deduplication module | Duplicate logic in prepare-stadion-parents.js | DRY violation; changes must be made in 2 places |
| Email-based matching | Phone-based matching | Email more reliable (normalized, unique); phones can have formatting variations |
| Process parents first | Process children first | Children must exist to create parent→child relationships |
| Manual bidirectional updates | ACF bidirectional setting | Manual requires 2 API calls per relationship; ACF handles automatically |

**Installation:**
```bash
# No new dependencies needed for Phase 7
# All required libraries already in package.json
```

**Source:** Codebase analysis shows `prepare-laposta-members.js` contains parent deduplication logic (lines 51-54, 327-395) that can be extracted.

## Architecture Patterns

### Recommended Project Structure
```
.
├── lib/
│   ├── parent-dedupe.js         # New: shared deduplication logic
│   ├── stadion-client.js        # Phase 5: API client
│   ├── stadion-db.js            # Phase 6: hash tracking (extended for parents)
│   └── logger.js                # Existing: dual-stream logger
├── prepare-stadion-members.js   # Phase 6: member transformation
├── prepare-stadion-parents.js   # New: parent extraction and transformation
├── submit-stadion-sync.js       # Phase 6: member sync (extended for parents)
└── prepare-laposta-members.js   # Existing: uses lib/parent-dedupe.js
```

### Pattern 1: Email Normalization for Deduplication
**What:** Normalize email addresses to lowercase + trimmed for consistent deduplication
**When to use:** All parent email handling (deduplication, matching, comparison)
**Example:**
```javascript
// Source: prepare-laposta-members.js lines 51-54
function normalizeEmail(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.includes('@');
}
```

**Best practices from web research:**
- Always convert to lowercase (case-insensitive matching)
- Trim leading/trailing whitespace
- Store both original (for communication) and normalized (for deduplication) values
- For Gmail aliases: consider removing `+suffix` and dots in local part (not implemented in Laposta, defer to future)

**Sources:**
- [Best Practices for Normalizing Emails Before Hashing](https://www.narrative.io/knowledge-base/how-to-guides/how-to-normalize-emails-prior-to-hashing)
- [How to Normalize Email Addresses to prevent duplicate accounts](https://www.usercheck.com/guides/how-to-normalize-email-addresses)

### Pattern 2: Parent Deduplication with Maps (Within-Run)
**What:** Track parents by normalized email using Maps during preparation, deduplicate before sync
**When to use:** Parent extraction from Sportlink member records
**Example:**
```javascript
// Source: prepare-laposta-members.js lines 359-395 (existing pattern)
const parentNamesMap = new Map(); // Map<normalizedEmail, string[]>
const parentTeamsMap = new Map(); // Map<normalizedEmail, Set<string>>
const parentPhonesMap = new Map(); // Map<normalizedEmail, Set<string>>

members.forEach((member) => {
  const childName = buildChildFullName(member);

  ['EmailAddressParent1', 'EmailAddressParent2'].forEach((emailField) => {
    const emailValue = member[emailField];
    if (!isValidEmail(emailValue)) return;

    const normalized = normalizeEmail(emailValue);

    // Track child names for this parent
    if (!parentNamesMap.has(normalized)) {
      parentNamesMap.set(normalized, []);
    }
    if (childName && !parentNamesMap.get(normalized).includes(childName)) {
      parentNamesMap.get(normalized).push(childName);
    }

    // Track phone numbers (multiple sources)
    if (!parentPhonesMap.has(normalized)) {
      parentPhonesMap.set(normalized, new Set());
    }
    const phoneField = emailField === 'EmailAddressParent1'
      ? 'TelephoneParent1'
      : 'TelephoneParent2';
    if (member[phoneField]) {
      parentPhonesMap.get(normalized).add(member[phoneField].trim());
    }
  });
});

// Convert Maps to parent records
const parents = Array.from(parentNamesMap.keys()).map((email) => ({
  email: email,
  children_names: parentNamesMap.get(email),
  phones: Array.from(parentPhonesMap.get(email))
}));
```

**Key insight:** Maps track multiple children per parent email. Deduplication happens at email level (one parent record per unique email, regardless of how many children list them).

### Pattern 3: Parent Name Resolution (First Wins)
**What:** When same parent appears with different names across children, first occurrence wins
**When to use:** Resolving conflicting parent names during deduplication
**Example:**
```javascript
// Source: prepare-laposta-members.js lines 86-105, 359-367
const memberNameMap = new Map(); // Map<normalizedEmail, {voornaam, tussenvoegsel, achternaam}>

// Build from members first (if parent has own member record)
primaryEmailMap.forEach((entries, normalized) => {
  if (entries.length === 0) return;
  const { member } = entries[0];
  memberNameMap.set(normalized, buildMemberNameParts(member));
});

// Fallback to parent name fields (NameParent1/2) if not a member
function buildParentNameParts(member, parentKey) {
  const parentName = member[parentKey];
  if (hasValue(parentName)) {
    return {
      voornaam: String(parentName).trim(),
      tussenvoegsel: '',
      achternaam: ''
    };
  }

  // Ultimate fallback: "Ouder/verzorger van {child firstname}"
  const firstName = hasValue(member.FirstName) ? String(member.FirstName).trim() : '';
  const infix = hasValue(member.Infix) ? String(member.Infix).trim() : '';
  const lastName = hasValue(member.LastName) ? String(member.LastName).trim() : '';

  return {
    voornaam: `Ouder/verzorger van ${firstName}`.trim(),
    tussenvoegsel: infix,
    achternaam: lastName
  };
}

// When preparing parent entry, check memberNameMap first
const normalized = normalizeEmail(parentEmail);
const memberName = memberNameMap.get(normalized);
const parentName = memberName && (hasValue(memberName.voornaam) || hasValue(memberName.achternaam))
  ? memberName
  : buildParentNameParts(member, 'NameParent1');
```

**Name resolution priority:**
1. If parent email matches a member's primary email → use member's full name
2. Else if NameParent1/2 field present → use that value
3. Else fallback → "Ouder/verzorger van {child first name}"

### Pattern 4: ACF Relationship Field Format
**What:** ACF relationship fields accept/return array of post IDs via REST API
**When to use:** Linking parents to children in Stadion
**Example:**
```javascript
// Source: ACF REST API documentation
// POST/PUT to /wp/v2/person/{id}
{
  "acf": {
    "relationships": [123, 456, 789]  // Array of post IDs
  }
}

// For single relationship
{
  "acf": {
    "relationships": 123  // Single post ID (or single-item array)
  }
}

// To clear relationships
{
  "acf": {
    "relationships": null
  }
}
```

**Data type:** `int`, `array`, or `null`

**Sources:**
- [ACF WP REST API Integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/)
- [ACF Relationship](https://www.advancedcustomfields.com/resources/relationship/)

### Pattern 5: Bidirectional Relationship Updates
**What:** Update both parent→child and child→parent relationships to maintain bidirectional links
**When to use:** After syncing parent records to Stadion
**Example:**
```javascript
// Source: ACF Bidirectional Relationships documentation
// Approach 1: Manual bidirectional updates (2 API calls per relationship)
async function linkParentToChild(parentId, childId, options) {
  // 1. Update parent's "children" relationship field
  await stadionRequest(
    `wp/v2/person/${parentId}`,
    'POST',
    {
      acf: {
        children: [childId] // Add child to parent's relationships
      }
    },
    options
  );

  // 2. Update child's "parents" relationship field
  await stadionRequest(
    `wp/v2/person/${childId}`,
    'POST',
    {
      acf: {
        parents: [parentId] // Add parent to child's relationships
      }
    },
    options
  );
}

// Approach 2: ACF bidirectional setting (automatic, if enabled in Stadion)
// If "Bidirectional" is enabled on the relationship field in ACF settings,
// updating one side automatically updates the other. Only one API call needed.
async function linkParentToChild(parentId, childId, options) {
  // Update parent's "children" field
  // ACF automatically updates child's "parents" field
  await stadionRequest(
    `wp/v2/person/${parentId}`,
    'POST',
    {
      acf: {
        children: [childId]
      }
    },
    options
  );
}
```

**Key decision:** Check if Stadion has ACF bidirectional setting enabled. If yes, use single-sided updates. If no, manually update both sides.

**Sources:**
- [ACF Bidirectional Relationships](https://www.advancedcustomfields.com/resources/bidirectional-relationships/)
- ACF 6.2+ includes native bidirectional support

### Pattern 6: Merge Multiple Phone Numbers from Children
**What:** Collect all phone numbers from different child records, merge into parent's contact_info repeater
**When to use:** Parent has multiple phone numbers from different children's parent phone fields
**Example:**
```javascript
// Source: User decision from CONTEXT.md + prepare-stadion-members.js buildContactInfo pattern
function buildParentContactInfo(parentPhones, parentEmail) {
  const contacts = [];

  // Email (single, from deduplication key)
  if (parentEmail) {
    contacts.push({ type: 'email', value: parentEmail });
  }

  // Phones (multiple, deduplicated)
  const uniquePhones = Array.from(new Set(parentPhones)); // Deduplicate
  uniquePhones.forEach((phone) => {
    if (phone) {
      contacts.push({ type: 'phone', value: phone });
    }
  });

  return contacts;
}
```

**Key insight:** Stadion ACF contact_info is a repeater, so multiple phone entries are allowed. Don't pick one—include all unique phones.

### Pattern 7: Hash-Based Change Detection for Parents
**What:** Compute hash of parent data (email + fields), skip sync if hash matches last synced hash
**When to use:** Before syncing each parent to Stadion
**Example:**
```javascript
// Source: lib/stadion-db.js computeSourceHash pattern
const { computeSourceHash } = require('./lib/stadion-db');

// For parents, use email as stable identifier (no KNVB ID)
function computeParentHash(email, parentData) {
  const payload = stableStringify({ email: email, data: parentData || {} });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// In stadion-db.js, add parent-specific tracking table
function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stadion_parents (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      stadion_id INTEGER,
      data_json TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_synced_at TEXT,
      last_synced_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stadion_parents_hash
      ON stadion_parents (source_hash, last_synced_hash);
  `);
}
```

**Key difference from members:** Parents use email as primary key (not KNVB ID). Hash includes email + all parent fields.

### Pattern 8: Delete Orphan Parents
**What:** Remove parent records that no longer have any linked children in Sportlink
**When to use:** After syncing all parents, identify orphans and delete from Stadion
**Example:**
```javascript
// Source: submit-stadion-sync.js deleteRemovedMembers pattern (lines 161-196)
async function deleteOrphanParents(db, currentParentEmails, options) {
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});
  const deleted = [];
  const errors = [];

  // Find parents in DB but not in current Sportlink data
  const toDelete = getParentsNotInList(db, currentParentEmails);

  for (const parent of toDelete) {
    if (!parent.stadion_id) {
      // Never synced to Stadion, just remove from tracking
      deleteParent(db, parent.email);
      continue;
    }

    logVerbose(`Deleting orphan parent: ${parent.email}`);
    try {
      await stadionRequest(
        `wp/v2/person/${parent.stadion_id}`,
        'DELETE',
        null,
        options
      );
      deleteParent(db, parent.email);
      deleted.push({ email: parent.email, stadion_id: parent.stadion_id });
    } catch (error) {
      errors.push({ email: parent.email, message: error.message });
    }

    // Rate limit
    await sleep(2000);
  }

  return { deleted, errors };
}
```

**Key insight:** Orphan detection requires tracking which parents appeared in current Sportlink run. If parent exists in DB but not in current run's parentNamesMap, they're an orphan.

### Pattern 9: Preserve Existing Manual Relationships
**What:** Don't remove existing relationships from Stadion—only add new ones from Sportlink
**When to use:** When updating relationship fields via API
**Example:**
```javascript
// Source: User decision from CONTEXT.md
async function addParentChildRelationship(parentId, childId, options) {
  // 1. Fetch existing parent record to get current relationships
  const existing = await stadionRequest(
    `wp/v2/person/${parentId}`,
    'GET',
    null,
    options
  );

  const currentChildren = existing.body.acf?.children || [];

  // 2. Merge new child with existing children (deduplicate)
  const updatedChildren = Array.from(new Set([...currentChildren, childId]));

  // 3. Update parent with merged relationships
  await stadionRequest(
    `wp/v2/person/${parentId}`,
    'POST',
    {
      acf: {
        children: updatedChildren
      }
    },
    options
  );
}
```

**Key insight:** Always GET existing relationships, merge with new ones, then PUT merged array. Never replace entire relationship array with only Sportlink-derived links.

### Anti-Patterns to Avoid
- **Duplicate deduplication logic:** Don't copy normalizeEmail() and parent Maps into prepare-stadion-parents.js—extract to shared module
- **Phone-only matching:** Don't match parents by phone number alone—use email (phones have formatting variations)
- **Process parents before children:** Don't sync parents first—children must exist to create relationships
- **Overwrite manual relationships:** Don't replace relationship arrays—merge new with existing
- **Skip change detection:** Don't sync all parents every run—use hash comparison to skip unchanged

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email normalization | Custom toLowerCase + trim | Extract `normalizeEmail()` from prepare-laposta-members.js | Already handles null/undefined, proven in production |
| Parent deduplication | Custom loop with conditionals | Extract Map-based pattern from prepare-laposta-members.js | Handles multiple children per parent, proven logic |
| Hash computation | Custom MD5/checksum | `computeSourceHash()` from stadion-db.js | Already handles stable serialization |
| Bidirectional relationships | Custom API calls | ACF bidirectional setting (if available) | Automatic, one API call instead of two |
| Phone deduplication | String comparison loops | `new Set(phones)` | Built-in JavaScript Set deduplicates automatically |

**Key insight:** Laposta parent deduplication is battle-tested and solves the same problem. Extract to shared module rather than reimplementing.

## Common Pitfalls

### Pitfall 1: Normalized Email Mismatch Across Systems
**What goes wrong:** Parent created with different email normalization than Laposta, causing duplicates
**Why it happens:** Implementing normalization differently in Stadion vs Laposta code
**How to avoid:** Use single shared `normalizeEmail()` function for both systems
**Warning signs:** Same parent appears as two separate records in Stadion

### Pitfall 2: Parent Name Conflicts Not Resolved
**What goes wrong:** Parent appears with different names across children, sync creates duplicate records
**Why it happens:** Not implementing "first wins" strategy for name conflicts
**How to avoid:** Use memberNameMap pattern from Laposta (first occurrence of email sets the name)
**Warning signs:** Multiple parent records with same email but different names in Stadion

### Pitfall 3: Relationship Field Format Wrong
**What goes wrong:** Relationship field not saving, or error from Stadion API
**Why it happens:** Sending `{children: {id: 123}}` instead of `{children: [123]}`
**How to avoid:** Always use array format for relationship fields, even for single value
**Warning signs:** API returns 200 OK but relationships field empty on GET

### Pitfall 4: ACF Field Group Not Exposed to REST API
**What goes wrong:** POST/PUT succeeds but relationship field not saved
**Why it happens:** ACF field group has "Show in REST API" disabled (default)
**How to avoid:** Verify relationship field group has REST API enabled in Stadion ACF settings
**Warning signs:** API returns 200 OK but `acf.children` missing from GET response

**Source:** [ACF WP REST API Integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/) - "By default, field groups are not visible in the WP REST API. You must opt-in."

### Pitfall 5: Overwriting Manual Relationships
**What goes wrong:** Manually added relationships disappear after sync
**Why it happens:** Replacing entire relationship array with only Sportlink-derived links
**How to avoid:** Always GET existing relationships, merge with new ones, then PUT merged array
**Warning signs:** Users report losing manually created parent-child links after sync runs

### Pitfall 6: Processing Parents Before Children Sync
**What goes wrong:** Cannot create parent→child relationship because child post ID doesn't exist yet
**Why it happens:** Syncing parents before syncing children (wrong order)
**How to avoid:** Process children first (Phase 6), then parents (Phase 7), ensuring children exist
**Warning signs:** Parent sync errors "Post ID {id} does not exist" when setting relationships

### Pitfall 7: Not Skipping Parents Without Email or Phone
**What goes wrong:** Parent record created with no contact info, impossible to deduplicate
**Why it happens:** Not validating parent has at least email OR phone before creating record
**How to avoid:** Skip parents where `!email && !phone` (can't dedupe reliably)
**Warning signs:** Parent records with title "Ouder/verzorger van X" but no contact info

**Source:** User decision from CONTEXT.md - "Skip parents with no email AND no phone — can't dedupe reliably"

## Code Examples

Verified patterns from existing codebase:

### Email Normalization (Extract to Shared Module)
```javascript
// Source: prepare-laposta-members.js lines 51-59
function normalizeEmail(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.includes('@');
}
```

### Parent Deduplication Maps (Reuse in Stadion)
```javascript
// Source: prepare-laposta-members.js lines 359-395
const parentNamesMap = new Map();
const parentPhonesMap = new Map();

members.forEach((member) => {
  const childName = buildChildFullName(member);

  ['EmailAddressParent1', 'EmailAddressParent2'].forEach((emailField, index) => {
    const emailValue = member[emailField];
    if (!isValidEmail(emailValue)) return;

    const normalized = normalizeEmail(emailValue);

    // Track child names
    if (!parentNamesMap.has(normalized)) {
      parentNamesMap.set(normalized, []);
    }
    if (childName && !parentNamesMap.get(normalized).includes(childName)) {
      parentNamesMap.get(normalized).push(childName);
    }

    // Track phone numbers
    const phoneField = index === 0 ? 'TelephoneParent1' : 'TelephoneParent2';
    if (!parentPhonesMap.has(normalized)) {
      parentPhonesMap.set(normalized, new Set());
    }
    if (member[phoneField]) {
      parentPhonesMap.get(normalized).add(member[phoneField].trim());
    }
  });
});
```

### ACF Relationship Field Update
```javascript
// Source: ACF REST API documentation + prepare-stadion-members.js patterns
async function updateParentChildRelationship(parentId, childId, options) {
  // Fetch existing relationships
  const existing = await stadionRequest(
    `wp/v2/person/${parentId}`,
    'GET',
    null,
    options
  );

  const currentChildren = existing.body.acf?.children || [];
  const updatedChildren = Array.from(new Set([...currentChildren, childId]));

  // Update with merged relationships
  await stadionRequest(
    `wp/v2/person/${parentId}`,
    'POST',
    {
      acf: {
        children: updatedChildren
      }
    },
    options
  );
}
```

### Parent Contact Info with Multiple Phones
```javascript
// Source: prepare-stadion-members.js buildContactInfo pattern (lines 38-48)
function buildParentContactInfo(parentEmail, parentPhones) {
  const contacts = [];

  if (parentEmail) {
    contacts.push({ type: 'email', value: parentEmail });
  }

  // Deduplicate phones and add all
  const uniquePhones = Array.from(new Set(parentPhones));
  uniquePhones.forEach((phone) => {
    if (phone) {
      contacts.push({ type: 'phone', value: phone });
    }
  });

  return contacts; // May have multiple phone entries
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No parent sync | Parents as separate persons | Phase 7 (2026-01-25) | Parents become queryable, linkable entities |
| Parent fields on child record | Bidirectional relationships | Phase 7 (2026-01-25) | Can query children from parent, parent from child |
| Manual bidirectional linking | ACF bidirectional setting | ACF 6.2 (2023) | One API call instead of two for relationships |
| Timestamp comparison | Hash-based change detection | Existing pattern | Detects any field change, more reliable |

**Deprecated/outdated:**
- **Parent fields on child records only:** Stadion will have separate parent persons with bidirectional links
- **Phone number as single value:** Contact_info repeater supports multiple phones per person

## Open Questions

Things that couldn't be fully resolved:

1. **ACF Bidirectional Setting Availability**
   - What we know: ACF 6.2+ supports bidirectional relationships via field setting
   - What's unclear: Does Stadion instance have ACF 6.2+? Is bidirectional enabled on relationship fields?
   - Recommendation: Attempt single-sided update first; if child's `parents` field doesn't auto-update, fall back to manual bidirectional updates

2. **Relationship Field Names in Stadion**
   - What we know: Need to link parents to children via ACF relationship field
   - What's unclear: Exact field names (`children`/`parents`? `relationships`? something else?)
   - Recommendation: Inspect Stadion ACF field configuration or query sample person record to identify field names

3. **isParent Custom Field Format**
   - What we know: User will add `isParent` custom field to Stadion before sync
   - What's unclear: Field type (boolean? text? checkbox?), exact field name
   - Recommendation: Assume boolean `true/false`, verify field name via Stadion ACF settings

4. **Parent Address Inheritance**
   - What we know: Context says "address (from child record)"
   - What's unclear: If parent has multiple children with different addresses, which address to use?
   - Recommendation: Use address from first child encountered (first-wins pattern), or leave empty if children have conflicting addresses

## Sources

### Primary (HIGH confidence)
- Codebase: `prepare-laposta-members.js` lines 51-59, 86-105, 327-395 - Email normalization and parent deduplication patterns
- Codebase: `lib/stadion-db.js` - Hash computation and state tracking patterns
- Codebase: `prepare-stadion-members.js` buildContactInfo pattern - ACF repeater structure
- [ACF WP REST API Integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/) - Relationship field format
- [ACF Relationship](https://www.advancedcustomfields.com/resources/relationship/) - Return values and data types

### Secondary (MEDIUM confidence)
- [ACF Bidirectional Relationships](https://www.advancedcustomfields.com/resources/bidirectional-relationships/) - Native bidirectional support in ACF 6.2+
- [Best Practices for Normalizing Emails Before Hashing](https://www.narrative.io/knowledge-base/how-to-guides/how-to-normalize-emails-prior-to-hashing) - Email normalization patterns
- [How to Normalize Email Addresses to prevent duplicate accounts](https://www.usercheck.com/guides/how-to-normalize-email-addresses) - Email deduplication best practices

### Tertiary (LOW confidence)
- None - All findings verified with codebase or official ACF documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Reuses existing libraries (better-sqlite3, stadion-client, stadion-db patterns)
- Architecture: MEDIUM - Parent deduplication pattern proven in Laposta, but relationship field details need verification
- Pitfalls: MEDIUM - ACF REST API behaviors documented, but bidirectional setting availability uncertain

**Research date:** 2026-01-25
**Valid until:** 30 days (stable domain - parent sync patterns unlikely to change)

**Coverage of requirements:**
- STAD-13 (create parent record): Covered - transformation and API patterns identified
- STAD-14 (deduplicate parents): Covered - Laposta pattern extraction identified
- STAD-15 (link via relationships): Covered - ACF relationship field format documented, bidirectional pattern identified

**Gaps requiring planning decisions:**
- Exact ACF field names in Stadion (children/parents vs relationships)
- Whether to use ACF bidirectional setting or manual updates (depends on Stadion ACF version)
- Address resolution when parent has multiple children with different addresses
- Shared module structure for parent-dedupe.js (what functions to export)
