#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { buildBackendDataRefreshPlan } from './backend-data-refresh-plan.mjs';

const options = parseArgs(process.argv.slice(2));
const mode = String(options.mode ?? 'plan').trim().toLowerCase();
const itemPageLimit = options['item-page-limit'] ?? options.itemPageLimit;
const plan = buildBackendDataRefreshPlan({ itemPageLimit });

if (mode === 'plan') {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (mode !== 'apply') {
  throw new Error(`Unsupported --mode value: ${mode}`);
}

for (const action of plan.actions) {
  const command = action.runner === 'python' ? 'python' : process.execPath;
  const result = spawnSync(command, action.args, {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Backend refresh action failed: ${action.id}`);
  }
}

console.log(JSON.stringify({
  completed: plan.actions.map((action) => action.id),
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
