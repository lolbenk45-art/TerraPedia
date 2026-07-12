import fs from 'node:fs';
import path from 'node:path';

export function buildActionRuntimePaths({ outputPath, actionId } = {}) {
  const resolvedOutputPath = path.resolve(String(outputPath ?? 'reports/backend-data-refresh.json'));
  const parsed = path.parse(resolvedOutputPath);
  const runtimeDir = path.join(parsed.dir, `${parsed.name}.runtime`);
  const safeActionId = sanitizeActionId(actionId);

  return {
    runtimeDir,
    snapshotPath: path.join(runtimeDir, `${safeActionId}.snapshot.json`),
    heartbeatPath: path.join(runtimeDir, `${safeActionId}.heartbeat.json`),
    childStatusPath: path.join(runtimeDir, `${safeActionId}.child-status.json`)
  };
}

export function buildActionSnapshotPayload({
  action,
  status,
  startedAt,
  completedAt = null,
  durationMs = null,
  generatedAt = new Date().toISOString(),
  outputPath,
  timedOut = false,
  progress = null
} = {}) {
  return mergeActionProgressFields({
    actionId: String(action?.id ?? ''),
    args: Array.isArray(action?.args) ? action.args : [],
    durationMs: durationMs == null ? null : (Number.isFinite(Number(durationMs)) ? Number(durationMs) : null),
    generatedAt,
    outputPath: outputPath ?? null,
    runner: action?.runner ?? null,
    startedAt: startedAt ?? null,
    status: status ?? 'pending',
    timedOut: Boolean(timedOut),
    timeoutMs: Number.isFinite(Number(action?.timeoutMs)) ? Number(action.timeoutMs) : null,
    ...(completedAt ? { completedAt } : {})
  }, progress);
}

export function buildActionHeartbeatPayload({
  actionId,
  generatedAt = new Date().toISOString(),
  pid = null,
  status = 'running',
  outputPath = null,
  snapshotPath = null,
  progress = null
} = {}) {
  return mergeActionProgressFields({
    actionId: String(actionId ?? ''),
    generatedAt,
    outputPath,
    pid: Number.isFinite(Number(pid)) ? Number(pid) : null,
    snapshotPath,
    status
  }, progress);
}

export function buildActionProgressPayload({
  actionId,
  status = 'running',
  phase = null,
  message = null,
  current = null,
  total = null,
  startedAt = null,
  batchOffset = null,
  batchLimit = null,
  overallCurrent = null,
  overallTotal = null,
  percent = null,
  generatedAt = new Date().toISOString(),
  lastHeartbeatAt = generatedAt,
  childStatusPath = null,
  observedProgressSequence = null
} = {}) {
  const payload = mergeActionProgressFields({
    actionId: String(actionId ?? ''),
    generatedAt,
    status
  }, {
    childStatusPath,
    current,
    batchLimit,
    batchOffset,
    lastHeartbeatAt,
    message,
    overallCurrent,
    overallTotal,
    percent,
    phase,
    startedAt,
    total
  });
  return attachCrawlerAttemptIdentity(payload, { observedProgressSequence });
}

export function crawlerAttemptIdentityFromEnv(env = process.env) {
  const queueId = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_QUEUE_ID);
  const attemptId = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_ATTEMPT_ID);
  const stateStoreEpoch = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH);
  const fenceToken = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_FENCE_TOKEN);
  const stateVersion = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION);
  const progressSequence = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE) ?? 0;
  if (!queueId || !attemptId || !stateStoreEpoch || fenceToken == null || stateVersion == null) {
    return null;
  }
  return { queueId, attemptId, fenceToken, stateStoreEpoch, stateVersion, progressSequence };
}

export function createCrawlerAttemptProgressSequencer(env = process.env) {
  const identity = crawlerAttemptIdentityFromEnv(env);
  let sequence = identity?.progressSequence ?? 0;
  return {
    next(payload, { observedProgressSequence = null } = {}) {
      if (!identity) return payload;
      sequence = Math.max(sequence, finiteNumberOrNull(observedProgressSequence) ?? 0) + 1;
      return {
        ...payload,
        queueId: identity.queueId,
        attemptId: identity.attemptId,
        fenceToken: identity.fenceToken,
        stateStoreEpoch: identity.stateStoreEpoch,
        stateVersion: identity.stateVersion,
        progressSequence: sequence
      };
    }
  };
}

const defaultCrawlerAttemptProgressSequencer = createCrawlerAttemptProgressSequencer();

export function attachCrawlerAttemptIdentity(payload, options = {}) {
  return defaultCrawlerAttemptProgressSequencer.next(payload, options);
}

export function prepareCrawlerChildProgressPath(filePath) {
  if (!filePath) return;
  fs.rmSync(filePath, { force: true });
}

export function readActionProgressFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isCrawlerProgressPayload(payload)) {
      return unreadableActionProgress(filePath, 'progress file is not contract-valid');
    }
    return {
      ...payload,
      childStatusPath: payload.childStatusPath ?? filePath,
      progressReadable: true
    };
  } catch {
    return unreadableActionProgress(filePath, 'progress file is not readable');
  }
}

export function mergeActionProgressFields(payload, progress) {
  const normalized = normalizeProgressFields(progress);
  if (Object.keys(normalized).length === 0) {
    return payload;
  }
  return {
    ...payload,
    ...normalized
  };
}

export function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameFileWithRetry(temporaryPath, filePath);
}

function renameFileWithRetry(sourcePath, destinationPath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.renameSync(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableRenameError(error) || attempt === 5) {
        throw error;
      }
      sleepSync(Math.min(250, 25 * attempt));
    }
  }
  throw lastError;
}

function isRetryableRenameError(error) {
  return ['EACCES', 'EBUSY', 'EPERM'].includes(String(error?.code ?? ''));
}

function sleepSync(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
}

function sanitizeActionId(value) {
  const text = String(value ?? 'action').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return text || 'action';
}

function normalizeIdentityText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCrawlerProgressPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const requiredTextFields = [
    'actionId',
    'status',
    'generatedAt',
    'lastHeartbeatAt',
    'childStatusPath',
    'phase',
    'message'
  ];
  if (requiredTextFields.some((field) => !normalizeIdentityText(payload[field]))) {
    return false;
  }
  if (!['running', 'completed', 'failed', 'queued', 'stalled'].includes(String(payload.status))) {
    return false;
  }
  if (!Number.isFinite(Date.parse(String(payload.generatedAt)))
    || !Number.isFinite(Date.parse(String(payload.lastHeartbeatAt)))) {
    return false;
  }
  return ['current', 'total'].every((field) => Object.hasOwn(payload, field)
    && (payload[field] == null || finiteNumberOrNull(payload[field]) != null));
}

function unreadableActionProgress(filePath, message) {
  return {
    childStatusPath: filePath,
    message,
    phase: 'monitor',
    progressReadable: false
  };
}

function normalizeProgressFields(progress) {
  if (!progress || typeof progress !== 'object') {
    return {};
  }
  const current = normalizeNullableNumber(progress.current);
  const total = normalizeNullableNumber(progress.total);
  const percent = normalizePercent(progress.percent, current, total);
  const batchOffset = normalizeNullableNumber(progress.batchOffset);
  const batchLimit = normalizeNullableNumber(progress.batchLimit);
  const overallCurrent = normalizeNullableNumber(progress.overallCurrent);
  const overallTotal = normalizeNullableNumber(progress.overallTotal);
  const result = {};
  if (batchLimit != null) {
    result.batchLimit = batchLimit;
  }
  if (batchOffset != null) {
    result.batchOffset = batchOffset;
  }
  if (progress.childStatusPath) {
    result.childStatusPath = String(progress.childStatusPath);
  }
  if (current != null) {
    result.current = current;
  }
  if (progress.lastHeartbeatAt || progress.generatedAt) {
    result.lastHeartbeatAt = String(progress.lastHeartbeatAt ?? progress.generatedAt);
  }
  if (progress.message) {
    result.message = String(progress.message);
  }
  if (overallCurrent != null) {
    result.overallCurrent = overallCurrent;
  }
  if (overallTotal != null) {
    result.overallTotal = overallTotal;
  }
  if (percent != null) {
    result.percent = percent;
  }
  if (progress.phase) {
    result.phase = String(progress.phase);
  }
  if (progress.startedAt) {
    result.startedAt = String(progress.startedAt);
  }
  if (total != null) {
    result.total = total;
  }
  return result;
}

function normalizeNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePercent(rawPercent, current, total) {
  const explicit = normalizeNullableNumber(rawPercent);
  if (explicit != null) {
    return clampPercent(explicit);
  }
  if (current != null && total != null && total > 0) {
    return clampPercent((current / total) * 100);
  }
  return null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value)));
}
