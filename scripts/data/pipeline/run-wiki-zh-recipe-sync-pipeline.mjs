#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();

const options = parseCliArgs(process.argv.slice(2));
const dryRun = booleanOption(options['dry-run'] ?? options.dryRun, false);
const apply = !dryRun && booleanOption(options.apply, false);
const today = new Date().toISOString().slice(0, 10);
const importReportPath = path.resolve(
  repoRoot,
  options['import-report'] ?? path.join('reports', `wiki-zh-recipe-import-${today}.json`)
);
const consolidationReportPath = path.resolve(
  repoRoot,
  options['consolidation-report'] ?? path.join('reports', `recipe-provider-consolidation-${today}.json`)
);
const pipelineReportPath = path.resolve(
  repoRoot,
  options.output ?? path.join('reports', `wiki-zh-recipe-sync-summary-${today}.json`)
);

const importScriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-wiki-zh-recipes-to-db.mjs');
const backfillScriptPath = path.join(repoRoot, 'scripts', 'data', 'backfill', 'backfill-recipe-zh-display-names.mjs');
const consolidateScriptPath = path.join(repoRoot, 'scripts', 'data', 'sync', 'consolidate-recipe-provider-priority.mjs');

const sharedDbArgs = buildSharedDbArgs(options);
const importArgs = [...sharedDbArgs, `--output=${importReportPath}`];
if (typeof options.input === 'string' && options.input.trim() !== '') {
  importArgs.push(`--input=${path.resolve(repoRoot, options.input.trim())}`);
}
if (apply) {
  importArgs.push('--apply=true');
} else if (dryRun) {
  importArgs.push('--dry-run=true');
}

const backfillArgs = [...sharedDbArgs];
if (apply) {
  backfillArgs.push('--apply=true');
} else if (dryRun) {
  backfillArgs.push('--dry-run=true');
}

const consolidateArgs = [...sharedDbArgs, `--output=${consolidationReportPath}`];
if (apply) {
  consolidateArgs.push('--apply=true');
} else if (dryRun) {
  consolidateArgs.push('--dry-run=true');
}
if (booleanOption(options['allow-non-primary-db'] ?? options.allowNonPrimaryDb, false)) {
  consolidateArgs.push('--allow-non-primary-db=true');
}

const importSummary = runJsonScript(importScriptPath, importArgs, 'wiki zh recipe import');
const zhDisplaySummary = runJsonScript(backfillScriptPath, backfillArgs, 'recipe zh display-name backfill');
const consolidationSummary = runJsonScript(consolidateScriptPath, consolidateArgs, 'recipe provider consolidation');

const pipelineSummary = {
  generatedAt: new Date().toISOString(),
  apply,
  dryRun,
  reportPath: pipelineReportPath,
  reports: {
    import: importReportPath,
    consolidation: consolidationReportPath
  },
  steps: {
    import: importSummary,
    zhDisplayBackfill: zhDisplaySummary,
    providerConsolidation: consolidationSummary
  }
};

fs.mkdirSync(path.dirname(pipelineReportPath), { recursive: true });
fs.writeFileSync(pipelineReportPath, JSON.stringify(pipelineSummary, null, 2), 'utf8');
console.log(JSON.stringify(pipelineSummary, null, 2));

function runJsonScript(scriptPath, args, label) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`Failed during ${label}`);
  }

  const payload = String(result.stdout ?? '').trim();
  try {
    return payload ? JSON.parse(payload) : {};
  } catch (error) {
    throw new Error(`Failed to parse JSON output from ${label}: ${error.message}`);
  }
}

function buildSharedDbArgs(rawOptions) {
  const args = [];
  for (const key of ['host', 'port', 'user', 'password', 'database']) {
    if (typeof rawOptions[key] === 'string' && rawOptions[key].trim() !== '') {
      args.push(`--${key}=${rawOptions[key].trim()}`);
    }
  }
  return args;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}
