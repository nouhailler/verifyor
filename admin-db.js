(function () {
  const elements = {
    refreshButton: document.getElementById("refreshAdminButton"),
    analysesCount: document.getElementById("adminAnalysesCount"),
    enrichmentsCount: document.getElementById("adminEnrichmentsCount"),
    lastActivity: document.getElementById("adminLastActivity"),
    statusBanner: document.getElementById("adminStatusBanner"),
    statusText: document.getElementById("adminStatusText"),
    analysesList: document.getElementById("adminAnalysesList"),
    enrichmentsList: document.getElementById("adminEnrichmentsList"),
    analysisDetail: document.getElementById("adminAnalysisDetail")
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

  function renderAnalysisDetail(analysis) {
    if (!analysis) {
      elements.analysisDetail.innerHTML = '<p class="insight-empty">Aucune recherche selectionnee.</p>';
      return;
    }

    const payload = analysis.payload || {};
    const rows = [
      ["Email", payload.email || analysis.email],
      ["Nom complet", payload.full_name || analysis.full_name || "Unknown user"],
      ["Tags", (analysis.tags || []).join(", ") || "-"],
      ["Note", analysis.note_text || "-"],
      ["Statut", payload.status || analysis.status || "-"],
      ["Risque", payload.risk || analysis.risk || "-"],
      ["Score", payload.score ?? analysis.score ?? "-"],
      ["Provider", payload.verification_provider || analysis.verification_provider || "-"],
      ["Provider demande", payload.requested_provider || "-"],
      ["Fallback local", payload.is_local_fallback ? "oui" : "non"],
      ["Domaine", payload.domain || analysis.domain || "-"],
      ["Detail deliverability", payload.deliverabilityDetail || payload.sub_status || "-"],
      ["MX", payload.mx ? "oui" : "non"],
      ["SMTP", payload.smtp ? "oui" : "non"],
      ["Adresse jetable", payload.disposable ? "oui" : "non"],
      ["Adresse de role", payload.role ? "oui" : "non"],
      ["Suggestion", payload.suggestion || "-"],
      ["Message provider", payload.provider_message || "-"],
      ["Cree le", analysis.created_at || "-"]
    ];

    elements.analysisDetail.innerHTML = `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">ID</span>
          <div>
            <p class="item-title">Recherche #${escapeHtml(analysis.id)}</p>
            <p class="item-copy">${escapeHtml(analysis.email)}</p>
            <p class="item-detail">Selectionnee depuis l'historique.</p>
          </div>
        </div>
        <span class="status success">loaded</span>
      </div>
      ${rows.map(([label, value]) => `
        <div class="info-item">
          <div class="item-main">
            <span class="item-icon">${escapeHtml(label.slice(0, 3).toUpperCase())}</span>
            <div>
              <p class="item-title">${escapeHtml(label)}</p>
              <p class="item-copy">${escapeHtml(String(value == null ? "-" : value))}</p>
            </div>
          </div>
        </div>
      `).join("")}
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">RAW</span>
          <div>
            <p class="item-title">Payload JSON brut</p>
            <pre class="item-detail" style="white-space:pre-wrap;overflow:auto;max-width:100%">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
          </div>
        </div>
      </div>
    `;
  }

  async function loadAnalysisDetail(id) {
    setStatus("loading", `Chargement du detail de la recherche #${id}...`);

    try {
      const analysis = await fetchJson(`/api/admin/analyses/${encodeURIComponent(id)}`);
      renderAnalysisDetail(analysis);
      setStatus("success", `Detail de la recherche #${id} charge.`);
    } catch (error) {
      setStatus("error", error.message);
      elements.analysisDetail.innerHTML = `<p class="insight-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderAnalyses(items) {
    if (!items.length) {
      elements.analysesList.innerHTML = '<p class="insight-empty">Aucune recherche sauvegardee.</p>';
      renderAnalysisDetail(null);
      return;
    }

    elements.analysesList.innerHTML = items.map((item) => `
      <button class="info-item" type="button" data-analysis-id="${escapeHtml(item.id)}">
        <div class="item-main">
          <span class="item-icon">EML</span>
          <div>
            <p class="item-title">${escapeHtml(item.email)}</p>
            <p class="item-copy">${escapeHtml(item.full_name || "Unknown user")}</p>
            <p class="item-detail">${escapeHtml(`${item.status || "-"} | risque ${item.risk || "-"} | score ${item.score ?? "-"} | provider ${item.verification_provider || "-"}`)}</p>
          </div>
        </div>
        <span class="status ${item.risk === "high" ? "error" : item.risk === "medium" ? "warning" : "success"}">${escapeHtml(formatDateTime(item.created_at))}</span>
      </button>
    `).join("");

    elements.analysesList.querySelectorAll("[data-analysis-id]").forEach((button) => {
      button.addEventListener("click", () => loadAnalysisDetail(button.dataset.analysisId));
    });
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
      renderAnalysisDetail(null);
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
