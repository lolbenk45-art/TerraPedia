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
  buildActionResultSummary,
  buildActionRuntimePaths,
  buildActionSnapshotPayload,
  buildBackendWrapperHeartbeatProgress,
  crawlerAttemptIdentityFromEnv,
  prepareCrawlerChildProgressPath,
  readActionProgressFile,
  writeJsonFile
} from './backend-refresh-runtime-state.mjs';
import { writeCrawlerMonitorRedisState } from '../lib/crawler-monitor-redis-state.mjs';
import { finalizeBackendRefreshActionIngestionManifest } from './backend-refresh-manifest-finalize.mjs';

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

const crawlerAttemptIdentity = crawlerAttemptIdentityFromEnv(process.env);
if (crawlerAttemptIdentity && !String(process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? '').trim()) {
  throw new Error('TERRAPEDIA_CRAWLER_PROGRESS_PATH is required for a V2 crawler attempt');
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
  const canonicalProgressPath = crawlerAttemptIdentity
    ? path.resolve(String(process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH))
    : runtimePaths.childStatusPath;
  const childProgressPath = crawlerAttemptIdentity
    ? path.join(path.dirname(canonicalProgressPath), 'child-progress.json')
    : runtimePaths.childStatusPath;
  if (crawlerAttemptIdentity) {
    prepareCrawlerChildProgressPath(childProgressPath);
  }
  const initialProgress = buildActionProgressPayload({
    actionId: action.id,
    status: 'running',
    phase: 'action',
    message: `running ${action.id}`,
    current: 0,
    total: 1,
    generatedAt: startedAtIso,
    childStatusPath: childProgressPath,
    ...buildActionResultSummary({
      actionId: action.id,
      status: 'running',
      current: 0,
      total: 1
    })
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
  writeJsonFile(canonicalProgressPath, initialProgress);
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
    canonicalProgressPath,
    childProgressPath,
    initialProgress,
    initialProgressSequence: initialProgress.progressSequence ?? null,
    isV2Attempt: Boolean(crawlerAttemptIdentity),
    outputPath,
    runtimePaths,
    startedAt,
    startedAtIso,
    timeoutMs: action.timeoutMs
  });
  const completedAtIso = new Date().toISOString();
  const finalStatus = result.status === 0 ? 'completed' : 'failed';
  const childProgress = readActionProgressFile(childProgressPath);
  const finalCurrent = childProgress?.current ?? (result.status === 0 ? 1 : 0);
  const finalTotal = childProgress?.total ?? 1;
  const finalProgress = buildActionProgressPayload({
    ...childProgress,
    actionId: action.id,
    status: finalStatus,
    phase: childProgress?.phase ?? 'action',
    message: childProgress?.message ?? `${finalStatus} ${action.id}`,
    current: finalCurrent,
    total: finalTotal,
    generatedAt: completedAtIso,
    lastHeartbeatAt: completedAtIso,
    childStatusPath: childProgress?.childStatusPath ?? childProgressPath,
    observedProgressSequence: childProgress?.progressSequence,
    ...buildActionResultSummary({
      actionId: action.id,
      status: finalStatus,
      current: finalCurrent,
      total: finalTotal,
      progress: childProgress
    })
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
  writeJsonFile(canonicalProgressPath, finalProgress);
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
  finalizeBackendRefreshActionIngestionManifest({ actionId: action.id });
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
      updatedAt: action.updatedAt ?? null,
      plannedCount: action.plannedCount ?? null,
      actualCount: action.actualCount ?? null,
      skippedCount: action.skippedCount ?? null,
      failedCount: action.failedCount ?? null,
      estimatedRequests: action.estimatedRequests ?? null,
      estimatedRecords: action.estimatedRecords ?? null,
      resultKind: action.resultKind ?? null,
      resumeOutcome: action.resumeOutcome ?? null
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
    const actionArgs = Array.isArray(args)
      ? args.map((arg) => typeof arg === 'string' ? arg.replaceAll('<outputPath>', options.outputPath) : arg)
      : [];
    const childEnv = {
      ...process.env,
      TERRAPEDIA_CRAWLER_ACTION_ID: options.action.id,
      TERRAPEDIA_CRAWLER_PROGRESS_PATH: options.childProgressPath
    };
    if (options.initialProgressSequence != null) {
      childEnv.TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE = String(options.initialProgressSequence);
    }
    const child = spawn(command, actionArgs, {
      cwd: options.cwd,
      env: childEnv,
      stdio: 'inherit'
    });
    let settled = false;
    let timedOut = false;

    writeActionHeartbeat(options, child.pid);

    const heartbeatTimer = setInterval(() => {
      writeActionHeartbeat(options, child.pid);
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

function writeActionHeartbeat(options, pid) {
  const childProgress = readActionProgressFile(options.childProgressPath);
  const canonicalProgress = options.isV2Attempt
    ? readActionProgressFile(options.canonicalProgressPath)
    : null;
  const progress = options.isV2Attempt
    ? writeCanonicalActionProgress(options, childProgress, canonicalProgress)
    : childProgress;
  writeJsonFile(options.runtimePaths.heartbeatPath, buildActionHeartbeatPayload({
    actionId: options.action.id,
    generatedAt: new Date().toISOString(),
    pid,
    status: 'running',
    outputPath: options.outputPath,
    snapshotPath: options.runtimePaths.snapshotPath,
    progress
  }));
}

function writeCanonicalActionProgress(options, childProgress, canonicalProgress) {
  const generatedAt = new Date().toISOString();
  const nextProgress = buildBackendWrapperHeartbeatProgress({
    actionId: options.action.id,
    childProgress,
    canonicalProgress,
    initialProgress: options.initialProgress,
    generatedAt,
    childStatusPath: options.childProgressPath
  });
  writeJsonFile(options.canonicalProgressPath, nextProgress);
  writeActionProgressState(options.action.id, nextProgress);
  return nextProgress;
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function toActionProgressResult(progress) {
  return {
    childStatusPath: progress?.childStatusPath ?? null,
    current: progress?.current ?? null,
    total: progress?.total ?? null,
    percent: progress?.percent ?? null,
    phase: progress?.phase ?? null,
    message: progress?.message ?? null,
    lastHeartbeatAt: progress?.lastHeartbeatAt ?? progress?.generatedAt ?? null,
    plannedCount: progress?.plannedCount ?? null,
    actualCount: progress?.actualCount ?? null,
    skippedCount: progress?.skippedCount ?? null,
    failedCount: progress?.failedCount ?? null,
    estimatedRequests: progress?.estimatedRequests ?? null,
    estimatedRecords: progress?.estimatedRecords ?? null,
    resultKind: progress?.resultKind ?? null,
    resumeOutcome: progress?.resumeOutcome ?? null
  };
}
