import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveSharedDataRoot } from './project-root.mjs';
import { loadAlertConfig, recordCrawlerAlert } from './crawler-alerts.mjs';
import { WIKI_USER_AGENT } from './wiki-user-agent.mjs';

const defaultStatePath = resolveSharedDataRoot('generated', 'wiki-request-gate.latest.json');
const defaultUserAgent = WIKI_USER_AGENT;

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
  userAgent = defaultUserAgent,
  requestProfiles = REQUEST_PROFILES,
  sleepFn = sleep,
  nowFn = Date.now,
  fetchFn = globalThis.fetch,
  externalRequestFn = defaultExternalRequestFn(),
  alertFn = recordCrawlerAlert,
  alertConfig = loadAlertConfig()
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

  async function runBinaryRequest(input, options = {}) {
    return enqueue(() => performRequest(input, { ...options, responseType: 'binary' }));
  }

  function getStateSnapshot() {
    return { ...state };
  }

  function clearCooldown() {
    const previousState = state;
    state = {
      ...state,
      consecutiveThrottleFailures: 0,
      cooldownUntil: null,
      lastError: null
    };
    state = saveGateState(gateStatePath, state, previousState);
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
    const requestProfile = requestProfiles[profile] ?? requestProfiles.revision ?? REQUEST_PROFILES.revision;
    const normalizedUrl = normalizeRequestUrl(input);

    for (let attempt = 1; attempt <= requestProfile.maxAttempts; attempt += 1) {
      await enforceCooldown();
      await waitForTurn(requestProfile);

      try {
        const requestHeaders = {
          'user-agent': userAgent,
          ...headers
        };
        let response = await fetchFn(normalizedUrl, {
          method,
          headers: requestHeaders,
          body,
          signal: AbortSignal.timeout(timeoutMs)
        });

        let rawBody = responseType === 'binary' ? null : await response.text();
        if (shouldUseExternalFallback({
          externalRequestFn,
          normalizedUrl,
          response,
          rawBody
        })) {
          const fallbackResponse = await externalRequestFn({
            url: normalizedUrl.toString(),
            method,
            headers: requestHeaders,
            body: serializeRequestBody(body),
            timeoutMs,
            profile,
            sourceKey
          });
          const normalizedFallback = await normalizeExternalResponse(fallbackResponse);
          response = normalizedFallback.response;
          rawBody = normalizedFallback.rawBody;
        }
        const maybeJson = responseType === 'json' ? parseJsonSafely(rawBody) : null;

        if (!response.ok) {
          if (rawBody == null && typeof response.text === 'function') {
            rawBody = await response.text();
          }
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
        if (responseType === 'binary') {
          const body = Buffer.from(await response.arrayBuffer());
          return {
            status: response.status,
            statusText: response.statusText,
            headers: headersToObject(response.headers),
            body
          };
        }
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
    if (!state.cooldownUntil) {
      return;
    }
    const cooldownAt = Date.parse(state.cooldownUntil);
    if (!Number.isFinite(cooldownAt)) {
      clearCooldown();
      return;
    }
    const now = Number(nowFn());
    if (cooldownAt <= now) {
      clearCooldown();
      return;
    }
    await sleepFn(cooldownAt - now);
    clearCooldown();
  }

  async function waitForTurn(profile) {
    const jitter = profile.jitterMs > 0 ? Math.floor(Math.random() * profile.jitterMs) : 0;
    const targetDelayMs = profile.baseDelayMs + jitter;
    const lastRequestAt = Date.parse(state.lastRequestAt ?? 0);
    const now = Number(nowFn());
    const waitMs = Number.isFinite(lastRequestAt) ? Math.max(0, targetDelayMs - (now - lastRequestAt)) : 0;
    if (waitMs > 0) {
      await sleepFn(waitMs);
    }
    const previousState = state;
    state = {
      ...state,
      lastRequestAt: new Date(Number.isFinite(now) ? now : Date.now()).toISOString()
    };
    state = saveGateState(gateStatePath, state, previousState);
  }

  function noteSuccess() {
    const previousState = state;
    state = {
      ...state,
      consecutiveThrottleFailures: 0,
      cooldownUntil: null,
      lastError: null,
      successCount: Number(state.successCount ?? 0) + 1
    };
    state = saveGateState(gateStatePath, state, previousState);
  }

  function noteFailure(error, profile) {
    const previousState = state;
    const retryable = isRetryableError(error);
    const nextFailureCount = retryable
      ? Number(state.consecutiveThrottleFailures ?? 0) + 1
      : Number(state.consecutiveThrottleFailures ?? 0);
    const shouldCooldown = retryable && nextFailureCount >= 3;
    state = {
      ...state,
      consecutiveThrottleFailures: nextFailureCount,
      cooldownUntil: shouldCooldown ? new Date(Number(nowFn()) + profile.cooldownMs).toISOString() : state.cooldownUntil,
      lastError: compactError(error),
      lastFailureAt: new Date(Number(nowFn())).toISOString(),
      failureCount: Number(state.failureCount ?? 0) + 1,
      throttleFailureCount: retryable ? Number(state.throttleFailureCount ?? 0) + 1 : Number(state.throttleFailureCount ?? 0)
    };
    state = saveGateState(gateStatePath, state, previousState);
    if (isCloudflareLikeError(error) && nextFailureCount === Number(alertConfig.consecutiveCloudflareFailures ?? 3)) {
      alertFn({
        type: 'cloudflare',
        entity: hostKey,
        message: `wiki request gate saw ${nextFailureCount} consecutive Cloudflare or 403 failures`,
        context: {
          consecutiveFailures: nextFailureCount,
          lastError: compactError(error),
          cooldownUntil: state.cooldownUntil
        }
      });
    }
  }

  return {
    clearCooldown,
    getStateSnapshot,
    runBinaryRequest,
    runJsonRequest,
    runTextRequest,
    statePath: gateStatePath,
    userAgent
  };
}

function headersToObject(headers) {
  if (!headers || typeof headers.entries !== 'function') {
    return {};
  }
  return Object.fromEntries([...headers.entries()].map(([key, value]) => [String(key).toLowerCase(), String(value)]));
}

function defaultExternalRequestFn() {
  return process.platform === 'win32' ? runPowerShellWebRequest : null;
}

function shouldUseExternalFallback({
  externalRequestFn,
  normalizedUrl,
  response,
  rawBody
}) {
  if (typeof externalRequestFn !== 'function') {
    return false;
  }
  if (!isWikiApiUrl(normalizedUrl) || Number(response?.status) !== 403) {
    return false;
  }
  const text = compactText(rawBody).toLowerCase();
  return (
    (text.includes('just a second') && text.includes('wiki.gg')) ||
    text.includes('cf-chl') ||
    text.includes('cloudflare')
  );
}

async function normalizeExternalResponse(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('External wiki request fallback returned no response');
  }
  const status = Number(result.status ?? result.statusCode);
  if (!Number.isFinite(status) || status <= 0) {
    throw new Error('External wiki request fallback returned invalid status');
  }
  const rawBody = typeof result.text === 'function'
    ? await result.text()
    : String(result.body ?? result.text ?? '');
  return {
    response: {
      ok: result.ok ?? (status >= 200 && status < 300),
      status,
      statusText: String(result.statusText ?? result.statusDescription ?? '')
    },
    rawBody
  };
}

async function runPowerShellWebRequest({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = 20_000
} = {}) {
  const timeoutSec = Math.max(1, Math.ceil(Number(timeoutMs) / 1000));
  const bodyText = body == null ? null : String(body);
  const bodyFile = bodyText
    ? path.join(os.tmpdir(), `terrapedia-wiki-request-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
    : null;

  if (bodyFile) {
    await fs.promises.writeFile(bodyFile, bodyText, 'utf8');
  }

  try {
    const output = await runPowerShellScript(POWER_SHELL_WEB_REQUEST_SCRIPT, {
      TERRAPEDIA_WIKI_FALLBACK_URL: String(url),
      TERRAPEDIA_WIKI_FALLBACK_METHOD: String(method || 'GET').toUpperCase(),
      TERRAPEDIA_WIKI_FALLBACK_HEADERS: JSON.stringify(headers ?? {}),
      TERRAPEDIA_WIKI_FALLBACK_BODY_FILE: bodyFile ?? '',
      TERRAPEDIA_WIKI_FALLBACK_TIMEOUT_SEC: String(timeoutSec)
    }, (timeoutSec + 5) * 1000);
    return parsePowerShellWebResponse(output.stdout);
  } finally {
    if (bodyFile) {
      await fs.promises.rm(bodyFile, { force: true });
    }
  }
}

function serializeRequestBody(body) {
  if (body == null) {
    return null;
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  return String(body);
}

function runPowerShellScript(script, extraEnv, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ], {
      env: {
        ...process.env,
        ...extraEnv
      },
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`PowerShell wiki request fallback timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`PowerShell wiki request fallback failed exit=${code}: ${compactText(stderr)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parsePowerShellWebResponse(stdout) {
  const match = String(stdout ?? '').match(/^STATUS:(\d+)\r?\nSTATUS_TEXT:(.*)\r?\n/s);
  if (!match) {
    throw new Error('PowerShell wiki request fallback returned malformed output');
  }
  return {
    status: Number(match[1]),
    statusText: match[2],
    body: String(stdout).slice(match[0].length)
  };
}

const POWER_SHELL_WEB_REQUEST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{}
$contentType = ''
$userAgent = ''
$headersJson = [Environment]::GetEnvironmentVariable('TERRAPEDIA_WIKI_FALLBACK_HEADERS')
if ($headersJson) {
  $parsedHeaders = ConvertFrom-Json -InputObject $headersJson
  foreach ($property in $parsedHeaders.PSObject.Properties) {
    $name = [string]$property.Name
    $value = [string]$property.Value
    if ($name.ToLowerInvariant() -eq 'content-type') {
      $contentType = $value
    } elseif ($name.ToLowerInvariant() -eq 'user-agent') {
      $userAgent = $value
    } else {
      $headers[$name] = $value
    }
  }
}
$timeoutSec = [int]([Environment]::GetEnvironmentVariable('TERRAPEDIA_WIKI_FALLBACK_TIMEOUT_SEC'))
$params = @{
  Uri = [Environment]::GetEnvironmentVariable('TERRAPEDIA_WIKI_FALLBACK_URL')
  Method = [Environment]::GetEnvironmentVariable('TERRAPEDIA_WIKI_FALLBACK_METHOD')
  UseBasicParsing = $true
  TimeoutSec = $timeoutSec
  Headers = $headers
}
if ($contentType) {
  $params.ContentType = $contentType
}
if ($userAgent) {
  $params.UserAgent = $userAgent
}
$bodyFile = [Environment]::GetEnvironmentVariable('TERRAPEDIA_WIKI_FALLBACK_BODY_FILE')
if ($bodyFile) {
  $params.Body = Get-Content -Raw -LiteralPath $bodyFile
}
$response = Invoke-WebRequest @params
[Console]::WriteLine('STATUS:' + [int]$response.StatusCode)
[Console]::WriteLine('STATUS_TEXT:' + [string]$response.StatusDescription)
[Console]::Write([string]$response.Content)
`;

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

function isCloudflareLikeError(error) {
  const message = compactError(error).toLowerCase();
  return message.includes('cloudflare') || message.includes('403') || message.includes('forbidden');
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

function saveGateState(filePath, state, previousLocalState = null) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return withGateStateLock(filePath, () => {
    const previousState = loadGateState(filePath, state.hostKey ?? 'terraria.wiki.gg');
    const nextState = {
      ...mergeGateState(previousState, state, previousLocalState),
      updatedAt: new Date().toISOString()
    };
    writeGateStateAtomically(filePath, nextState);
    return nextState;
  });
}

function writeGateStateAtomically(filePath, state) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function withGateStateLock(filePath, work) {
  const lockPath = `${filePath}.lock`;
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt > 30_000) {
        throw new Error(`Timed out waiting for wiki request gate state lock: ${lockPath}`);
      }
      sleepSync(10);
    }
  }

  try {
    return work();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

function mergeGateState(previousState, nextState, previousLocalState = null) {
  const localBase = previousLocalState ?? buildInitialState(nextState.hostKey ?? previousState.hostKey);
  return {
    ...previousState,
    ...nextState,
    failureCount: addCounterDelta(previousState, localBase, nextState, 'failureCount'),
    successCount: addCounterDelta(previousState, localBase, nextState, 'successCount'),
    throttleFailureCount: addCounterDelta(previousState, localBase, nextState, 'throttleFailureCount'),
    lastRequestAt: latestTimestamp(previousState.lastRequestAt, nextState.lastRequestAt)
  };
}

function addCounterDelta(previousState, localBase, nextState, fieldName) {
  const persistedValue = Number(previousState[fieldName] ?? 0);
  const localBeforeValue = Number(localBase[fieldName] ?? 0);
  const localAfterValue = Number(nextState[fieldName] ?? 0);
  return persistedValue + Math.max(0, localAfterValue - localBeforeValue);
}

function latestTimestamp(previousValue, nextValue) {
  const previousTime = Date.parse(previousValue ?? 0);
  const nextTime = Date.parse(nextValue ?? 0);
  if (!Number.isFinite(previousTime)) {
    return nextValue ?? null;
  }
  if (!Number.isFinite(nextTime)) {
    return previousValue ?? null;
  }
  return nextTime >= previousTime ? nextValue : previousValue;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
