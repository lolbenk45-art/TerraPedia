#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { buildShimmerImportArgs } from './shimmer-sync-args.mjs';

if (isDirectExecution()) {
  main();
}

export function buildShimmerSyncPreviewPlan(options = {}) {
  assertPreviewOnlyOptions(options);
  return Object.freeze({
    extract: {
      scriptPath: 'scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
      args: []
    },
    preview: {
      scriptPath: 'scripts/data/import/import-wiki-shimmer-to-db.mjs',
      args: buildShimmerImportArgs(options)
    }
  });
}

function assertPreviewOnlyOptions(options) {
  for (const key of ['apply', 'input', 'raw']) {
    const value = String(options?.[key] ?? '').trim();
    if (value && (key !== 'apply' || value !== 'false')) {
      throw new Error(`shimmer sync pipeline does not accept ${key}; preview inputs derive from the verified bundle manifest`);
    }
  }
}

function main() {
  const repoRoot = getProjectRoot();
  const options = parseCliArgs(process.argv.slice(2));
  const plan = buildShimmerSyncPreviewPlan(options);
  runScript(repoRoot, plan.extract.scriptPath, plan.extract.args, 'shimmer extract');
  runScript(repoRoot, plan.preview.scriptPath, plan.preview.args, 'shimmer import preview');
  console.log('Shimmer sync extraction and preview finished successfully');
}

function runScript(repoRoot, scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
