#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  buildBackendDataRefreshPlan,
  buildBackendDataRefreshReport,
  resolvePendingBackendDataRefreshActions
} from './backend-data-refresh-plan.mjs';
import {
  buildBackendRefreshSummary,
  buildBackendRefreshSummaryPath
} from './backend-refresh-summary.mjs';
import {
  buildActionHeartbeatPayload,
  buildActionProgressPayload,
  buildActionRuntimePaths,
  buildActionSnapshotPayload,
  writeJsonFile
} from './backend-refresh-runtime-state.mjs';
import { writeCrawlerMonitorRedisState } from '../lib/crawler-monitor-redis-state.mjs';

const options = parseArgs(process.argv.slice(2));
const mode = String(options.mode ?? 'plan').trim().toLowerCase();
const itemPageLimit = options['item-page-limit'] ?? options.itemPageLimit;
const steps = options.steps;
const resume = options.resume === 'true';
const timeoutMs = options['timeout-ms'] ?? options.timeoutMs;
const heartbeatMs = normalizePositiveInteger(options['heartbeat-ms'] ?? options.heartbeatMs, 30 * 1000);
const plan = buildBackendDataRefreshPlan({ itemPageLimit, steps, timeoutMs });
const outputPath = path.resolve(
  options.output
  ?? path.join(process.cwd(), 'reports', `backend-data-refresh-${new Date().toISOString().slice(0, 10)}.json`)
);

if (mode === 'plan') {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (mode !== 'apply') {
  throw new Error(`Unsupported --mode value: ${mode}`);
}

let actionResults = loadExistingActionResults(outputPath);
const actionsToRun = resume
  ? resolvePendingBackendDataRefreshActions(plan, buildBackendDataRefreshReport(plan, actionResults))
  : plan.actions;

for (const action of actionsToRun) {
  const command = action.runner === 'python' ? 'python' : process.execPath;
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const runtimePaths = buildActionRuntimePaths({ outputPath, actionId: action.id });
  const initialProgress = buildActionProgressPayload({
    actionId: action.id,
    status: 'running',
    phase: 'action',
    message: `running ${action.id}`,
    current: 0,
    total: 1,
    generatedAt: startedAtIso,
    childStatusPath: runtimePaths.childStatusPath
  });
  actionResults = upsertActionResult(actionResults, {
    id: action.id,
    status: 'running',
    durationMs: null,
    timedOut: false,
    heartbeatPath: runtimePaths.heartbeatPath,
    snapshotPath: runtimePaths.snapshotPath,
    childStatusPath: runtimePaths.childStatusPath,
    updatedAt: startedAtIso,
    ...toActionProgressResult(initialProgress)
  });
  writeJsonFile(runtimePaths.childStatusPath, initialProgress);
  writeActionProgressState(action.id, initialProgress);
  writeJsonFile(runtimePaths.snapshotPath, buildActionSnapshotPayload({
    action,
    status: 'running',
    startedAt: startedAtIso,
    generatedAt: startedAtIso,
    outputPath,
    progress: initialProgress
  }));
  writeReport(outputPath, buildBackendDataRefreshReport(plan, actionResults));
  const result = await runAction(command, action.args, {
    action,
    cwd: process.cwd(),
    heartbeatMs,
    outputPath,
    runtimePaths,
    startedAt,
    startedAtIso,
    timeoutMs: action.timeoutMs
  });
  const completedAtIso = new Date().toISOString();
  const finalStatus = result.status === 0 ? 'completed' : 'failed';
  const childProgress = readActionProgress(runtimePaths.childStatusPath);
  const finalProgress = buildActionProgressPayload({
    ...childProgress,
    actionId: action.id,
    status: finalStatus,
    phase: childProgress?.phase ?? 'action',
    message: childProgress?.message ?? `${finalStatus} ${action.id}`,
    current: childProgress?.current ?? (result.status === 0 ? 1 : null),
    total: childProgress?.total ?? (result.status === 0 ? 1 : null),
    generatedAt: completedAtIso,
    lastHeartbeatAt: completedAtIso,
    childStatusPath: runtimePaths.childStatusPath
  });
  actionResults = upsertActionResult(actionResults, {
    id: action.id,
    status: finalStatus,
    durationMs: Date.now() - startedAt,
    timedOut: result.timedOut,
    heartbeatPath: runtimePaths.heartbeatPath,
    snapshotPath: runtimePaths.snapshotPath,
    childStatusPath: runtimePaths.childStatusPath,
    updatedAt: completedAtIso,
    ...toActionProgressResult(finalProgress)
  });
  writeJsonFile(runtimePaths.childStatusPath, finalProgress);
  writeActionProgressState(action.id, finalProgress);
  writeJsonFile(runtimePaths.snapshotPath, buildActionSnapshotPayload({
    action,
    status: finalStatus,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationMs: Date.now() - startedAt,
    generatedAt: completedAtIso,
    outputPath,
    timedOut: result.timedOut,
    progress: finalProgress
  }));
  writeJsonFile(runtimePaths.heartbeatPath, buildActionHeartbeatPayload({
    actionId: action.id,
    generatedAt: completedAtIso,
    pid: result.pid,
    status: finalStatus,
    outputPath,
    snapshotPath: runtimePaths.snapshotPath,
    progress: finalProgress
  }));
  if (result.status !== 0) {
    writeReport(outputPath, buildBackendDataRefreshReport(plan, actionResults));
    throw new Error(`Backend refresh action failed: ${action.id}`);
  }
}

const report = buildBackendDataRefreshReport(plan, actionResults);
writeReport(outputPath, report);
writeReport(buildBackendRefreshSummaryPath(outputPath), buildBackendRefreshSummary({ outputPath, report }));
console.log(JSON.stringify({
  outputPath,
  completed: report.completedActions,
  totalActions: report.totalActions,
  generatedAt: plan.generatedAt
}, null, 2));

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

function writeReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}

function writeActionProgressState(actionId, payload) {
  writeCrawlerMonitorRedisState({
    stateId: `backend-refresh:action:${actionId}:progress`,
    payload
  }).catch(() => {});
}

function loadExistingActionResults(outputPath) {
  if (!fs.existsSync(outputPath)) {
    return [];
  }
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  return Array.isArray(report?.actions)
    ? report.actions.map((action) => ({
      id: action.id,
      status: action.status,
      durationMs: action.durationMs ?? null,
      timedOut: action.timedOut ?? false,
      heartbeatPath: action.heartbeatPath ?? null,
      snapshotPath: action.snapshotPath ?? null,
      childStatusPath: action.childStatusPath ?? null,
      current: action.current ?? null,
      total: action.total ?? null,
      percent: action.percent ?? null,
      phase: action.phase ?? null,
      message: action.message ?? null,
      lastHeartbeatAt: action.lastHeartbeatAt ?? null,
      updatedAt: action.updatedAt ?? null
    }))
    : [];
}

function upsertActionResult(actionResults, nextResult) {
  const results = Array.isArray(actionResults) ? [...actionResults] : [];
  const index = results.findIndex((entry) => entry.id === nextResult.id);
  if (index === -1) {
    results.push(nextResult);
    return results;
  }
  results[index] = {
    ...results[index],
    ...nextResult
  };
  return results;
}

function runAction(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        TERRAPEDIA_CRAWLER_ACTION_ID: options.action.id,
        TERRAPEDIA_CRAWLER_PROGRESS_PATH: options.runtimePaths.childStatusPath
      },
      stdio: 'inherit'
    });
    let settled = false;
    let timedOut = false;

    writeJsonFile(options.runtimePaths.heartbeatPath, buildActionHeartbeatPayload({
      actionId: options.action.id,
      generatedAt: new Date().toISOString(),
      pid: child.pid,
      status: 'running',
      outputPath: options.outputPath,
      snapshotPath: options.runtimePaths.snapshotPath,
      progress: readActionProgress(options.runtimePaths.childStatusPath)
    }));

    const heartbeatTimer = setInterval(() => {
      writeJsonFile(options.runtimePaths.heartbeatPath, buildActionHeartbeatPayload({
        actionId: options.action.id,
        generatedAt: new Date().toISOString(),
        pid: child.pid,
        status: 'running',
        outputPath: options.outputPath,
        snapshotPath: options.runtimePaths.snapshotPath,
        progress: readActionProgress(options.runtimePaths.childStatusPath)
      }));
    }, options.heartbeatMs);

    const timeoutTimer = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
      ? setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {}
      }, Number(options.timeoutMs))
      : null;

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(heartbeatTimer);
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      resolve({
        pid: child.pid ?? null,
        status: code === 0 ? 0 : 1,
        timedOut
      });
    });

    child.on('error', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(heartbeatTimer);
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      resolve({
        pid: child.pid ?? null,
        status: 1,
        timedOut
      });
    });
  });
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function readActionProgress(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...payload,
      childStatusPath: payload.childStatusPath ?? filePath
    };
  } catch {
    return {
      childStatusPath: filePath,
      message: 'progress file is not readable',
      phase: 'monitor'
    };
  }
}

function toActionProgressResult(progress) {
  return {
    childStatusPath: progress?.childStatusPath ?? null,
    current: progress?.current ?? null,
    total: progress?.total ?? null,
    percent: progress?.percent ?? null,
    phase: progress?.phase ?? null,
    message: progress?.message ?? null,
    lastHeartbeatAt: progress?.lastHeartbeatAt ?? progress?.generatedAt ?? null
  };
}
