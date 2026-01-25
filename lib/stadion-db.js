const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'stadion-sync.sqlite');

/**
 * Deterministic JSON serialization for hash computation.
 * Ensures identical objects always produce the same string representation.
 */
function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compute SHA-256 hash of member data for change detection.
 * Uses KNVB ID as stable identifier (email can change).
 */
function computeSourceHash(knvbId, data) {
  const payload = stableStringify({ knvb_id: knvbId, data: data || {} });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Open database and initialize schema.
 */
function openDb(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  initDb(db);
  return db;
}

/**
 * Initialize database tables and indexes.
 */
function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stadion_members (
      id INTEGER PRIMARY KEY,
      knvb_id TEXT NOT NULL UNIQUE,
      stadion_id INTEGER,
      email TEXT,
      data_json TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_synced_at TEXT,
      last_synced_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stadion_members_hash
      ON stadion_members (source_hash, last_synced_hash);

    CREATE INDEX IF NOT EXISTS idx_stadion_members_email
      ON stadion_members (email);
  `);
}

/**
 * Insert or update member records in bulk.
 * Each member: { knvb_id, email, data }
 */
function upsertMembers(db, members) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO stadion_members (
      knvb_id,
      email,
      data_json,
      source_hash,
      last_seen_at,
      created_at
    )
    VALUES (
      @knvb_id,
      @email,
      @data_json,
      @source_hash,
      @last_seen_at,
      @created_at
    )
    ON CONFLICT(knvb_id) DO UPDATE SET
      email = excluded.email,
      data_json = excluded.data_json,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = members.map((member) => {
    const data = member.data || {};
    return {
      knvb_id: member.knvb_id,
      email: member.email || null,
      data_json: stableStringify(data),
      source_hash: computeSourceHash(member.knvb_id, data),
      last_seen_at: now,
      created_at: now
    };
  });

  insertMany(rows);
}

/**
 * Get members needing sync (source_hash != last_synced_hash).
 * If force=true, return all members regardless of sync state.
 * Returns: [{ knvb_id, email, data, source_hash, stadion_id }]
 */
function getMembersNeedingSync(db, force = false) {
  const stmt = force
    ? db.prepare(`
      SELECT knvb_id, email, data_json, source_hash, stadion_id
      FROM stadion_members
      ORDER BY knvb_id ASC
    `)
    : db.prepare(`
      SELECT knvb_id, email, data_json, source_hash, stadion_id
      FROM stadion_members
      WHERE last_synced_hash IS NULL OR last_synced_hash != source_hash
      ORDER BY knvb_id ASC
    `);

  return stmt.all().map((row) => ({
    knvb_id: row.knvb_id,
    email: row.email,
    data: JSON.parse(row.data_json),
    source_hash: row.source_hash,
    stadion_id: row.stadion_id
  }));
}

/**
 * Update sync state after successful sync to Stadion.
 * Stores WordPress post ID for future updates/deletes.
 */
function updateSyncState(db, knvbId, sourceHash, stadionId) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE stadion_members
    SET last_synced_at = ?, last_synced_hash = ?, stadion_id = ?
    WHERE knvb_id = ?
  `);
  stmt.run(now, sourceHash, stadionId || null, knvbId);
}

/**
 * Delete member from tracking table.
 */
function deleteMember(db, knvbId) {
  const stmt = db.prepare(`
    DELETE FROM stadion_members
    WHERE knvb_id = ?
  `);
  stmt.run(knvbId);
}

/**
 * Find tracked members not in provided list (for delete detection).
 * Returns members that exist in DB but not in knvbIds array.
 */
function getMembersNotInList(db, knvbIds) {
  if (!knvbIds || knvbIds.length === 0) {
    // All tracked members are "not in list" if list is empty
    const stmt = db.prepare(`
      SELECT knvb_id, email, stadion_id
      FROM stadion_members
      ORDER BY knvb_id ASC
    `);
    return stmt.all();
  }

  const placeholders = knvbIds.map(() => '?').join(', ');
  const stmt = db.prepare(`
    SELECT knvb_id, email, stadion_id
    FROM stadion_members
    WHERE knvb_id NOT IN (${placeholders})
    ORDER BY knvb_id ASC
  `);

  return stmt.all(...knvbIds);
}

module.exports = {
  DEFAULT_DB_PATH,
  openDb,
  initDb,
  stableStringify,
  computeSourceHash,
  upsertMembers,
  getMembersNeedingSync,
  updateSyncState,
  deleteMember,
  getMembersNotInList
};
