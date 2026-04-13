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
    cached: asBoolean(payload.cached)
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

  const detailLines = [
    "Verifyor - Rapport de verification email",
    `Genere le: ${formatTimestamp(generatedAt)} UTC`,
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
