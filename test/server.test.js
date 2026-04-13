const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Duplex } = require("node:stream");

const {
  buildFrontendPayload,
  buildPdfReport,
  clearAllData,
  clearCache,
  createApp,
  mapZeroBounceResponse
} = require("../server");

class MockSocket extends Duplex {
  constructor() {
    super();
    this.chunks = [];
    this.remoteAddress = "127.0.0.1";
  }

  _read() {}

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

function invokeApp(app, { method = "GET", url = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new MockSocket();
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [String(name).toLowerCase(), value])
    );
    req.connection = socket;
    req.socket = socket;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    res.on("error", reject);
    res.on("finish", () => {
      const raw = Buffer.concat(socket.chunks).toString("utf8");
      const separator = raw.indexOf("\r\n\r\n");
      const bodyText = separator >= 0 ? raw.slice(separator + 4) : "";
      const buffer = Buffer.from(bodyText, "utf8");
      const responseHeaders = Object.fromEntries(
        Object.entries(res.getHeaders()).map(([name, value]) => [String(name).toLowerCase(), value])
      );
      let json = null;

      try {
        json = JSON.parse(bodyText);
      } catch (error) {
        json = null;
      }

      resolve({
        statusCode: res.statusCode,
        headers: responseHeaders,
        body: buffer,
        json
      });
    });

    const serializedBody = body
      ? typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body)
      : null;

    if (serializedBody && !req.headers["content-length"]) {
      req.headers["content-length"] = Buffer.byteLength(serializedBody).toString();
    }

    if (!req.headers.host) {
      req.headers.host = "verifyor.local";
    }

    if (serializedBody) {
      req.push(serializedBody);
    }

    app.handle(req, res, (error) => {
      if (error) reject(error);
    });

    req.push(null);
  });
}

function bufferFromHttpBody(rawBuffer) {
  const separator = rawBuffer.indexOf("\r\n\r\n");
  if (separator < 0) return Buffer.alloc(0);
  return rawBuffer.subarray(separator + 4);
}

function invokeBinaryApp(app, options) {
  return new Promise((resolve, reject) => {
    const socket = new MockSocket();
    const req = new http.IncomingMessage(socket);
    req.method = options.method || "GET";
    req.url = options.url || "/";
    req.headers = Object.fromEntries(
      Object.entries(options.headers || {}).map(([name, value]) => [String(name).toLowerCase(), value])
    );
    req.connection = socket;
    req.socket = socket;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    res.on("error", reject);
    res.on("finish", () => {
      const rawBuffer = Buffer.concat(socket.chunks);
      resolve({
        statusCode: res.statusCode,
        headers: Object.fromEntries(
          Object.entries(res.getHeaders()).map(([name, value]) => [String(name).toLowerCase(), value])
        ),
        body: bufferFromHttpBody(rawBuffer)
      });
    });

    const serializedBody = options.body
      ? typeof options.body === "string" || Buffer.isBuffer(options.body)
        ? options.body
        : JSON.stringify(options.body)
      : null;

    if (serializedBody && !req.headers["content-length"]) {
      req.headers["content-length"] = Buffer.byteLength(serializedBody).toString();
    }

    if (!req.headers.host) {
      req.headers.host = "verifyor.local";
    }

    if (serializedBody) {
      req.push(serializedBody);
    }

    app.handle(req, res, (error) => {
      if (error) reject(error);
    });

    req.push(null);
  });
}

test("mapZeroBounceResponse normalizes the provider payload", () => {
  const result = mapZeroBounceResponse("john.doe@gmail.com", {
    status: "valid",
    sub_status: "",
    domain: "gmail.com",
    mx_found: "true",
    free_email: "true",
    quality_score: 0.91
  });

  assert.equal(result.status, "valid");
  assert.equal(result.mx_found, true);
  assert.equal(result.smtp_valid, true);
  assert.equal(result.quality_score, 91);
  assert.equal(result.full_name, "John Doe");
  assert.equal(result.email_type, "personal");
  assert.equal(result.provider_type, "free");
  assert.equal(result.risk, "low");
});

test("buildFrontendPayload computes a fallback score when ZeroBounce score is unusable", () => {
  const payload = buildFrontendPayload({
    email: "ops@company.com",
    status: "valid",
    sub_status: "role_based",
    domain: "company.com",
    mx_found: true,
    smtp_valid: true,
    disposable: false,
    toxic: false,
    quality_score: 0,
    quality_score_raw: 0,
    did_you_mean: null,
    mx_record: "mx.company.com",
    provider: "Google Workspace",
    free_email: false,
    firstname: "",
    lastname: "",
    full_name: "Unknown user",
    email_type: "professional",
    company_domain: "company.com",
    provider_type: "corporate",
    domain_age_estimate: "old",
    risk_level: "medium",
    risk: "medium",
    cached: false
  });

  assert.equal(payload.score_source, "fallback");
  assert.equal(payload.score, 100);
  assert.deepEqual(payload.mxRecords, ["mx.company.com"]);
  assert.equal(payload.role, true);
});

test("buildPdfReport returns a PDF buffer", () => {
  const buffer = buildPdfReport({
    email: "report@example.com",
    full_name: "Report Example",
    status: "valid",
    deliverability: "valid",
    deliverabilityDetail: "valid",
    domain: "example.com",
    mx: true,
    smtp: true,
    syntax: true,
    disposable: false,
    role: false,
    risk: "low",
    score: 88,
    score_source: "zerobounce",
    email_type: "professional",
    provider_type: "corporate",
    domain_age_estimate: "old"
  });

  assert.equal(Buffer.isBuffer(buffer), true);
  assert.equal(buffer.slice(0, 8).toString("utf8"), "%PDF-1.4");
  assert.match(buffer.toString("utf8"), /verifyor-report|Verifyor/i);
});

test("GET /api/verify returns mapped verification data", async () => {
  clearCache();
  clearAllData();

  const app = createApp({
    verificationFetcher: async (email) => ({
      email,
      status: "valid",
      sub_status: "",
      domain: "example.com",
      mx_found: true,
      smtp_valid: true,
      disposable: false,
      toxic: false,
      quality_score: 82,
      quality_score_raw: 82,
      did_you_mean: null,
      mx_record: "mx.example.com",
      provider: "Test SMTP",
      free_email: false,
      firstname: "Alice",
      lastname: "Martin",
      full_name: "Alice Martin",
      email_type: "professional",
      company_domain: "example.com",
      provider_type: "corporate",
      domain_age_estimate: "old",
      risk_level: "low",
      risk: "low",
      cached: false
    })
  });
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/verify?email=alice@example.com&provider=local"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.email, "alice@example.com");
  assert.equal(response.json.score, 82);
  assert.equal(response.json.mx, true);
  assert.equal(response.json.smtp, true);
  assert.equal(response.json.full_name, "Alice Martin");
  assert.equal(response.json.verification_provider, "local");

  clearCache();
  clearAllData();
});

test("dashboard endpoints expose persisted analyses", async () => {
  clearCache();
  clearAllData();

  const app = createApp({
    verificationFetcher: async (email) => ({
      email,
      status: "valid",
      sub_status: "",
      domain: "example.com",
      mx_found: true,
      smtp_valid: true,
      disposable: false,
      toxic: false,
      quality_score: 75,
      quality_score_raw: 75,
      did_you_mean: null,
      mx_record: "mx.example.com",
      provider: "Test SMTP",
      free_email: false,
      firstname: "Pat",
      lastname: "Example",
      full_name: "Pat Example",
      email_type: "professional",
      company_domain: "example.com",
      provider_type: "corporate",
      domain_age_estimate: "old",
      risk_level: "low",
      risk: "low",
      cached: false
    })
  });

  await invokeApp(app, {
    method: "GET",
    url: "/api/verify?email=pat@example.com&provider=local"
  });

  const analysesResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/analyses?limit=5"
  });
  const summaryResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/dashboard/summary"
  });

  assert.equal(analysesResponse.statusCode, 200);
  assert.equal(Array.isArray(analysesResponse.json.items), true);
  assert.equal(analysesResponse.json.items[0].email, "pat@example.com");

  assert.equal(summaryResponse.statusCode, 200);
  assert.equal(summaryResponse.json.analyses_count >= 1, true);
  assert.equal(summaryResponse.json.valid_count >= 1, true);
  assert.equal(summaryResponse.json.local_count >= 1, true);

  clearCache();
  clearAllData();
});

test("admin and providers endpoints are exposed", async () => {
  clearCache();
  clearAllData();

  const app = createApp({
    verificationFetcher: async (email, provider) => ({
      email,
      status: "valid",
      sub_status: "",
      domain: "example.com",
      mx_found: true,
      smtp_valid: provider === "local" ? false : true,
      disposable: false,
      toxic: false,
      quality_score: 60,
      quality_score_raw: 60,
      provider: "Stub",
      verification_provider: provider || "local",
      verification_method: provider || "local"
    })
  });

  await invokeApp(app, {
    method: "GET",
    url: "/api/verify?email=ops@example.com&provider=local"
  });

  const providersResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/verification/providers"
  });
  const adminHistoryResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/admin/history?limit=20"
  });
  const adminPageResponse = await invokeApp(app, {
    method: "GET",
    url: "/admin/db"
  });

  assert.equal(providersResponse.statusCode, 200);
  assert.equal(Array.isArray(providersResponse.json.providers), true);
  assert.equal(providersResponse.json.providers.includes("local"), true);

  assert.equal(adminHistoryResponse.statusCode, 200);
  assert.equal(Array.isArray(adminHistoryResponse.json.analyses), true);
  assert.equal(adminHistoryResponse.json.analyses[0].email, "ops@example.com");

  assert.equal(adminPageResponse.statusCode, 200);
  assert.match(adminPageResponse.body.toString("utf8"), /Verifyor DB/);

  clearCache();
  clearAllData();
});

test("POST /api/report/pdf returns an application/pdf response", async () => {
  const app = createApp();
  const response = await invokeBinaryApp(app, {
    method: "POST",
    url: "/api/report/pdf",
    headers: {
      "content-type": "application/json"
    },
    body: {
      email: "pdf@example.com",
      full_name: "Pdf Example",
      status: "valid",
      deliverability: "valid",
      deliverabilityDetail: "valid",
      domain: "example.com",
      mx: true,
      smtp: true,
      syntax: true,
      disposable: false,
      role: false,
      risk: "low",
      score: 93,
      score_source: "zerobounce",
      email_type: "professional",
      provider_type: "corporate",
      domain_age_estimate: "old"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/pdf");
  assert.match(response.headers["content-disposition"], /verifyor-report-pdf_at_example\.com\.pdf/);
  assert.equal(response.body.slice(0, 8).toString("utf8"), "%PDF-1.4");
});
