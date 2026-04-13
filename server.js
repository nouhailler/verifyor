const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL_MS = 5 * 60 * 1000;
const verificationCache = new Map();
const KNOWN_PROVIDERS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

function getZeroBounceApiKey() {
  return process.env.ZEROBOUNCE_API_KEY;
}

function emailRegex() {
  return /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
}

function isValidEmail(email) {
  return emailRegex().test(email);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getCached(email) {
  const entry = verificationCache.get(email);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    verificationCache.delete(email);
    return null;
  }

  return entry.payload;
}

function setCached(email, payload) {
  verificationCache.set(email, {
    createdAt: Date.now(),
    payload
  });
}

function clearCache() {
  verificationCache.clear();
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return Boolean(value);
}

function toScore(raw) {
  const value = Number(raw);
  if (Number.isNaN(value)) return 0;
  if (value <= 1) return Math.round(value * 100);
  if (value <= 10) return Math.round(value * 10);
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeFallbackScore({ status, smtpValid, mxFound, disposable, toxic, domain }) {
  if (status !== "valid") return 0;

  let score = 50;
  if (smtpValid) score += 20;
  if (mxFound) score += 15;
  if (!disposable) score += 10;
  if (!toxic) score += 5;
  if (KNOWN_PROVIDERS.has(domain)) score += 5;

  return clampScore(score);
}

function capitalizeWord(value) {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sanitizeNameToken(token) {
  return String(token || "").replace(/[^a-zA-Z]/g, "");
}

function inferNameFromEmail(email) {
  const localPart = email.split("@")[0] || "";
  const tokenized = localPart
    .replace(/[0-9]+/g, " ")
    .split(/[._-]+|\s+/)
    .map(sanitizeNameToken)
    .filter(Boolean);

  if (tokenized.length >= 2) {
    return {
      firstname: capitalizeWord(tokenized[0]),
      lastname: capitalizeWord(tokenized[tokenized.length - 1])
    };
  }

  if (tokenized.length === 1) {
    return {
      firstname: capitalizeWord(tokenized[0]),
      lastname: ""
    };
  }

  const alphaOnly = sanitizeNameToken(localPart);
  if (!alphaOnly) {
    return { firstname: "", lastname: "" };
  }

  return {
    firstname: capitalizeWord(alphaOnly),
    lastname: ""
  };
}

function inferProviderType(domain) {
  return KNOWN_PROVIDERS.has(domain) ? "free" : "corporate";
}

function inferEmailType(domain) {
  return KNOWN_PROVIDERS.has(domain) ? "personal" : "professional";
}

function inferDomainAgeEstimate(domain) {
  if (KNOWN_PROVIDERS.has(domain)) return "old";
  const root = (domain || "").split(".")[0] || "";
  if (root.length <= 4) return "new";
  if (root.length <= 8) return "medium";
  return "old";
}

function deriveRisk({ status, subStatus, mxFound, smtpValid, disposable, toxic, qualityScore }) {
  if (status === "invalid" || toxic || disposable) return "high";
  if (!mxFound || !smtpValid || ["spamtrap", "abuse", "do_not_mail"].includes(status)) return "high";
  if (["unknown", "catch-all"].includes(status)) return "medium";
  if (["role_based", "greylisted", "mail_server_temporary_error", "timeout_exceeded"].includes(subStatus)) return "medium";
  if (qualityScore < 70) return "medium";
  return "low";
}

function deriveSmtpValid(status, subStatus, mxFound) {
  if (!mxFound) return false;
  if (status === "invalid") return false;
  if (["mailbox_not_found", "failed_smtp_connection", "failed_syntax_check", "does_not_accept_mail"].includes(subStatus)) {
    return false;
  }

  return ["valid", "catch-all", "unknown", "do_not_mail"].includes(status);
}

function mapZeroBounceResponse(email, data) {
  const status = String(data.status || "unknown").toLowerCase();
  const subStatus = String(data.sub_status || "").toLowerCase();
  const domain = data.domain || email.split("@")[1];
  const mxFound = asBoolean(data.mx_found);
  const smtpValid = deriveSmtpValid(status, subStatus, mxFound);
  const disposable = status === "do_not_mail" && subStatus === "disposable";
  const toxic = status === "do_not_mail" && subStatus === "toxic";
  const qualityScore = toScore(data.quality_score);
  const qualityScoreRaw = Number(data.quality_score);
  const risk = deriveRisk({
    status,
    subStatus,
    mxFound,
    smtpValid,
    disposable,
    toxic,
    qualityScore
  });
  const inferredName = inferNameFromEmail(email);
  const firstname = capitalizeWord(data.firstname || data.first_name || inferredName.firstname);
  const lastname = capitalizeWord(data.lastname || data.last_name || inferredName.lastname);
  const fullName = [firstname, lastname].filter(Boolean).join(" ") || "Unknown user";
  const emailType = inferEmailType(domain);
  const providerType = inferProviderType(domain);
  const domainAgeEstimate = inferDomainAgeEstimate(domain);

  return {
    email,
    status,
    sub_status: subStatus,
    domain,
    mx_found: mxFound,
    smtp_valid: smtpValid,
    disposable,
    toxic,
    quality_score: qualityScore,
    quality_score_raw: Number.isNaN(qualityScoreRaw) ? null : qualityScoreRaw,
    did_you_mean: data.did_you_mean || null,
    mx_record: data.mx_record || null,
    provider: data.smtp_provider || null,
    free_email: asBoolean(data.free_email),
    firstname,
    lastname,
    full_name: fullName,
    email_type: emailType,
    company_domain: emailType === "professional" ? domain : null,
    provider_type: providerType,
    domain_age_estimate: domainAgeEstimate,
    risk_level: risk,
    risk,
    cached: false
  };
}

async function fetchEmailVerification(email) {
  const apiKey = getZeroBounceApiKey();

  if (!apiKey) {
    throw new Error("ZEROBOUNCE_API_KEY is missing. Add it to your environment before starting the server.");
  }

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);
  url.searchParams.set("timeout", "10");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ZeroBounce request failed with ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  }

  return mapZeroBounceResponse(email, data);
}

function buildFrontendPayload(verification) {
  const syntax = verification.status !== "invalid";
  const useFallbackScore = verification.quality_score === 0 && verification.status === "valid";
  const computedScore = computeFallbackScore({
    status: verification.status,
    smtpValid: verification.smtp_valid,
    mxFound: verification.mx_found,
    disposable: verification.disposable,
    toxic: verification.toxic,
    domain: verification.domain
  });
  const score = useFallbackScore ? computedScore : verification.quality_score;

  return {
    ...verification,
    syntax,
    mx: verification.mx_found,
    smtp: verification.smtp_valid,
    score,
    computedScore,
    score_source: useFallbackScore ? "fallback" : "zerobounce",
    suggestion: verification.did_you_mean,
    deliverability: verification.status,
    deliverabilityDetail: verification.sub_status || verification.status,
    mxRecords: verification.mx_record ? [verification.mx_record] : [],
    role: verification.sub_status.includes("role_based"),
    risk: verification.risk_level
  };
}

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

function createApp({ verificationFetcher = fetchEmailVerification } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.resolve(__dirname)));

  app.get("/api/verify", async (req, res) => {
    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({ error: "Missing required query parameter: email" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const cached = getCached(email);
    if (cached) {
      return res.json({
        ...cached,
        cached: true
      });
    }

    try {
      const verification = await verificationFetcher(email);
      const payload = buildFrontendPayload(verification);
      setCached(email, payload);
      return res.json(payload);
    } catch (error) {
      console.error("Email verification failed:", error.message);
      return res.status(502).json({
        error: "Unable to verify email with ZeroBounce",
        details: error.message
      });
    }
  });

  app.post("/api/report/pdf", (req, res) => {
    try {
      const pdf = buildPdfReport(req.body);
      const report = normalizeReportPayload(req.body);
      const filename = buildReportFilename(report.email);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdf);
    } catch (error) {
      return res.status(400).json({
        error: "Unable to generate PDF report",
        details: error.message
      });
    }
  });

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "index.html"));
  });

  return app;
}

const app = createApp();

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`Verifyor listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildFrontendPayload,
  buildPdfReport,
  buildReportFilename,
  clearCache,
  computeFallbackScore,
  createApp,
  fetchEmailVerification,
  inferNameFromEmail,
  isValidEmail,
  mapZeroBounceResponse,
  normalizeEmail,
  normalizeReportPayload,
  startServer,
  toScore
};
