require('varlock/auto-load');

const { stadionRequest } = require('./lib/stadion-client');
const { runPrepare } = require('./prepare-stadion-members');
const { runPrepare: runPrepareParents } = require('./prepare-stadion-parents');
const {
  openDb,
  upsertMembers,
  getMembersNeedingSync,
  updateSyncState,
  deleteMember,
  getMembersNotInList,
  getAllTrackedMembers,
  upsertParents,
  getParentsNeedingSync,
  updateParentSyncState,
  deleteParent,
  getParentsNotInList
} = require('./lib/stadion-db');

function readEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

const PERSON_TYPE = readEnv('STADION_PERSON_TYPE', 'person');

/**
 * Helper for rate limiting between API requests
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find existing person in Stadion by KNVB ID first, then email fallback
 * Email fallback uses client-side filtering of ACF contact_info field
 * @param {string} knvbId - KNVB ID (relatiecode)
 * @param {string} email - Email address
 * @param {Object} options - Logger and verbose options
 * @returns {Promise<Object|null>} - WordPress person object or null
 */
async function findExistingPerson(knvbId, email, options) {
  const { logger, verbose } = options;
  const logVerbose = logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {});

  // Try KNVB ID match first (meta query)
  if (knvbId) {
    try {
      const response = await stadionRequest(
        `wp/v2/${PERSON_TYPE}?meta_key=knvb_id&meta_value=${encodeURIComponent(knvbId)}`,
        'GET',
        null,
        options
      );
      if (response.body && response.body.length > 0) {
        logVerbose(`Matched by KNVB ID: ${knvbId}`);
        return response.body[0];
      }
    } catch (error) {
      logVerbose(`KNVB ID search failed: ${error.message}`);
    }
  }

  // Fallback: email match with client-side filtering
  // WordPress search won't find ACF contact_info fields, so we:
  // 1. Search by email as general search term (may match title/content)
  // 2. Fetch results and filter client-side for actual ACF email match
  if (email) {
    try {
      // Use general search - will match if email appears in any indexed field
      const response = await stadionRequest(
        `wp/v2/${PERSON_TYPE}?search=${encodeURIComponent(email)}&per_page=20`,
        'GET',
        null,
        options
      );
      if (response.body && response.body.length > 0) {
        // Client-side filter: check ACF contact_info for exact email match
        for (const person of response.body) {
          const contactInfo = person.acf?.contact_info || [];
          const hasEmail = contactInfo.some(c =>
            c.type === 'email' && c.value?.toLowerCase() === email.toLowerCase()
          );
          if (hasEmail) {
            logVerbose(`Matched by email (client-side filter): ${email}`);
            return person;
          }
        }
      }

      // If search didn't find it, try fetching recent persons and filtering
      // This handles case where email isn't in indexed fields
      logVerbose(`Email not in search results, checking recent persons...`);
      const recentResponse = await stadionRequest(
        `wp/v2/${PERSON_TYPE}?per_page=100&orderby=modified&order=desc`,
        'GET',
        null,
        options
      );
      if (recentResponse.body && recentResponse.body.length > 0) {
        for (const person of recentResponse.body) {
          const contactInfo = person.acf?.contact_info || [];
          const hasEmail = contactInfo.some(c =>
            c.type === 'email' && c.value?.toLowerCase() === email.toLowerCase()
          );
          if (hasEmail) {
            logVerbose(`Matched by email (recent persons scan): ${email}`);
            return person;
          }
        }
      }
    } catch (error) {
      logVerbose(`Email search failed: ${error.message}`);
    }
  }

  return null; // No match found
}

/**
 * Sync a single member to Stadion (create or update)
 * @param {Object} member - Member record from database
 * @param {Object} db - SQLite database connection
 * @param {Object} options - Logger and verbose options
 * @returns {Promise<{action: string, id: number}>}
 */
async function syncPerson(member, db, options) {
  const { knvb_id, email, data, source_hash } = member;
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});

  const existing = await findExistingPerson(knvb_id, email, options);

  if (existing) {
    // UPDATE existing person
    // Backfill KNVB ID if matched by email and missing
    if (!existing.meta?.knvb_id && knvb_id) {
      data.meta.knvb_id = knvb_id;
    }

    const response = await stadionRequest(
      `wp/v2/${PERSON_TYPE}/${existing.id}`,
      'POST', // WordPress uses POST for updates too (with ID in URL)
      data,
      options
    );
    updateSyncState(db, knvb_id, source_hash, existing.id);
    return { action: 'updated', id: existing.id };
  } else {
    // CREATE new person
    const response = await stadionRequest(
      `wp/v2/${PERSON_TYPE}`,
      'POST',
      data,
      options
    );
    const newId = response.body.id;
    updateSyncState(db, knvb_id, source_hash, newId);
    return { action: 'created', id: newId };
  }
}

/**
 * Find existing parent in Stadion by email
 * Uses same email matching approach as member fallback
 * @param {string} email - Parent email address
 * @param {Object} options - Logger and verbose options
 * @returns {Promise<Object|null>} - WordPress person object or null
 */
async function findExistingParent(email, options) {
  const { logger, verbose } = options;
  const logVerbose = logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {});

  if (!email) return null;

  try {
    // Search by email
    const response = await stadionRequest(
      `wp/v2/${PERSON_TYPE}?search=${encodeURIComponent(email)}&per_page=20`,
      'GET',
      null,
      options
    );

    if (response.body && response.body.length > 0) {
      // Client-side filter for exact ACF email match
      for (const person of response.body) {
        const contactInfo = person.acf?.contact_info || [];
        const hasEmail = contactInfo.some(c =>
          c.type === 'email' && c.value?.toLowerCase() === email.toLowerCase()
        );
        if (hasEmail) {
          logVerbose(`Parent matched by email: ${email}`);
          return person;
        }
      }
    }

    // Fallback: check recent persons
    logVerbose(`Parent email not in search results, checking recent persons...`);
    const recentResponse = await stadionRequest(
      `wp/v2/${PERSON_TYPE}?per_page=100&orderby=modified&order=desc`,
      'GET',
      null,
      options
    );

    if (recentResponse.body && recentResponse.body.length > 0) {
      for (const person of recentResponse.body) {
        const contactInfo = person.acf?.contact_info || [];
        const hasEmail = contactInfo.some(c =>
          c.type === 'email' && c.value?.toLowerCase() === email.toLowerCase()
        );
        if (hasEmail) {
          logVerbose(`Parent matched by email (recent scan): ${email}`);
          return person;
        }
      }
    }
  } catch (error) {
    logVerbose(`Parent email search failed: ${error.message}`);
  }

  return null;
}

/**
 * Update children's parents relationship field (bidirectional linking)
 * Preserves existing parent links, adds new one
 */
async function updateChildrenParentLinks(parentId, childStadionIds, options) {
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});

  for (const childId of childStadionIds) {
    try {
      // Get existing child record
      const childResponse = await stadionRequest(
        `wp/v2/${PERSON_TYPE}/${childId}`,
        'GET',
        null,
        options
      );

      const existingParents = childResponse.body.acf?.parents || [];
      if (!existingParents.includes(parentId)) {
        const mergedParents = [...existingParents, parentId];
        await stadionRequest(
          `wp/v2/${PERSON_TYPE}/${childId}`,
          'POST',
          { acf: { parents: mergedParents } },
          options
        );
        logVerbose(`Linked parent ${parentId} to child ${childId}`);
      }
    } catch (error) {
      logVerbose(`Failed to link parent to child ${childId}: ${error.message}`);
      // Continue with other children
    }

    await sleep(1000); // Rate limit
  }
}

/**
 * Sync a single parent to Stadion (create or update)
 * Also links parent to children via relationships field
 * @param {Object} parent - Parent record from preparation
 * @param {Object} db - SQLite database connection
 * @param {Map} knvbIdToStadionId - Map of KNVB ID to Stadion post ID for children
 * @param {Object} options - Logger and verbose options
 * @returns {Promise<{action: string, id: number}>}
 */
async function syncParent(parent, db, knvbIdToStadionId, options) {
  const { email, childKnvbIds, data, source_hash } = parent;
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});

  // Resolve child KNVB IDs to Stadion post IDs
  const childStadionIds = childKnvbIds
    .map(knvbId => knvbIdToStadionId.get(knvbId))
    .filter(Boolean);

  const existing = await findExistingParent(email, options);

  if (existing) {
    // UPDATE existing parent
    // Merge existing children relationships with new ones (preserve manual links)
    const existingChildren = existing.acf?.children || [];
    const mergedChildren = Array.from(new Set([...existingChildren, ...childStadionIds]));

    // Add children to ACF data
    const updateData = {
      ...data,
      acf: {
        ...data.acf,
        children: mergedChildren
      }
    };

    const response = await stadionRequest(
      `wp/v2/${PERSON_TYPE}/${existing.id}`,
      'POST',
      updateData,
      options
    );
    updateParentSyncState(db, email, source_hash, existing.id);

    // Update children's parent relationship (bidirectional)
    await updateChildrenParentLinks(existing.id, childStadionIds, options);

    return { action: 'updated', id: existing.id };
  } else {
    // CREATE new parent
    const createData = {
      ...data,
      acf: {
        ...data.acf,
        children: childStadionIds
      }
    };

    const response = await stadionRequest(
      `wp/v2/${PERSON_TYPE}`,
      'POST',
      createData,
      options
    );
    const newId = response.body.id;
    updateParentSyncState(db, email, source_hash, newId);

    // Update children's parent relationship (bidirectional)
    await updateChildrenParentLinks(newId, childStadionIds, options);

    return { action: 'created', id: newId };
  }
}

/**
 * Delete parents that no longer have children in Sportlink
 */
async function deleteOrphanParents(db, currentParentEmails, options) {
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});
  const deleted = [];
  const errors = [];

  const toDelete = getParentsNotInList(db, currentParentEmails);

  for (const parent of toDelete) {
    if (!parent.stadion_id) {
      deleteParent(db, parent.email);
      continue;
    }

    logVerbose(`Deleting orphan parent: ${parent.email}`);
    try {
      await stadionRequest(
        `wp/v2/${PERSON_TYPE}/${parent.stadion_id}`,
        'DELETE',
        null,
        options
      );
      deleteParent(db, parent.email);
      deleted.push({ email: parent.email, stadion_id: parent.stadion_id });
    } catch (error) {
      errors.push({ email: parent.email, message: error.message });
    }

    await sleep(2000);
  }

  return { deleted, errors };
}

/**
 * Sync parents to Stadion
 * @param {Object} db - SQLite database connection
 * @param {Map} knvbIdToStadionId - Map of member KNVB ID to Stadion post ID
 * @param {Object} options - Logger, verbose, force options
 * @returns {Promise<Object>} - Parent sync result
 */
async function syncParents(db, knvbIdToStadionId, options = {}) {
  const { logger, verbose = false, force = false } = options;
  const logVerbose = logger?.verbose.bind(logger) || (verbose ? console.log : () => {});

  const result = {
    total: 0,
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    errors: []
  };

  // Prepare parents from Sportlink
  const prepared = await runPrepareParents({ logger, verbose });
  if (!prepared.success) {
    result.errors.push({ message: prepared.error });
    return result;
  }

  const parents = prepared.parents;
  result.total = parents.length;

  // Upsert to tracking database
  upsertParents(db, parents);

  // Get parents needing sync
  const needsSync = getParentsNeedingSync(db, force);
  result.skipped = result.total - needsSync.length;

  logVerbose(`${needsSync.length} parents need sync (${result.skipped} unchanged)`);

  // Sync each parent
  for (let i = 0; i < needsSync.length; i++) {
    const parent = needsSync[i];
    logVerbose(`Syncing parent ${i + 1}/${needsSync.length}: ${parent.email}`);

    try {
      const syncResult = await syncParent(parent, db, knvbIdToStadionId, options);
      result.synced++;
      if (syncResult.action === 'created') result.created++;
      if (syncResult.action === 'updated') result.updated++;
    } catch (error) {
      result.errors.push({ email: parent.email, message: error.message });
    }

    if (i < needsSync.length - 1) {
      await sleep(2000);
    }
  }

  // Delete orphan parents
  const currentEmails = parents.map(p => p.email);
  const deleteResult = await deleteOrphanParents(db, currentEmails, options);
  result.deleted = deleteResult.deleted.length;
  result.errors.push(...deleteResult.errors);

  return result;
}

/**
 * Delete members that were removed from Sportlink
 * @param {Object} db - SQLite database connection
 * @param {Array<string>} currentKnvbIds - Current KNVB IDs from Sportlink
 * @param {Object} options - Logger and verbose options
 * @returns {Promise<{deleted: Array, errors: Array}>}
 */
async function deleteRemovedMembers(db, currentKnvbIds, options) {
  const logVerbose = options.logger?.verbose.bind(options.logger) || (options.verbose ? console.log : () => {});
  const deleted = [];
  const errors = [];

  // Find members in DB but not in current Sportlink data
  const toDelete = getMembersNotInList(db, currentKnvbIds);

  for (const member of toDelete) {
    if (!member.stadion_id) {
      // Never synced to Stadion, just remove from tracking
      deleteMember(db, member.knvb_id);
      continue;
    }

    logVerbose(`Deleting from Stadion: ${member.knvb_id}`);
    try {
      await stadionRequest(
        `wp/v2/${PERSON_TYPE}/${member.stadion_id}`,
        'DELETE',
        null,
        options
      );
      deleteMember(db, member.knvb_id);
      deleted.push({ knvb_id: member.knvb_id, stadion_id: member.stadion_id });
    } catch (error) {
      errors.push({ knvb_id: member.knvb_id, message: error.message });
    }

    // Rate limit
    await sleep(2000);
  }

  return { deleted, errors };
}

/**
 * Main sync orchestration
 * @param {Object} options
 * @param {Object} [options.logger] - Logger instance
 * @param {boolean} [options.verbose=false] - Verbose mode
 * @param {boolean} [options.force=false] - Force sync all members
 * @param {boolean} [options.includeMembers=true] - Include member sync
 * @param {boolean} [options.includeParents=true] - Include parent sync
 * @returns {Promise<Object>} - Sync result
 */
async function runSync(options = {}) {
  const { logger, verbose = false, force = false, includeMembers = true, includeParents = true } = options;
  const logVerbose = logger?.verbose.bind(logger) || (verbose ? console.log : () => {});
  const logError = logger?.error.bind(logger) || console.error;

  const result = {
    success: true,
    total: 0,
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    errors: []
  };

  try {
    const db = openDb();
    try {
      // Members sync
      if (includeMembers) {
        // Step 1: Prepare members from Sportlink
        const prepared = await runPrepare({ logger, verbose });
        if (!prepared.success) {
          result.success = false;
          result.error = prepared.error;
          return result;
        }

        const members = prepared.members;
        result.total = members.length;

        // Step 2: Upsert to tracking database
        upsertMembers(db, members);

        // Step 3: Get members needing sync (hash changed or force)
        const needsSync = getMembersNeedingSync(db, force);
        result.skipped = result.total - needsSync.length;

        logVerbose(`${needsSync.length} members need sync (${result.skipped} unchanged)`);

        // Step 4: Sync each member
        for (let i = 0; i < needsSync.length; i++) {
          const member = needsSync[i];
          logVerbose(`Syncing ${i + 1}/${needsSync.length}: ${member.knvb_id}`);

          try {
            const syncResult = await syncPerson(member, db, options);
            result.synced++;
            if (syncResult.action === 'created') result.created++;
            if (syncResult.action === 'updated') result.updated++;
          } catch (error) {
            result.errors.push({
              knvb_id: member.knvb_id,
              email: member.email,
              message: error.message
            });
          }

          // Rate limit: 2 seconds between requests
          if (i < needsSync.length - 1) {
            await sleep(2000);
          }
        }

        // Step 5: Delete members removed from Sportlink
        const currentKnvbIds = members.map(m => m.knvb_id);
        const deleteResult = await deleteRemovedMembers(db, currentKnvbIds, options);
        result.deleted = deleteResult.deleted.length;
        result.errors.push(...deleteResult.errors);
      }

      // Parents sync
      if (includeParents) {
        // Build KNVB ID to Stadion ID mapping from ALL tracked members
        // IMPORTANT: Use getAllTrackedMembers() not getMembersNeedingSync() because we need
        // ALL synced members (including those from previous runs) for parent-child linking
        const knvbIdToStadionId = new Map();
        const allMembers = getAllTrackedMembers(db);
        allMembers.forEach(m => {
          if (m.knvb_id && m.stadion_id) {
            knvbIdToStadionId.set(m.knvb_id, m.stadion_id);
          }
        });

        logVerbose('Starting parent sync...');
        const parentResult = await syncParents(db, knvbIdToStadionId, options);
        result.parents = parentResult;
      }

    } finally {
      db.close();
    }

    result.success = result.errors.length === 0;
    return result;

  } catch (error) {
    result.success = false;
    result.error = error.message;
    logError(`Sync error: ${error.message}`);
    return result;
  }
}

module.exports = { runSync };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');
  const force = process.argv.includes('--force');
  const parentsOnly = process.argv.includes('--parents-only');
  const skipParents = process.argv.includes('--skip-parents');

  const options = {
    verbose,
    force,
    includeMembers: !parentsOnly,
    includeParents: !skipParents
  };

  runSync(options)
    .then(result => {
      if (options.includeMembers) {
        console.log(`Stadion sync: ${result.synced}/${result.total} synced`);
        console.log(`  Created: ${result.created}`);
        console.log(`  Updated: ${result.updated}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Deleted: ${result.deleted}`);
      }
      if (result.parents) {
        console.log(`Parents: ${result.parents.synced}/${result.parents.total} synced`);
        console.log(`  Created: ${result.parents.created}`);
        console.log(`  Updated: ${result.parents.updated}`);
        console.log(`  Skipped: ${result.parents.skipped}`);
        console.log(`  Deleted: ${result.parents.deleted}`);
      }
      if (result.errors.length > 0) {
        console.error(`  Errors: ${result.errors.length}`);
        result.errors.forEach(e => console.error(`    - ${e.knvb_id || e.email}: ${e.message}`));
        process.exitCode = 1;
      }
      if (result.parents?.errors.length > 0) {
        console.error(`  Parent errors: ${result.parents.errors.length}`);
        result.parents.errors.forEach(e => console.error(`    - ${e.email}: ${e.message}`));
        process.exitCode = 1;
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exitCode = 1;
    });
}
