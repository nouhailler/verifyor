const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.VERIFYOR_DB_PATH || path.resolve(__dirname, "..", "data", "verifyor.sqlite");

let database;

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function getDatabase() {
  if (database) return database;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      full_name TEXT,
      status TEXT,
      risk TEXT,
      score INTEGER,
      domain TEXT,
      verification_provider TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_email_created_at
    ON analyses(email, created_at DESC);

    CREATE TABLE IF NOT EXISTS enrichments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      email TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_enrichments_kind_email_created_at
    ON enrichments(kind, email, created_at DESC);
  `);

  ensureColumn(database, "analyses", "verification_provider", "TEXT");

  return database;
}

function saveAnalysis(payload) {
  const db = getDatabase();
  const statement = db.prepare(`
    INSERT INTO analyses (email, full_name, status, risk, score, domain, verification_provider, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    payload.email,
    payload.full_name || null,
    payload.status || null,
    payload.risk || null,
    Number.isFinite(payload.score) ? payload.score : null,
    payload.domain || null,
    payload.verification_provider || null,
    JSON.stringify(payload)
  );

  return Number(result.lastInsertRowid);
}

function saveEnrichment(kind, email, payload) {
  const db = getDatabase();
  const statement = db.prepare(`
    INSERT INTO enrichments (kind, email, payload_json)
    VALUES (?, ?, ?)
  `);

  const result = statement.run(kind, email, JSON.stringify(payload));
  return Number(result.lastInsertRowid);
}

function listRecentAnalyses(limit = 5) {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, created_at
    FROM analyses
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(Math.max(1, Math.min(50, Number(limit) || 5)));
}

function getDashboardSummary() {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS analyses_count,
      SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) AS valid_count,
      SUM(CASE WHEN risk IN ('medium', 'high') THEN 1 ELSE 0 END) AS flagged_count,
      SUM(CASE WHEN verification_provider = 'local' THEN 1 ELSE 0 END) AS local_count,
      MAX(created_at) AS last_activity
    FROM analyses
  `).get();

  return {
    analyses_count: Number(row.analyses_count || 0),
    valid_count: Number(row.valid_count || 0),
    flagged_count: Number(row.flagged_count || 0),
    local_count: Number(row.local_count || 0),
    last_activity: row.last_activity || null
  };
}

function listRecentEnrichments(limit = 20) {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, kind, email, created_at
    FROM enrichments
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(Math.max(1, Math.min(200, Number(limit) || 20)));
}

function listAdminHistory(limit = 50) {
  const db = getDatabase();
  const analyses = db.prepare(`
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, created_at
    FROM analyses
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 50)));

  const enrichments = listRecentEnrichments(limit);
  return { analyses, enrichments };
}

function getAnalysisById(id) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, payload_json, created_at
    FROM analyses
    WHERE id = ?
  `).get(Number(id));

  if (!row) return null;

  let payload = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (error) {
    payload = null;
  }

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    status: row.status,
    risk: row.risk,
    score: row.score,
    domain: row.domain,
    verification_provider: row.verification_provider,
    created_at: row.created_at,
    payload
  };
}

function clearAllData() {
  const db = getDatabase();
  db.exec("DELETE FROM enrichments; DELETE FROM analyses;");
}

module.exports = {
  DB_PATH,
  clearAllData,
  getDashboardSummary,
  getAnalysisById,
  getDatabase,
  listAdminHistory,
  listRecentAnalyses,
  listRecentEnrichments,
  saveAnalysis,
  saveEnrichment
};
