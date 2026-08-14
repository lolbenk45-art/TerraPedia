import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ensureDir, sharedDataPath } from './wiki-item-utils.mjs';

export const DEFAULT_WIKI_SOURCE_MANIFEST_PATH = sharedDataPath('generated', 'wiki-source-manifest.latest.json');
export const DEFAULT_WIKI_MONITOR_STATE_PATH = sharedDataPath('generated', 'wiki-monitor-state.latest.json');
export const DEFAULT_WIKI_SYNC_PLAN_PATH = sharedDataPath('generated', 'wiki-sync-plan.latest.json');

export function loadWikiSourceManifest(filePath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH) {
  return normalizeManifest(loadJsonIfExists(filePath), filePath);
}

export function saveWikiSourceManifest(filePath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH, manifest) {
  writeJson(filePath, normalizeManifest(manifest, filePath));
}

export function loadWikiMonitorState(filePath = DEFAULT_WIKI_MONITOR_STATE_PATH) {
  return normalizeMonitorState(loadJsonIfExists(filePath), filePath);
}

export function saveWikiMonitorState(filePath = DEFAULT_WIKI_MONITOR_STATE_PATH, state) {
  writeJson(filePath, normalizeMonitorState(state, filePath));
}

export function loadWikiSyncPlan(filePath = DEFAULT_WIKI_SYNC_PLAN_PATH) {
  return normalizeSyncPlan(loadJsonIfExists(filePath), filePath);
}

export function saveWikiSyncPlan(filePath = DEFAULT_WIKI_SYNC_PLAN_PATH, plan) {
  writeJson(filePath, normalizeSyncPlan(plan, filePath));
}

export function buildManifestRecordKey(record) {
  const sourceKey = nullableString(record?.sourceKey) ?? 'unknown';
  const entityFamily = nullableString(record?.entityFamily) ?? 'unknown';
  const sourceKind = nullableString(record?.sourceKind) ?? 'unknown';
  const lang = nullableString(record?.lang) ?? 'en';
  const pageTitle = nullableString(record?.pageTitle) ?? nullableString(record?.requestedPageTitle) ?? 'unknown';
  return [entityFamily, sourceKind, sourceKey, lang, pageTitle].join('|');
}

export function upsertManifestRecord(manifest, record) {
  const normalizedManifest = normalizeManifest(manifest);
  const nextRecord = deepSortObject({
    key: buildManifestRecordKey(record),
    status: 'ok',
    ...record
  });
  const recordKey = nextRecord.key;
  const retained = normalizedManifest.records.filter((entry) => entry.key !== recordKey);
  retained.push(nextRecord);
  retained.sort((left, right) => left.key.localeCompare(right.key));
  return {
    ...normalizedManifest,
    generatedAt: new Date().toISOString(),
    records: retained
  };
}

export function buildManifestRecordMap(manifest) {
  const map = new Map();
  for (const record of normalizeManifest(manifest).records) {
    map.set(record.key, record);
  }
  return map;
}

export function buildManifestRecordsBySourceKey(manifest) {
  const map = new Map();
  for (const record of normalizeManifest(manifest).records) {
    const sourceKey = nullableString(record.sourceKey);
    if (!sourceKey) {
      continue;
    }
    const records = map.get(sourceKey) ?? [];
    records.push(record);
    map.set(sourceKey, records);
  }
  return map;
}

export function latestManifestRecordForSourceKey(manifest, sourceKey) {
  return pickNewestManifestRecord(buildManifestRecordsBySourceKey(manifest).get(sourceKey) ?? []);
}

export function resolveIngestedRecord(manifest, { sourceKey, locator } = {}) {
  const sourceRecords = buildManifestRecordsBySourceKey(manifest).get(sourceKey) ?? [];
  if (sourceRecords.length === 0) {
    return null;
  }
  const locatorText = nullableString(locator);
  if (locatorText) {
    const identityMatches = sourceRecords.filter((record) => {
      return record.pageTitle === locatorText || record.requestedPageTitle === locatorText;
    });
    if (identityMatches.length > 0) {
      return pickNewestManifestRecord(identityMatches);
    }
  }
  return pickNewestManifestRecord(sourceRecords);
}

export function createContentHash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function advanceWikiIngestionManifestForSource({
  sourceKey,
  locator,
  entityFamily,
  sourceKind,
  outputPath,
  record,
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH
} = {}) {
  if (!sourceKey) {
    throw new Error('advanceWikiIngestionManifestForSource requires sourceKey');
  }
  if (!entityFamily) {
    throw new Error('advanceWikiIngestionManifestForSource requires entityFamily');
  }
  if (!sourceKind) {
    throw new Error('advanceWikiIngestionManifestForSource requires sourceKind');
  }
  if (!outputPath) {
    throw new Error('advanceWikiIngestionManifestForSource requires outputPath');
  }
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const manifest = loadWikiSourceManifest(manifestPath);
  const sourceRecord = isObject(record) ? record : null;
  const fetchedAt = sourceRecord?.fetchedAt ?? payload.fetchedAt ?? payload.generatedAt ?? new Date().toISOString();
  const pageTitle = sourceRecord?.pageTitle ?? payload.pageTitle ?? payload.moduleTitle ?? payload.requestedPageTitle ?? locator ?? null;
  const requestedPageTitle = sourceRecord?.requestedPageTitle ?? payload.requestedPageTitle ?? payload.moduleTitle ?? locator ?? pageTitle;
  const contentHash = sourceRecord?.contentHash === null
    ? null
    : createContentHash(sourceRecord?.moduleContent ?? payload.moduleContent ?? JSON.stringify(payload));
  const nextManifest = upsertManifestRecord(manifest, {
    contentHash,
    entityFamily,
    lang: 'en',
    lastFetchedAt: fetchedAt,
    lastParsedAt: fetchedAt,
    localPath: normalizePathForOutput(outputPath),
    pageId: sourceRecord?.pageId ?? payload.pageId ?? null,
    pageTitle,
    requestedPageTitle,
    revisionId: sourceRecord?.revisionId ?? payload.revisionId ?? null,
    revisionTimestamp: sourceRecord?.revisionTimestamp ?? payload.revisionTimestamp ?? null,
    sourceKey,
    sourceKind,
    status: 'ok'
  });
  saveWikiSourceManifest(manifestPath, nextManifest);
  return nextManifest;
}

export function acknowledgeWikiProbeSnapshot({
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  snapshot,
  outputPath
} = {}) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('probe acknowledgement requires a readable terminal output');
  }
  if (!isObject(snapshot) || !nullableString(snapshot.contentHash)) {
    throw new Error('probe acknowledgement requires a source snapshot contentHash');
  }
  const checkedAt = nullableString(snapshot.checkedAt) ?? new Date().toISOString();
  const manifest = loadWikiSourceManifest(manifestPath);
  const nextManifest = upsertManifestRecord(manifest, {
    contentHash: snapshot.contentHash,
    entityFamily: snapshot.entityFamily,
    lang: 'en',
    lastFetchedAt: checkedAt,
    lastParsedAt: checkedAt,
    localPath: normalizePathForOutput(outputPath),
    pageTitle: snapshot.locator,
    requestedPageTitle: snapshot.locator,
    sourceKey: snapshot.sourceKey,
    sourceKind: snapshot.sourceKind,
    status: 'ok'
  });
  saveWikiSourceManifest(manifestPath, nextManifest);
  return loadWikiSourceManifest(manifestPath);
}

export function normalizePathForOutput(filePath) {
  return path.resolve(filePath).replaceAll('\\', '/');
}

export function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(deepSortObject(payload), null, 2)}\n`);
}

function normalizeManifest(manifest, filePath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH) {
  const records = Array.isArray(manifest?.records) ? manifest.records : [];
  return deepSortObject({
    generatedAt: manifest?.generatedAt ?? null,
    path: normalizePathForOutput(filePath),
    records: records
      .filter((record) => record && typeof record === 'object')
      .map((record) => ({
        key: buildManifestRecordKey(record),
        status: 'ok',
        ...record
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    schemaVersion: '1.0.0'
  });
}

function normalizeMonitorState(state, filePath = DEFAULT_WIKI_MONITOR_STATE_PATH) {
  const sources = Array.isArray(state?.sources) ? state.sources : [];
  return deepSortObject({
    checkedAt: state?.checkedAt ?? null,
    path: normalizePathForOutput(filePath),
    requestedEntities: Array.isArray(state?.requestedEntities) ? state.requestedEntities : [],
    schemaVersion: '1.0.0',
    sources
  });
}

function normalizeSyncPlan(plan, filePath = DEFAULT_WIKI_SYNC_PLAN_PATH) {
  return deepSortObject({
    actions: Array.isArray(plan?.actions) ? plan.actions : [],
    estimatedRequests: Number.isFinite(Number(plan?.estimatedRequests)) ? Number(plan.estimatedRequests) : 0,
    generatedAt: plan?.generatedAt ?? null,
    path: normalizePathForOutput(filePath),
    requestedEntities: Array.isArray(plan?.requestedEntities) ? plan.requestedEntities : [],
    resumeToken: nullableString(plan?.resumeToken),
    runMode: nullableString(plan?.runMode) ?? 'plan',
    schemaVersion: '1.0.0',
    shards: Array.isArray(plan?.shards) ? plan.shards : []
  });
}

function nullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickNewestManifestRecord(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftTime = newestManifestTimestamp(left.record);
      const rightTime = newestManifestTimestamp(right.record);
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return left.index - right.index;
    })[0].record;
}

function newestManifestTimestamp(record) {
  for (const field of ['lastParsedAt', 'lastFetchedAt', 'revisionTimestamp']) {
    const value = Date.parse(record?.[field] ?? '');
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function deepSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortObject(entry));
  }
  if (!isObject(value)) {
    return value;
  }
  const sorted = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    sorted[key] = deepSortObject(value[key]);
  }
  return sorted;
}
