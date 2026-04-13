const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.VERIFYOR_DB_PATH || path.resolve(__dirname, "..", "data", "verifyor.sqlite");

let database;

const ANALYSIS_SEARCH_FIELDS = [
  { key: "verification_provider", type: "string" },
  { key: "verification_method", type: "string" },
  { key: "requested_provider", type: "string" },
  { key: "is_local_fallback", type: "boolean" },
  { key: "email", type: "string" },
  { key: "status", type: "string" },
  { key: "sub_status", type: "string" },
  { key: "domain", type: "string" },
  { key: "mx_found", type: "boolean" },
  { key: "smtp_valid", type: "boolean" },
  { key: "disposable", type: "boolean" },
  { key: "toxic", type: "boolean" },
  { key: "quality_score", type: "number" },
  { key: "quality_score_raw", type: "number" },
  { key: "did_you_mean", type: "string" },
  { key: "mx_record", type: "string" },
  { key: "provider", type: "string" },
  { key: "free_email", type: "boolean" },
  { key: "firstname", type: "string" },
  { key: "lastname", type: "string" },
  { key: "full_name", type: "string" },
  { key: "email_type", type: "string" },
  { key: "company_domain", type: "string" },
  { key: "provider_type", type: "string" },
  { key: "domain_age_estimate", type: "string" },
  { key: "risk_level", type: "string" },
  { key: "risk", type: "string" },
  { key: "cached", type: "boolean" },
  { key: "provider_message", type: "string" },
  { key: "syntax", type: "boolean" },
  { key: "mx", type: "boolean" },
  { key: "smtp", type: "boolean" },
  { key: "score", type: "number" },
  { key: "computedScore", type: "number" },
  { key: "score_source", type: "string" },
  { key: "suggestion", type: "string" },
  { key: "deliverability", type: "string" },
  { key: "deliverabilityDetail", type: "string" },
  { key: "mxRecords", type: "array" },
  { key: "role", type: "boolean" }
];

function parseBooleanFilter(value) {
  if (value === true || value === false) return value;
  if (value == null || value === "") return null;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return null;
}

function parseNumberFilter(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringFilter(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeSearchFilters(filters = {}) {
  const normalized = {
    raw_payload: normalizeStringFilter(filters.raw_payload),
    created_from: normalizeStringFilter(filters.created_from),
    created_to: normalizeStringFilter(filters.created_to),
    limit: Math.max(1, Math.min(1000, Number(filters.limit) || 250))
  };

  for (const field of ANALYSIS_SEARCH_FIELDS) {
    if (field.type === "boolean") {
      normalized[field.key] = parseBooleanFilter(filters[field.key]);
    } else if (field.type === "number") {
      normalized[field.key] = parseNumberFilter(filters[field.key]);
      normalized[`${field.key}_min`] = parseNumberFilter(filters[`${field.key}_min`]);
      normalized[`${field.key}_max`] = parseNumberFilter(filters[`${field.key}_max`]);
    } else if (field.type === "array" || field.type === "string") {
      normalized[field.key] = normalizeStringFilter(filters[field.key]);
    }
  }

  return normalized;
}

function isWithinDateRange(createdAt, createdFrom, createdTo) {
  if (!createdFrom && !createdTo) return true;

  const createdDate = new Date(String(createdAt || "").replace(" ", "T"));
  if (Number.isNaN(createdDate.getTime())) return false;

  if (createdFrom) {
    const fromDate = new Date(`${createdFrom}T00:00:00`);
    if (!Number.isNaN(fromDate.getTime()) && createdDate < fromDate) return false;
  }

  if (createdTo) {
    const toDate = new Date(`${createdTo}T23:59:59`);
    if (!Number.isNaN(toDate.getTime()) && createdDate > toDate) return false;
  }

  return true;
}

function matchesAnalysisFilter(payload, normalizedFilters, row) {
  if (!isWithinDateRange(row.created_at, normalizedFilters.created_from, normalizedFilters.created_to)) {
    return false;
  }

  if (normalizedFilters.raw_payload && !JSON.stringify(payload).toLowerCase().includes(normalizedFilters.raw_payload)) {
    return false;
  }

  for (const field of ANALYSIS_SEARCH_FIELDS) {
    const filterValue = normalizedFilters[field.key];

    if (field.type === "boolean") {
      if (filterValue == null) continue;
      if (Boolean(payload[field.key]) !== filterValue) return false;
      continue;
    }

    if (field.type === "number") {
      const exactValue = normalizedFilters[field.key];
      const minValue = normalizedFilters[`${field.key}_min`];
      const maxValue = normalizedFilters[`${field.key}_max`];
      if (exactValue == null && minValue == null && maxValue == null) continue;

      const payloadValue = Number(payload[field.key]);
      if (!Number.isFinite(payloadValue)) return false;
      if (exactValue != null && payloadValue !== exactValue) return false;
      if (minValue != null && payloadValue < minValue) return false;
      if (maxValue != null && payloadValue > maxValue) return false;
      continue;
    }

    if (!filterValue) continue;

    if (field.type === "array") {
      const haystack = Array.isArray(payload[field.key]) ? payload[field.key].join(" ").toLowerCase() : "";
      if (!haystack.includes(filterValue)) return false;
      continue;
    }

    const haystack = String(payload[field.key] == null ? "" : payload[field.key]).toLowerCase();
    if (!haystack.includes(filterValue)) return false;
  }

  return true;
}

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
  ensureColumn(database, "analyses", "note_text", "TEXT");
  ensureColumn(database, "analyses", "tags_json", "TEXT");

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
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, note_text, tags_json, created_at
    FROM analyses
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(Math.max(1, Math.min(50, Number(limit) || 5))).map((row) => ({
    ...row,
    tags: parseJsonArray(row.tags_json)
  }));
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
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, note_text, tags_json, created_at
    FROM analyses
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 50))).map((row) => ({
    ...row,
    tags: parseJsonArray(row.tags_json)
  }));

  const enrichments = listRecentEnrichments(limit);
  return { analyses, enrichments };
}

function getAnalysisById(id) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, payload_json, note_text, tags_json, created_at
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
    note_text: row.note_text || "",
    tags: parseJsonArray(row.tags_json),
    created_at: row.created_at,
    payload
  };
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function updateAnalysisAnnotations(id, { note_text, tags } = {}) {
  const db = getDatabase();
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
  const statement = db.prepare(`
    UPDATE analyses
    SET note_text = ?, tags_json = ?
    WHERE id = ?
  `);

  statement.run(
    String(note_text || "").trim() || null,
    normalizedTags.length ? JSON.stringify(normalizedTags) : null,
    Number(id)
  );

  return getAnalysisById(id);
}

function searchAnalyses(filters = {}) {
  const db = getDatabase();
  const normalizedFilters = normalizeSearchFilters(filters);
  const rows = db.prepare(`
    SELECT id, email, full_name, status, risk, score, domain, verification_provider, payload_json, created_at
    FROM analyses
    ORDER BY id DESC
    LIMIT ?
  `).all(normalizedFilters.limit);

  const items = [];

  for (const row of rows) {
    let payload = null;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (error) {
      payload = null;
    }

    if (!payload) continue;
    if (!matchesAnalysisFilter(payload, normalizedFilters, row)) continue;

    items.push({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      status: row.status,
      risk: row.risk,
      score: row.score,
      domain: row.domain,
      verification_provider: row.verification_provider,
      note_text: row.note_text || "",
      tags: parseJsonArray(row.tags_json),
      created_at: row.created_at,
      payload
    });
  }

  return {
    filters: normalizedFilters,
    count: items.length,
    items
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
  searchAnalyses,
  getDatabase,
  listAdminHistory,
  listRecentAnalyses,
  listRecentEnrichments,
  saveAnalysis,
  saveEnrichment,
  updateAnalysisAnnotations
};
