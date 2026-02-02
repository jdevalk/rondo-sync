const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'discipline-sync.sqlite');

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
 * Compute SHA-256 hash of discipline case data for change detection.
 */
function computeCaseHash(caseData) {
  const payload = stableStringify({
    dossier_id: caseData.DossierId,
    public_person_id: caseData.PublicPersonId,
    match_date: caseData.MatchDate,
    match_description: caseData.MatchDescription,
    team_name: caseData.TeamName,
    charge_codes: caseData.ChargeCodes,
    charge_description: caseData.ChargeDescription,
    sanction_description: caseData.SanctionDescription,
    processing_date: caseData.ProcessingDate,
    administrative_fee: caseData.AdministrativeFee,
    is_charged: caseData.IsCharged
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
    CREATE TABLE IF NOT EXISTS discipline_cases (
      id INTEGER PRIMARY KEY,
      dossier_id TEXT NOT NULL UNIQUE,
      public_person_id TEXT,
      match_date TEXT,
      match_description TEXT,
      team_name TEXT,
      charge_codes TEXT,
      charge_description TEXT,
      sanction_description TEXT,
      processing_date TEXT,
      administrative_fee REAL,
      is_charged INTEGER,
      source_hash TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discipline_cases_person
      ON discipline_cases (public_person_id);

    CREATE INDEX IF NOT EXISTS idx_discipline_cases_date
      ON discipline_cases (match_date);
  `);
}

/**
 * Insert or update discipline case records in bulk.
 * Each case should have API fields: DossierId, PublicPersonId, MatchDate, etc.
 */
function upsertCases(db, cases) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO discipline_cases (
      dossier_id,
      public_person_id,
      match_date,
      match_description,
      team_name,
      charge_codes,
      charge_description,
      sanction_description,
      processing_date,
      administrative_fee,
      is_charged,
      source_hash,
      last_seen_at,
      created_at
    )
    VALUES (
      @dossier_id,
      @public_person_id,
      @match_date,
      @match_description,
      @team_name,
      @charge_codes,
      @charge_description,
      @sanction_description,
      @processing_date,
      @administrative_fee,
      @is_charged,
      @source_hash,
      @last_seen_at,
      @created_at
    )
    ON CONFLICT(dossier_id) DO UPDATE SET
      public_person_id = excluded.public_person_id,
      match_date = excluded.match_date,
      match_description = excluded.match_description,
      team_name = excluded.team_name,
      charge_codes = excluded.charge_codes,
      charge_description = excluded.charge_description,
      sanction_description = excluded.sanction_description,
      processing_date = excluded.processing_date,
      administrative_fee = excluded.administrative_fee,
      is_charged = excluded.is_charged,
      source_hash = excluded.source_hash,
      last_seen_at = excluded.last_seen_at
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = cases.map((c) => ({
    dossier_id: c.DossierId,
    public_person_id: c.PublicPersonId ?? null,
    match_date: c.MatchDate ?? null,
    match_description: c.MatchDescription ?? null,
    team_name: c.TeamName ?? null,
    charge_codes: Array.isArray(c.ChargeCodes) ? JSON.stringify(c.ChargeCodes) : (c.ChargeCodes ?? null),
    charge_description: c.ChargeDescription ?? null,
    sanction_description: c.SanctionDescription ?? null,
    processing_date: c.ProcessingDate ?? null,
    administrative_fee: c.AdministrativeFee ?? null,
    is_charged: c.IsCharged === true ? 1 : (c.IsCharged === false ? 0 : null),
    source_hash: computeCaseHash(c),
    last_seen_at: now,
    created_at: now
  }));

  insertMany(rows);
}

/**
 * Get all discipline cases.
 * Returns: [{ dossier_id, public_person_id, match_date, ... }]
 */
function getAllCases(db) {
  const stmt = db.prepare(`
    SELECT
      dossier_id,
      public_person_id,
      match_date,
      match_description,
      team_name,
      charge_codes,
      charge_description,
      sanction_description,
      processing_date,
      administrative_fee,
      is_charged,
      source_hash,
      last_seen_at,
      created_at
    FROM discipline_cases
    ORDER BY match_date DESC
  `);
  return stmt.all();
}

/**
 * Get discipline cases by person public ID.
 * Returns: [{ dossier_id, match_date, ... }]
 */
function getCasesByPersonId(db, publicPersonId) {
  const stmt = db.prepare(`
    SELECT
      dossier_id,
      public_person_id,
      match_date,
      match_description,
      team_name,
      charge_codes,
      charge_description,
      sanction_description,
      processing_date,
      administrative_fee,
      is_charged,
      source_hash,
      last_seen_at,
      created_at
    FROM discipline_cases
    WHERE public_person_id = ?
    ORDER BY match_date DESC
  `);
  return stmt.all(publicPersonId);
}

/**
 * Get discipline case count.
 */
function getCaseCount(db) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM discipline_cases');
  return stmt.get().count;
}

/**
 * Delete all discipline cases (for fresh import).
 */
function clearCases(db) {
  db.exec('DELETE FROM discipline_cases');
}

module.exports = {
  DEFAULT_DB_PATH,
  openDb,
  initDb,
  stableStringify,
  computeCaseHash,
  upsertCases,
  getAllCases,
  getCasesByPersonId,
  getCaseCount,
  clearCases
};
