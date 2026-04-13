(function () {
  const BOOLEAN_FIELDS = [
    ["is_local_fallback", "Fallback local"],
    ["mx_found", "MX found"],
    ["smtp_valid", "SMTP valid"],
    ["disposable", "Disposable"],
    ["toxic", "Toxic"],
    ["free_email", "Free email"],
    ["cached", "Cached"],
    ["syntax", "Syntax"],
    ["mx", "MX"],
    ["smtp", "SMTP"],
    ["role", "Role"]
  ];

  const NUMBER_FIELDS = [
    ["quality_score", "Quality score"],
    ["quality_score_raw", "Quality score raw"],
    ["score", "Score"],
    ["computedScore", "Computed score"]
  ];

  const TEXT_FIELDS = [
    ["verification_provider", "Verification provider"],
    ["verification_method", "Verification method"],
    ["requested_provider", "Requested provider"],
    ["email", "Email"],
    ["status", "Status"],
    ["sub_status", "Sub status"],
    ["domain", "Domain"],
    ["did_you_mean", "Did you mean"],
    ["mx_record", "MX record"],
    ["provider", "Provider"],
    ["firstname", "Firstname"],
    ["lastname", "Lastname"],
    ["full_name", "Full name"],
    ["email_type", "Email type"],
    ["company_domain", "Company domain"],
    ["provider_type", "Provider type"],
    ["domain_age_estimate", "Domain age estimate"],
    ["risk_level", "Risk level"],
    ["risk", "Risk"],
    ["provider_message", "Provider message"],
    ["score_source", "Score source"],
    ["suggestion", "Suggestion"],
    ["deliverability", "Deliverability"],
    ["deliverabilityDetail", "Deliverability detail"],
    ["mxRecords", "MX records"]
  ];

  const META_FIELDS = [
    ["created_from", "Date min", "date"],
    ["created_to", "Date max", "date"],
    ["limit", "Limite lue", "number"],
    ["raw_payload", "Payload JSON brut", "textarea"]
  ];

  const elements = {
    form: document.getElementById("searchForm"),
    submitButton: document.getElementById("searchSubmitButton"),
    submitButtonTop: document.getElementById("searchSubmitButtonTop"),
    resetButton: document.getElementById("searchResetButton"),
    statusBanner: document.getElementById("searchStatusBanner"),
    statusText: document.getElementById("searchStatusText"),
    metaFilters: document.getElementById("searchMetaFilters"),
    booleanFilters: document.getElementById("searchBooleanFilters"),
    numberFilters: document.getElementById("searchNumberFilters"),
    textFilters: document.getElementById("searchTextFilters"),
    count: document.getElementById("searchCount"),
    limitLabel: document.getElementById("searchLimitLabel"),
    lastActivity: document.getElementById("searchLastActivity"),
    summary: document.getElementById("searchSummaryText"),
    resultsList: document.getElementById("searchResultsList"),
    resultDetail: document.getElementById("searchResultDetail")
  };
  let expandedAnalysisId = null;

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

  function formatHumanValue(value) {
    if (value == null || value === "") return "-";
    if (typeof value === "boolean") return value ? "oui" : "non";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function setStatus(type, text) {
    elements.statusBanner.className = `status-banner visible ${type}`;
    elements.statusText.textContent = text;
  }

  function buildTextFilter(field, label) {
    return `
      <label class="filter-item">
        <span class="filter-label">${escapeHtml(label)}</span>
        <input class="search-input" type="text" name="${escapeHtml(field)}" autocomplete="off" />
      </label>
    `;
  }

  function buildBooleanFilter(field, label) {
    return `
      <label class="filter-item">
        <span class="filter-label">${escapeHtml(label)}</span>
        <select class="search-input" name="${escapeHtml(field)}">
          <option value="">Tous</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      </label>
    `;
  }

  function buildNumberFilter(field, label) {
    return `
      <div class="filter-item">
        <span class="filter-label">${escapeHtml(label)}</span>
        <input class="search-input" type="number" step="any" name="${escapeHtml(field)}" placeholder="Valeur exacte" />
        <input class="search-input" type="number" step="any" name="${escapeHtml(field)}_min" placeholder="Minimum" />
        <input class="search-input" type="number" step="any" name="${escapeHtml(field)}_max" placeholder="Maximum" />
      </div>
    `;
  }

  function buildMetaFilter(field, label, type) {
    if (type === "textarea") {
      return `
        <label class="filter-item" style="grid-column: 1 / -1;">
          <span class="filter-label">${escapeHtml(label)}</span>
          <textarea class="search-input" name="${escapeHtml(field)}" placeholder="Recherche libre dans le JSON brut"></textarea>
        </label>
      `;
    }

    return `
      <label class="filter-item">
        <span class="filter-label">${escapeHtml(label)}</span>
        <input class="search-input" type="${escapeHtml(type)}" name="${escapeHtml(field)}" ${field === "limit" ? 'value="250" min="1" max="1000"' : ""} />
      </label>
    `;
  }

  function renderFilters() {
    elements.metaFilters.innerHTML = META_FIELDS.map(([field, label, type]) => buildMetaFilter(field, label, type)).join("");
    elements.booleanFilters.innerHTML = BOOLEAN_FIELDS.map(([field, label]) => buildBooleanFilter(field, label)).join("");
    elements.numberFilters.innerHTML = NUMBER_FIELDS.map(([field, label]) => buildNumberFilter(field, label)).join("");
    elements.textFilters.innerHTML = TEXT_FIELDS.map(([field, label]) => buildTextFilter(field, label)).join("");
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

  function buildQueryFromForm() {
    const formData = new FormData(elements.form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      const normalized = String(value || "").trim();
      if (!normalized) continue;
      params.set(key, normalized);
    }

    if (!params.has("limit")) {
      params.set("limit", "250");
    }

    return params;
  }

  function buildDetailRows(analysis) {
    if (!analysis) {
      return [];
    }

    const payload = analysis.payload || {};
    return [
      ["Email", payload.email || analysis.email],
      ["Nom complet", payload.full_name || analysis.full_name || "Unknown user"],
      ["Statut", payload.status || analysis.status || "-"],
      ["Sub status", payload.sub_status || "-"],
      ["Risque", payload.risk || analysis.risk || "-"],
      ["Score", payload.score ?? analysis.score ?? "-"],
      ["Provider", payload.verification_provider || analysis.verification_provider || "-"],
      ["Provider demande", payload.requested_provider || "-"],
      ["Fallback local", payload.is_local_fallback ? "oui" : "non"],
      ["Domaine", payload.domain || analysis.domain || "-"],
      ["Deliverability", payload.deliverability || "-"],
      ["Detail deliverability", payload.deliverabilityDetail || "-"],
      ["MX record", payload.mx_record || "-"],
      ["MX records", Array.isArray(payload.mxRecords) ? payload.mxRecords.join(", ") : "-"],
      ["MX", payload.mx ? "oui" : "non"],
      ["SMTP", payload.smtp ? "oui" : "non"],
      ["Free email", payload.free_email ? "oui" : "non"],
      ["Disposable", payload.disposable ? "oui" : "non"],
      ["Role", payload.role ? "oui" : "non"],
      ["Suggestion", payload.suggestion || "-"],
      ["Message provider", payload.provider_message || "-"],
      ["Cree le", analysis.created_at || "-"]
    ];
  }

  function buildDetailTable(analysis) {
    const rows = buildDetailRows(analysis);
    const payload = analysis.payload || {};
    const payloadSections = [
      {
        title: "Verification",
        rows: [
          ["Provider choisi", payload.verification_provider],
          ["Methode", payload.verification_method],
          ["Provider demande", payload.requested_provider],
          ["Fallback local", payload.is_local_fallback],
          ["Message provider", payload.provider_message]
        ]
      },
      {
        title: "Identite email",
        rows: [
          ["Email", payload.email],
          ["Prenom", payload.firstname],
          ["Nom", payload.lastname],
          ["Nom complet", payload.full_name],
          ["Type d'email", payload.email_type],
          ["Adresse de role", payload.role]
        ]
      },
      {
        title: "Deliverability",
        rows: [
          ["Statut", payload.status],
          ["Sous-statut", payload.sub_status],
          ["Deliverability", payload.deliverability],
          ["Detail deliverability", payload.deliverabilityDetail],
          ["MX trouve", payload.mx_found ?? payload.mx],
          ["SMTP valide", payload.smtp_valid ?? payload.smtp],
          ["MX principal", payload.mx_record],
          ["MX records", payload.mxRecords],
          ["Catch-all probable", payload.catch_all_probable]
        ]
      },
      {
        title: "Risque et qualite",
        rows: [
          ["Risque", payload.risk],
          ["Niveau de risque", payload.risk_level],
          ["Disposable", payload.disposable],
          ["Toxic", payload.toxic],
          ["Quality score", payload.quality_score],
          ["Quality score raw", payload.quality_score_raw],
          ["Score final", payload.score],
          ["Computed score", payload.computedScore],
          ["Source du score", payload.score_source],
          ["Confiance", payload.confidence_level]
        ]
      },
      {
        title: "Domaine et securite DNS",
        rows: [
          ["Domaine", payload.domain],
          ["Domaine entreprise", payload.company_domain],
          ["Provider type", payload.provider_type],
          ["Free email", payload.free_email],
          ["Age estime", payload.domain_age_estimate],
          ["Problemes domaine", payload.domain_diagnostics && payload.domain_diagnostics.issues],
          ["SPF", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.spf],
          ["DKIM", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.dkim],
          ["DMARC", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.dmarc],
          ["BIMI", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.bimi],
          ["MTA-STS", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.mta_sts],
          ["TLS-RPT", payload.domain_diagnostics && payload.domain_diagnostics.security_posture && payload.domain_diagnostics.security_posture.tls_rpt]
        ]
      },
      {
        title: "Scoring explicable",
        rows: [
          ["Deliverability score", payload.score_breakdown && payload.score_breakdown.deliverability],
          ["Fraud risk score", payload.score_breakdown && payload.score_breakdown.fraud_risk],
          ["Identity confidence", payload.score_breakdown && payload.score_breakdown.identity_confidence],
          ["Domain trust", payload.score_breakdown && payload.score_breakdown.domain_trust],
          ["Explications", payload.explanation_lines]
        ]
      },
      {
        title: "Annotations",
        rows: [
          ["Tags", analysis.tags],
          ["Note", analysis.note_text]
        ]
      }
    ];

    return `
      <div class="inline-detail-card">
        <div class="section-head">
          <div>
            <h3 class="section-title">Detail de la recherche #${escapeHtml(analysis.id)}</h3>
            <p class="card-subtitle">Informations detaillees chargees directement sous le resultat selectionne.</p>
          </div>
          <span class="pill neutral">Inline</span>
        </div>
        <div class="detail-table-wrap">
          <table class="detail-table">
            <tbody>
              ${rows.map(([label, value]) => `
                <tr>
                  <th scope="row">${escapeHtml(label)}</th>
                  <td>${escapeHtml(String(value == null ? "-" : value))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="info-item">
          <div class="item-main">
            <span class="item-icon">RAW</span>
            <div>
              <p class="item-title">Payload JSON brut, reformate pour lecture humaine</p>
              <div class="payload-human-grid">
                ${payloadSections.map((section) => `
                  <div class="payload-human-card">
                    <p class="payload-human-title">${escapeHtml(section.title)}</p>
                    <div class="payload-human-list">
                      ${section.rows.map(([label, value]) => `
                        <div class="payload-human-row">
                          <span class="payload-human-label">${escapeHtml(label)}</span>
                          <span class="payload-human-value">${escapeHtml(formatHumanValue(value))}</span>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDetail(analysis) {
    if (!analysis) {
      elements.resultDetail.innerHTML = '<p class="insight-empty">Aucune recherche selectionnee.</p>';
      return;
    }

    const rows = buildDetailRows(analysis);
    const payload = analysis.payload || {};
    const readablePayload = [
      `Verification via ${formatHumanValue(payload.verification_provider)}`,
      `Statut ${formatHumanValue(payload.status)} / ${formatHumanValue(payload.sub_status)}`,
      `Domaine ${formatHumanValue(payload.domain)}`,
      `Score ${formatHumanValue(payload.score)} | Confiance ${formatHumanValue(payload.confidence_level)}`,
      `Risque ${formatHumanValue(payload.risk)}`,
      `Problemes domaine ${formatHumanValue(payload.domain_diagnostics && payload.domain_diagnostics.issues)}`
    ].join(" | ");

    elements.resultDetail.innerHTML = `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">ID</span>
          <div>
            <p class="item-title">Recherche #${escapeHtml(analysis.id)}</p>
            <p class="item-copy">${escapeHtml(analysis.email)}</p>
            <p class="item-detail">Detail charge depuis la base locale.</p>
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
            <p class="item-title">Lecture humaine du payload</p>
            <p class="item-copy">${escapeHtml(readablePayload)}</p>
            <p class="item-detail">Le detail complet et structure est aussi visible sous la ligne selectionnee.</p>
          </div>
        </div>
      </div>
    `;
  }

  async function loadDetail(id, triggerButton) {
    setStatus("loading", `Chargement du detail de la recherche #${id}...`);

    try {
      const analysis = await fetchJson(`/api/admin/analyses/${encodeURIComponent(id)}`);
      const currentInline = elements.resultsList.querySelector(".inline-search-detail");
      if (currentInline) {
        currentInline.remove();
      }

      if (expandedAnalysisId === String(id)) {
        expandedAnalysisId = null;
        renderDetail(null);
        setStatus("success", `Detail de la recherche #${id} masque.`);
        return;
      }

      const detailContainer = document.createElement("div");
      detailContainer.className = "inline-search-detail";
      detailContainer.innerHTML = buildDetailTable(analysis);
      triggerButton.insertAdjacentElement("afterend", detailContainer);
      expandedAnalysisId = String(id);
      renderDetail(analysis);
      setStatus("success", `Detail de la recherche #${id} charge.`);
    } catch (error) {
      expandedAnalysisId = null;
      renderDetail(null);
      setStatus("error", error.message);
    }
  }

  function renderResults(items) {
    if (!items.length) {
      elements.resultsList.innerHTML = '<p class="insight-empty">Aucun resultat pour ces filtres.</p>';
      renderDetail(null);
      return;
    }

    elements.resultsList.innerHTML = items.map((item) => `
      <button class="info-item search-result-item" type="button" data-analysis-id="${escapeHtml(item.id)}" aria-expanded="false">
        <div class="item-main">
          <span class="item-icon">EML</span>
          <div>
            <p class="item-title">${escapeHtml(item.email)}</p>
            <p class="item-copy">${escapeHtml(item.full_name || "Unknown user")}</p>
            <p class="item-detail">${escapeHtml(`${item.status || "-"} | risque ${item.risk || "-"} | score ${item.score ?? "-"} | provider ${item.verification_provider || "-"} | domaine ${item.domain || "-"}`)}</p>
          </div>
        </div>
        <span class="status ${item.risk === "high" ? "error" : item.risk === "medium" ? "warning" : "success"}">${escapeHtml(formatDateTime(item.created_at))}</span>
      </button>
    `).join("");

    elements.resultsList.querySelectorAll("[data-analysis-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const isExpanded = expandedAnalysisId === button.dataset.analysisId;
        elements.resultsList.querySelectorAll("[data-analysis-id]").forEach((itemButton) => {
          itemButton.setAttribute("aria-expanded", "false");
        });
        loadDetail(button.dataset.analysisId, button);
        if (!isExpanded) {
          button.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  async function runSearch() {
    const params = buildQueryFromForm();
    const limit = params.get("limit") || "250";
    elements.limitLabel.textContent = limit;
    setStatus("loading", "Recherche dans la base locale en cours...");

    try {
      const result = await fetchJson(`/api/admin/search?${params.toString()}`);
      const items = result.items || [];
      elements.count.textContent = String(result.count || 0);
      elements.lastActivity.textContent = items[0] ? formatDateTime(items[0].created_at) : "-";
      elements.summary.textContent = `${result.count || 0} resultat(s) sur les ${limit} dernieres analyses inspectees.`;
      renderResults(items);
      setStatus("success", "Recherche terminee.");
    } catch (error) {
      elements.count.textContent = "0";
      elements.lastActivity.textContent = "-";
      elements.summary.textContent = error.message;
      elements.resultsList.innerHTML = `<p class="insight-empty">${escapeHtml(error.message)}</p>`;
      renderDetail(null);
      setStatus("error", error.message);
    }
  }

  function resetSearch() {
    elements.form.reset();
    const limitInput = elements.form.querySelector('input[name="limit"]');
    if (limitInput) {
      limitInput.value = "250";
    }
    elements.count.textContent = "0";
    elements.limitLabel.textContent = "250";
    elements.lastActivity.textContent = "-";
    elements.summary.textContent = "Filtres reinitialises. Lance une nouvelle recherche.";
    elements.resultsList.innerHTML = '<p class="insight-empty">Aucune recherche executee.</p>';
    expandedAnalysisId = null;
    renderDetail(null);
    setStatus("success", "Filtres reinitialises.");
  }

  renderFilters();
  elements.submitButtonTop.addEventListener("click", runSearch);
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });
  elements.resetButton.addEventListener("click", resetSearch);
  resetSearch();
})();
