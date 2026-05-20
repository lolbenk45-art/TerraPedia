import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  ensureDir,
  expandWikiText,
  fetchWikiPageMetadataBatch,
  fetchWikiPagePayload,
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { reportHeartbeat } from '../lib/crawler-heartbeat.mjs';
import { writeCrawlerMonitorRedisState } from '../lib/crawler-monitor-redis-state.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = resolveProjectPath();
const DEFAULT_WIKI_SYNC_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

let rawDir;
let progressPath;
let progressActionId;
let progressStartedAt;
let maxAttempts;
let withRecipes;
let offset;
let limit;
let overallTotal;
let batchCandidateCount;
let skippedExisting = 0;
let skippedUnchanged = 0;
let timestamp;

async function main() {
const options = parseCliArgs(process.argv.slice(2));
const inputPath = path.resolve(process.cwd(), options.input ?? sharedDataPath('normalized', 'items.wiki.json'));
rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki', 'item-pages'));
const reportDir = path.resolve(process.cwd(), options['report-dir'] ?? sharedDataPath('reports', 'fetch'));
const allowFullCorpus = booleanOption(options['allow-full-corpus'] ?? options.allowFullCorpus, false);
const requestedLimit = numericOption(options.limit, allowFullCorpus ? null : 100);
limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : null;
offset = numericOption(options.offset, 0);
const concurrency = Math.max(1, numericOption(options.concurrency, 1));
const onlyMissing = booleanOption(options['only-missing'] ?? options.onlyMissing, false);
const onlyChanged = booleanOption(options['only-changed'] ?? options.onlyChanged, true);
const probeOnly = booleanOption(options['probe-only'] ?? options.probeOnly, false);
withRecipes = booleanOption(options['with-recipes'] ?? options.withRecipes, false);
maxAttempts = Math.max(1, numericOption(options['max-attempts'] ?? options.maxAttempts, 8));
progressPath = options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_WIKI_SYNC_PROGRESS_PATH;
progressActionId = process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? 'fetch-item-pages';
progressStartedAt = new Date().toISOString();
const requestedItems = new Set(
  String(options.items ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

ensureDir(rawDir);
ensureDir(reportDir);

const sourcePayload = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
const rawItems = Array.isArray(sourcePayload?.items) ? sourcePayload.items : [];
let selectedItems = rawItems.filter((item) => item?.internalName && item?.name);

if (!allowFullCorpus && requestedItems.size === 0 && (limit == null || limit > 100)) {
  throw new Error('Full-corpus item page refresh is disabled by default. Pass --limit=100 or lower, provide --items=..., or set --allow-full-corpus=true.');
}

if (requestedItems.size > 0) {
  selectedItems = selectedItems.filter((item) => {
    return requestedItems.has(item.internalName) || requestedItems.has(item.name);
  });
}

overallTotal = selectedItems.length;
selectedItems = selectedItems.slice(offset, Number.isFinite(limit) && limit > 0 ? offset + limit : undefined);
batchCandidateCount = selectedItems.length;

skippedExisting = 0;
skippedUnchanged = 0;
let revisionMap = new Map();
if (onlyMissing) {
  const beforeCount = selectedItems.length;
  selectedItems = selectedItems.filter((item) => {
    const fileBase = sanitizeFileName(item.internalName);
    const latestPath = path.join(rawDir, `${fileBase}.latest.json`);
    return !fs.existsSync(latestPath);
  });
  skippedExisting = beforeCount - selectedItems.length;
}

if ((onlyChanged || probeOnly) && selectedItems.length > 0) {
  revisionMap = await loadRemoteRevisionMap(selectedItems);
}

if (onlyChanged && selectedItems.length > 0) {
  const beforeCount = selectedItems.length;
  selectedItems = selectedItems.filter((item) => {
    const existingRevision = readExistingLatestRevision(item.internalName);
    const remoteRevision = revisionMap.get(normalizeKey(item.name));
    if (!remoteRevision) {
      return true;
    }
    return existingRevision == null || existingRevision !== remoteRevision;
  });
  skippedUnchanged = beforeCount - selectedItems.length;
}

timestamp = new Date().toISOString().replaceAll(':', '-');
const errors = [];
const successes = [];

await emitHeartbeat('running', { phase: probeOnly ? 'probe' : 'select' });

if (probeOnly) {
  const probeItems = selectedItems.map((item) => {
    const existingRevision = readExistingLatestRevision(item.internalName);
    const remoteRevision = revisionMap.get(normalizeKey(item.name)) ?? null;
    return {
      name: item.name,
      internalName: item.internalName,
      existingRevision,
      remoteRevision,
      changed: remoteRevision == null || existingRevision !== remoteRevision,
      reason: remoteRevision == null ? 'missing_remote_revision' : existingRevision === remoteRevision ? 'unchanged' : 'source_changed'
    };
  });
  const reportPath = path.join(reportDir, `fetch-item-pages-probe-${timestamp}.json`);
  writeJson(reportPath, {
    inputPath,
    rawDir,
    probeOnly: true,
    selectedCount: selectedItems.length,
    changedCount: probeItems.filter((item) => item.changed).length,
    skippedExisting,
    skippedUnchanged,
    checkedAt: new Date().toISOString(),
    onlyChanged,
    items: probeItems
  });
  writeFetchProgress({
    status: 'completed',
    phase: 'probe',
    message: `finished item page probe; changed=${probeItems.filter((item) => item.changed).length}; skipped unchanged=${skippedUnchanged}`,
    current: selectedItems.length,
    total: selectedItems.length
  });
  await emitHeartbeat('completed', { phase: 'probe', changedCount: probeItems.filter((item) => item.changed).length });
  console.log(`Input: ${inputPath}`);
  console.log('Probe only: true');
  console.log(`Selected items: ${selectedItems.length}`);
  console.log(`Changed pages: ${probeItems.filter((item) => item.changed).length}`);
  console.log(`Report: ${reportPath}`);
  process.exit(0);
}

writeFetchProgress({
  status: 'running',
  phase: 'select',
  message: `selected ${selectedItems.length} item page(s); skipped unchanged ${skippedUnchanged}`,
  current: 0,
  total: selectedItems.length
});

for (let index = 0; index < selectedItems.length; index += concurrency) {
  const batch = selectedItems.slice(index, index + concurrency);
  const results = await Promise.allSettled(batch.map((item) => fetchAndPersistItemPage(item, rawDir)));

  results.forEach((result, batchIndex) => {
    const item = batch[batchIndex];
    if (result.status === 'fulfilled') {
      successes.push(result.value);
      return;
    }

    errors.push({
      itemName: item.name,
      internalName: item.internalName,
      message: result.reason?.message ?? String(result.reason)
    });
  });

  const finished = Math.min(index + batch.length, selectedItems.length);
  if (finished % Math.max(concurrency * 10, 50) === 0 || finished === selectedItems.length) {
    console.log(`Progress: ${finished}/${selectedItems.length} (ok=${successes.length}, failed=${errors.length})`);
  }
  writeFetchProgress({
    status: 'running',
    phase: 'fetch',
    message: `fetched ${finished}/${selectedItems.length} item page(s); ok=${successes.length}; failed=${errors.length}`,
    current: finished,
    total: selectedItems.length
  });
}

const reportPath = path.join(reportDir, `fetch-item-pages-${timestamp}.json`);
writeJson(reportPath, {
  inputPath,
  rawDir,
  selectedCount: selectedItems.length,
  probeOnly: false,
  allowFullCorpus,
  skippedExisting,
  skippedUnchanged,
  successCount: successes.length,
  failureCount: errors.length,
  fetchedAt: new Date().toISOString(),
  onlyChanged,
  withRecipes,
  items: successes,
  errors
});

console.log(`Input: ${inputPath}`);
console.log(`Selected items: ${selectedItems.length}`);
if (onlyMissing) {
  console.log(`Skipped existing latest pages: ${skippedExisting}`);
}
if (onlyChanged) {
  console.log(`Skipped unchanged pages: ${skippedUnchanged}`);
}
console.log(`Fetched pages: ${successes.length}`);
console.log(`Failed pages: ${errors.length}`);
console.log(`Report: ${reportPath}`);

writeFetchProgress({
  status: errors.length > 0 ? 'failed' : 'completed',
  phase: 'fetch',
  message: `finished item page fetch; ok=${successes.length}; failed=${errors.length}; skipped unchanged=${skippedUnchanged}`,
  current: selectedItems.length,
  total: selectedItems.length
});
await emitHeartbeat(errors.length > 0 ? 'failed' : 'completed', {
  phase: 'fetch',
  successCount: successes.length,
  failureCount: errors.length
});
}

if (process.argv[1] === __filename) {
  main().catch(async (error) => {
    console.error(error);
    await emitHeartbeat('failed', { phase: 'error', error: error?.message ?? String(error) });
    process.exitCode = 1;
  });
}

async function fetchAndPersistItemPage(item, outputDir) {
  const payload = await withRetry(() => fetchWikiPagePayload({ pageTitle: item.name }), item.name);
  const recipesMarkup = withRecipes && payload.wikitext.includes('{{recipes|result=')
    ? await withRetry(() => expandWikiText({ text: `{{recipes|result=${payload.pageTitle}}}` }), `${item.name} recipes`)
    : '';
  const fileBase = sanitizeFileName(item.internalName);
  const latestPath = path.join(outputDir, `${fileBase}.latest.json`);
  const snapshotPath = path.join(outputDir, `${fileBase}.${timestamp}.json`);
  const storedPayload = {
    ...payload,
    recipesMarkup,
    entityType: 'item',
    itemName: item.name,
    itemInternalName: item.internalName
  };

  writeJson(latestPath, storedPayload);
  writeJson(snapshotPath, storedPayload);

  return {
    itemName: item.name,
    itemInternalName: item.internalName,
    pageTitle: payload.pageTitle,
    pageId: payload.pageId,
    revisionTimestamp: payload.revisionTimestamp,
    latestPath,
    snapshotPath
  };
}

async function loadRemoteRevisionMap(items) {
  const byTitle = new Map();
  const titles = items.map((item) => item.name).filter(Boolean);
  for (const batch of chunkArray(titles, 50)) {
    const pages = await fetchWikiPageMetadataBatch({
      titles: batch
    });
    pages.forEach((page) => {
      if (!page?.pageTitle) {
        return;
      }
      byTitle.set(normalizeKey(page.pageTitle), page.revisionTimestamp ?? null);
    });
  }
  return byTitle;
}

function readExistingLatestRevision(internalName) {
  const fileBase = sanitizeFileName(internalName);
  const latestPath = path.join(rawDir, `${fileBase}.latest.json`);
  if (!fs.existsSync(latestPath)) {
    return null;
  }
  try {
    const payload = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    return typeof payload?.revisionTimestamp === 'string' ? payload.revisionTimestamp : null;
  } catch {
    return null;
  }
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function chunkArray(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
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

function writeFetchProgress(progress) {
  if (!progressPath) {
    return;
  }
  const generatedAt = new Date().toISOString();
  const payload = buildActionProgressPayload({
    ...progress,
    actionId: progressActionId,
    ...buildProgressQueueFields(progress.current),
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  writeJsonFile(progressPath, payload);
  writeCrawlerMonitorRedisState({
    stateId: 'item-pages-refresh:progress',
    payload
  }).catch(() => {});
  if (path.resolve(process.cwd(), progressPath) !== DEFAULT_WIKI_SYNC_PROGRESS_PATH) {
    writeJsonFile(DEFAULT_WIKI_SYNC_PROGRESS_PATH, {
      ...payload,
      childStatusPath: DEFAULT_WIKI_SYNC_PROGRESS_PATH
    });
  }
}

function buildProgressQueueFields(current) {
  const normalizedCurrent = Number.isFinite(Number(current)) ? Math.max(0, Number(current)) : 0;
  const processedInBatch = Math.min(
    batchCandidateCount,
    skippedExisting + skippedUnchanged + normalizedCurrent
  );
  const overallCurrent = Math.min(overallTotal, Math.max(0, offset + processedInBatch));
  const batchLimit = Number.isFinite(limit) && limit > 0 ? limit : batchCandidateCount;
  return {
    batchLimit,
    batchOffset: offset,
    overallCurrent,
    overallTotal,
    startedAt: progressStartedAt
  };
}

function sanitizeFileName(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

async function withRetry(task, label) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await task();
    } catch (error) {
      const message = error?.message ?? String(error);
      const retryable = isRetryableError(message);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      const backoff = computeBackoffMs(attempt);
      console.warn(`Retrying [${label}] attempt=${attempt}/${maxAttempts} wait=${backoff}ms reason=${compactError(message)}`);
      await sleep(backoff);
    }
  }
  throw new Error(`Retry exhausted: ${label}`);
}

function isRetryableError(message) {
  const lower = String(message ?? '').toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('500') ||
    lower.includes('ratelimited')
  );
}

function computeBackoffMs(attempt) {
  return Math.min(120000, 1500 * (2 ** (attempt - 1)));
}

function compactError(message) {
  return String(message ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function emitHeartbeat(status, detail = {}) {
  const result = await reportHeartbeat('items', status, { detail });
  if (!result.ok) {
    console.warn(`Crawler heartbeat skipped: ${result.error}`);
  }
  return result;
}
