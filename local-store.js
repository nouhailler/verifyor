(function () {
  const STORAGE_KEY = "verifyor.localAnalyses.v1";

  function read() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function write(items) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 250)));
  }

  function normalizeItem(payload) {
    const createdAt = payload.created_at || new Date().toISOString();
    const id = payload.analysis_id || payload.id || `local-${Date.now()}`;
    return {
      id,
      analysis_id: id,
      email: payload.email,
      full_name: payload.full_name || "Unknown user",
      status: payload.status || "unknown",
      risk: payload.risk || "medium",
      score: payload.score ?? 0,
      verification_provider: payload.verification_provider || "browser-local",
      domain: payload.domain || "",
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      note_text: payload.note_text || "",
      created_at: createdAt,
      payload: {
        ...payload,
        id,
        analysis_id: id,
        created_at: createdAt
      }
    };
  }

  function saveAnalysis(payload) {
    const item = normalizeItem(payload);
    const items = read().filter((entry) => entry.id !== item.id);
    write([item, ...items]);
    return item;
  }

  function list(limit) {
    return read().slice(0, Number(limit) || 100);
  }

  function getById(id) {
    return read().find((item) => String(item.id) === String(id)) || null;
  }

  function updateAnnotations(id, annotations) {
    const items = read();
    const index = items.findIndex((item) => String(item.id) === String(id));
    if (index === -1) return null;

    const tags = Array.isArray(annotations.tags) ? annotations.tags : [];
    const noteText = annotations.note_text || "";
    items[index] = {
      ...items[index],
      tags,
      note_text: noteText,
      payload: {
        ...items[index].payload,
        tags,
        note_text: noteText
      }
    };
    write(items);
    return items[index];
  }

  function summary() {
    const items = read();
    return {
      analyses_count: items.length,
      valid_count: items.filter((item) => item.status === "valid").length,
      flagged_count: items.filter((item) => item.risk === "medium" || item.risk === "high").length,
      local_count: items.filter((item) => item.verification_provider === "browser-local" || item.payload.is_local_fallback).length,
      last_activity: items[0] ? items[0].created_at : null
    };
  }

  function includesText(value, needle) {
    return String(value == null ? "" : value).toLowerCase().includes(String(needle).toLowerCase());
  }

  function matchesQuery(item, params) {
    const payload = item.payload || {};
    for (const [key, value] of params.entries()) {
      if (!value || key === "limit") continue;
      if (key.endsWith("_min") || key.endsWith("_max")) continue;
      if (key === "created_from" && item.created_at < `${value}T00:00:00.000Z`) return false;
      if (key === "created_to" && item.created_at > `${value}T23:59:59.999Z`) return false;
      if (key === "raw_payload" && !includesText(JSON.stringify(payload), value)) return false;
      if (key === "raw_payload" || key === "created_from" || key === "created_to") continue;

      const actual = payload[key] ?? item[key];
      if (value === "true" || value === "false") {
        if (String(Boolean(actual)) !== value) return false;
      } else if (!includesText(actual, value)) {
        return false;
      }
    }

    for (const [key, value] of params.entries()) {
      if (!value || (!key.endsWith("_min") && !key.endsWith("_max"))) continue;
      const field = key.replace(/_(min|max)$/, "");
      const actual = Number(payload[field] ?? item[field]);
      if (!Number.isFinite(actual)) return false;
      const expected = Number(value);
      if (key.endsWith("_min") && actual < expected) return false;
      if (key.endsWith("_max") && actual > expected) return false;
    }

    return true;
  }

  function search(params) {
    const limit = Number(params.get("limit")) || 250;
    const items = read().slice(0, limit).filter((item) => matchesQuery(item, params));
    return {
      count: items.length,
      items
    };
  }

  window.VerifyorLocalStore = {
    getById,
    list,
    saveAnalysis,
    search,
    summary,
    updateAnnotations
  };
})();
