const runtimeStatus = {
  zerobounce: { ok: true, last_error: null },
  abstract: { ok: true, last_error: null },
  hunter: { ok: true, last_error: null },
  gravatar: { ok: true, last_error: null }
};

function setProviderError(provider, message) {
  if (!runtimeStatus[provider]) return;
  runtimeStatus[provider] = {
    ok: false,
    last_error: String(message || "Unknown error")
  };
}

function clearProviderError(provider) {
  if (!runtimeStatus[provider]) return;
  runtimeStatus[provider] = {
    ok: true,
    last_error: null
  };
}

function getProviderRuntimeStatus() {
  return {
    zerobounce: { ...runtimeStatus.zerobounce },
    abstract: { ...runtimeStatus.abstract },
    hunter: { ...runtimeStatus.hunter },
    gravatar: { ...runtimeStatus.gravatar }
  };
}

module.exports = {
  clearProviderError,
  getProviderRuntimeStatus,
  setProviderError
};
