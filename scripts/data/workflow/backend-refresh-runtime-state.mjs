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
    heartbeatPath: path.join(runtimeDir, `${safeActionId}.heartbeat.json`)
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
  timedOut = false
} = {}) {
  return {
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
  };
}

export function buildActionHeartbeatPayload({
  actionId,
  generatedAt = new Date().toISOString(),
  pid = null,
  status = 'running',
  outputPath = null,
  snapshotPath = null
} = {}) {
  return {
    actionId: String(actionId ?? ''),
    generatedAt,
    outputPath,
    pid: Number.isFinite(Number(pid)) ? Number(pid) : null,
    snapshotPath,
    status
  };
}

export function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sanitizeActionId(value) {
  const text = String(value ?? 'action').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return text || 'action';
}
