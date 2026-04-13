const dns = require("node:dns/promises");

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
const SUPPORTED_VERIFICATION_PROVIDERS = ["auto", "local", "zerobounce", "abstract"];

function getZeroBounceApiKey() {
  return process.env.ZEROBOUNCE_API_KEY || "";
}

function getAbstractApiKey() {
  return process.env.ABSTRACT_API_KEY || "";
}

function getDefaultVerificationProvider() {
  const configured = String(process.env.VERIFYOR_DEFAULT_PROVIDER || "auto").toLowerCase();
  return SUPPORTED_VERIFICATION_PROVIDERS.includes(configured) ? configured : "auto";
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

function buildCacheKey(provider, email) {
  return `${provider}:${email}`;
}

function getCached(provider, email) {
  const entry = verificationCache.get(buildCacheKey(provider, email));
  if (!entry) return null;

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    verificationCache.delete(buildCacheKey(provider, email));
    return null;
  }

  return entry.payload;
}

function setCached(provider, email, payload) {
  verificationCache.set(buildCacheKey(provider, email), {
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

function baseVerificationShape(email, extras = {}) {
  const domain = extras.domain || email.split("@")[1];
  const inferredName = inferNameFromEmail(email);
  const firstname = capitalizeWord(extras.firstname || extras.first_name || inferredName.firstname);
  const lastname = capitalizeWord(extras.lastname || extras.last_name || inferredName.lastname);
  const fullName = [firstname, lastname].filter(Boolean).join(" ") || "Unknown user";
  const emailType = inferEmailType(domain);
  const providerType = inferProviderType(domain);
  const domainAgeEstimate = inferDomainAgeEstimate(domain);
  const status = String(extras.status || "unknown").toLowerCase();
  const subStatus = String(extras.sub_status || extras.status_detail || "").toLowerCase();
  const mxFound = asBoolean(extras.mx_found);
  const smtpValid = typeof extras.smtp_valid === "boolean"
    ? extras.smtp_valid
    : deriveSmtpValid(status, subStatus, mxFound);
  const disposable = asBoolean(extras.disposable);
  const toxic = asBoolean(extras.toxic);
  const qualityScore = toScore(extras.quality_score);
  const qualityScoreRaw = Number(extras.quality_score_raw ?? extras.quality_score);
  const risk = deriveRisk({
    status,
    subStatus,
    mxFound,
    smtpValid,
    disposable,
    toxic,
    qualityScore
  });

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
    did_you_mean: extras.did_you_mean || null,
    mx_record: extras.mx_record || null,
    provider: extras.provider || null,
    free_email: asBoolean(extras.free_email),
    firstname,
    lastname,
    full_name: fullName,
    email_type: emailType,
    company_domain: emailType === "professional" ? domain : null,
    provider_type: providerType,
    domain_age_estimate: domainAgeEstimate,
    risk_level: risk,
    risk,
    cached: false,
    verification_provider: extras.verification_provider || "local",
    verification_method: extras.verification_method || extras.verification_provider || "local",
    requested_provider: extras.requested_provider || extras.verification_provider || "local",
    is_local_fallback: asBoolean(extras.is_local_fallback),
    provider_message: extras.provider_message || null
  };
}

function mapZeroBounceResponse(email, data) {
  return baseVerificationShape(email, {
    status: data.status,
    sub_status: data.sub_status,
    domain: data.domain || email.split("@")[1],
    mx_found: asBoolean(data.mx_found),
    smtp_valid: deriveSmtpValid(String(data.status || "unknown").toLowerCase(), String(data.sub_status || "").toLowerCase(), asBoolean(data.mx_found)),
    disposable: String(data.status || "").toLowerCase() === "do_not_mail" && String(data.sub_status || "").toLowerCase() === "disposable",
    toxic: String(data.status || "").toLowerCase() === "do_not_mail" && String(data.sub_status || "").toLowerCase() === "toxic",
    quality_score: data.quality_score,
    quality_score_raw: data.quality_score,
    did_you_mean: data.did_you_mean || null,
    mx_record: data.mx_record || null,
    provider: data.smtp_provider || null,
    free_email: data.free_email,
    firstname: data.firstname || data.first_name,
    lastname: data.lastname || data.last_name,
    verification_provider: "zerobounce",
    verification_method: "api"
  });
}

function mapAbstractResponse(email, data) {
  const deliverability = data.email_deliverability || {};
  const quality = data.email_quality || {};
  const mxRecords = Array.isArray(deliverability.mx_records) ? deliverability.mx_records : [];
  const status = deliverability.status === "deliverable"
    ? "valid"
    : deliverability.status === "undeliverable"
    ? "invalid"
    : "unknown";
  const statusDetail = deliverability.status_detail || deliverability.status || "unknown";
  const disposable = asBoolean(quality.is_disposable_email);
  const toxic = asBoolean(quality.is_risky) || asBoolean(quality.is_catch_all);

  return baseVerificationShape(email, {
    status,
    sub_status: statusDetail,
    domain: email.split("@")[1],
    mx_found: asBoolean(deliverability.is_mx_valid),
    smtp_valid: asBoolean(deliverability.is_smtp_valid),
    disposable,
    toxic,
    quality_score: quality.score,
    quality_score_raw: quality.score,
    did_you_mean: null,
    mx_record: mxRecords[0] || null,
    provider: "Abstract",
    free_email: quality.is_free_email,
    verification_provider: "abstract",
    verification_method: "api",
    provider_message: quality.date_last_breached ? `Derniere fuite connue: ${quality.date_last_breached}` : null
  });
}

async function resolveMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((record) => record.exchange);
  } catch (error) {
    return [];
  }
}

async function resolveAnyHost(domain) {
  try {
    const [ipv4, ipv6] = await Promise.allSettled([dns.resolve4(domain), dns.resolve6(domain)]);
    return {
      hasAddress:
        (ipv4.status === "fulfilled" && ipv4.value.length > 0) ||
        (ipv6.status === "fulfilled" && ipv6.value.length > 0)
    };
  } catch (error) {
    return { hasAddress: false };
  }
}

async function fetchLocalVerification(email) {
  const domain = email.split("@")[1];
  const mxRecords = await resolveMx(domain);
  const addressInfo = await resolveAnyHost(domain);
  const hasMx = mxRecords.length > 0;
  const hasResolvableDomain = addressInfo.hasAddress;
  const domainKnown = KNOWN_PROVIDERS.has(domain);
  const localStatus = hasMx ? "valid" : hasResolvableDomain ? "unknown" : "invalid";
  const subStatus = hasMx ? "dns_mx_confirmed" : hasResolvableDomain ? "dns_only_no_mx" : "domain_unresolvable";
  const scoreSeed = localStatus === "valid" ? 72 : hasResolvableDomain ? 42 : 5;

  return baseVerificationShape(email, {
    status: localStatus,
    sub_status: subStatus,
    domain,
    mx_found: hasMx,
    smtp_valid: false,
    disposable: false,
    toxic: false,
    quality_score: domainKnown ? scoreSeed + 10 : scoreSeed,
    quality_score_raw: null,
    mx_record: mxRecords[0] || null,
    provider: "Local DNS/MX",
    free_email: domainKnown,
    verification_provider: "local",
    verification_method: "dns_mx",
    requested_provider: "local",
    is_local_fallback: false,
    provider_message: hasMx
      ? `Verification DNS/MX locale reussie avec ${mxRecords.length} enregistrement(s).`
      : hasResolvableDomain
      ? "Le domaine repond au DNS, mais aucun MX n'a ete trouve."
      : "Le domaine ne repond ni en MX ni en resolution d'adresse."
  });
}

async function fetchZeroBounceVerification(email) {
  const apiKey = getZeroBounceApiKey();

  if (!apiKey) {
    throw new Error("ZEROBOUNCE_API_KEY is missing.");
  }

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);
  url.searchParams.set("timeout", "10");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
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

async function fetchAbstractVerification(email) {
  const apiKey = getAbstractApiKey();

  if (!apiKey) {
    throw new Error("ABSTRACT_API_KEY is missing.");
  }

  const url = new URL("https://emailreputation.abstractapi.com/v1/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Abstract request failed with ${response.status}: ${text}`);
  }

  const data = await response.json();
  return mapAbstractResponse(email, data);
}

function buildFrontendPayload(verification) {
  const syntax = verification.status !== "invalid" || verification.verification_provider === "local";
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
    score_source: useFallbackScore ? "fallback" : verification.verification_provider,
    suggestion: verification.did_you_mean,
    deliverability: verification.status,
    deliverabilityDetail: verification.sub_status || verification.status,
    mxRecords: verification.mx_record ? [verification.mx_record] : [],
    role: verification.sub_status.includes("role_based"),
    risk: verification.risk_level
  };
}

function normalizeProviderSelection(provider) {
  const normalized = String(provider || "").toLowerCase();
  return SUPPORTED_VERIFICATION_PROVIDERS.includes(normalized)
    ? normalized
    : getDefaultVerificationProvider();
}

async function fetchEmailVerification(email, requestedProvider = getDefaultVerificationProvider()) {
  const provider = normalizeProviderSelection(requestedProvider);

  if (provider === "local") {
    return fetchLocalVerification(email);
  }

  if (provider === "zerobounce") {
    return fetchZeroBounceVerification(email);
  }

  if (provider === "abstract") {
    return fetchAbstractVerification(email);
  }

  const attempts = [
    { provider: "zerobounce", run: () => fetchZeroBounceVerification(email) },
    { provider: "abstract", run: () => fetchAbstractVerification(email) },
    { provider: "local", run: () => fetchLocalVerification(email) }
  ];
  const failures = [];

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      if (attempt.provider === "local") {
        return {
          ...result,
          requested_provider: "auto",
          is_local_fallback: true,
          provider_message: `Fallback local active. Aucune API payante n'a ete utilisee. ${result.provider_message || ""}`.trim()
        };
      }

      return {
        ...result,
        requested_provider: "auto",
        is_local_fallback: false
      };
    } catch (error) {
      failures.push(`${attempt.provider}: ${error.message}`);
    }
  }

  throw new Error(failures.join(" | "));
}

function getSupportedVerificationProviders() {
  return SUPPORTED_VERIFICATION_PROVIDERS.slice();
}

module.exports = {
  asBoolean,
  buildFrontendPayload,
  capitalizeWord,
  clampScore,
  clearCache,
  computeFallbackScore,
  fetchAbstractVerification,
  fetchEmailVerification,
  fetchLocalVerification,
  fetchZeroBounceVerification,
  getCached,
  getDefaultVerificationProvider,
  getSupportedVerificationProviders,
  inferNameFromEmail,
  isValidEmail,
  mapZeroBounceResponse,
  normalizeEmail,
  normalizeProviderSelection,
  setCached,
  toScore
};
