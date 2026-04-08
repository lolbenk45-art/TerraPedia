import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultStatePath = path.join(workspaceRoot, 'data', 'terraPedia', 'generated', 'wiki-request-gate.latest.json');
const defaultUserAgent = 'TerraPedia-data-sync/2.0 (+https://terraria.wiki.gg/api.php)';

const REQUEST_PROFILES = {
  revision: {
    baseDelayMs: 1_000,
    jitterMs: 500,
    maxAttempts: 4,
    cooldownMs: 15 * 60_000
  },
  page: {
    baseDelayMs: 3_000,
    jitterMs: 1_000,
    maxAttempts: 4,
    cooldownMs: 15 * 60_000
  },
  parse: {
    baseDelayMs: 5_000,
    jitterMs: 2_000,
    maxAttempts: 4,
    cooldownMs: 20 * 60_000
  },
  expand: {
    baseDelayMs: 5_000,
    jitterMs: 2_000,
    maxAttempts: 4,
    cooldownMs: 20 * 60_000
  }
};

export function createWikiRequestGate({
  hostKey = 'terraria.wiki.gg',
  statePath = defaultStatePath,
  userAgent = defaultUserAgent
} = {}) {
  const gateStatePath = path.resolve(statePath);
  let state = loadGateState(gateStatePath, hostKey);
  let queue = Promise.resolve();

  function enqueue(work) {
    const run = queue.then(work, work);
    queue = run.catch(() => {});
    return run;
  }

  async function runJsonRequest(input, options = {}) {
    return enqueue(() => performRequest(input, { ...options, responseType: 'json' }));
  }

  async function runTextRequest(input, options = {}) {
    return enqueue(() => performRequest(input, { ...options, responseType: 'text' }));
  }

  function getStateSnapshot() {
    return { ...state };
  }

  function clearCooldown() {
    state = {
      ...state,
      consecutiveThrottleFailures: 0,
      cooldownUntil: null,
      lastError: null
    };
    saveGateState(gateStatePath, state);
  }

  async function performRequest(input, {
    profile = 'revision',
    responseType = 'json',
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20_000,
    sourceKey = null
  } = {}) {
    const requestProfile = REQUEST_PROFILES[profile] ?? REQUEST_PROFILES.revision;
    const normalizedUrl = normalizeRequestUrl(input);

    for (let attempt = 1; attempt <= requestProfile.maxAttempts; attempt += 1) {
      await enforceCooldown();
      await waitForTurn(requestProfile);

      try {
        const response = await fetch(normalizedUrl, {
          method,
          headers: {
            'user-agent': userAgent,
            ...headers
          },
          body,
          signal: AbortSignal.timeout(timeoutMs)
        });

        const rawBody = await response.text();
        const maybeJson = responseType === 'json' ? parseJsonSafely(rawBody) : null;

        if (!response.ok) {
          throw buildHttpError({
            response,
            rawBody,
            maybeJson,
            sourceKey,
            requestProfile
          });
        }

        if (maybeJson?.error) {
          throw buildApiError({
            errorPayload: maybeJson.error,
            sourceKey,
            requestProfile
          });
        }

        noteSuccess();
        if (responseType === 'json') {
          if (maybeJson == null) {
            throw new Error(`Expected JSON response from ${normalizedUrl}`);
          }
          return maybeJson;
        }
        return rawBody;
      } catch (error) {
        const retryable = isRetryableError(error);
        noteFailure(error, requestProfile);
        if (!retryable || attempt >= requestProfile.maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error(`Request retry exhausted for ${normalizedUrl}`);
  }

  async function enforceCooldown() {
    const now = Date.now();
    if (state.cooldownUntil && Date.parse(state.cooldownUntil) <= now) {
      clearCooldown();
      return;
    }
    if (state.cooldownUntil && Date.parse(state.cooldownUntil) > now) {
      throw new Error(`Wiki request gate is cooling down until ${state.cooldownUntil}`);
    }
  }

  async function waitForTurn(profile) {
    const jitter = profile.jitterMs > 0 ? Math.floor(Math.random() * profile.jitterMs) : 0;
    const targetDelayMs = profile.baseDelayMs + jitter;
    const lastRequestAt = Date.parse(state.lastRequestAt ?? 0);
    const waitMs = Number.isFinite(lastRequestAt) ? Math.max(0, targetDelayMs - (Date.now() - lastRequestAt)) : 0;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    state = {
      ...state,
      lastRequestAt: new Date().toISOString()
    };
    saveGateState(gateStatePath, state);
  }

  function noteSuccess() {
    state = {
      ...state,
      consecutiveThrottleFailures: 0,
      cooldownUntil: null,
      lastError: null,
      successCount: Number(state.successCount ?? 0) + 1
    };
    saveGateState(gateStatePath, state);
  }

  function noteFailure(error, profile) {
    const retryable = isRetryableError(error);
    const nextFailureCount = retryable
      ? Number(state.consecutiveThrottleFailures ?? 0) + 1
      : Number(state.consecutiveThrottleFailures ?? 0);
    const shouldCooldown = retryable && nextFailureCount >= 3;
    state = {
      ...state,
      consecutiveThrottleFailures: nextFailureCount,
      cooldownUntil: shouldCooldown ? new Date(Date.now() + profile.cooldownMs).toISOString() : state.cooldownUntil,
      lastError: compactError(error),
      lastFailureAt: new Date().toISOString(),
      failureCount: Number(state.failureCount ?? 0) + 1,
      throttleFailureCount: retryable ? Number(state.throttleFailureCount ?? 0) + 1 : Number(state.throttleFailureCount ?? 0)
    };
    saveGateState(gateStatePath, state);
  }

  return {
    clearCooldown,
    getStateSnapshot,
    runJsonRequest,
    runTextRequest,
    statePath: gateStatePath,
    userAgent
  };
}

function normalizeRequestUrl(input) {
  const url = input instanceof URL ? new URL(input) : new URL(String(input));
  if (isWikiApiUrl(url)) {
    if (!url.searchParams.has('maxlag')) {
      url.searchParams.set('maxlag', '5');
    }
    if (!url.searchParams.has('format') && isApiActionNeedingFormat(url)) {
      url.searchParams.set('format', 'json');
    }
  }
  return url;
}

function isWikiApiUrl(url) {
  return url.hostname === 'terraria.wiki.gg' && url.pathname.endsWith('/api.php');
}

function isApiActionNeedingFormat(url) {
  const action = url.searchParams.get('action');
  return action === 'query' || action === 'parse' || action === 'expandtemplates' || action === 'help';
}

function buildHttpError({ response, rawBody, maybeJson, sourceKey, requestProfile }) {
  const errorCode = maybeJson?.error?.code ?? null;
  const errorInfo = maybeJson?.error?.info ?? null;
  const statusText = `HTTP ${response.status} ${response.statusText}`;
  const details = [sourceKey, errorCode, errorInfo, compactText(rawBody)].filter(Boolean).join(' | ');
  const message = [statusText, details].filter(Boolean).join(' | ');
  const error = new Error(message);
  error.retryable = isRetryableStatus(response.status) || isRetryableApiCode(errorCode);
  error.status = response.status;
  error.profile = requestProfile;
  return error;
}

function buildApiError({ errorPayload, sourceKey, requestProfile }) {
  const code = String(errorPayload?.code ?? '');
  const info = String(errorPayload?.info ?? '');
  const details = [sourceKey, code, info].filter(Boolean).join(' | ');
  const error = new Error(`Wiki API error: ${details}`);
  error.retryable = isRetryableApiCode(code) || compactText(info).toLowerCase().includes('lag');
  error.profile = requestProfile;
  error.code = code;
  return error;
}

function isRetryableError(error) {
  if (error?.retryable === true) {
    return true;
  }
  const message = compactError(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('403') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('maxlag') ||
    message.includes('ratelimited') ||
    message.includes('rate limit') ||
    message.includes('cooling down')
  );
}

function isRetryableStatus(status) {
  return status === 403 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableApiCode(code) {
  const normalized = String(code ?? '').trim().toLowerCase();
  return normalized === 'maxlag' || normalized === 'ratelimited';
}

function compactError(error) {
  if (error instanceof Error) {
    return compactText(error.message);
  }
  return compactText(String(error ?? ''));
}

function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadGateState(filePath, hostKey) {
  if (!fs.existsSync(filePath)) {
    return buildInitialState(hostKey);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...buildInitialState(hostKey),
      ...parsed,
      hostKey
    };
  } catch {
    return buildInitialState(hostKey);
  }
}

function buildInitialState(hostKey) {
  return {
    schemaVersion: '1.0.0',
    hostKey,
    cooldownUntil: null,
    consecutiveThrottleFailures: 0,
    failureCount: 0,
    lastError: null,
    lastFailureAt: null,
    lastRequestAt: null,
    successCount: 0,
    throttleFailureCount: 0,
    updatedAt: new Date().toISOString()
  };
}

function saveGateState(filePath, state) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
