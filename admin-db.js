(function () {
  const elements = {
    refreshButton: document.getElementById("refreshAdminButton"),
    analysesCount: document.getElementById("adminAnalysesCount"),
    enrichmentsCount: document.getElementById("adminEnrichmentsCount"),
    lastActivity: document.getElementById("adminLastActivity"),
    statusBanner: document.getElementById("adminStatusBanner"),
    statusText: document.getElementById("adminStatusText"),
    analysesList: document.getElementById("adminAnalysesList"),
    enrichmentsList: document.getElementById("adminEnrichmentsList")
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function setStatus(type, text) {
    elements.statusBanner.className = `status-banner visible ${type}`;
    elements.statusText.textContent = text;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Chargement impossible.");
    }
    return payload;
  }

  function renderAnalyses(items) {
    if (!items.length) {
      elements.analysesList.innerHTML = '<p class="insight-empty">Aucune recherche sauvegardee.</p>';
      return;
    }

    elements.analysesList.innerHTML = items.map((item) => `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">EML</span>
          <div>
            <p class="item-title">${escapeHtml(item.email)}</p>
            <p class="item-copy">${escapeHtml(item.full_name || "Unknown user")}</p>
            <p class="item-detail">${escapeHtml(`${item.status || "-"} | risque ${item.risk || "-"} | score ${item.score ?? "-"} | provider ${item.verification_provider || "-"}`)}</p>
          </div>
        </div>
        <span class="status ${item.risk === "high" ? "error" : item.risk === "medium" ? "warning" : "success"}">${escapeHtml(formatDateTime(item.created_at))}</span>
      </div>
    `).join("");
  }

  function renderEnrichments(items) {
    if (!items.length) {
      elements.enrichmentsList.innerHTML = '<p class="insight-empty">Aucun enrichissement sauvegarde.</p>';
      return;
    }

    elements.enrichmentsList.innerHTML = items.map((item) => `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">INT</span>
          <div>
            <p class="item-title">${escapeHtml(item.kind)}</p>
            <p class="item-copy">${escapeHtml(item.email)}</p>
            <p class="item-detail">Event #${escapeHtml(item.id)} enregistre le ${escapeHtml(formatDateTime(item.created_at))}</p>
          </div>
        </div>
        <span class="status success">saved</span>
      </div>
    `).join("");
  }

  async function loadAdminPage() {
    setStatus("loading", "Chargement de la base locale...");

    try {
      const [history, summary] = await Promise.all([
        fetchJson("/api/admin/history?limit=100"),
        fetchJson("/api/dashboard/summary")
      ]);

      elements.analysesCount.textContent = String((history.analyses || []).length);
      elements.enrichmentsCount.textContent = String((history.enrichments || []).length);
      elements.lastActivity.textContent = formatDateTime(summary.last_activity);
      renderAnalyses(history.analyses || []);
      renderEnrichments(history.enrichments || []);
      setStatus("success", "Base chargee avec succes.");
    } catch (error) {
      setStatus("error", error.message);
      elements.analysesList.innerHTML = `<p class="insight-empty">${escapeHtml(error.message)}</p>`;
      elements.enrichmentsList.innerHTML = "";
    }
  }

  elements.refreshButton.addEventListener("click", loadAdminPage);
  loadAdminPage();
})();
