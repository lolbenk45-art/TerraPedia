#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  numericOption,
  parseCliArgs,
  sharedDataPath
} from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = resolveProjectPath();
const fetchScriptPath = 'scripts/data/fetch/fetch-wiki-item-pages.mjs';
const defaultProgressPath = path.join('data', 'generated', 'wiki-sync-progress.latest.json');

export function buildBatchPlan({ startOffset, endOffset, batchSize }) {
  const start = Math.max(0, Math.trunc(Number(startOffset) || 0));
  const end = Math.max(0, Math.trunc(Number(endOffset) || 0));
  const size = Math.max(1, Math.trunc(Number(batchSize) || 100));
  const offsets = [];
  for (let offset = start; offset < end; offset += size) {
    offsets.push(offset);
  }
  return offsets;
}

export function resolveResumeOffset({ progress, fallbackOffset = 0 }) {
  const fallback = Math.max(0, Math.trunc(Number(fallbackOffset) || 0));
  if (!progress || typeof progress !== 'object') {
    return fallback;
  }
  const batchOffset = numericOption(progress.batchOffset, null);
  if (batchOffset == null) {
    return fallback;
  }
  const batchLimit = Math.max(1, numericOption(progress.batchLimit ?? progress.total, 100));
  const status = String(progress.status ?? '').toLowerCase();
  const current = numericOption(progress.current, null);
  const total = numericOption(progress.total, null);
  const complete = status === 'completed' || (current != null && total != null && total > 0 && current >= total);
  return Math.max(0, Math.trunc(complete ? batchOffset + batchLimit : batchOffset));
}

export function buildFetchArgs({
  offset,
  batchSize,
  concurrency,
  onlyChanged,
  withRecipes,
  delayMs,
  jitterMs,
  maxAttempts,
  progressPath,
  inputPath = null,
  rawDir = null,
  reportDir = null
}) {
  const args = [
    fetchScriptPath,
    `--offset=${Math.max(0, Math.trunc(Number(offset) || 0))}`,
    `--limit=${Math.max(1, Math.trunc(Number(batchSize) || 100))}`,
    `--concurrency=${Math.max(1, Math.trunc(Number(concurrency) || 1))}`,
    `--only-changed=${Boolean(onlyChanged)}`,
    `--with-recipes=${Boolean(withRecipes)}`,
    `--delay-ms=${Math.max(0, Math.trunc(Number(delayMs) || 0))}`,
    `--jitter-ms=${Math.max(0, Math.trunc(Number(jitterMs) || 0))}`,
    `--max-attempts=${Math.max(1, Math.trunc(Number(maxAttempts) || 1))}`,
    `--progress-path=${progressPath || defaultProgressPath}`
  ];
  if (inputPath) {
    args.push(`--input=${inputPath}`);
  }
  if (rawDir) {
    args.push(`--raw-dir=${rawDir}`);
  }
  if (reportDir) {
    args.push(`--report-dir=${reportDir}`);
  }
  return args;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const progressPath = normalizeRepoPath(options['progress-path'] ?? defaultProgressPath);
  const progress = readJsonIfExists(path.resolve(repoRoot, progressPath));
  const inputPath = normalizeNullablePath(options.input ?? sharedDataPath('normalized', 'items.wiki.json'));
  const rawDir = normalizeNullablePath(options['raw-dir']);
  const reportDir = normalizeNullablePath(options['report-dir'] ?? sharedDataPath('reports', 'fetch'));
  const batchSize = Math.max(1, numericOption(options['batch-size'] ?? options.limit, 100));
  const fallbackStartOffset = Math.max(0, numericOption(options['start-offset'] ?? options.offset, 0));
  const resumeFromProgress = booleanOption(options['resume-from-progress'], true);
  const startOffset = resumeFromProgress
    ? resolveResumeOffset({ progress, fallbackOffset: fallbackStartOffset })
    : fallbackStartOffset;
  const endOffset = Math.max(0, numericOption(
    options['end-offset'] ?? options['max-offset'] ?? progress?.overallTotal,
    countInputItems(inputPath)
  ));
  const concurrency = Math.max(1, numericOption(options.concurrency, 1));
  const onlyChanged = booleanOption(options['only-changed'] ?? options.onlyChanged, false);
  const withRecipes = booleanOption(options['with-recipes'] ?? options.withRecipes, true);
  const delayMs = Math.max(0, numericOption(options['delay-ms'] ?? options.delayMs, 5000));
  const jitterMs = Math.max(0, numericOption(options['jitter-ms'] ?? options.jitterMs, 2000));
  const maxAttempts = Math.max(1, numericOption(options['max-attempts'] ?? options.maxAttempts, 8));
  const continueOnError = booleanOption(options['continue-on-error'] ?? options.continueOnError, true);
  const actionPrefix = String(options['action-prefix'] ?? 'item-pages-batch');
  const offsets = buildBatchPlan({ startOffset, endOffset, batchSize });

  console.log(JSON.stringify({
    action: 'run-item-page-crawl-batches',
    batchSize,
    continueOnError,
    endOffset,
    offsetCount: offsets.length,
    progressPath,
    resumeFromProgress,
    startOffset,
    startedAt: new Date().toISOString()
  }, null, 2));

  for (const offset of offsets) {
    const actionId = `${actionPrefix}-${String(offset).padStart(4, '0')}`;
    const args = buildFetchArgs({
      offset,
      batchSize,
      concurrency,
      onlyChanged,
      withRecipes,
      delayMs,
      jitterMs,
      maxAttempts,
      progressPath,
      inputPath,
      rawDir,
      reportDir
    });
    console.log(`starting ${actionId} at ${new Date().toISOString()}`);
    const result = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        TERRAPEDIA_CRAWLER_ACTION_ID: actionId,
        TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath
      },
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      console.error(`failed ${actionId} exit=${result.status}`);
      if (!continueOnError) {
        process.exit(result.status ?? 1);
      }
    }
    console.log(`finished ${actionId} exit=${result.status ?? 0} at ${new Date().toISOString()}`);
  }

  console.log(JSON.stringify({
    action: 'run-item-page-crawl-batches',
    completedOffsets: offsets.length,
    finishedAt: new Date().toISOString()
  }, null, 2));
}

function countInputItems(inputPath) {
  const payload = readJsonIfExists(inputPath);
  return Array.isArray(payload?.items) ? payload.items.length : 0;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeRepoPath(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return defaultProgressPath;
  }
  const resolved = path.isAbsolute(text) ? path.resolve(text) : path.resolve(repoRoot, text);
  const relative = path.relative(repoRoot, resolved);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replaceAll('\\', '/')
    : resolved;
}

function normalizeNullablePath(value) {
  if (value == null || String(value).trim() === '') {
    return null;
  }
  return String(value);
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
