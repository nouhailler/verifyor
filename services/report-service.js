const {
  asBoolean,
  clampScore,
  isValidEmail,
  normalizeEmail
} = require("./verification-service");

function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function normalizeReportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const email = normalizeEmail(payload.email);
  if (!email || !isValidEmail(email)) {
    return null;
  }

  return {
    email,
    full_name: payload.full_name || "Unknown user",
    firstname: payload.firstname || "",
    lastname: payload.lastname || "",
    status: String(payload.status || "unknown"),
    deliverability: String(payload.deliverability || payload.status || "unknown"),
    deliverabilityDetail: String(payload.deliverabilityDetail || payload.sub_status || payload.status || "unknown"),
    domain: String(payload.domain || email.split("@")[1] || ""),
    mx: asBoolean(payload.mx ?? payload.mx_found),
    smtp: asBoolean(payload.smtp ?? payload.smtp_valid),
    syntax: asBoolean(payload.syntax ?? payload.status !== "invalid"),
    disposable: asBoolean(payload.disposable),
    role: asBoolean(payload.role),
    risk: String(payload.risk || payload.risk_level || "unknown"),
    score: clampScore(payload.score ?? payload.quality_score ?? 0),
    score_source: String(payload.score_source || "zerobounce"),
    suggestion: payload.suggestion || payload.did_you_mean || null,
    email_type: String(payload.email_type || "unknown"),
    provider_type: String(payload.provider_type || "unknown"),
    company_domain: payload.company_domain || null,
    domain_age_estimate: String(payload.domain_age_estimate || "unknown"),
    provider: payload.provider || null,
    cached: asBoolean(payload.cached),
    confidence_level: String(payload.confidence_level || "unknown"),
    score_breakdown: payload.score_breakdown || null,
    explanation_lines: Array.isArray(payload.explanation_lines) ? payload.explanation_lines : [],
    domain_diagnostics: payload.domain_diagnostics || null,
    technical_signals: payload.technical_signals || null,
    hunter: payload.hunter || null,
    gravatar: payload.gravatar || null,
    linkedin: payload.linkedin || null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    note_text: payload.note_text || ""
  };
}

function splitTextIntoLines(text, maxChars = 82) {
  const raw = String(text || "").trim();
  if (!raw) return [""];

  const words = raw.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(word.slice(0, maxChars));
    current = word.slice(maxChars);
  }

  if (current) lines.push(current);

  return lines;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfStream(lines) {
  const commands = ["BT", "/F1 12 Tf", "50 770 Td", "16 TL"];

  lines.forEach((line, index) => {
    commands.push(`(${escapePdfText(line)}) Tj`);
    if (index < lines.length - 1) {
      commands.push("T*");
    }
  });

  commands.push("ET");

  return `${commands.join("\n")}\n`;
}

function buildPdfDocument(pageStreams) {
  const objects = [];
  const kids = [];

  pageStreams.forEach((stream) => {
    const pageObjectNumber = objects.length + 3;
    const contentObjectNumber = pageObjectNumber + 1;
    kids.push(`${pageObjectNumber} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${pageStreams.length * 2 + 3} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`);
  });

  const fontObjectNumber = objects.length + 3;
  const allObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >>`,
    ...objects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  allObjects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${allObjects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${allObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  if (fontObjectNumber !== pageStreams.length * 2 + 3) {
    throw new Error("PDF object numbering invariant violated");
  }

  return Buffer.from(pdf, "utf8");
}

function buildPdfReport(payload, { generatedAt = new Date() } = {}) {
  const report = normalizeReportPayload(payload);

  if (!report) {
    throw new Error("A valid verification payload is required to generate the PDF report.");
  }

  const scoreBreakdown = report.score_breakdown || {};
  const domainDiagnostics = report.domain_diagnostics || { flags: {}, issues: [], security_posture: {} };
  const technicalSignals = report.technical_signals || {};
  const executiveSummary = report.status === "invalid"
    ? "Adresse invalide. Correction ou nouvelle collecte necessaire."
    : report.confidence_level === "high confidence"
      ? "Adresse exploitable avec un niveau de confiance eleve."
      : report.confidence_level === "medium confidence"
        ? "Adresse exploitable avec prudence et verification humaine possible."
        : "Adresse a confirmer avant usage metier.";
  const riskFlags = [
    report.disposable ? "adresse jetable" : null,
    report.role ? "adresse de role" : null,
    report.domain_diagnostics && report.domain_diagnostics.flags && report.domain_diagnostics.flags.parked_domain ? "domaine parke" : null,
    report.domain_diagnostics && report.domain_diagnostics.flags && report.domain_diagnostics.flags.domain_without_website ? "pas de site web detecte" : null,
    report.technical_signals && report.technical_signals.smtp && report.technical_signals.smtp.catch_all_probable ? "catch-all probable" : null
  ].filter(Boolean);

  const detailLines = [
    "Verifyor - Rapport de verification email",
    `Genere le: ${formatTimestamp(generatedAt)} UTC`,
    "",
    "Synthese executive:",
    executiveSummary,
    `Niveau de confiance: ${report.confidence_level}`,
    `Drapeaux de risque: ${riskFlags.length ? riskFlags.join(", ") : "aucun drapeau critique"}`,
    "",
    `Email: ${report.email}`,
    `Nom complet: ${report.full_name}`,
    `Statut principal: ${report.deliverability}`,
    `Detail: ${report.deliverabilityDetail}`,
    `Score de confiance: ${report.score}/100 (${report.score_source})`,
    `Niveau de risque: ${report.risk}`,
    `Syntaxe valide: ${report.syntax ? "oui" : "non"}`,
    `MX detecte: ${report.mx ? "oui" : "non"}`,
    `SMTP confirme: ${report.smtp ? "oui" : "non"}`,
    `Adresse jetable: ${report.disposable ? "oui" : "non"}`,
    `Adresse de role: ${report.role ? "oui" : "non"}`,
    `Type d'email: ${report.email_type}`,
    `Type de fournisseur: ${report.provider_type}`,
    `Domaine: ${report.domain}`,
    `Domaine societe: ${report.company_domain || "-"}`,
    `Age estime du domaine: ${report.domain_age_estimate}`,
    `Provider SMTP: ${report.provider || "-"}`,
    `Suggestion: ${report.suggestion || "-"}`,
    `Resultat issu du cache: ${report.cached ? "oui" : "non"}`,
    "",
    "Sous-scores:",
    `Deliverability: ${scoreBreakdown.deliverability ?? "-"}/100`,
    `Fraud risk: ${scoreBreakdown.fraud_risk ?? "-"}/100`,
    `Identity confidence: ${scoreBreakdown.identity_confidence ?? "-"}/100`,
    `Domain trust: ${scoreBreakdown.domain_trust ?? "-"}/100`,
    "",
    "Analyse DNS et domaine:",
    `SPF: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.spf ? "oui" : "non"}`,
    `DKIM: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.dkim ? "oui" : "non"}`,
    `DMARC: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.dmarc ? "oui" : "non"}`,
    `BIMI: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.bimi ? "oui" : "non"}`,
    `MTA-STS: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.mta_sts ? "oui" : "non"}`,
    `TLS-RPT: ${domainDiagnostics.security_posture && domainDiagnostics.security_posture.tls_rpt ? "oui" : "non"}`,
    `Problemes detectes: ${domainDiagnostics.issues && domainDiagnostics.issues.length ? domainDiagnostics.issues.join(", ") : "aucun"}`,
    "",
    "SMTP avance:",
    `Classification: ${technicalSignals.smtp ? technicalSignals.smtp.classification || "-" : "-"}`,
    `Mailbox exists: ${technicalSignals.smtp && technicalSignals.smtp.mailbox_exists ? "oui" : "non"}`,
    `Accept-all: ${technicalSignals.smtp && technicalSignals.smtp.accept_all ? "oui" : "non"}`,
    `Greylisting: ${technicalSignals.smtp && technicalSignals.smtp.greylisting ? "oui" : "non"}`,
    "",
    "Explications du score:",
    ...(report.explanation_lines.length ? report.explanation_lines : ["Aucune explication detaillee disponible."]),
    "",
    "Sources utilisees:",
    `Verification: ${report.score_source}`,
    `Hunter: ${report.hunter ? "oui" : "non"}`,
    `Gravatar: ${report.gravatar ? "oui" : "non"}`,
    `LinkedIn matching: ${report.linkedin ? "oui" : "non"}`,
    "",
    "Annotations:",
    `Tags: ${report.tags.length ? report.tags.join(", ") : "-"}`,
    `Note: ${report.note_text || "-"}`,
    "",
    "Lecture rapide:",
    report.status === "invalid"
      ? "L'adresse est invalide et doit etre corrigee avant usage."
      : report.risk === "low"
      ? "Les signaux principaux sont coherents et l'adresse semble exploitable."
      : report.risk === "medium"
      ? "Les signaux sont mitiges. Une verification humaine est conseillee."
      : "Les signaux sont defavorables. Il faut confirmer l'adresse avant usage."
  ];

  const wrappedLines = detailLines.flatMap((line) => splitTextIntoLines(line));
  const linesPerPage = 42;
  const pageStreams = [];

  for (let index = 0; index < wrappedLines.length; index += linesPerPage) {
    pageStreams.push(buildPdfStream(wrappedLines.slice(index, index + linesPerPage)));
  }

  return buildPdfDocument(pageStreams);
}

function buildReportFilename(email) {
  const sanitized = normalizeEmail(email).replace(/[^a-z0-9@._-]+/g, "-").replace(/@/g, "_at_");
  return `verifyor-report-${sanitized || "email"}.pdf`;
}

module.exports = {
  buildPdfReport,
  buildReportFilename,
  normalizeReportPayload
};
