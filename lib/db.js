const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.VERIFYOR_DB_PATH || path.resolve(__dirname, "..", "data", "verifyor.sqlite");

let database;

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

  return database;
}

function saveAnalysis(payload) {
  const db = getDatabase();
  const statement = db.prepare(`
    INSERT INTO analyses (email, full_name, status, risk, score, domain, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    payload.email,
    payload.full_name || null,
    payload.status || null,
    payload.risk || null,
    Number.isFinite(payload.score) ? payload.score : null,
    payload.domain || null,
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
    SELECT id, email, full_name, status, risk, score, domain, created_at
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
      MAX(created_at) AS last_activity
    FROM analyses
  `).get();

  return {
    analyses_count: Number(row.analyses_count || 0),
    valid_count: Number(row.valid_count || 0),
    flagged_count: Number(row.flagged_count || 0),
    last_activity: row.last_activity || null
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
  getDatabase,
  listRecentAnalyses,
  saveAnalysis,
  saveEnrichment
};
