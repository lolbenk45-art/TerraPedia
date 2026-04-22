import path from 'node:path';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

export function buildBackendRefreshScheduleConfig(rawOptions = {}, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const config = options.config ?? loadLocalStackConfig(repoRoot);
  const scheduleConfig = readScheduleConfig(config);
  const intervalMinutes = normalizePositiveInteger(
    rawOptions.intervalMinutes ?? rawOptions['interval-minutes'] ?? scheduleConfig.intervalMinutes,
    180
  );
  const startupDelaySeconds = normalizePositiveInteger(
    rawOptions.startupDelaySeconds ?? rawOptions['startup-delay-seconds'] ?? scheduleConfig.startupDelaySeconds,
    30
  );
  const staleLockMinutes = normalizePositiveInteger(
    rawOptions.staleLockMinutes ?? rawOptions['stale-lock-minutes'] ?? scheduleConfig.staleLockMinutes,
    intervalMinutes * 2
  );
  const heartbeatSeconds = normalizePositiveInteger(
    rawOptions.heartbeatSeconds ?? rawOptions['heartbeat-seconds'] ?? scheduleConfig.heartbeatSeconds,
    15
  );

  return {
    enabled: isTrue(rawOptions.enabled ?? scheduleConfig.enabled),
    intervalMs: intervalMinutes * 60 * 1000,
    startupDelayMs: startupDelaySeconds * 1000,
    staleLockMs: staleLockMinutes * 60 * 1000,
    heartbeatMs: heartbeatSeconds * 1000,
    resume: booleanWithFallback(rawOptions.resume, scheduleConfig.resume, true),
    mode: normalizeMode(rawOptions.mode ?? scheduleConfig.mode),
    timeoutMs: normalizeNullablePositiveInteger(rawOptions.timeoutMs ?? rawOptions['timeout-ms'] ?? scheduleConfig.timeoutMs),
    steps: normalizeSteps(rawOptions.steps ?? scheduleConfig.steps),
    reportDir: path.resolve(
      repoRoot,
      String(rawOptions.reportDir ?? scheduleConfig.reportDir ?? path.join('reports', 'backend-refresh', 'history'))
    ),
    lockFile: path.resolve(
      repoRoot,
      String(rawOptions.lockFile ?? scheduleConfig.lockFile ?? path.join('reports', 'backend-refresh', 'backend-refresh.lock.json'))
    ),
    stateFile: path.resolve(
      repoRoot,
      String(rawOptions.stateFile ?? scheduleConfig.stateFile ?? path.join('reports', 'backend-refresh', 'backend-refresh-scheduler.latest.json'))
    ),
    heartbeatFile: path.resolve(
      repoRoot,
      String(rawOptions.heartbeatFile ?? scheduleConfig.heartbeatFile ?? path.join('reports', 'backend-refresh', 'backend-refresh-daemon.heartbeat.json'))
    )
  };
}

export function buildBackendRefreshScheduleRun(scheduleConfig = {}, now = new Date()) {
  const outputPath = path.resolve(
    scheduleConfig.reportDir ?? path.join(process.cwd(), 'reports', 'backend-refresh', 'history'),
    `backend-data-refresh-${formatTimestamp(now)}.json`
  );
  const mode = normalizeMode(scheduleConfig.mode);
  const args = [
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    `--mode=${mode}`
  ];

  if (booleanWithFallback(scheduleConfig.resume, true, true) && mode === 'apply') {
    args.push('--resume=true');
  }
  if (Array.isArray(scheduleConfig.steps) && scheduleConfig.steps.length > 0) {
    args.push(`--steps=${scheduleConfig.steps.join(',')}`);
  }
  if (Number.isFinite(Number(scheduleConfig.timeoutMs)) && Number(scheduleConfig.timeoutMs) > 0) {
    args.push(`--timeout-ms=${Math.trunc(Number(scheduleConfig.timeoutMs))}`);
  }
  args.push(`--output=${outputPath}`);

  return {
    args,
    outputPath,
    scriptPath: 'scripts/data/workflow/run-backend-data-refresh.mjs'
  };
}

export function isRefreshLockStale(lockPayload, options = {}) {
  const startedAt = Date.parse(String(lockPayload?.startedAt ?? ''));
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const staleLockMs = Number.isFinite(Number(options.staleLockMs)) ? Number(options.staleLockMs) : 0;
  if (!Number.isFinite(startedAt) || staleLockMs <= 0) {
    return false;
  }
  return now - startedAt >= staleLockMs;
}

function readScheduleConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }
  return config.dataRefresh && typeof config.dataRefresh === 'object' && !Array.isArray(config.dataRefresh)
    ? config.dataRefresh
    : {};
}

function normalizeMode(value) {
  return String(value ?? 'apply').trim().toLowerCase() === 'plan' ? 'plan' : 'apply';
}

function normalizeSteps(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function normalizeNullablePositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function booleanWithFallback(...values) {
  for (const value of values) {
    if (value === true || value === 'true' || value === '1' || value === 'yes') {
      return true;
    }
    if (value === false || value === 'false' || value === '0' || value === 'no') {
      return false;
    }
  }
  return false;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function formatTimestamp(value) {
  return new Date(value)
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-');
}
