#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildBackendRefreshScheduleConfig,
  buildBackendRefreshScheduleRun,
  isRefreshLockStale
} from './backend-refresh-schedule-config.mjs';

const rawOptions = parseArgs(process.argv.slice(2));
const scheduleConfig = buildBackendRefreshScheduleConfig(rawOptions, { repoRoot: process.cwd() });
const once = isTrue(rawOptions.once);

if (!scheduleConfig.enabled && !once) {
  throw new Error('Backend refresh daemon is disabled. Set dataRefresh.enabled=true or pass --once=true for manual execution.');
}

writeSchedulerState(scheduleConfig.stateFile, {
  status: 'booting',
  generatedAt: new Date().toISOString(),
  config: sanitizeConfig(scheduleConfig)
});

if (once) {
  const result = runRefreshCycle(scheduleConfig, 'manual_once');
  process.exit(result.exitCode);
}

console.log(JSON.stringify({
  status: 'started',
  intervalMs: scheduleConfig.intervalMs,
  startupDelayMs: scheduleConfig.startupDelayMs,
  reportDir: scheduleConfig.reportDir,
  lockFile: scheduleConfig.lockFile,
  stateFile: scheduleConfig.stateFile
}, null, 2));

await sleep(scheduleConfig.startupDelayMs);

while (true) {
  const cycleStartedAt = Date.now();
  runRefreshCycle(scheduleConfig, 'scheduled');
  const elapsedMs = Date.now() - cycleStartedAt;
  const waitMs = Math.max(0, scheduleConfig.intervalMs - elapsedMs);
  writeSchedulerState(scheduleConfig.stateFile, {
    status: 'sleeping',
    generatedAt: new Date().toISOString(),
    lastCycleDurationMs: elapsedMs,
    nextPlannedAt: new Date(Date.now() + waitMs).toISOString()
  }, { merge: true });
  await sleep(waitMs);
}

function runRefreshCycle(scheduleConfig, trigger) {
  const now = new Date();
  const lockStatus = acquireLock(scheduleConfig.lockFile, {
    staleLockMs: scheduleConfig.staleLockMs,
    trigger
  });

  if (!lockStatus.acquired) {
    writeSchedulerState(scheduleConfig.stateFile, {
      status: 'skipped_locked',
      generatedAt: now.toISOString(),
      lastTrigger: trigger,
      lockFile: scheduleConfig.lockFile,
      lockPayload: lockStatus.lockPayload ?? null
    }, { merge: true });
    console.warn(`Skipped backend refresh cycle because lock is held: ${scheduleConfig.lockFile}`);
    return { exitCode: 0, skipped: true };
  }

  const run = buildBackendRefreshScheduleRun(scheduleConfig, now);
  writeSchedulerState(scheduleConfig.stateFile, {
    status: 'running',
    generatedAt: now.toISOString(),
    lastTrigger: trigger,
    lastStartedAt: now.toISOString(),
    lastOutputPath: run.outputPath
  }, { merge: true });

  try {
    const result = spawnSync(process.execPath, run.args, {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
    const completedAt = new Date().toISOString();
    const exitCode = Number(result.status ?? 1);
    writeSchedulerState(scheduleConfig.stateFile, {
      status: exitCode === 0 ? 'completed' : 'failed',
      generatedAt: completedAt,
      lastTrigger: trigger,
      lastCompletedAt: completedAt,
      lastExitCode: exitCode,
      lastOutputPath: run.outputPath
    }, { merge: true });
    return { exitCode };
  } finally {
    releaseLock(scheduleConfig.lockFile);
  }
}

function acquireLock(lockFile, options = {}) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const lockPayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    trigger: options.trigger ?? 'scheduled'
  };

  try {
    fs.writeFileSync(lockFile, JSON.stringify(lockPayload, null, 2), { encoding: 'utf8', flag: 'wx' });
    return { acquired: true, lockPayload };
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }

  const existingPayload = readJsonFile(lockFile);
  if (isRefreshLockStale(existingPayload, { staleLockMs: options.staleLockMs })) {
    try {
      fs.rmSync(lockFile, { force: true });
      fs.writeFileSync(lockFile, JSON.stringify(lockPayload, null, 2), { encoding: 'utf8', flag: 'wx' });
      return { acquired: true, lockPayload, recoveredStaleLock: true };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  return { acquired: false, lockPayload: existingPayload };
}

function releaseLock(lockFile) {
  try {
    fs.rmSync(lockFile, { force: true });
  } catch {}
}

function writeSchedulerState(stateFile, payload, options = {}) {
  const nextState = options.merge
    ? {
      ...readJsonFile(stateFile),
      ...payload
    }
    : payload;
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function sanitizeConfig(config) {
  return {
    enabled: config.enabled,
    intervalMs: config.intervalMs,
    startupDelayMs: config.startupDelayMs,
    staleLockMs: config.staleLockMs,
    resume: config.resume,
    mode: config.mode,
    timeoutMs: config.timeoutMs,
    steps: config.steps,
    reportDir: config.reportDir,
    lockFile: config.lockFile,
    stateFile: config.stateFile
  };
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex === -1) {
      result[body] = 'true';
      continue;
    }
    result[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
  }
  return result;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
