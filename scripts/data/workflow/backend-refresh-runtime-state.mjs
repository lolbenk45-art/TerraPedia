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
  childStatusPath = null
} = {}) {
  return mergeActionProgressFields({
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
  fs.renameSync(temporaryPath, filePath);
}

function sanitizeActionId(value) {
  const text = String(value ?? 'action').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return text || 'action';
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
