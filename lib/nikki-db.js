const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'nikki-sync.sqlite');

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
 * Compute SHA-256 hash of contribution data for change detection.
 */
function computeContributionHash(knvbId, year, nikkiId, saldo, hoofdsom, status) {
  const payload = stableStringify({
    knvb_id: knvbId,
    year: year,
    nikki_id: nikkiId,
    saldo: saldo,
    hoofdsom: hoofdsom,
    status: status
  });
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
    CREATE TABLE IF NOT EXISTS nikki_contributions (
      id INTEGER PRIMARY KEY,
      knvb_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      nikki_id TEXT NOT NULL,
      saldo REAL,
      hoofdsom REAL,
      status TEXT,
      source_hash TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(knvb_id, year)
    );

    CREATE INDEX IF NOT EXISTS idx_nikki_contributions_knvb_id
      ON nikki_contributions (knvb_id);

    CREATE INDEX IF NOT EXISTS idx_nikki_contributions_year
      ON nikki_contributions (year);

    CREATE INDEX IF NOT EXISTS idx_nikki_contributions_saldo
      ON nikki_contributions (saldo);
  `);

  // Migration: add hoofdsom column if it doesn't exist
  try {
    db.exec('ALTER TABLE nikki_contributions ADD COLUMN hoofdsom REAL');
  } catch (e) {
    // Column already exists, ignore
  }
}

/**
 * Insert or update contribution records in bulk.
 * Each contribution: { knvb_id, year, nikki_id, saldo, hoofdsom, status }
 */
function upsertContributions(db, contributions) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO nikki_contributions (
      knvb_id,
      year,
      nikki_id,
      saldo,
      hoofdsom,
      status,
      source_hash,
      last_seen_at,
      created_at
    )
    VALUES (
      @knvb_id,
      @year,
      @nikki_id,
      @saldo,
      @hoofdsom,
      @status,
      @source_hash,
      @last_seen_at,
      @created_at
    )
    ON CONFLICT(knvb_id, year) DO UPDATE SET
      nikki_id = excluded.nikki_id,
      saldo = excluded.saldo,
      hoofdsom = excluded.hoofdsom,
      status = excluded.status,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = contributions.map((contrib) => ({
    knvb_id: contrib.knvb_id,
    year: contrib.year,
    nikki_id: contrib.nikki_id,
    saldo: contrib.saldo,
    hoofdsom: contrib.hoofdsom ?? null,
    status: contrib.status || null,
    source_hash: computeContributionHash(
      contrib.knvb_id,
      contrib.year,
      contrib.nikki_id,
      contrib.saldo,
      contrib.hoofdsom,
      contrib.status
    ),
    last_seen_at: now,
    created_at: now
  }));

  insertMany(rows);
}

/**
 * Get contributions by KNVB ID.
 * Returns: [{ knvb_id, year, nikki_id, saldo, hoofdsom, status }]
 */
function getContributionsByKnvbId(db, knvbId) {
  const stmt = db.prepare(`
    SELECT knvb_id, year, nikki_id, saldo, hoofdsom, status
    FROM nikki_contributions
    WHERE knvb_id = ?
    ORDER BY year DESC
  `);
  return stmt.all(knvbId);
}

/**
 * Get contributions by year.
 * Returns: [{ knvb_id, year, nikki_id, saldo, hoofdsom, status }]
 */
function getContributionsByYear(db, year) {
  const stmt = db.prepare(`
    SELECT knvb_id, year, nikki_id, saldo, hoofdsom, status
    FROM nikki_contributions
    WHERE year = ?
    ORDER BY knvb_id ASC
  `);
  return stmt.all(year);
}

/**
 * Get all contributions.
 * Returns: [{ knvb_id, year, nikki_id, saldo, hoofdsom, status }]
 */
function getAllContributions(db) {
  const stmt = db.prepare(`
    SELECT knvb_id, year, nikki_id, saldo, hoofdsom, status
    FROM nikki_contributions
    ORDER BY year DESC, knvb_id ASC
  `);
  return stmt.all();
}

/**
 * Get members with outstanding balance (saldo > 0).
 * Returns: [{ knvb_id, year, nikki_id, saldo, hoofdsom, status }]
 */
function getMembersWithOutstandingBalance(db) {
  const stmt = db.prepare(`
    SELECT knvb_id, year, nikki_id, saldo, hoofdsom, status
    FROM nikki_contributions
    WHERE saldo > 0
    ORDER BY saldo DESC, year DESC
  `);
  return stmt.all();
}

/**
 * Get all contributions grouped by KNVB ID.
 * Returns: Map<knvb_id, [{ year, nikki_id, saldo, hoofdsom, status }]>
 */
function getContributionsGroupedByMember(db) {
  const stmt = db.prepare(`
    SELECT knvb_id, year, nikki_id, saldo, hoofdsom, status
    FROM nikki_contributions
    ORDER BY knvb_id ASC, year DESC
  `);
  const rows = stmt.all();

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.knvb_id)) {
      grouped.set(row.knvb_id, []);
    }
    grouped.get(row.knvb_id).push({
      year: row.year,
      nikki_id: row.nikki_id,
      saldo: row.saldo,
      hoofdsom: row.hoofdsom,
      status: row.status
    });
  }

  return grouped;
}

/**
 * Get unique KNVB IDs from contributions.
 */
function getUniqueKnvbIds(db) {
  const stmt = db.prepare(`
    SELECT DISTINCT knvb_id
    FROM nikki_contributions
    ORDER BY knvb_id ASC
  `);
  return stmt.all().map(row => row.knvb_id);
}

/**
 * Get contribution count.
 */
function getContributionCount(db) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM nikki_contributions');
  return stmt.get().count;
}

/**
 * Delete all contributions (for fresh import).
 */
function clearContributions(db) {
  db.exec('DELETE FROM nikki_contributions');
}

module.exports = {
  DEFAULT_DB_PATH,
  openDb,
  initDb,
  stableStringify,
  computeContributionHash,
  upsertContributions,
  getContributionsByKnvbId,
  getContributionsByYear,
  getAllContributions,
  getMembersWithOutstandingBalance,
  getContributionsGroupedByMember,
  getUniqueKnvbIds,
  getContributionCount,
  clearContributions
};
