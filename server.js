const express = require("express");
const path = require("node:path");
const dotenv = require("dotenv");

const {
  clearAllData,
  getDashboardSummary,
  listAdminHistory,
  listRecentAnalyses,
  saveAnalysis,
  saveEnrichment
} = require("./lib/db");
const {
  readSettings,
  writeSettings
} = require("./lib/settings");
const {
  getGravatarLookup,
  getHunterB2BIntelligence,
  getLinkedInMatch
} = require("./services/intelligence-service");
const {
  getProviderRuntimeStatus
} = require("./services/provider-status");
const {
  buildPdfReport,
  buildReportFilename,
  normalizeReportPayload
} = require("./services/report-service");
const {
  buildFrontendPayload,
  clearCache,
  fetchEmailVerification,
  getDefaultVerificationProvider,
  getCached,
  getSupportedVerificationProviders,
  inferNameFromEmail,
  isValidEmail,
  mapZeroBounceResponse,
  normalizeEmail,
  normalizeProviderSelection,
  setCached,
  toScore
} = require("./services/verification-service");

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createApp({ verificationFetcher = fetchEmailVerification } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.resolve(__dirname)));

  app.get("/api/verify", async (req, res) => {
    const email = normalizeEmail(req.query.email);
    const provider = normalizeProviderSelection(req.query.provider);

    if (!email) {
      return res.status(400).json({ error: "Missing required query parameter: email" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const cached = getCached(provider, email);
    if (cached) {
      return res.json({
        ...cached,
        cached: true
      });
    }

    try {
      const verification = await verificationFetcher(email, provider);
      const payload = buildFrontendPayload({
        verification_provider: provider,
        verification_method: provider === "local" ? "dns_mx" : "api",
        requested_provider: provider,
        is_local_fallback: false,
        ...verification
      });
      setCached(provider, email, payload);
      saveAnalysis(payload);
      return res.json(payload);
    } catch (error) {
      console.error("Email verification failed:", error.message);
      return res.status(502).json({
        error: "Unable to verify email with ZeroBounce",
        details: error.message
      });
    }
  });

  app.get("/api/analyses", (req, res) => {
    const limit = safeNumber(req.query.limit, 5);
    return res.json({
      items: listRecentAnalyses(limit)
    });
  });

  app.get("/api/dashboard/summary", (req, res) => {
    return res.json(getDashboardSummary());
  });

  app.get("/api/verification/providers", (req, res) => {
    return res.json({
      default_provider: getDefaultVerificationProvider(),
      providers: getSupportedVerificationProviders()
    });
  });

  app.get("/api/settings", (req, res) => {
    const settings = readSettings();
    const runtime = getProviderRuntimeStatus();

    return res.json({
      ...settings,
      runtime
    });
  });

  app.post("/api/settings", (req, res) => {
    writeSettings(req.body || {});
    return res.json({
      ok: true,
      restart_required: true,
      message: "Configuration enregistree. Redemarrage de l'application requis pour charger les nouvelles cles."
    });
  });

  app.get("/api/admin/history", (req, res) => {
    const limit = safeNumber(req.query.limit, 100);
    return res.json(listAdminHistory(limit));
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

  app.post("/api/intelligence/hunter", async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    try {
      const payload = await getHunterB2BIntelligence(email, req.body.currentResult || {});
      saveEnrichment("hunter", email, payload);
      return res.json(payload);
    } catch (error) {
      return res.status(502).json({
        error: "Unable to load Hunter intelligence",
        details: error.message
      });
    }
  });

  app.post("/api/intelligence/gravatar", async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    try {
      const payload = await getGravatarLookup(email);
      saveEnrichment("gravatar", email, payload);
      return res.json(payload);
    } catch (error) {
      return res.status(502).json({
        error: "Unable to load Gravatar lookup",
        details: error.message
      });
    }
  });

  app.post("/api/intelligence/linkedin-match", async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    try {
      const payload = await getLinkedInMatch(email, req.body.currentResult || {});
      saveEnrichment("linkedin_match", email, payload);
      return res.json(payload);
    } catch (error) {
      return res.status(502).json({
        error: "Unable to load LinkedIn matching",
        details: error.message
      });
    }
  });

  app.get("/admin/db", (req, res) => {
    res.sendFile(path.resolve(__dirname, "admin-db.html"));
  });

  app.get("/settings", (req, res) => {
    res.sendFile(path.resolve(__dirname, "settings.html"));
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
  clearAllData,
  clearCache,
  createApp,
  inferNameFromEmail,
  isValidEmail,
  mapZeroBounceResponse,
  normalizeEmail,
  normalizeReportPayload,
  startServer,
  toScore
};
