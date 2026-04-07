import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  expandWikiText,
  fetchWikiPagePayload,
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const options = parseCliArgs(process.argv.slice(2));
const inputPath = path.resolve(process.cwd(), options.input ?? sharedDataPath('normalized', 'items.wiki.json'));
const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki', 'item-pages'));
const reportDir = sharedDataPath('reports', 'fetch');
const limit = numericOption(options.limit, null);
const offset = numericOption(options.offset, 0);
const concurrency = Math.max(1, numericOption(options.concurrency, 2));
const onlyMissing = options['only-missing'] === true || options.onlyMissing === true;
const delayMs = Math.max(0, numericOption(options['delay-ms'] ?? options.delayMs, 200));
const jitterMs = Math.max(0, numericOption(options['jitter-ms'] ?? options.jitterMs, 250));
const maxAttempts = Math.max(1, numericOption(options['max-attempts'] ?? options.maxAttempts, 8));
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

if (requestedItems.size > 0) {
  selectedItems = selectedItems.filter((item) => {
    return requestedItems.has(item.internalName) || requestedItems.has(item.name);
  });
}

selectedItems = selectedItems.slice(offset, Number.isFinite(limit) && limit > 0 ? offset + limit : undefined);

let skippedExisting = 0;
if (onlyMissing) {
  const beforeCount = selectedItems.length;
  selectedItems = selectedItems.filter((item) => {
    const fileBase = sanitizeFileName(item.internalName);
    const latestPath = path.join(rawDir, `${fileBase}.latest.json`);
    return !fs.existsSync(latestPath);
  });
  skippedExisting = beforeCount - selectedItems.length;
}

const timestamp = new Date().toISOString().replaceAll(':', '-');
const errors = [];
const successes = [];

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
}

const reportPath = path.join(reportDir, `fetch-item-pages-${timestamp}.json`);
writeJson(reportPath, {
  inputPath,
  rawDir,
  selectedCount: selectedItems.length,
  skippedExisting,
  successCount: successes.length,
  failureCount: errors.length,
  fetchedAt: new Date().toISOString(),
  items: successes,
  errors
});

console.log(`Input: ${inputPath}`);
console.log(`Selected items: ${selectedItems.length}`);
if (onlyMissing) {
  console.log(`Skipped existing latest pages: ${skippedExisting}`);
}
console.log(`Fetched pages: ${successes.length}`);
console.log(`Failed pages: ${errors.length}`);
console.log(`Report: ${reportPath}`);

async function fetchAndPersistItemPage(item, outputDir) {
  await sleep(computeDelayMs());
  const payload = await withRetry(() => fetchWikiPagePayload({ pageTitle: item.name }), item.name);
  const recipesMarkup = payload.wikitext.includes('{{recipes|result=')
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
  const exponential = Math.min(120000, 1500 * (2 ** (attempt - 1)));
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return exponential + jitter;
}

function computeDelayMs() {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return delayMs + jitter;
}

function compactError(message) {
  return String(message ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
