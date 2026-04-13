(function () {
  const elements = {
    form: document.getElementById("settingsForm"),
    saveButton: document.getElementById("saveSettingsButton"),
    portInput: document.getElementById("portInput"),
    defaultProviderInput: document.getElementById("defaultProviderInput"),
    zerobounceKeyInput: document.getElementById("zerobounceKeyInput"),
    abstractKeyInput: document.getElementById("abstractKeyInput"),
    hunterKeyInput: document.getElementById("hunterKeyInput"),
    gravatarKeyInput: document.getElementById("gravatarKeyInput"),
    statusBanner: document.getElementById("settingsStatusBanner"),
    statusText: document.getElementById("settingsStatusText"),
    runtimeStatusList: document.getElementById("runtimeStatusList")
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(type, text) {
    elements.statusBanner.className = `status-banner visible ${type}`;
    elements.statusText.textContent = text;
  }

  function renderRuntime(runtime) {
    const entries = Object.entries(runtime || {});
    if (!entries.length) {
      elements.runtimeStatusList.innerHTML = '<p class="insight-empty">Aucun statut runtime disponible.</p>';
      return;
    }

    elements.runtimeStatusList.innerHTML = entries.map(([provider, info]) => `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">${escapeHtml(provider.slice(0, 3).toUpperCase())}</span>
          <div>
            <p class="item-title">${escapeHtml(provider)}</p>
            <p class="item-copy">${info.ok ? "Provider operationnel" : "Provider en erreur"}</p>
            <p class="item-detail">${escapeHtml(info.last_error || "Aucune erreur recente.")}</p>
          </div>
        </div>
        <span class="status ${info.ok ? "success" : "error"}">${info.ok ? "ok" : "error"}</span>
      </div>
    `).join("");
  }

  async function fetchSettings() {
    const response = await fetch("/api/settings", {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Impossible de charger la configuration.");
    }
    return payload;
  }

  async function saveSettings(event) {
    event.preventDefault();
    elements.saveButton.disabled = true;
    setStatus("loading", "Enregistrement de la configuration...");

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          port: elements.portInput.value,
          default_provider: elements.defaultProviderInput.value,
          zerobounce_api_key: elements.zerobounceKeyInput.value,
          abstract_api_key: elements.abstractKeyInput.value,
          hunter_api_key: elements.hunterKeyInput.value,
          gravatar_api_key: elements.gravatarKeyInput.value
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Impossible d'enregistrer la configuration.");
      }

      setStatus("warning", payload.message || "Configuration enregistree. Redemarrage requis.");
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      elements.saveButton.disabled = false;
    }
  }

  async function loadPage() {
    setStatus("loading", "Chargement de la configuration...");

    try {
      const settings = await fetchSettings();
      elements.portInput.value = settings.port || "3000";
      elements.defaultProviderInput.value = settings.default_provider || "auto";
      elements.zerobounceKeyInput.value = settings.zerobounce_api_key || "";
      elements.abstractKeyInput.value = settings.abstract_api_key || "";
      elements.hunterKeyInput.value = settings.hunter_api_key || "";
      elements.gravatarKeyInput.value = settings.gravatar_api_key || "";
      renderRuntime(settings.runtime || {});
      setStatus("success", "Configuration chargee. Toute modification necessitera un redemarrage de l'application.");
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  elements.form.addEventListener("submit", saveSettings);
  loadPage();
})();
