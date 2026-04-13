const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
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

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(path.resolve(__dirname)));

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
  if (!ZEROBOUNCE_API_KEY) {
    throw new Error("ZEROBOUNCE_API_KEY is missing. Add it to your environment before starting the server.");
  }

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", ZEROBOUNCE_API_KEY);
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
    const verification = await fetchEmailVerification(email);
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

app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Verifyor listening on http://localhost:${PORT}`);
});
