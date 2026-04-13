const crypto = require("node:crypto");
const {
  clearProviderError,
  setProviderError
} = require("./provider-status");

const {
  normalizeEmail,
  isValidEmail
} = require("./verification-service");

function getHunterApiKey() {
  return process.env.HUNTER_API_KEY || "test-api-key";
}

function getGravatarApiKey() {
  return process.env.GRAVATAR_API_KEY || "";
}

function safeText(value) {
  return value == null ? null : String(value);
}

function gravatarHash(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function buildLinkedInUrl(handle) {
  if (!handle) return null;
  if (String(handle).startsWith("http")) return handle;
  return `https://www.linkedin.com/${String(handle).replace(/^\/+/, "")}`;
}

function buildSocialUrl(network, handle) {
  if (!handle) return null;
  if (String(handle).startsWith("http")) return handle;

  const normalized = String(handle).replace(/^@/, "").replace(/^\/+/, "");

  if (network === "linkedin") return `https://www.linkedin.com/${normalized}`;
  if (network === "twitter") return `https://x.com/${normalized}`;
  if (network === "github") return `https://github.com/${normalized}`;
  if (network === "facebook") return `https://www.facebook.com/${normalized}`;
  if (network === "gravatar") return `https://gravatar.com/${normalized}`;

  return null;
}

function normalizeSocialProfiles(person) {
  const profiles = [
    {
      network: "linkedin",
      handle: person.linkedin ? person.linkedin.handle : null,
      url: buildSocialUrl("linkedin", person.linkedin ? person.linkedin.handle : null)
    },
    {
      network: "twitter",
      handle: person.twitter ? person.twitter.handle : null,
      url: buildSocialUrl("twitter", person.twitter ? person.twitter.handle : null)
    },
    {
      network: "github",
      handle: person.github ? person.github.handle : null,
      url: buildSocialUrl("github", person.github ? person.github.handle : null)
    },
    {
      network: "facebook",
      handle: person.facebook ? person.facebook.handle : null,
      url: buildSocialUrl("facebook", person.facebook ? person.facebook.handle : null)
    },
    {
      network: "gravatar",
      handle: person.gravatar ? person.gravatar.handle : null,
      url: buildSocialUrl("gravatar", person.gravatar ? person.gravatar.handle : null),
      avatar_url: person.gravatar ? person.gravatar.avatar : null
    }
  ];

  return profiles.filter((profile) => profile.handle || profile.url || profile.avatar_url);
}

function normalizeVerifiedAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .slice(0, 8)
    .map((account) => ({
      network: account.service_type || account.service_label || "account",
      handle: account.username || account.shortname || null,
      url: account.url || account.profile_url || null,
      verified: account.is_verified !== false
    }))
    .filter((account) => account.handle || account.url);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && payload.errors
      ? JSON.stringify(payload.errors)
      : payload && payload.error
      ? JSON.stringify(payload.error)
      : `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function fetchHunter(endpoint, params = {}) {
  const apiKey = getHunterApiKey();
  const url = new URL(`https://api.hunter.io/v2/${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  try {
    const payload = await fetchJson(url, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });
    clearProviderError("hunter");
    return payload;
  } catch (error) {
    setProviderError("hunter", error.message);
    throw error;
  }
}

async function safeHunter(endpoint, params) {
  try {
    return await fetchHunter(endpoint, params);
  } catch (error) {
    return {
      error: error.message,
      status: error.status || 500
    };
  }
}

function splitFullName(fullName) {
  const normalized = safeText(fullName);
  if (!normalized || normalized === "Unknown user") {
    return { firstName: null, lastName: null };
  }

  const parts = normalized.trim().split(/\s+/);
  return {
    firstName: parts[0] || null,
    lastName: parts.slice(1).join(" ") || null
  };
}

function normalizeHunterContact(emailRecord) {
  return {
    email: emailRecord.value || null,
    type: emailRecord.type || null,
    confidence: emailRecord.confidence ?? null,
    position: emailRecord.position || null,
    department: Array.isArray(emailRecord.department) ? emailRecord.department.join(", ") : emailRecord.department || null,
    seniority: emailRecord.seniority || null,
    sources: Array.isArray(emailRecord.sources) ? emailRecord.sources.length : 0
  };
}

function normalizeHunterIntelligence({ email, currentResult, combined, company, domainSearch, emailFinder, verifier }) {
  const combinedData = combined && combined.data ? combined.data : {};
  const companyData = company && company.data ? company.data : {};
  const domainData = domainSearch && domainSearch.data ? domainSearch.data : {};
  const finderData = emailFinder && emailFinder.data ? emailFinder.data : {};
  const verifierData = verifier && verifier.data ? verifier.data : {};
  const person = combinedData.person || {};
  const personName = person.name || {};
  const employment = person.employment || {};
  const combinedCompany = combinedData.company || {};
  const chosenCompany = Object.keys(companyData).length ? companyData : combinedCompany;
  const domainContacts = Array.isArray(domainData.emails) ? domainData.emails.slice(0, 5).map(normalizeHunterContact) : [];
  const socialProfiles = normalizeSocialProfiles(person);
  const linkedinHandle = person.linkedin && person.linkedin.handle
    ? person.linkedin.handle
    : chosenCompany.linkedin && chosenCompany.linkedin.handle
    ? chosenCompany.linkedin.handle
    : null;

  return {
    email,
    emailFinder: {
      email: finderData.email || person.email || currentResult.email,
      score: finderData.score ?? null,
      pattern: finderData.pattern || domainData.pattern || null,
      sources: Array.isArray(finderData.sources) ? finderData.sources.length : 0
    },
    deliverability: {
      result: verifierData.result || currentResult.deliverability || currentResult.status,
      score: verifierData.score ?? currentResult.score ?? null,
      status: verifierData.status || null,
      regexp: verifierData.regexp ?? null,
      gibberish: verifierData.gibberish ?? null,
      disposable: verifierData.disposable ?? currentResult.disposable ?? null,
      webmail: verifierData.webmail ?? null,
      accept_all: verifierData.accept_all ?? null
    },
    company: {
      name: chosenCompany.name || employment.name || domainData.organization || currentResult.company_domain || currentResult.domain,
      legal_name: chosenCompany.legalName || null,
      domain: chosenCompany.domain || employment.domain || currentResult.domain,
      website: chosenCompany.website || chosenCompany.domain || employment.domain || null,
      description: chosenCompany.description || null,
      location: chosenCompany.location || null,
      country: chosenCompany.location ? String(chosenCompany.location).split(",").slice(-1)[0].trim() : null,
      phone: chosenCompany.phone || null,
      employees: chosenCompany.metrics ? chosenCompany.metrics.employees || null : null,
      industry: chosenCompany.category ? chosenCompany.category.industry || null : null,
      technologies: Array.isArray(chosenCompany.technologies) ? chosenCompany.technologies.slice(0, 8) : [],
      hiring: chosenCompany.metrics ? chosenCompany.metrics.isHiring ?? null : null,
      logo: chosenCompany.logo || null,
      linkedin_url: buildLinkedInUrl(chosenCompany.linkedin ? chosenCompany.linkedin.handle : null)
    },
    person: {
      full_name: personName.fullName || currentResult.full_name || "Unknown user",
      first_name: personName.givenName || currentResult.firstname || null,
      last_name: personName.familyName || currentResult.lastname || null,
      title: employment.title || finderData.position || null,
      seniority: employment.seniority || null,
      role: employment.role || null,
      bio: person.bio || null,
      location: person.location || null,
      site: person.site || null,
      avatar_url: person.avatar || (person.gravatar ? person.gravatar.avatar : null) || null,
      linkedin_url: buildLinkedInUrl(linkedinHandle),
      social_profiles: socialProfiles
    },
    social_profiles: socialProfiles,
    pattern_detection: {
      pattern: domainData.pattern || finderData.pattern || null,
      organization: domainData.organization || chosenCompany.name || null,
      sample_emails: domainContacts,
      public_emails: domainContacts.map((contact) => contact.email).filter(Boolean)
    },
    domain_search: {
      organization: domainData.organization || null,
      pattern: domainData.pattern || null,
      disposable: domainData.disposable || null,
      webmail: domainData.webmail || null,
      accept_all: verifierData.accept_all ?? null
    },
    segmentation: {
      employee_range: chosenCompany.metrics ? chosenCompany.metrics.employees || null : null,
      industry: chosenCompany.category ? chosenCompany.category.industry || null : null,
      location: chosenCompany.location || null,
      country: chosenCompany.location ? String(chosenCompany.location).split(",").slice(-1)[0].trim() : null,
      technologies: Array.isArray(chosenCompany.technologies) ? chosenCompany.technologies.slice(0, 8) : [],
      hiring_signal: chosenCompany.metrics ? chosenCompany.metrics.isHiring ?? null : null
    },
    credits_note: getHunterApiKey() === "test-api-key"
      ? "Hunter test-api-key active: la structure de la reponse est valide, mais les donnees sont de demonstration."
      : null,
    sources: {
      combined_error: combined && combined.error ? combined.error : null,
      company_error: company && company.error ? company.error : null,
      domain_search_error: domainSearch && domainSearch.error ? domainSearch.error : null,
      email_finder_error: emailFinder && emailFinder.error ? emailFinder.error : null,
      verifier_error: verifier && verifier.error ? verifier.error : null
    }
  };
}

async function getHunterB2BIntelligence(email, currentResult = {}) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error("A valid email is required for Hunter intelligence.");
  }

  const domain = currentResult.domain || normalized.split("@")[1];
  const { firstName, lastName } = splitFullName(currentResult.full_name);

  const [combined, company, domainSearch, verifier, emailFinder] = await Promise.all([
    safeHunter("combined/find", { email: normalized }),
    safeHunter("companies/find", { domain }),
    safeHunter("domain-search", { domain }),
    safeHunter("email-verifier", { email: normalized }),
    firstName && lastName
      ? safeHunter("email-finder", { domain, first_name: firstName, last_name: lastName })
      : Promise.resolve({ data: null })
  ]);

  return normalizeHunterIntelligence({
    email: normalized,
    currentResult,
    combined,
    company,
    domainSearch,
    emailFinder,
    verifier
  });
}

async function getGravatarLookup(email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error("A valid email is required for Gravatar lookup.");
  }

  const hash = gravatarHash(normalized);
  const avatarUrl = `https://gravatar.com/avatar/${hash}?s=240&d=404`;
  const profileUrl = `https://api.gravatar.com/v3/profiles/${hash}`;
  const apiKey = getGravatarApiKey();

  try {
    const payload = await fetchJson(profileUrl, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      signal: AbortSignal.timeout(12000)
    });
    clearProviderError("gravatar");

    return {
      email: normalized,
      hash,
      photo_url: payload.avatar_url || avatarUrl,
      full_name: payload.display_name || [payload.first_name, payload.last_name].filter(Boolean).join(" ") || null,
      first_name: payload.first_name || null,
      last_name: payload.last_name || null,
      profile_url: payload.profile_url || `https://gravatar.com/${hash}`,
      public_profile: true,
      job_title: payload.job_title || null,
      company: payload.company || null,
      location: payload.location || null,
      description: payload.description || null,
      verified_accounts: Array.isArray(payload.verified_accounts) ? payload.verified_accounts.slice(0, 6) : [],
      social_profiles: normalizeVerifiedAccounts(payload.verified_accounts),
      site: payload.profile_url || payload.site_url || null,
      bio: payload.description || null,
      source_note: apiKey
        ? "Profil public Gravatar charge via l'API profile."
        : "Profil public Gravatar charge sans bearer token. Selon le compte et le rate limit, les donnees peuvent etre partielles."
    };
  } catch (error) {
    if (error.status === 404) {
      clearProviderError("gravatar");
      return {
        email: normalized,
        hash,
        photo_url: null,
        full_name: null,
        profile_url: null,
        public_profile: false,
        verified_accounts: [],
        social_profiles: [],
        source_note: "Aucun profil public Gravatar trouve pour cet email."
      };
    }

    setProviderError("gravatar", error.message);
    throw error;
  }
}

async function getLinkedInMatch(email, currentResult = {}) {
  const hunterData = await getHunterB2BIntelligence(email, currentResult).catch(() => null);
  const gravatarData = await getGravatarLookup(email).catch(() => null);

  const hunterPerson = hunterData ? hunterData.person : {};
  const hunterCompany = hunterData ? hunterData.company : {};
  const gravatarName = gravatarData ? gravatarData.full_name : null;
  const fullName = hunterPerson.full_name && hunterPerson.full_name !== "Unknown user"
    ? hunterPerson.full_name
    : gravatarName || currentResult.full_name || "Unknown user";
  const photoUrl = hunterPerson.avatar_url || (gravatarData ? gravatarData.photo_url : null) || null;
  const confidence = hunterPerson.linkedin_url
    ? "medium"
    : hunterPerson.title || hunterCompany.name
    ? "low"
    : "none";

  return {
    email: normalizeEmail(email),
    full_name: fullName,
    first_name: hunterPerson.first_name || (gravatarData ? gravatarData.first_name : null) || currentResult.firstname || null,
    last_name: hunterPerson.last_name || (gravatarData ? gravatarData.last_name : null) || currentResult.lastname || null,
    job_title: hunterPerson.title || (gravatarData ? gravatarData.job_title : null) || null,
    company: hunterCompany.name || (gravatarData ? gravatarData.company : null) || currentResult.company_domain || null,
    photo_url: photoUrl,
    linkedin_url: hunterPerson.linkedin_url || hunterCompany.linkedin_url || null,
    bio: hunterPerson.bio || (gravatarData ? gravatarData.bio : null) || null,
    location: hunterPerson.location || (gravatarData ? gravatarData.location : null) || null,
    site: hunterPerson.site || (gravatarData ? gravatarData.site : null) || null,
    social_profiles: [
      ...(hunterData && hunterData.social_profiles ? hunterData.social_profiles : []),
      ...(gravatarData && gravatarData.social_profiles ? gravatarData.social_profiles : [])
    ],
    confidence,
    source_note: "Ce matching n'utilise pas l'API officielle LinkedIn pour une recherche arbitraire. Il combine les signaux Hunter, Gravatar et les handles LinkedIn publics disponibles."
  };
}

module.exports = {
  getGravatarLookup,
  getHunterB2BIntelligence,
  getLinkedInMatch,
  gravatarHash
};
