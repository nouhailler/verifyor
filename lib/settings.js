const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.resolve(__dirname, "..", ".env");
const SETTING_KEYS = [
  "ZEROBOUNCE_API_KEY",
  "ABSTRACT_API_KEY",
  "HUNTER_API_KEY",
  "GRAVATAR_API_KEY",
  "VERIFYOR_DEFAULT_PROVIDER",
  "PORT"
];

function parseEnvContent(content) {
  const values = {};
  const lines = String(content || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    values[key] = value;
  }

  return values;
}

function readSettings() {
  const content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const parsed = parseEnvContent(content);

  return {
    port: parsed.PORT || process.env.PORT || "3000",
    default_provider: parsed.VERIFYOR_DEFAULT_PROVIDER || process.env.VERIFYOR_DEFAULT_PROVIDER || "auto",
    zerobounce_api_key: parsed.ZEROBOUNCE_API_KEY || "",
    abstract_api_key: parsed.ABSTRACT_API_KEY || "",
    hunter_api_key: parsed.HUNTER_API_KEY || "",
    gravatar_api_key: parsed.GRAVATAR_API_KEY || ""
  };
}

function writeSettings(input) {
  const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const lines = current ? current.split(/\r?\n/) : [];
  const nextMap = {
    PORT: input.port || "3000",
    VERIFYOR_DEFAULT_PROVIDER: input.default_provider || "auto",
    ZEROBOUNCE_API_KEY: input.zerobounce_api_key || "",
    ABSTRACT_API_KEY: input.abstract_api_key || "",
    HUNTER_API_KEY: input.hunter_api_key || "",
    GRAVATAR_API_KEY: input.gravatar_api_key || ""
  };
  const seen = new Set();

  const rewritten = lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) return line;
      const key = line.slice(0, separatorIndex).trim();
      if (!SETTING_KEYS.includes(key)) return line;
      seen.add(key);
      return `${key}=${nextMap[key]}`;
    });

  for (const key of SETTING_KEYS) {
    if (!seen.has(key)) {
      rewritten.push(`${key}=${nextMap[key]}`);
    }
  }

  fs.writeFileSync(ENV_PATH, `${rewritten.join("\n")}\n`, "utf8");
}

module.exports = {
  ENV_PATH,
  readSettings,
  writeSettings
};
