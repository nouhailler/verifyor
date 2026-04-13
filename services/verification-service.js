const dns = require("node:dns/promises");
const net = require("node:net");
const {
  clearProviderError,
  setProviderError
} = require("./provider-status");

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
const ROLE_LOCAL_PARTS = new Set(["admin", "billing", "contact", "hello", "info", "jobs", "marketing", "newsletter", "sales", "security", "support", "team"]);
const PARKING_HINTS = ["parking", "parked", "sedoparking", "bodis", "cashparking", "domaincontrol", "afternic"];
const COMMON_DKIM_SELECTORS = ["default", "selector1", "selector2", "google", "k1", "dkim"];

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

function localPart(email) {
  return String(email || "").split("@")[0].toLowerCase();
}

function inferRoleAddress(email, subStatus = "") {
  if (String(subStatus || "").includes("role_based")) return true;
  return ROLE_LOCAL_PARTS.has(localPart(email));
}

async function resolveRecordSafely(resolver, fallback = []) {
  try {
    return await resolver();
  } catch (error) {
    return fallback;
  }
}

async function resolveTxtRecords(name) {
  const records = await resolveRecordSafely(() => dns.resolveTxt(name), []);
  return records.map((parts) => parts.join("")).filter(Boolean);
}

async function resolveDnsSecurity(domain) {
  const [rootTxt, dmarcTxt, bimiTxt, mtaStsTxt, tlsRptTxt, nsRecords] = await Promise.all([
    resolveTxtRecords(domain),
    resolveTxtRecords(`_dmarc.${domain}`),
    resolveTxtRecords(`default._bimi.${domain}`),
    resolveTxtRecords(`_mta-sts.${domain}`),
    resolveTxtRecords(`_smtp._tls.${domain}`),
    resolveRecordSafely(() => dns.resolveNs(domain), [])
  ]);

  const dkimRecords = [];
  for (const selector of COMMON_DKIM_SELECTORS) {
    const txtRecords = await resolveTxtRecords(`${selector}._domainkey.${domain}`);
    if (txtRecords.some((record) => record.toLowerCase().includes("v=dkim1"))) {
      dkimRecords.push(selector);
    }
  }

  const spfRecord = rootTxt.find((record) => record.toLowerCase().includes("v=spf1")) || null;
  const dmarcRecord = dmarcTxt.find((record) => record.toLowerCase().includes("v=dmarc1")) || null;
  const bimiRecord = bimiTxt.find((record) => record.toLowerCase().includes("v=bimi1")) || null;
  const mtaStsRecord = mtaStsTxt.find((record) => record.toLowerCase().includes("v=stsv1")) || null;
  const tlsRptRecord = tlsRptTxt.find((record) => record.toLowerCase().includes("v=tlsrptv1")) || null;
  const parked = nsRecords.some((record) => PARKING_HINTS.some((hint) => String(record).toLowerCase().includes(hint)));

  return {
    spf: { present: Boolean(spfRecord), value: spfRecord },
    dmarc: { present: Boolean(dmarcRecord), value: dmarcRecord },
    dkim: { present: dkimRecords.length > 0, selectors: dkimRecords },
    bimi: { present: Boolean(bimiRecord), value: bimiRecord },
    mta_sts: { present: Boolean(mtaStsRecord), value: mtaStsRecord },
    tls_rpt: { present: Boolean(tlsRptRecord), value: tlsRptRecord },
    nameservers: nsRecords,
    parked
  };
}

async function resolveWebPresence(domain) {
  const [aRecords, aaaaRecords, cnameRecords] = await Promise.all([
    resolveRecordSafely(() => dns.resolve4(domain), []),
    resolveRecordSafely(() => dns.resolve6(domain), []),
    resolveRecordSafely(() => dns.resolveCname(domain), [])
  ]);

  return {
    has_web: aRecords.length > 0 || aaaaRecords.length > 0 || cnameRecords.length > 0,
    a_records: aRecords,
    aaaa_records: aaaaRecords,
    cname_records: cnameRecords
  };
}

function createSmtpSession(host, commands) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    const transcript = [];
    const result = {
      connected: false,
      timed_out: false,
      accepted: false,
      code: null,
      message: "",
      transcript
    };

    let buffer = "";
    let step = 0;
    let settled = false;

    function finish(partial = {}) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...result, ...partial });
    }

    socket.setTimeout(6000, () => {
      finish({ timed_out: true, message: "SMTP timeout" });
    });

    socket.on("error", (error) => {
      finish({ message: error.message });
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;

        transcript.push(line);
        const code = Number(line.slice(0, 3));
        if (!Number.isFinite(code)) continue;
        result.code = code;
        result.message = line.slice(4);

        if (line[3] === "-") {
          continue;
        }

        if (step < commands.length) {
          socket.write(`${commands[step]}\r\n`);
          step += 1;
          continue;
        }

        finish({
          connected: true,
          accepted: code >= 200 && code < 300
        });
      }
    });
  });
}

async function performAdvancedSmtpCheck(email, mxRecords) {
  const host = mxRecords[0];
  if (!host) {
    return {
      classification: "mx_missing",
      mailbox_exists: false,
      accept_all: false,
      catch_all_probable: false,
      greylisting: false,
      tempfail: false,
      transcript: []
    };
  }

  const probeEmail = `verifyor-probe-${Date.now()}@${email.split("@")[1]}`;
  const baseCommands = [
    "EHLO verifyor.local",
    "MAIL FROM:<probe@verifyor.local>",
    `RCPT TO:<${email}>`,
    "QUIT"
  ];
  const probeCommands = [
    "EHLO verifyor.local",
    "MAIL FROM:<probe@verifyor.local>",
    `RCPT TO:<${probeEmail}>`,
    "QUIT"
  ];

  try {
    const [mailboxResult, probeResult] = await Promise.all([
      createSmtpSession(host, baseCommands),
      createSmtpSession(host, probeCommands)
    ]);

    const mailboxExists = mailboxResult.accepted;
    const acceptAll = mailboxResult.accepted && probeResult.accepted;
    const greylisting = [421, 450, 451, 452].includes(mailboxResult.code) || [421, 450, 451, 452].includes(probeResult.code);
    const tempfail = mailboxResult.timed_out || probeResult.timed_out || greylisting;
    const classification = mailboxExists
      ? acceptAll
        ? "accept_all"
        : "mailbox_exists"
      : greylisting
        ? "greylisting"
        : tempfail
          ? "tempfail"
          : mailboxResult.code === 550
            ? "mailbox_not_found"
            : "unknown";

    return {
      classification,
      mailbox_exists: mailboxExists,
      accept_all: acceptAll,
      catch_all_probable: acceptAll,
      greylisting,
      tempfail,
      transcript: [...mailboxResult.transcript.slice(0, 6), ...probeResult.transcript.slice(0, 6)]
    };
  } catch (error) {
    return {
      classification: "smtp_unreachable",
      mailbox_exists: false,
      accept_all: false,
      catch_all_probable: false,
      greylisting: false,
      tempfail: true,
      transcript: [error.message]
    };
  }
}

function buildDomainDiagnostics({ domain, mxRecords, addressInfo, dnsSecurity, webPresence }) {
  const noWebsite = !webPresence.has_web;
  const mxInconsistent = mxRecords.length > 0 && !addressInfo.hasAddress && noWebsite;
  const flags = {
    parked_domain: dnsSecurity.parked,
    domain_without_website: noWebsite,
    mx_inconsistent: mxInconsistent,
    recently_created_estimate: inferDomainAgeEstimate(domain) === "new"
  };

  const issues = [];
  if (flags.parked_domain) issues.push("domaine potentiellement parke");
  if (flags.domain_without_website) issues.push("aucun site web detecte");
  if (flags.mx_inconsistent) issues.push("MX presents mais domaine web non resolu");
  if (flags.recently_created_estimate) issues.push("domaine estime recent");

  return {
    flags,
    issues,
    security_posture: {
      spf: dnsSecurity.spf.present,
      dmarc: dnsSecurity.dmarc.present,
      dkim: dnsSecurity.dkim.present,
      bimi: dnsSecurity.bimi.present,
      mta_sts: dnsSecurity.mta_sts.present,
      tls_rpt: dnsSecurity.tls_rpt.present
    }
  };
}

function confidenceLevelFromScore(score) {
  if (score >= 80) return "high confidence";
  if (score >= 55) return "medium confidence";
  return "low confidence";
}

function buildScoreBreakdown(result) {
  const deliverability = clampScore(
    (result.syntax ? 25 : 0) +
    (result.mx ? 25 : 0) +
    (result.smtp ? 30 : 0) +
    (result.status === "valid" ? 20 : result.status === "catch-all" ? 10 : 0)
  );
  const fraudRisk = clampScore(
    100 -
    (result.disposable ? 35 : 0) -
    (result.role ? 15 : 0) -
    (result.risk === "high" ? 35 : result.risk === "medium" ? 15 : 0) -
    (result.catch_all_probable ? 15 : 0)
  );
  const identityConfidence = clampScore(
    (result.full_name && result.full_name !== "Unknown user" ? 45 : 10) +
    (result.email_type === "professional" ? 25 : 15) +
    (result.role ? 0 : 15) +
    (result.firstname ? 15 : 5)
  );
  const securityPosture = result.domain_diagnostics ? result.domain_diagnostics.security_posture : null;
  const domainTrust = clampScore(
    (result.mx ? 25 : 0) +
    (securityPosture && securityPosture.spf ? 15 : 0) +
    (securityPosture && securityPosture.dmarc ? 20 : 0) +
    (securityPosture && securityPosture.dkim ? 15 : 0) +
    (securityPosture && securityPosture.mta_sts ? 10 : 0) +
    (securityPosture && securityPosture.tls_rpt ? 5 : 0) +
    (result.domain_diagnostics && result.domain_diagnostics.flags.domain_without_website ? -10 : 10) +
    (result.domain_diagnostics && result.domain_diagnostics.flags.parked_domain ? -25 : 0) +
    (result.domain_age_estimate === "old" ? 10 : result.domain_age_estimate === "medium" ? 5 : 0)
  );
  const finalScore = clampScore((deliverability * 0.4) + (fraudRisk * 0.25) + (identityConfidence * 0.15) + (domainTrust * 0.2));

  const explanations = [];
  if (result.syntax) explanations.push("syntaxe email valide");
  if (result.mx) explanations.push("MX detecte");
  if (result.smtp) explanations.push("SMTP ou mailbox confirme");
  if (result.catch_all_probable) explanations.push("domaine catch-all probable, ce qui reduit la precision");
  if (securityPosture && securityPosture.spf) explanations.push("SPF publie");
  if (securityPosture && securityPosture.dmarc) explanations.push("DMARC publie");
  if (securityPosture && securityPosture.dkim) explanations.push("DKIM detecte");
  if (result.disposable) explanations.push("adresse jetable detectee");
  if (result.role) explanations.push("adresse de role ou equipe");
  if (result.domain_diagnostics && result.domain_diagnostics.issues.length) {
    explanations.push(...result.domain_diagnostics.issues);
  }
  if (!explanations.length) explanations.push("analyse basee sur des signaux partiels");

  return {
    deliverability,
    fraud_risk: fraudRisk,
    identity_confidence: identityConfidence,
    domain_trust: domainTrust,
    final: finalScore,
    confidence_level: confidenceLevelFromScore(finalScore),
    explanations
  };
}

function deriveRisk({ status, subStatus, mxFound, smtpValid, disposable, toxic, qualityScore }) {
  if (status === "invalid" || toxic || disposable) return "high";
  if (!mxFound || !smtpValid || ["spamtrap", "abuse", "do_not_mail"].includes(status)) return "high";
  if (["unknown", "catch-all"].includes(status)) return "medium";
  if (["role_based", "greylisted", "mail_server_temporary_error", "timeout_exceeded", "accept_all", "catch_all_probable"].includes(subStatus)) return "medium";
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
  const role = typeof extras.role === "boolean" ? extras.role : inferRoleAddress(email, subStatus);

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
    provider_message: extras.provider_message || null,
    technical_signals: extras.technical_signals || null,
    score_breakdown: extras.score_breakdown || null,
    domain_diagnostics: extras.domain_diagnostics || null,
    social_summary: extras.social_summary || null,
    role
  };
}

function mapZeroBounceResponse(email, data) {
  const status = String(data.status || "unknown").toLowerCase();
  const subStatus = String(data.sub_status || "").toLowerCase();
  const mxFound = asBoolean(data.mx_found);
  return baseVerificationShape(email, {
    status,
    sub_status: subStatus,
    domain: data.domain || email.split("@")[1],
    mx_found: mxFound,
    smtp_valid: deriveSmtpValid(status, subStatus, mxFound),
    disposable: status === "do_not_mail" && subStatus === "disposable",
    toxic: status === "do_not_mail" && subStatus === "toxic",
    quality_score: data.quality_score,
    quality_score_raw: data.quality_score,
    did_you_mean: data.did_you_mean || null,
    mx_record: data.mx_record || null,
    provider: data.smtp_provider || null,
    free_email: data.free_email,
    firstname: data.firstname || data.first_name,
    lastname: data.lastname || data.last_name,
    verification_provider: "zerobounce",
    verification_method: "api",
    technical_signals: {
      smtp: {
        classification: subStatus === "greylisted"
          ? "greylisting"
          : status === "catch-all"
            ? "accept_all"
            : status === "valid"
              ? "mailbox_exists"
              : status === "invalid"
                ? "mailbox_not_found"
                : "unknown",
        mailbox_exists: deriveSmtpValid(status, subStatus, mxFound),
        accept_all: status === "catch-all",
        catch_all_probable: status === "catch-all",
        greylisting: subStatus === "greylisted",
        tempfail: ["mail_server_temporary_error", "timeout_exceeded"].includes(subStatus),
        transcript: []
      }
    }
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
  const isCatchAll = asBoolean(quality.is_catch_all);
  const toxic = asBoolean(quality.is_risky) || isCatchAll;

  return baseVerificationShape(email, {
    status: isCatchAll ? "catch-all" : status,
    sub_status: isCatchAll ? "accept_all" : statusDetail,
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
    provider_message: quality.date_last_breached ? `Derniere fuite connue: ${quality.date_last_breached}` : null,
    technical_signals: {
      smtp: {
        classification: isCatchAll ? "accept_all" : deliverability.is_smtp_valid ? "mailbox_exists" : "unknown",
        mailbox_exists: asBoolean(deliverability.is_smtp_valid),
        accept_all: isCatchAll,
        catch_all_probable: isCatchAll,
        greylisting: false,
        tempfail: false,
        transcript: []
      }
    }
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
  const [mxRecords, addressInfo, dnsSecurity, webPresence] = await Promise.all([
    resolveMx(domain),
    resolveAnyHost(domain),
    resolveDnsSecurity(domain),
    resolveWebPresence(domain)
  ]);
  const smtpInspection = await performAdvancedSmtpCheck(email, mxRecords);
  const domainDiagnostics = buildDomainDiagnostics({
    domain,
    mxRecords,
    addressInfo,
    dnsSecurity,
    webPresence
  });
  const hasMx = mxRecords.length > 0;
  const hasResolvableDomain = addressInfo.hasAddress;
  const domainKnown = KNOWN_PROVIDERS.has(domain);
  const localStatus = smtpInspection.mailbox_exists
    ? (smtpInspection.accept_all ? "catch-all" : "valid")
    : hasMx
      ? "unknown"
      : hasResolvableDomain
        ? "unknown"
        : "invalid";
  const subStatus = smtpInspection.classification === "mailbox_exists"
    ? "mailbox_exists"
    : smtpInspection.classification === "accept_all"
      ? "accept_all"
      : smtpInspection.classification === "greylisting"
        ? "greylisted"
        : smtpInspection.classification === "tempfail"
          ? "mail_server_temporary_error"
          : hasMx
            ? "dns_mx_confirmed"
            : hasResolvableDomain
              ? "dns_only_no_mx"
              : "domain_unresolvable";
  const scoreSeed = localStatus === "valid" ? 72 : hasResolvableDomain ? 42 : 5;

  return baseVerificationShape(email, {
    status: localStatus,
    sub_status: subStatus,
    domain,
    mx_found: hasMx,
    smtp_valid: smtpInspection.mailbox_exists,
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
      ? `Verification DNS/MX locale reussie avec ${mxRecords.length} enregistrement(s). Classification SMTP: ${smtpInspection.classification}.`
      : hasResolvableDomain
      ? "Le domaine repond au DNS, mais aucun MX n'a ete trouve."
      : "Le domaine ne repond ni en MX ni en resolution d'adresse.",
    technical_signals: {
      smtp: smtpInspection,
      dns_security: dnsSecurity,
      web_presence: webPresence
    },
    domain_diagnostics: domainDiagnostics
  });
}

async function fetchZeroBounceVerification(email) {
  const apiKey = getZeroBounceApiKey();

  if (!apiKey) {
    setProviderError("zerobounce", "ZEROBOUNCE_API_KEY is missing.");
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
    setProviderError("zerobounce", `ZeroBounce request failed with ${response.status}: ${text}`);
    throw new Error(`ZeroBounce request failed with ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    setProviderError("zerobounce", typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  }

  clearProviderError("zerobounce");

  return mapZeroBounceResponse(email, data);
}

async function fetchAbstractVerification(email) {
  const apiKey = getAbstractApiKey();

  if (!apiKey) {
    setProviderError("abstract", "ABSTRACT_API_KEY is missing.");
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
    setProviderError("abstract", `Abstract request failed with ${response.status}: ${text}`);
    throw new Error(`Abstract request failed with ${response.status}: ${text}`);
  }

  const data = await response.json();
  clearProviderError("abstract");
  return mapAbstractResponse(email, data);
}

async function enrichVerificationWithLocalDomainSignals(verification) {
  const domain = verification.domain || String(verification.email || "").split("@")[1];
  if (!domain) return verification;

  const [mxRecords, addressInfo, dnsSecurity, webPresence] = await Promise.all([
    resolveMx(domain),
    resolveAnyHost(domain),
    resolveDnsSecurity(domain),
    resolveWebPresence(domain)
  ]);
  const domainDiagnostics = buildDomainDiagnostics({
    domain,
    mxRecords,
    addressInfo,
    dnsSecurity,
    webPresence
  });

  return {
    ...verification,
    technical_signals: {
      ...(verification.technical_signals || {}),
      dns_security: dnsSecurity,
      web_presence: webPresence
    },
    domain_diagnostics: domainDiagnostics,
    mx_record: verification.mx_record || mxRecords[0] || null
  };
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
  const mxRecords = verification.mx_record
    ? [verification.mx_record]
    : verification.technical_signals && verification.technical_signals.smtp && Array.isArray(verification.technical_signals.smtp.mx_records)
      ? verification.technical_signals.smtp.mx_records
      : [];
  const role = typeof verification.role === "boolean"
    ? verification.role
    : inferRoleAddress(verification.email, verification.sub_status);
  const scoreBreakdown = buildScoreBreakdown({
    ...verification,
    syntax,
    score,
    mx: verification.mx_found,
    smtp: verification.smtp_valid,
    role
  });

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
    mxRecords,
    role,
    risk: verification.risk_level,
    catch_all_probable: Boolean(verification.technical_signals && verification.technical_signals.smtp && verification.technical_signals.smtp.catch_all_probable),
    score_breakdown: scoreBreakdown,
    confidence_level: scoreBreakdown.confidence_level,
    explanation_lines: scoreBreakdown.explanations,
    technical_signals: verification.technical_signals || {
      smtp: {
        classification: verification.smtp_valid ? "mailbox_exists" : "unknown",
        mailbox_exists: verification.smtp_valid,
        accept_all: false,
        catch_all_probable: false,
        greylisting: false,
        tempfail: false,
        transcript: []
      }
    },
    domain_diagnostics: verification.domain_diagnostics || {
      flags: {
        parked_domain: false,
        domain_without_website: false,
        mx_inconsistent: false,
        recently_created_estimate: verification.domain_age_estimate === "new"
      },
      issues: [],
      security_posture: {
        spf: false,
        dmarc: false,
        dkim: false,
        bimi: false,
        mta_sts: false,
        tls_rpt: false
      }
    }
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
    return enrichVerificationWithLocalDomainSignals(await fetchZeroBounceVerification(email));
  }

  if (provider === "abstract") {
    return enrichVerificationWithLocalDomainSignals(await fetchAbstractVerification(email));
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
        ...(attempt.provider === "local" ? result : await enrichVerificationWithLocalDomainSignals(result)),
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
