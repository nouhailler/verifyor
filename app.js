(function () {
  const state = {
    currentEmail: "",
    currentResult: null,
    retryEmail: "",
    typoSuggestion: null,
    isDownloadingPdf: false,
    isLoadingHunter: false,
    isLoadingGravatar: false,
    isLoadingLinkedin: false,
    settings: null
  };

  const elements = {
    emailInput: document.getElementById("emailInput"),
    providerSelect: document.getElementById("providerSelect"),
    analyzeButton: document.getElementById("analyzeButton"),
    inputMessage: document.getElementById("inputMessage"),
    providerWarning: document.getElementById("providerWarning"),
    typoBanner: document.getElementById("typoBanner"),
    typoText: document.getElementById("typoText"),
    applyTypoButton: document.getElementById("applyTypoButton"),
    historyList: document.getElementById("historyList"),
    statusBanner: document.getElementById("statusBanner"),
    statusText: document.getElementById("statusText"),
    retryButton: document.getElementById("retryButton"),
    resultsSection: document.getElementById("resultsSection"),
    technicalList: document.getElementById("technicalList"),
    trustScore: document.getElementById("trustScore"),
    trustLabel: document.getElementById("trustLabel"),
    trustSummary: document.getElementById("trustSummary"),
    trustFactors: document.getElementById("trustFactors"),
    trustLevelPill: document.getElementById("trustLevelPill"),
    scoreRingProgress: document.getElementById("scoreRingProgress"),
    profileInsights: document.getElementById("profileInsights"),
    aiProbability: document.getElementById("aiProbability"),
    aiProbabilitySmall: document.getElementById("aiProbabilitySmall"),
    aiSummary: document.getElementById("aiSummary"),
    aiProgressBar: document.getElementById("aiProgressBar"),
    factorList: document.getElementById("factorList"),
    spamDensityBadge: document.getElementById("spamDensityBadge"),
    predictionBadge: document.getElementById("predictionBadge"),
    sparklinePath: document.getElementById("sparklinePath"),
    riskLevelBadge: document.getElementById("riskLevelBadge"),
    riskList: document.getElementById("riskList"),
    recommendationText: document.getElementById("recommendationText"),
    recommendationActions: document.getElementById("recommendationActions"),
    pdfButton: document.getElementById("pdfButton"),
    summaryAnalyses: document.getElementById("summaryAnalyses"),
    summaryValid: document.getElementById("summaryValid"),
    summaryFlagged: document.getElementById("summaryFlagged"),
    summaryLocal: document.getElementById("summaryLocal"),
    hunterButton: document.getElementById("hunterButton"),
    hunterInsights: document.getElementById("hunterInsights"),
    gravatarButton: document.getElementById("gravatarButton"),
    gravatarInsights: document.getElementById("gravatarInsights"),
    linkedinButton: document.getElementById("linkedinButton"),
    linkedinInsights: document.getElementById("linkedinInsights"),
    helpModal: document.getElementById("helpModal"),
    helpTitle: document.getElementById("helpTitle"),
    helpLead: document.getElementById("helpLead"),
    helpBlocks: document.getElementById("helpBlocks"),
    helpCloseButton: document.getElementById("helpCloseButton")
  };

  function emailRegex() {
    return /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
  }

  function normalizeEmail(email) {
    return email.trim().toLowerCase();
  }

  function isValidEmail(email) {
    return emailRegex().test(email);
  }

  function classForLevel(level) {
    if (level === "high") return "high";
    if (level === "medium") return "medium";
    return "low";
  }

  function trustMeta(score) {
    if (score >= 90) return { label: "Excellent", color: "#57c785", pillClass: "low" };
    if (score >= 70) return { label: "Stable", color: "#f2aa52", pillClass: "medium" };
    if (score >= 50) return { label: "Risque modere", color: "#ef8a47", pillClass: "medium" };
    return { label: "Risque eleve", color: "#ef5b5b", pillClass: "high" };
  }

  function probabilityMeta(score) {
    if (score >= 70) return { label: "Favorablement modele", className: "low" };
    if (score >= 50) return { label: "A confirmer", className: "medium" };
    return { label: "Fragile", className: "high" };
  }

  function setStatusBanner(type, text, showRetry) {
    elements.statusBanner.className = `status-banner visible ${type}`;
    elements.statusText.textContent = text;
    elements.retryButton.classList.toggle("hidden", !showRetry);
  }

  function clearStatusBanner() {
    elements.statusBanner.className = "status-banner";
    elements.statusText.textContent = "";
    elements.retryButton.classList.add("hidden");
  }

  function setLoading(isLoading) {
    elements.analyzeButton.disabled = isLoading || !isValidEmail(normalizeEmail(elements.emailInput.value));
    elements.emailInput.disabled = isLoading;
    elements.analyzeButton.classList.toggle("loading", isLoading);
  }

  function setPdfLoading(isLoading) {
    state.isDownloadingPdf = isLoading;
    elements.pdfButton.disabled = isLoading;
    elements.pdfButton.textContent = isLoading ? "Generation du PDF..." : "Telecharger le rapport PDF complet";
  }

  function setAsyncButtonLoading(button, isLoading, loadingLabel, idleLabel) {
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingLabel : idleLabel;
  }

  function formatStatus(status) {
    if (status === "valid") return "Valide";
    if (status === "invalid") return "Invalide";
    if (status === "catch-all") return "Catch-all";
    return status || "Inconnu";
  }

  function formatDateTime(value) {
    if (!value) return "Date inconnue";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function renderHistory(items) {
    if (!items || !items.length) {
      elements.historyList.innerHTML = '<p class="history-empty">Aucune analyse sauvegardee pour le moment.</p>';
      return;
    }

    elements.historyList.innerHTML = "";

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-chip";
      button.innerHTML = `
        <span class="history-primary">
          <span class="history-email">${item.email}</span>
          <span class="history-meta">${formatStatus(item.status)} | provider ${item.verification_provider || "-"} | score ${item.score ?? "-"} | ${formatDateTime(item.created_at)}</span>
        </span>
        <span class="status ${classForLevel(item.risk)}">${item.risk || "n/a"}</span>
      `;
      button.addEventListener("click", () => {
        elements.emailInput.value = item.email;
        handleInputChange();
        runAnalysis(item.email);
      });
      elements.historyList.appendChild(button);
    });
  }

  function renderDashboardSummary(summary) {
    elements.summaryAnalyses.textContent = String(summary.analyses_count || 0);
    elements.summaryValid.textContent = String(summary.valid_count || 0);
    elements.summaryFlagged.textContent = String(summary.flagged_count || 0);
    elements.summaryLocal.textContent = String(summary.local_count || 0);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(value) {
    if (!value) return null;

    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function updateInputState() {
    const email = normalizeEmail(elements.emailInput.value);
    const valid = isValidEmail(email);
    elements.emailInput.setAttribute("aria-invalid", String(email.length > 0 && !valid));
    elements.analyzeButton.disabled = !valid;

    if (!email) {
      elements.inputMessage.textContent = "Saisissez une adresse email valide pour lancer l'analyse.";
      elements.inputMessage.className = "inline-note";
      return;
    }

    if (!valid) {
      elements.inputMessage.textContent = "Format invalide. Respectez local@domaine et 254 caracteres maximum.";
      elements.inputMessage.className = "inline-note error";
      return;
    }

    elements.inputMessage.textContent = "Format valide. Verification prete.";
    elements.inputMessage.className = "inline-note";
  }

  function renderProviderWarning() {
    const selected = elements.providerSelect.value || "auto";
    const settings = state.settings;

    if (!settings || !settings.runtime) {
      elements.providerWarning.textContent = "";
      elements.providerWarning.className = "inline-note hidden";
      return;
    }

    if (selected === "abstract") {
      if (!settings.abstract_api_key) {
        elements.providerWarning.textContent = "ABSTRACT_API_KEY absente. Configure-la dans Parametrage, puis redemarre l'application.";
        elements.providerWarning.className = "inline-note error";
        return;
      }

      if (settings.runtime.abstract && !settings.runtime.abstract.ok && settings.runtime.abstract.last_error) {
        elements.providerWarning.textContent = `Abstract en erreur: ${settings.runtime.abstract.last_error}`;
        elements.providerWarning.className = "inline-note error";
        return;
      }
    }

    if (selected === "auto" && !settings.abstract_api_key) {
      elements.providerWarning.textContent = "Mode auto: Abstract n'est pas configure. Le moteur utilisera ZeroBounce si disponible, sinon fallback local.";
      elements.providerWarning.className = "inline-note";
      return;
    }

    elements.providerWarning.textContent = "";
    elements.providerWarning.className = "inline-note hidden";
  }

  function renderTypoBanner(result) {
    const suggestion = result && result.suggestion && result.suggestion !== result.email ? result.suggestion : null;
    state.typoSuggestion = suggestion;

    if (!suggestion) {
      elements.typoBanner.classList.remove("visible");
      elements.typoText.textContent = "";
      return;
    }

    elements.typoText.textContent = `L'adresse semble corrigible automatiquement. Suggestion: "${suggestion}".`;
    elements.typoBanner.classList.add("visible");
  }

  function renderTechnicalList(result) {
    const items = [
      {
        icon: "SRC",
        title: "Source de verification",
        copy: result.is_local_fallback
          ? "Fallback local DNS/MX active."
          : result.verification_provider === "local"
          ? "Verification locale DNS/MX."
          : `Verification via ${result.verification_provider || "provider inconnu"}.`,
        detail: result.is_local_fallback
          ? "Aucune API payante n'a ete utilisee pour cette analyse."
          : result.provider_message || `Provider demande: ${result.requested_provider || result.verification_provider || "-"}`,
        status: {
          label: result.is_local_fallback ? "Local fallback" : (result.verification_provider || "unknown"),
          kind: result.is_local_fallback ? "warning" : "success"
        }
      },
      {
        icon: "ID",
        title: "Identite detectee",
        copy: result.full_name || "Unknown user",
        detail: result.full_name === "Unknown user"
          ? "Aucun nom fiable n'a pu etre deduit a partir de l'adresse."
          : `Prenom: ${result.firstname || "-"} | Nom: ${result.lastname || "-"}`,
        status: { label: result.full_name === "Unknown user" ? "Inconnu" : "Identifie", kind: result.full_name === "Unknown user" ? "warning" : "success" }
      },
      {
        icon: "RFC",
        title: "Validation de syntaxe",
        copy: result.syntax ? "Le format de l'adresse est correct." : "Le format de l'adresse est invalide.",
        detail: `Detail du resultat: ${subStatusLabel(result.deliverabilityDetail)}`,
        status: result.syntax ? { label: "Valide", kind: "success" } : { label: "Invalide", kind: "error" }
      },
      {
        icon: "DNS",
        title: "Verification DNS / MX",
        copy: result.mx
          ? `Serveurs trouves: ${result.mxRecords.length ? result.mxRecords.join(" | ") : "MX valide"}`
          : "Aucun serveur de messagerie valide n'a ete detecte.",
        detail: `Domaine analyse: ${result.domain}`,
        status: result.mx ? { label: "Trouve", kind: "success" } : { label: "Introuvable", kind: "error" }
      },
      {
        icon: "SMTP",
        title: "Verification SMTP",
        copy: result.smtp
          ? "Le serveur de messagerie accepte la boite comme probablement delivrable."
          : "La validite SMTP n'a pas pu etre confirmee.",
        detail: `Resultat principal: ${statusLabel(result.deliverability)}`,
        status: result.smtp ? { label: "Existant", kind: "success" } : { label: "Inconnu", kind: "warning" }
      },
      {
        icon: "ROLE",
        title: "Detection de roles",
        copy: result.role
          ? "Adresse generique de type support, info, sales ou similaire."
          : "Adresse non detectee comme generique.",
        detail: result.role ? "Ce type d'adresse est souvent partage entre plusieurs personnes." : "Meilleur signal pour un contact individuel.",
        status: result.role ? { label: "Role-based", kind: "warning" } : { label: "Nominative", kind: "success" }
      },
      {
        icon: "TYP",
        title: "Type d'email",
        copy: result.email_type === "professional" ? "Adresse professionnelle" : "Adresse personnelle",
        detail: result.email_type === "professional"
          ? `Domaine societe: ${result.company_domain || result.domain}`
          : `Fournisseur grand public: ${result.domain}`,
        status: { label: result.email_type === "professional" ? "Professionnel" : "Personnel", kind: "success" }
      }
    ];

    elements.technicalList.innerHTML = items
      .map(
        (item) => `
          <div class="verification-item">
            <div class="item-main">
              <span class="item-icon">${item.icon}</span>
              <div>
                <p class="item-title">${item.title}</p>
                <p class="item-copy">${item.copy}</p>
                <p class="item-detail">${item.detail}</p>
              </div>
            </div>
            <span class="status ${item.status.kind}">${item.status.label}</span>
          </div>`
      )
      .join("");
  }

  function statusLabel(status) {
    if (status === "valid") return "Valide";
    if (status === "invalid") return "Invalide";
    if (status === "catch-all") return "Catch-all";
    if (status === "do_not_mail") return "Ne pas contacter";
    if (status === "unknown") return "Inconnu";
    return status || "Inconnu";
  }

  function subStatusLabel(subStatus) {
    if (!subStatus) return "Aucun detail supplementaire";

    const labels = {
      valid: "Boite confirmee",
      role_based: "Adresse generique",
      disposable: "Adresse jetable",
      toxic: "Adresse a risque",
      mailbox_not_found: "Boite introuvable",
      failed_smtp_connection: "Connexion serveur impossible",
      failed_syntax_check: "Format non reconnu",
      does_not_accept_mail: "Le domaine ne recoit pas d'emails",
      greylisted: "Verification repoussee temporairement",
      mail_server_temporary_error: "Erreur temporaire du serveur",
      timeout_exceeded: "Temps de reponse depasse",
      catch_all: "Domaine catch-all"
    };

    return labels[subStatus] || subStatus;
  }

  function scoreExplanation(result) {
    if (result.is_local_fallback) {
      return "Le mode automatique est tombe en fallback local DNS/MX. Aucune API payante n'a ete utilisee, donc le score reste plus heuristique.";
    }

    if (result.status === "invalid") {
      return "L'adresse est invalide. Ici, le score n'est plus le sujet principal: c'est le statut qui compte.";
    }

    if (result.score_source === "fallback") {
      return "ZeroBounce n'a pas fourni de score exploitable. Une note estimee a ete calculee a partir des signaux techniques disponibles.";
    }

    if (result.score === 0) {
      return "ZeroBounce n'a attribue aucun score utile ou a attribue la note la plus faible. Cela ne veut pas automatiquement dire que l'adresse est fausse.";
    }

    if (result.score < 50) {
      return "La note est faible. L'adresse peut exister, mais sa qualite ou sa fiabilite parait limitee.";
    }

    if (result.score < 70) {
      return "La note est moyenne. L'adresse merite une verification humaine si l'usage est sensible.";
    }

    return "La note est plutot rassurante, sans remplacer pour autant le statut de validation.";
  }

  function renderTrustScore(result) {
    const meta = trustMeta(result.score);
    const offset = Number(((1 - result.score / 100) * 282.743).toFixed(3));

    elements.trustScore.textContent = String(result.score);
    elements.trustLabel.textContent = meta.label;
    elements.trustSummary.textContent =
      result.status === "valid"
        ? `Statut principal: ${statusLabel(result.status)}. ${scoreExplanation(result)}`
        : `Statut principal: ${statusLabel(result.status)}. ${scoreExplanation(result)}`;
    elements.scoreRingProgress.style.stroke = meta.color;
    elements.scoreRingProgress.style.strokeDashoffset = String(offset);
    elements.trustLevelPill.textContent = meta.label;
    elements.trustLevelPill.className = `pill ${meta.pillClass}`;

    const factors = [
      { label: "Domaine", copy: result.domain, value: result.mx ? "MX OK" : "MX NOK" },
      { label: "Resultat principal", copy: statusLabel(result.deliverability), value: result.smtp ? "SMTP OK" : "SMTP NOK" },
      { label: "Adresse jetable", copy: result.disposable ? "Oui" : "Non", value: result.disposable ? "Risque" : "Stable" },
      { label: "Adresse de role", copy: result.role ? "Oui" : "Non", value: result.role ? "A revoir" : "Nominale" },
      { label: "Type de fournisseur", copy: result.provider_type === "free" ? "Gratuit" : "Entreprise", value: result.domain_age_estimate },
      { label: "Utilisateur", copy: result.full_name || "Unknown user", value: result.email_type === "professional" ? "Pro" : "Perso" }
    ];

    if (result.is_local_fallback) {
      factors.unshift({
        label: "Mode",
        copy: "Fallback local",
        value: "No paid API"
      });
    }

    elements.trustFactors.innerHTML = factors
      .map(
        (factor) => `
          <div class="factor-item">
            <div>
              <p class="item-title">${factor.label}</p>
              <p class="factor-copy">${factor.copy}</p>
            </div>
            <span class="factor-score">${factor.value}</span>
          </div>`
      )
      .join("");
  }

  function renderPrediction(result) {
    const score = Number(result.score);
    const meta = probabilityMeta(score);
    const densityClass = classForLevel(result.risk);
    const densityLabel = result.risk === "high" ? "High Density" : result.risk === "medium" ? "Medium Density" : "Low Density";

    elements.aiProbability.textContent = `${score.toFixed(1)}%`;
    elements.aiProbabilitySmall.textContent = `${score.toFixed(1)}%`;
    elements.aiSummary.textContent =
      result.is_local_fallback
        ? "Analyse locale DNS/MX uniquement. Les signaux SMTP et reputation provider ne sont pas disponibles."
        : result.status === "invalid"
        ? "ZeroBounce marque cette adresse comme invalide."
        : result.score === 0
        ? "ZeroBounce renvoie un score nul ou inexploitable. L'adresse peut tout de meme etre valide si le statut principal est positif."
        : result.disposable
        ? "Le score baisse car l'adresse est consideree comme jetable."
        : result.smtp && result.mx
          ? "Le score est soutenu par des signaux de delivrabilite coherents."
          : "Le score est limite par des verifications techniques incomplertes.";

    elements.aiProgressBar.style.width = `${score}%`;
    elements.aiProgressBar.style.background =
      score >= 70
        ? "linear-gradient(90deg, #57c785, #8ad5a9)"
        : score >= 50
          ? "linear-gradient(90deg, #f2aa52, #ffd08a)"
          : "linear-gradient(90deg, #ef5b5b, #ff9d9d)";

    elements.predictionBadge.textContent = meta.label;
    elements.predictionBadge.className = `pill ${meta.className}`;
    elements.spamDensityBadge.textContent = densityLabel;
    elements.spamDensityBadge.className = `pill ${densityClass}`;

    elements.factorList.innerHTML = `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">QLT</span>
          <div>
            <p class="item-title">Score de confiance</p>
            <p class="item-copy">Score affiche: ${result.score}/100${result.score_source === "fallback" ? " (estimated score)" : ""}.</p>
            <p class="item-detail">Source: ${result.is_local_fallback ? "Fallback local DNS/MX (aucune API payante)" : result.score_source === "fallback" ? "Calcul estime" : (result.verification_provider || "provider inconnu")}${result.quality_score_raw !== null ? ` | valeur brute: ${result.quality_score_raw}` : ""}</p>
          </div>
        </div>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">IDN</span>
          <div>
            <p class="item-title">Identite</p>
            <p class="item-copy">${result.full_name || "Unknown user"}</p>
            <p class="item-detail">Type: ${result.email_type === "professional" ? "professionnel" : "personnel"}</p>
          </div>
        </div>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">DSP</span>
          <div>
            <p class="item-title">Adresse jetable</p>
            <p class="item-copy">${result.disposable ? "Le fournisseur signale une adresse temporaire ou jetable." : "Aucun signal d'adresse jetable."}</p>
          </div>
        </div>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">DLV</span>
          <div>
            <p class="item-title">Resultat de delivrabilite</p>
            <p class="item-copy">Resultat principal: ${statusLabel(result.deliverability)}</p>
            <p class="item-detail">Detail du resultat: ${subStatusLabel(result.deliverabilityDetail)}</p>
          </div>
        </div>
      </div>
    `;

    elements.sparklinePath.setAttribute(
      "d",
      score >= 70
        ? "M6 43 C36 40, 42 24, 72 26 S122 44, 152 34 S202 12, 232 18 S280 26, 314 8"
        : score >= 50
          ? "M6 40 C38 34, 50 34, 76 38 S122 44, 152 30 S198 18, 230 24 S280 36, 314 20"
          : "M6 18 C36 26, 48 38, 76 42 S122 34, 152 44 S198 42, 232 40 S280 34, 314 44"
    );
  }

  function renderProfileInsights(result) {
    elements.profileInsights.innerHTML = `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">USR</span>
          <div>
            <p class="item-title">Nom complet</p>
            <p class="item-copy">${result.full_name || "Unknown user"}</p>
            <p class="item-detail">Prenom: ${result.firstname || "-"} | Nom: ${result.lastname || "-"}</p>
          </div>
        </div>
        <span class="status ${result.full_name === "Unknown user" ? "warning" : "success"}">${result.full_name === "Unknown user" ? "Infere partiel" : "Identifie"}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">TYP</span>
          <div>
            <p class="item-title">Type d'email</p>
            <p class="item-copy">${result.email_type === "professional" ? "Professionnel" : "Personnel"}</p>
            <p class="item-detail">${result.email_type === "professional" ? `Domaine societe: ${result.company_domain || result.domain}` : `Fournisseur grand public: ${result.domain}`}</p>
          </div>
        </div>
        <span class="status success">${result.email_type === "professional" ? "Pro" : "Perso"}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">DOM</span>
          <div>
            <p class="item-title">Intelligence domaine</p>
            <p class="item-copy">Type fournisseur: ${result.provider_type === "free" ? "Gratuit" : "Entreprise"}</p>
            <p class="item-detail">Age estime: ${result.domain_age_estimate} | Domaine: ${result.domain}</p>
          </div>
        </div>
        <span class="status success">${result.domain_age_estimate}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">SRC</span>
          <div>
            <p class="item-title">Source utilisee</p>
            <p class="item-copy">${result.is_local_fallback ? "Fallback local DNS/MX" : (result.verification_provider || "unknown")}</p>
            <p class="item-detail">${result.is_local_fallback ? "Le mode auto a degrade vers le moteur local. Aucune API payante n'a ete utilisee." : (result.provider_message || `Provider demande: ${result.requested_provider || result.verification_provider || "-"}`)}</p>
          </div>
        </div>
        <span class="status ${result.is_local_fallback ? "warning" : "success"}">${result.is_local_fallback ? "Fallback" : "Source"}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">RSK</span>
          <div>
            <p class="item-title">Niveau de risque</p>
            <p class="item-copy">${result.risk}</p>
            <p class="item-detail">Statut principal: ${statusLabel(result.status)} | Score de confiance: ${result.score}/100</p>
          </div>
        </div>
        <span class="status ${result.risk === "high" ? "error" : result.risk === "medium" ? "warning" : "success"}">${result.risk}</span>
      </div>
    `;
  }

  function renderRiskIntelligence(result) {
    const riskClass = classForLevel(result.risk);
    const riskLabel = result.risk === "high" ? "High Risk" : result.risk === "medium" ? "Medium Risk" : "Low Risk";

    elements.riskLevelBadge.textContent = riskLabel;
    elements.riskLevelBadge.className = `pill ${riskClass}`;

    const riskPoints = [
      result.disposable ? "Adresse jetable detectee" : "Pas d'adresse jetable",
      result.role ? "Adresse de role detectee" : "Pas d'adresse de role",
      result.smtp ? "SMTP valide" : "SMTP non confirme",
      result.mx ? "MX detecte" : "MX absent"
    ];

    elements.riskList.innerHTML = `
      <div class="risk-item">
        <div class="item-main">
          <span class="item-icon">RSK</span>
          <div>
            <p class="item-title">Niveau de risque</p>
            <p class="item-copy">${riskPoints.join(" | ")}</p>
          </div>
        </div>
        <span class="status ${riskClass === "high" ? "error" : riskClass === "medium" ? "warning" : "success"}">${riskLabel}</span>
      </div>
      <div class="risk-item">
        <div class="item-main">
          <span class="item-icon">DOM</span>
          <div>
            <p class="item-title">Intelligence domaine</p>
            <p class="item-copy">Domaine evalue: ${result.domain}</p>
            <p class="item-detail">Type: ${result.provider_type === "free" ? "gratuit" : "entreprise"} | Age estime: ${result.domain_age_estimate}</p>
          </div>
        </div>
        <span class="status success">${result.domain}</span>
      </div>
      <div class="risk-item">
        <div class="item-main">
          <span class="item-icon">USR</span>
          <div>
            <p class="item-title">Profil utilisateur</p>
            <p class="item-copy">${result.full_name || "Unknown user"}</p>
            <p class="item-detail">Email ${result.email_type === "professional" ? "professionnel" : "personnel"}${result.company_domain ? ` | Domaine societe: ${result.company_domain}` : ""}</p>
          </div>
        </div>
        <span class="status success">${result.email_type}</span>
      </div>
      <div class="risk-item">
        <div class="item-main">
          <span class="item-icon">ACT</span>
          <div>
            <p class="item-title">Action recommandee</p>
            <p class="item-copy">${result.status === "valid" ? "Adresse techniquement valide." : result.risk === "low" ? "Adresse exploitable." : result.risk === "medium" ? "Verification manuelle conseillee." : "Adresse a traiter avec une forte prudence."}</p>
            <p class="item-detail">${result.suggestion ? `Suggestion detectee: ${result.suggestion}` : "Aucune correction automatique remontee."}</p>
          </div>
        </div>
        <span class="status ${riskClass === "high" ? "error" : "warning"}">${result.risk}</span>
      </div>
    `;

    elements.recommendationText.textContent =
      result.status === "invalid"
        ? "ZeroBounce signale une adresse invalide. Elle doit etre corrigee avant tout usage."
        : result.is_local_fallback
        ? "Le mode automatique a bascule sur le moteur local DNS/MX. L'analyse est utile, mais plus prudente car aucune API payante n'a ete interrogee."
        : result.risk === "low"
        ? "Tous les signaux essentiels sont au vert. Vous pouvez utiliser cette adresse avec un bon niveau de confiance."
        : result.risk === "medium"
          ? "Des signaux mitigés ont ete detectes. Une verification humaine reste conseillee."
          : "Le fournisseur remonte un niveau de risque eleve. N'utilisez pas cette adresse sans confirmation supplementaire.";

    elements.recommendationActions.innerHTML = `
      <div class="recommendation-action">
        <span class="action-name">APPLY_FIX</span>
        <p class="action-copy">${state.typoSuggestion || "Aucune correction proposee par le fournisseur."}</p>
      </div>
      <div class="recommendation-action">
        <span class="action-name">FLAG_FOR_REVIEW</span>
        <p class="action-copy">Recommande si le risque est moyen ou eleve, ou si SMTP n'est pas confirme.</p>
      </div>
      <div class="recommendation-action">
        <span class="action-name">APPROVE</span>
        <p class="action-copy">Possible si la syntaxe, MX et SMTP sont valides et si le risque reste faible.</p>
      </div>
      <div class="recommendation-action">
        <span class="action-name">REJECT</span>
        <p class="action-copy">A envisager en cas d'adresse jetable, de format invalide ou de risque eleve.</p>
      </div>
    `;
  }

  function renderResult(result) {
    state.currentResult = result;
    state.currentEmail = result.email;
    renderTypoBanner(result);
    renderTechnicalList(result);
    renderTrustScore(result);
    renderProfileInsights(result);
    renderPrediction(result);
    renderRiskIntelligence(result);
    elements.resultsSection.classList.remove("hidden");
    elements.resultsSection.classList.add("fade-in");
    setStatusBanner(
      "success",
      result.status === "invalid"
        ? `Invalid email: ${result.email}`
        : result.is_local_fallback
        ? `Fallback local active pour ${result.email}. Aucune API payante n'a ete utilisee. ${result.provider_message || ""}`.trim()
        : result.cached
        ? `Analyse chargee depuis le cache serveur 5 minutes pour ${result.email}.`
        : `Analyse terminee pour ${result.email}. Source ${result.verification_provider || "unknown"}, ${result.full_name || "Unknown user"}, email ${result.email_type}, statut ${statusLabel(result.status)}, score ${result.score}/100, risque ${result.risk}.`,
      false
    );
  }

  async function verifyEmail(email) {
    const provider = elements.providerSelect.value || "auto";
    const response = await fetch(`/api/verify?email=${encodeURIComponent(email)}&provider=${encodeURIComponent(provider)}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.details || payload.error || "La verification a echoue.");
    }

    return payload;
  }

  async function loadProviders() {
    try {
      const response = await fetch("/api/verification/providers", {
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      if (payload.default_provider) {
        elements.providerSelect.value = payload.default_provider;
      }
    } catch (error) {
      // Keep static options if provider metadata cannot be loaded.
    }
  }

  async function loadSettingsStatus() {
    try {
      const response = await fetch("/api/settings", {
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      state.settings = payload;
      renderProviderWarning();
    } catch (error) {
      // Ignore settings status failures on the main page.
    }
  }

  async function fetchRecentAnalyses() {
    const response = await fetch("/api/analyses?limit=5", {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Impossible de charger les analyses recentes.");
    }

    return payload.items || [];
  }

  async function fetchDashboardSummary() {
    const response = await fetch("/api/dashboard/summary", {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Impossible de charger le resume dashboard.");
    }

    return payload;
  }

  async function refreshDashboardSnapshot() {
    try {
      const [items, summary] = await Promise.all([fetchRecentAnalyses(), fetchDashboardSummary()]);
      renderHistory(items);
      renderDashboardSummary(summary);
    } catch (error) {
      elements.historyList.innerHTML = `<p class="history-empty">${error.message}</p>`;
    }
  }

  function filenameFromDisposition(header) {
    if (!header) return "verifyor-report.pdf";
    const match = /filename="([^"]+)"/i.exec(header);
    return match ? match[1] : "verifyor-report.pdf";
  }

  async function requestPdfReport(result) {
    const response = await fetch("/api/report/pdf", {
      method: "POST",
      headers: {
        Accept: "application/pdf",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(result)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.details || payload.error || "La generation du PDF a echoue.");
    }

    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get("content-disposition"))
    };
  }

  async function postIntelligence(endpoint, email, currentResult) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        currentResult
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.details || payload.error || "Le chargement d'intelligence a echoue.");
    }

    return payload;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderInfoRows(container, rows) {
    container.innerHTML = rows
      .map(
        (row) => `
          <div class="info-item">
            <div class="item-main">
              <span class="item-icon">${escapeHtml(row.icon)}</span>
              <div>
                <p class="item-title">${escapeHtml(row.title)}</p>
                <p class="item-copy">${escapeHtml(row.copy)}</p>
                ${row.detail ? `<p class="item-detail">${escapeHtml(row.detail)}</p>` : ""}
              </div>
            </div>
            ${row.status ? `<span class="status ${escapeHtml(row.status.kind)}">${escapeHtml(row.status.label)}</span>` : ""}
          </div>`
      )
      .join("");
  }

  function renderSocialProfiles(profiles) {
    const items = (profiles || [])
      .filter((profile) => profile && (profile.url || profile.handle))
      .map((profile) => {
        const url = safeUrl(profile.url);
        const label = profile.handle ? `${profile.network}: ${profile.handle}` : profile.network;
        if (!url) {
          return `<span class="status pending">${escapeHtml(label)}</span>`;
        }
        return `<a class="link-action" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
      });

    return items.length ? items.join(" | ") : "Aucun reseau social public remonte";
  }

  function renderHunterInsights(data) {
    const contacts = (data.pattern_detection && data.pattern_detection.sample_emails ? data.pattern_detection.sample_emails : [])
      .slice(0, 3)
      .map((contact) => `${contact.email || "-"}${contact.position ? ` (${contact.position})` : ""}`)
      .join(" | ") || "Aucun email source remonte";
    const socialProfiles = renderSocialProfiles(data.social_profiles || data.person.social_profiles || []);

    elements.hunterInsights.innerHTML = `
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">B2B</span>
          <div>
            <p class="item-title">Entreprise</p>
            <p class="item-copy">${escapeHtml(data.company.name || "Societe inconnue")}</p>
            <p class="item-detail">${escapeHtml([data.company.industry, data.company.location, data.company.domain].filter(Boolean).join(" | "))}</p>
          </div>
        </div>
        <span class="status success">${escapeHtml(data.company.domain || "n/a")}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">PAT</span>
          <div>
            <p class="item-title">Pattern detection</p>
            <p class="item-copy">${escapeHtml(data.pattern_detection.pattern || "Pattern non remonte")}</p>
            <p class="item-detail">${escapeHtml(`Exemples trouves: ${contacts}`)}</p>
          </div>
        </div>
        <span class="status warning">${escapeHtml(data.pattern_detection.organization || "Pattern")}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">DLV</span>
          <div>
            <p class="item-title">Deliverability Hunter</p>
            <p class="item-copy">${escapeHtml(data.deliverability.result || "Inconnu")}</p>
            <p class="item-detail">${escapeHtml(`Score: ${data.deliverability.score ?? "-"} | Status: ${data.deliverability.status || "-"}`)}</p>
          </div>
        </div>
        <span class="status ${data.deliverability.result === "deliverable" || data.deliverability.result === "valid" ? "success" : "warning"}">${escapeHtml(data.deliverability.result || "n/a")}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">PRS</span>
          <div>
            <p class="item-title">Personne enrichie</p>
            <p class="item-copy">${escapeHtml(data.person.full_name || "Unknown user")}</p>
            <p class="item-detail">${escapeHtml(`Titre: ${data.person.title || "-"}${data.person.linkedin_url ? ` | LinkedIn: ${data.person.linkedin_url}` : ""}`)}</p>
          </div>
        </div>
        <span class="status success">${escapeHtml(data.emailFinder.email || data.email)}</span>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">SOC</span>
          <div>
            <p class="item-title">Reseaux sociaux</p>
            <p class="item-copy">${socialProfiles}</p>
            <p class="item-detail">Liens publics remontes par l'email enrichment Hunter quand ils existent.</p>
          </div>
        </div>
        <span class="status ${(data.social_profiles || data.person.social_profiles || []).length ? "success" : "pending"}">${(data.social_profiles || data.person.social_profiles || []).length ? "public" : "none"}</span>
      </div>
    `;
  }

  function renderGravatarInsights(data) {
    if (!data.public_profile) {
      elements.gravatarInsights.innerHTML = `
        <p class="insight-empty">Aucun profil public Gravatar trouve pour ${escapeHtml(data.email)}.</p>
      `;
      return;
    }

    const verified = (data.verified_accounts || [])
      .slice(0, 4)
      .map((account) => account.service_label || account.service_type || account.url)
      .filter(Boolean)
      .join(" | ");
    const profileUrl = safeUrl(data.profile_url);
    const photoUrl = safeUrl(data.photo_url);

    elements.gravatarInsights.innerHTML = `
      <div class="avatar-tile">
        ${photoUrl ? `<img class="avatar-image" src="${photoUrl}" alt="Avatar Gravatar" />` : '<div class="avatar-image"></div>'}
        <div>
          <p class="item-title">${escapeHtml(data.full_name || "Profil public sans nom")}</p>
          <p class="item-copy">${escapeHtml(`${data.job_title || "Aucun poste public"}${data.company ? ` | ${data.company}` : ""}`)}</p>
          <p class="item-detail">${escapeHtml(data.location || "Localisation non publique")}</p>
        </div>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">URL</span>
          <div>
            <p class="item-title">Profil public</p>
            <p class="item-copy">${profileUrl ? `<a class="link-action" href="${profileUrl}" target="_blank" rel="noreferrer">Ouvrir le profil</a>` : "Aucun lien public"}</p>
            <p class="item-detail">${escapeHtml(verified || data.source_note)}</p>
          </div>
        </div>
        <span class="status success">Public</span>
      </div>
    `;
  }

  function renderLinkedinInsights(data) {
    const photoUrl = safeUrl(data.photo_url);
    const linkedinUrl = safeUrl(data.linkedin_url);
    elements.linkedinInsights.innerHTML = `
      <div class="avatar-tile">
        ${photoUrl ? `<img class="avatar-image" src="${photoUrl}" alt="Photo du matching" />` : '<div class="avatar-image"></div>'}
        <div>
          <p class="item-title">${escapeHtml(data.full_name || "Aucun nom fiable")}</p>
          <p class="item-copy">${escapeHtml(`${data.job_title || "Poste non remonte"}${data.company ? ` | ${data.company}` : ""}`)}</p>
          <p class="item-detail">${linkedinUrl ? `<a class="link-action" href="${linkedinUrl}" target="_blank" rel="noreferrer">Voir le profil LinkedIn suggere</a>` : "Aucun profil LinkedIn public fiable remonte."}</p>
        </div>
      </div>
      <div class="info-item">
        <div class="item-main">
          <span class="item-icon">SIG</span>
          <div>
            <p class="item-title">Confiance du matching</p>
            <p class="item-copy">${escapeHtml(data.confidence)}</p>
            <p class="item-detail">${escapeHtml(data.source_note)}</p>
          </div>
        </div>
        <span class="status ${data.confidence === "medium" ? "warning" : data.confidence === "low" ? "pending" : "error"}">${escapeHtml(data.confidence)}</span>
      </div>
    `;
  }

  async function runAnalysis(rawEmail) {
    const email = normalizeEmail(rawEmail || elements.emailInput.value);
    state.retryEmail = email;
    elements.emailInput.value = email;
    updateInputState();

    if (!isValidEmail(email)) {
      setStatusBanner("error", "Impossible de lancer l'analyse: format email invalide.", true);
      elements.resultsSection.classList.add("hidden");
      return;
    }

    setLoading(true);
    setStatusBanner("loading", "Analyse en cours...", false);

    try {
      const result = await verifyEmail(email);
      renderResult(result);
      refreshDashboardSnapshot();
    } catch (error) {
      elements.resultsSection.classList.add("hidden");
      elements.typoBanner.classList.remove("visible");
      setStatusBanner("error", error.message, true);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange() {
    updateInputState();
    clearStatusBanner();
    elements.typoBanner.classList.remove("visible");
  }

  function applyTypoCorrection() {
    if (!state.typoSuggestion) return;
    elements.emailInput.value = state.typoSuggestion;
    handleInputChange();
    runAnalysis(state.typoSuggestion);
  }

  async function handlePdfDownload() {
    if (!state.currentResult) {
      setStatusBanner("error", "Aucun resultat disponible. Lancez une analyse avant l'export PDF.", false);
      return;
    }

    setPdfLoading(true);
    setStatusBanner("loading", `Generation du rapport PDF pour ${state.currentResult.email}...`, false);

    try {
      const { blob, filename } = await requestPdfReport(state.currentResult);
      downloadBlob(blob, filename);
      setStatusBanner("success", `Rapport PDF genere pour ${state.currentResult.email}.`, false);
    } catch (error) {
      setStatusBanner("error", error.message, false);
    } finally {
      setPdfLoading(false);
    }
  }

  function requireCurrentResultForIntelligence() {
    if (state.currentResult) return true;
    setStatusBanner("error", "Lancez d'abord une analyse email avant d'utiliser les modules d'intelligence.", false);
    return false;
  }

  async function handleHunterLookup() {
    if (!requireCurrentResultForIntelligence()) return;

    state.isLoadingHunter = true;
    setAsyncButtonLoading(elements.hunterButton, true, "Chargement Hunter...", "B2B email intelligence");

    try {
      const payload = await postIntelligence("/api/intelligence/hunter", state.currentResult.email, state.currentResult);
      renderHunterInsights(payload);
      setStatusBanner("success", `Intelligence B2B chargee pour ${state.currentResult.email}.`, false);
    } catch (error) {
      elements.hunterInsights.innerHTML = `<p class="insight-empty">${error.message}</p>`;
      setStatusBanner("error", error.message, false);
    } finally {
      state.isLoadingHunter = false;
      setAsyncButtonLoading(elements.hunterButton, false, "Chargement Hunter...", "B2B email intelligence");
    }
  }

  async function handleGravatarLookup() {
    if (!requireCurrentResultForIntelligence()) return;

    state.isLoadingGravatar = true;
    setAsyncButtonLoading(elements.gravatarButton, true, "Chargement Gravatar...", "Gravatar lookup");

    try {
      const payload = await postIntelligence("/api/intelligence/gravatar", state.currentResult.email, state.currentResult);
      renderGravatarInsights(payload);
      setStatusBanner("success", `Lookup Gravatar termine pour ${state.currentResult.email}.`, false);
    } catch (error) {
      elements.gravatarInsights.innerHTML = `<p class="insight-empty">${error.message}</p>`;
      setStatusBanner("error", error.message, false);
    } finally {
      state.isLoadingGravatar = false;
      setAsyncButtonLoading(elements.gravatarButton, false, "Chargement Gravatar...", "Gravatar lookup");
    }
  }

  async function handleLinkedinLookup() {
    if (!requireCurrentResultForIntelligence()) return;

    state.isLoadingLinkedin = true;
    setAsyncButtonLoading(elements.linkedinButton, true, "Matching en cours...", "LinkedIn matching");

    try {
      const payload = await postIntelligence("/api/intelligence/linkedin-match", state.currentResult.email, state.currentResult);
      renderLinkedinInsights(payload);
      setStatusBanner("success", `Matching LinkedIn calcule pour ${state.currentResult.email}.`, false);
    } catch (error) {
      elements.linkedinInsights.innerHTML = `<p class="insight-empty">${error.message}</p>`;
      setStatusBanner("error", error.message, false);
    } finally {
      state.isLoadingLinkedin = false;
      setAsyncButtonLoading(elements.linkedinButton, false, "Matching en cours...", "LinkedIn matching");
    }
  }

  function getHelpContent(type) {
    const result = state.currentResult;

    if (type === "search") {
      return {
        title: "Comment utiliser cette page",
        lead: "Cette zone sert a verifier une adresse email via plusieurs strategies: local DNS/MX, ZeroBounce, Abstract ou mode automatique.",
        blocks: [
          { title: "Champ email", copy: "Saisissez ici l'adresse a verifier. Le bouton n'est actif que si le format est correct." },
          { title: "Provider", copy: "Vous pouvez forcer le mode local, ZeroBounce, Abstract ou laisser le serveur choisir automatiquement la meilleure option disponible." },
          { title: "Analyser", copy: "Un clic envoie une requete au serveur local sur /api/verify. Les cles externes restent cote serveur." },
          { title: "Banniere jaune", copy: "Si ZeroBounce retourne une suggestion de correction, elle s'affiche ici pour etre appliquee en un clic." },
          { title: "Historique", copy: "Les 5 dernieres analyses sauvegardees en base restent visibles pour relancer rapidement une verification." }
        ]
      };
    }

    if (!result) {
      return {
        title: "Aide contextuelle",
        lead: "Lancez d'abord une analyse pour voir l'explication des valeurs actuellement affichees.",
        blocks: [{ title: "Pourquoi", copy: "L'aide s'appuie sur les donnees recues depuis l'API pour expliquer concretement ce que signifient les resultats." }]
      };
    }

    if (type === "technical") {
      return {
        title: "Comprendre la verification technique",
        lead: "Cette carte explique si l'adresse semble techniquement recevable par un systeme de messagerie.",
        blocks: [
          { title: "Identite detectee", copy: `Le systeme affiche "${result.full_name || "Unknown user"}". Si ZeroBounce ne fournit pas de nom, l'application tente une deduction a partir de l'adresse email.` },
          { title: "Syntaxe", copy: result.syntax ? "Le format de l'adresse est correct." : "Le format de l'adresse n'est pas correct." },
          { title: "DNS / MX", copy: result.mx ? "Le domaine annonce des serveurs capables de recevoir des emails." : "Le domaine n'annonce pas de serveurs de messagerie valides." },
          { title: "SMTP", copy: result.smtp ? "ZeroBounce confirme un signal positif cote serveur de messagerie." : "Le serveur de messagerie n'a pas permis une confirmation fiable." },
          { title: "Adresse de role", copy: result.role ? "L'adresse semble etre une boite generique comme support ou contact." : "L'adresse ne semble pas etre une boite generique." },
          { title: "Type d'email", copy: result.email_type === "professional" ? "Le domaine n'appartient pas a un fournisseur grand public connu. L'adresse est classee comme professionnelle." : "Le domaine appartient a un fournisseur grand public connu. L'adresse est classee comme personnelle." }
        ]
      };
    }

    if (type === "trust") {
      return {
        title: "Comprendre le score de confiance",
        lead: "Ce score resume la qualite globale renvoyee par le fournisseur de verification.",
        blocks: [
          { title: "Valeur actuelle", copy: `Le score affiche est ${result.score}/100.` },
          { title: "Comment l'interpreter", copy: "Le statut de validation reste plus important que la note. Un score faible ne veut pas toujours dire que l'adresse est fausse." },
          { title: "Ce qui pese", copy: `Le resultat principal est "${statusLabel(result.deliverability)}" et le detail est "${subStatusLabel(result.deliverabilityDetail)}". Le score vient seulement en complement.` },
          { title: "Intelligence domaine", copy: `Le domaine est classe comme ${result.provider_type === "free" ? "fournisseur gratuit" : "domaine d'entreprise"} avec un age estime "${result.domain_age_estimate}".` }
        ]
      };
    }

    if (type === "profile") {
      return {
        title: "Comprendre le profil enrichi",
        lead: "Cette carte rassemble les informations d'identite et de contexte business autour de l'adresse email.",
        blocks: [
          { title: "Nom complet", copy: `Le systeme affiche "${result.full_name || "Unknown user"}". S'il manque des donnees, il tente une deduction a partir de l'adresse.` },
          { title: "Type d'email", copy: result.email_type === "professional" ? "L'adresse est consideree comme professionnelle car elle n'utilise pas un fournisseur grand public connu." : "L'adresse est consideree comme personnelle car elle utilise un fournisseur grand public connu." },
          { title: "Intelligence domaine", copy: `Le domaine est classe comme ${result.provider_type === "free" ? "gratuit" : "entreprise"} avec un age estime "${result.domain_age_estimate}".` },
          { title: "Lecture recommandee", copy: "Cette carte aide a comprendre a qui semble appartenir l'adresse et dans quel contexte elle est utilisee." }
        ]
      };
    }

    if (type === "ai") {
      return {
        title: "Comprendre la section IA",
        lead: "L'interface utilise ici le score renvoye par le fournisseur comme indicateur principal de qualite.",
        blocks: [
          { title: "Pourcentage", copy: `Le pourcentage affiche est ${result.score}/100 et provient de la reponse ZeroBounce.` },
          { title: "Priorite de lecture", copy: `Le statut actuel est "${statusLabel(result.status)}". C'est lui qu'il faut lire en premier.` },
          { title: "Detail du resultat", copy: `Le sous-statut actuel est "${subStatusLabel(result.deliverabilityDetail)}". Il precise la raison ou la nuance du resultat principal.` },
          { title: "Densite", copy: `Le niveau "${result.risk}" resume le niveau de prudence suggere par les signaux recus.` },
          { title: "Facteurs", copy: "Les encarts expliquent quels drapeaux concrets ont influence la lecture: delivrabilite, adresse jetable, etat SMTP, identite deduite et domaine." }
        ]
      };
    }

    if (type === "risk") {
      return {
        title: "Comprendre les risques",
        lead: "Cette zone traduit la reponse brute de l'API en recommandation simple pour un utilisateur metier.",
        blocks: [
          { title: "Risque", copy: `Le niveau de risque actuel est "${result.risk}".` },
          { title: "Pourquoi", copy: `L'analyse tient notamment compte de l'etat jetable (${result.disposable ? "oui" : "non"}), du role (${result.role ? "oui" : "non"}), du resultat principal (${statusLabel(result.deliverability)}), du detail (${subStatusLabel(result.deliverabilityDetail)}) et du type d'email (${result.email_type}).` },
          { title: "Action", copy: result.risk === "low" ? "L'adresse peut etre utilisee avec un bon niveau de confiance." : result.risk === "medium" ? "Une validation humaine est conseillee avant usage." : "Il faut traiter cette adresse avec prudence et demander une confirmation." }
        ]
      };
    }

    if (type === "report") {
      return {
        title: "Comprendre le rapport PDF",
        lead: "Cette zone prepare un export de synthese pour partager le resultat.",
        blocks: [
          { title: "Utilite", copy: "Le PDF sert a garder une trace de l'analyse et a la transmettre a une autre equipe." },
          { title: "Etat actuel", copy: "Le bouton genere un PDF cote serveur a partir du resultat courant, puis telecharge le fichier dans le navigateur." }
        ]
      };
    }

    return {
      title: "Aide contextuelle",
      lead: "Aucune aide specifique n'a ete definie pour cette zone.",
      blocks: []
    };
  }

  function openHelp(type) {
    const content = getHelpContent(type);
    elements.helpTitle.textContent = content.title;
    elements.helpLead.textContent = content.lead;
    elements.helpBlocks.innerHTML = content.blocks
      .map(
        (block) => `
          <div class="help-block">
            <p class="help-block-title">${block.title}</p>
            <p class="help-block-copy">${block.copy}</p>
          </div>`
      )
      .join("");
    elements.helpModal.classList.add("visible");
    elements.helpModal.setAttribute("aria-hidden", "false");
  }

  function closeHelp() {
    elements.helpModal.classList.remove("visible");
    elements.helpModal.setAttribute("aria-hidden", "true");
  }

  elements.emailInput.addEventListener("input", handleInputChange);
  elements.providerSelect.addEventListener("change", renderProviderWarning);
  elements.analyzeButton.addEventListener("click", () => runAnalysis());
  elements.emailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !elements.analyzeButton.disabled) {
      runAnalysis();
    }
  });
  elements.applyTypoButton.addEventListener("click", applyTypoCorrection);
  elements.retryButton.addEventListener("click", () => runAnalysis(state.retryEmail));
  elements.pdfButton.addEventListener("click", handlePdfDownload);
  elements.hunterButton.addEventListener("click", handleHunterLookup);
  elements.gravatarButton.addEventListener("click", handleGravatarLookup);
  elements.linkedinButton.addEventListener("click", handleLinkedinLookup);
  elements.helpCloseButton.addEventListener("click", closeHelp);
  elements.helpModal.addEventListener("click", (event) => {
    if (event.target === elements.helpModal) closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });
  document.querySelectorAll(".help-trigger").forEach((button) => {
    button.addEventListener("click", () => openHelp(button.dataset.help));
  });

  loadProviders();
  loadSettingsStatus();
  refreshDashboardSnapshot();
  updateInputState();
})();
