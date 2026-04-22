#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  buildBackendRefreshScheduleConfig,
  buildBackendRefreshScheduleRun,
  isRefreshLockStale
} from './backend-refresh-schedule-config.mjs';
import {
  buildBackendRefreshSummary,
  buildBackendRefreshSummaryPath
} from './backend-refresh-summary.mjs';
import {
  buildDaemonHeartbeatPayload,
  buildDaemonStatePayload
} from './backend-refresh-daemon-state.mjs';

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
writeDaemonHeartbeat(scheduleConfig, { status: 'booting' });

if (once) {
  const result = await runRefreshCycle(scheduleConfig, 'manual_once');
  process.exit(result.exitCode);
}

console.log(JSON.stringify({
  status: 'started',
  intervalMs: scheduleConfig.intervalMs,
  startupDelayMs: scheduleConfig.startupDelayMs,
  reportDir: scheduleConfig.reportDir,
  lockFile: scheduleConfig.lockFile,
  stateFile: scheduleConfig.stateFile,
  heartbeatFile: scheduleConfig.heartbeatFile
}, null, 2));

await sleepWithHeartbeat(scheduleConfig, scheduleConfig.startupDelayMs, 'startup_wait');

while (true) {
  const cycleStartedAt = Date.now();
  await runRefreshCycle(scheduleConfig, 'scheduled');
  const elapsedMs = Date.now() - cycleStartedAt;
  const waitMs = Math.max(0, scheduleConfig.intervalMs - elapsedMs);
  writeSchedulerState(scheduleConfig.stateFile, {
    status: 'sleeping',
    generatedAt: new Date().toISOString(),
    lastCycleDurationMs: elapsedMs,
    nextPlannedAt: new Date(Date.now() + waitMs).toISOString()
  }, { merge: true });
  await sleepWithHeartbeat(scheduleConfig, waitMs, 'sleeping');
}

async function runRefreshCycle(scheduleConfig, trigger) {
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
    writeDaemonHeartbeat(scheduleConfig, { status: 'skipped_locked' });
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
  writeDaemonHeartbeat(scheduleConfig, {
    status: 'running',
    lastOutputPath: run.outputPath
  });

  try {
    const result = await runRefreshProcess(scheduleConfig, run);
    const completedAt = new Date().toISOString();
    const exitCode = Number(result.status ?? 1);
    const summaryPath = buildBackendRefreshSummaryPath(run.outputPath);
    writeSchedulerState(scheduleConfig.stateFile, {
      status: exitCode === 0 ? 'completed' : 'failed',
      generatedAt: completedAt,
      lastTrigger: trigger,
      lastCompletedAt: completedAt,
      lastExitCode: exitCode,
      lastOutputPath: run.outputPath,
      lastSummaryPath: summaryPath
    }, { merge: true });
    writeSummaryIfExists(run.outputPath, summaryPath);
    writeDaemonHeartbeat(scheduleConfig, {
      status: exitCode === 0 ? 'completed' : 'failed',
      lastOutputPath: run.outputPath
    });
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

function writeDaemonHeartbeat(scheduleConfig, payload = {}) {
  writeJsonFile(scheduleConfig.heartbeatFile, buildDaemonHeartbeatPayload({
    pid: process.pid,
    ...payload
  }));
}

function writeSummaryIfExists(outputPath, summaryPath) {
  const report = readJsonFile(outputPath);
  if (!report || typeof report !== 'object') {
    return;
  }
  writeJsonFile(summaryPath, buildBackendRefreshSummary({ outputPath, report }));
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
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
    stateFile: config.stateFile,
    heartbeatFile: config.heartbeatFile,
    heartbeatMs: config.heartbeatMs
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

function runRefreshProcess(scheduleConfig, run) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, run.args, {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
    const heartbeatTimer = setInterval(() => {
      writeDaemonHeartbeat(scheduleConfig, {
        status: 'running',
        activeChildPid: child.pid,
        lastOutputPath: run.outputPath
      });
    }, scheduleConfig.heartbeatMs);

    child.on('close', (code) => {
      clearInterval(heartbeatTimer);
      resolve({ status: code === 0 ? 0 : 1, pid: child.pid });
    });
    child.on('error', () => {
      clearInterval(heartbeatTimer);
      resolve({ status: 1, pid: child.pid });
    });
  });
}

function sleepWithHeartbeat(scheduleConfig, ms, status) {
  return new Promise((resolve) => {
    const durationMs = Math.max(0, Number(ms) || 0);
    writeDaemonHeartbeat(scheduleConfig, { status });
    if (durationMs === 0) {
      resolve();
      return;
    }
    const heartbeatTimer = setInterval(() => {
      writeDaemonHeartbeat(scheduleConfig, { status });
    }, scheduleConfig.heartbeatMs);
    setTimeout(() => {
      clearInterval(heartbeatTimer);
      resolve();
    }, durationMs);
  });
}
