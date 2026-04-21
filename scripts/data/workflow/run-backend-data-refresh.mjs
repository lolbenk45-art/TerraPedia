#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildBackendDataRefreshPlan,
  buildBackendDataRefreshReport,
  resolvePendingBackendDataRefreshActions
} from './backend-data-refresh-plan.mjs';

const options = parseArgs(process.argv.slice(2));
const mode = String(options.mode ?? 'plan').trim().toLowerCase();
const itemPageLimit = options['item-page-limit'] ?? options.itemPageLimit;
const steps = options.steps;
const resume = options.resume === 'true';
const plan = buildBackendDataRefreshPlan({ itemPageLimit, steps });
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
  actionResults = upsertActionResult(actionResults, {
    id: action.id,
    status: 'running',
    durationMs: null
  });
  writeReport(outputPath, buildBackendDataRefreshReport(plan, actionResults));
  const result = spawnSync(command, action.args, {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  actionResults = upsertActionResult(actionResults, {
    id: action.id,
    status: result.status === 0 ? 'completed' : 'failed',
    durationMs: Date.now() - startedAt
  });
  if (result.status !== 0) {
    writeReport(outputPath, buildBackendDataRefreshReport(plan, actionResults));
    throw new Error(`Backend refresh action failed: ${action.id}`);
  }
}

const report = buildBackendDataRefreshReport(plan, actionResults);
writeReport(outputPath, report);
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

function loadExistingActionResults(outputPath) {
  if (!fs.existsSync(outputPath)) {
    return [];
  }
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  return Array.isArray(report?.actions)
    ? report.actions.map((action) => ({
      id: action.id,
      status: action.status,
      durationMs: action.durationMs ?? null
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
