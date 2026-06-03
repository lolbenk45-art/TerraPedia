#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync as spawnSyncDefault } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { resolveProjectPath, resolveSharedDataRoot } from '../lib/project-root.mjs';
import { numericOption, parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const repoRootDefault = resolveProjectPath();
const sharedDataRootDefault = resolveSharedDataRoot();
const defaultProgressPath = 'data/generated/wiki-sync-progress.latest.json';
const queueActionId = 'crawler-backfill-queue';

export function resolveItemResumeOffset(progress, fallbackOffset = 0) {
  const fallback = Math.max(0, Math.trunc(Number(fallbackOffset) || 0));
  if (!progress || typeof progress !== 'object') {
    return fallback;
  }
  const batchOffset = numericOption(progress.batchOffset, null);
  if (batchOffset == null) {
    return fallback;
  }
  const batchLimit = Math.max(1, numericOption(progress.batchLimit ?? progress.total, 100));
  const current = numericOption(progress.current, null);
  const total = numericOption(progress.total, null);
  const status = String(progress.status ?? '').toLowerCase();
  const complete = status === 'completed' || (current != null && total != null && total > 0 && current >= total);
  return Math.max(0, Math.trunc(complete ? batchOffset + batchLimit : batchOffset));
}

export function buildDefaultBackfillQueue({
  repoRoot = repoRootDefault,
  sharedDataRoot = sharedDataRootDefault,
  itemStartOffset = 0,
  itemEndOffset = itemStartOffset,
  itemBatchSize = 100,
  progressPath = defaultProgressPath,
  includeArmorSetImages = true,
  includeTownNpcMaintenance = true,
  includeItemPages = true
} = {}) {
  const queue = [];
  const normalizedRepoRoot = path.resolve(repoRoot);
  const normalizedSharedDataRoot = path.resolve(sharedDataRoot);
  const progress = normalizeProgressPath(progressPath, normalizedRepoRoot);

  if (includeArmorSetImages) {
    queue.push({
      id: 'armor-set-images',
      command: process.execPath,
      args: [
        'scripts/data/fetch/fetch-wiki-armor-set-images.mjs',
        `--input=${path.join(normalizedRepoRoot, 'data/standardized/armor_sets.standardized.json')}`,
        `--raw-dir=${path.join(normalizedSharedDataRoot, 'raw/wiki')}`,
        `--report-dir=${path.join(normalizedSharedDataRoot, 'reports/fetch')}`
      ],
      env: {
        TERRAPEDIA_CRAWLER_ACTION_ID: 'armor-set-images',
        TERRAPEDIA_CRAWLER_PROGRESS_PATH: progress
      }
    });
  }

  if (includeTownNpcMaintenance) {
    queue.push({
      id: 'town-npc-maintenance',
      command: 'uv',
      args: [
        'run',
        '--with',
        'beautifulsoup4',
        process.env.PYTHON || 'python3',
        'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py',
        `--source=${path.join(normalizedRepoRoot, 'data/generated/npc-standardized-map.json')}`,
        `--output=${path.join(normalizedRepoRoot, 'data/generated/wiki-town-npc-maintenance.latest.json')}`,
        `--snapshot-output=${path.join(normalizedRepoRoot, 'reports', `wiki-town-npc-maintenance-${timestampForFile(new Date())}.json`)}`,
        `--progress-path=${progress}`,
        '--delay-ms=1600'
      ],
      env: {
        TERRAPEDIA_CRAWLER_ACTION_ID: 'town-npc-maintenance',
        TERRAPEDIA_CRAWLER_PROGRESS_PATH: progress
      }
    });
  }

  if (includeItemPages) {
    const start = Math.max(0, Math.trunc(Number(itemStartOffset) || 0));
    const end = Math.max(start, Math.trunc(Number(itemEndOffset) || start));
    const size = Math.max(1, Math.trunc(Number(itemBatchSize) || 100));
    for (let offset = start; offset < end; offset += size) {
      const nextEnd = Math.min(offset + size, end);
      const suffix = String(offset).padStart(4, '0');
      queue.push({
        id: `item-pages-${suffix}`,
        command: process.execPath,
        args: [
          'scripts/data/fetch/run-item-page-crawl-batches.mjs',
          '--input=data/standardized/items.standardized.json',
          `--raw-dir=${path.join(normalizedSharedDataRoot, 'raw/wiki/item-pages')}`,
          `--report-dir=${path.join(normalizedSharedDataRoot, 'reports/fetch')}`,
          `--batch-size=${size}`,
          '--concurrency=1',
          '--max-attempts=8',
          `--progress-path=${progress}`,
          '--resume-from-progress=false',
          '--only-changed=false',
          '--with-recipes=false',
          `--start-offset=${offset}`,
          `--end-offset=${nextEnd}`
        ],
        env: {
          TERRAPEDIA_CRAWLER_ACTION_ID: `item-pages-batch-${suffix}`,
          TERRAPEDIA_CRAWLER_PROGRESS_PATH: progress
        }
      });
    }
  }

  return queue;
}

export function buildQueueProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  activeTaskId = null,
  nextStep = null,
  progressPath = defaultProgressPath,
  startedAt,
  now = new Date().toISOString()
} = {}) {
  const generatedAt = typeof now === 'string' ? now : now.toISOString();
  const payload = {
    actionId: queueActionId,
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
    phase,
    message,
    current,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0,
    startedAt
  };
  if (activeTaskId) {
    payload.activeTaskId = activeTaskId;
  }
  if (nextStep) {
    payload.nextStep = nextStep;
  }
  return payload;
}

export async function runCrawlerBackfillQueue({
  queue,
  repoRoot = repoRootDefault,
  progressPath = defaultProgressPath,
  now = () => new Date(),
  writeJson = writeJsonFile,
  spawnSync = spawnSyncDefault
} = {}) {
  const startedAt = now().toISOString();
  const progress = normalizeProgressPath(progressPath, repoRoot);
  const total = queue.length;

  writeJson(progress, buildQueueProgressPayload({
    status: 'queued',
    phase: 'queue',
    message: `queued ${total} crawler backfill task(s)`,
    current: 0,
    total,
    nextStep: queue[0]?.id ?? null,
    progressPath: progress,
    startedAt,
    now: now().toISOString()
  }));

  for (let index = 0; index < queue.length; index += 1) {
    const task = queue[index];
    writeJson(progress, buildQueueProgressPayload({
      status: 'running',
      phase: 'queue',
      message: `running ${task.id}`,
      current: index,
      total,
      activeTaskId: task.id,
      nextStep: queue[index + 1]?.id ?? null,
      progressPath: progress,
      startedAt,
      now: now().toISOString()
    }));

    const result = spawnSync(task.command, task.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(task.env ?? {})
      },
      stdio: 'inherit'
    });
    const status = Number.isFinite(Number(result.status)) ? Number(result.status) : 1;
    if (status !== 0) {
      writeJson(progress, buildQueueProgressPayload({
        status: 'failed',
        phase: 'queue',
        message: `failed ${task.id} exit=${status}`,
        current: index,
        total,
        activeTaskId: task.id,
        nextStep: 'inspect failed crawler task and rerun queue',
        progressPath: progress,
        startedAt,
        now: now().toISOString()
      }));
      return { status: 'failed', failedTaskId: task.id, exitCode: status };
    }
  }

  writeJson(progress, buildQueueProgressPayload({
    status: 'completed',
    phase: 'queue',
    message: `completed ${total} crawler backfill task(s)`,
    current: total,
    total,
    progressPath: progress,
    startedAt,
    now: now().toISOString()
  }));
  return { status: 'completed', completedTasks: total };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const repoRoot = path.resolve(String(options['repo-root'] ?? repoRootDefault));
  const sharedDataRoot = path.resolve(String(options['shared-data-root'] ?? sharedDataRootDefault));
  const progressPath = normalizeProgressPath(options['progress-path'] ?? defaultProgressPath, repoRoot);
  const progress = readJsonIfExists(progressPath);
  const fallbackItemStart = Math.max(0, numericOption(options['item-start-offset'] ?? options.offset, 0));
  const itemStartOffset = options['resume-item-pages'] === 'false'
    ? fallbackItemStart
    : resolveItemResumeOffset(progress, fallbackItemStart);
  const itemBatchSize = Math.max(1, numericOption(options['item-batch-size'] ?? options['batch-size'], 100));
  const itemEndOffset = Math.max(itemStartOffset, numericOption(
    options['item-end-offset'] ?? options['end-offset'],
    itemStartOffset
  ));
  const queue = buildDefaultBackfillQueue({
    repoRoot,
    sharedDataRoot,
    itemStartOffset,
    itemEndOffset,
    itemBatchSize,
    progressPath,
    includeArmorSetImages: booleanOption(options['include-armor-set-images'], true),
    includeTownNpcMaintenance: booleanOption(options['include-town-npc-maintenance'], true),
    includeItemPages: booleanOption(options['include-item-pages'], true)
  });

  const result = await runCrawlerBackfillQueue({ queue, repoRoot, progressPath });
  if (result.status !== 'completed') {
    process.exitCode = result.exitCode || 1;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeProgressPath(value, repoRoot) {
  const text = String(value ?? defaultProgressPath).trim() || defaultProgressPath;
  return path.isAbsolute(text) ? path.resolve(text) : path.join(path.resolve(repoRoot), text);
}

function timestampForFile(date) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
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
