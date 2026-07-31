#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWikiImageInfo, parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  createMinioImageUploader,
  isManagedUrl,
  resolveEntityManagedUrlPrefixes,
  slugify,
  toText
} from '../lib/minio-image-upload.mjs';
import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext
} from '../automation/authorized-operation-context.mjs';
import {
  DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  resolveManagedImageUrlPrefixes
} from '../relation/managed-image-url-policy.mjs';
import { writeJsonFile } from './backend-refresh-runtime-state.mjs';

const OPERATION_ID = 'canonical-image-sync';
const DECISION_LEDGER_PATH = 'reports/authorization/canonical/used-decisions.json';
const DEFAULT_PROMOTION_RESULT_PATH = 'reports/authorization/canonical/canonical-item-image-source-promotion.result.json';
const SUPPORTED_SCOPES = Object.freeze([
  'items',
  'npcs',
  'projectiles',
  'buffs',
  'armor_item_images',
  'armor_set_images',
  'town_npc_maintenance'
]);

export async function runImageSync(rawOptions = {}, dependencies = {}) {
  const repoRoot = path.resolve(rawOptions.repoRoot ?? process.cwd());
  const apply = Boolean(rawOptions.apply);
  const scopes = normalizeScopes(rawOptions.scopes);
  const standardizedRoot = path.join(repoRoot, 'data', 'standardized');
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const progressPath = path.resolve(
    repoRoot,
    rawOptions.progressPath ?? path.join('data', 'generated', 'wiki-sync-progress.latest.json')
  );
  const reportPath = path.resolve(
    repoRoot,
    rawOptions.outputPath ?? path.join('reports', `workflow-image-sync-${startedAt.slice(0, 10)}.json`)
  );
  // The resolver stays fail-closed: it trusts only what the local stack config
  // declares. Historical endpoints are merged in here instead, because objects
  // uploaded by earlier syncs still carry the old MinIO port. They are our own
  // managed artifacts, and re-fetching one would mean downloading from our own
  // storage at an endpoint that may no longer be listening.
  const managedUrlPrefixes = [...new Set([
    ...(rawOptions.managedUrlPrefixes ?? resolveManagedImageUrlPrefixes({ repoRoot })),
    ...DEFAULT_MANAGED_IMAGE_URL_PREFIXES
  ])];

  const readJson = dependencies.readJson ?? ((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')));
  const writeJson = dependencies.writeJson ?? writeJsonAtPath;
  const writeProgress = dependencies.writeProgress ?? ((filePath, payload) => writeJsonFile(filePath, payload));
  const resolveWikiImageUrl = dependencies.resolveWikiImageUrl ?? createWikiImageUrlResolver();
  const loadAuthorizedContext = dependencies.loadAuthorizedContext
    ?? (() => loadAuthorizedOperationContext({ operationId: OPERATION_ID }));
  const consumePermit = dependencies.consumePermit ?? ((authorizedContext) => (
    consumeAuthorizedOperationDispatchPermit({
      authorizedContext,
      decisionLedgerPath: path.join(repoRoot, DECISION_LEDGER_PATH)
    })
  ));

  const publish = ({ status, phase, message, current, total }) => {
    writeProgress(progressPath, buildImageSyncProgressPayload({
      status,
      phase,
      message,
      current,
      total,
      outputPath: reportPath,
      progressPath,
      repoRoot,
      startedAt,
      now: now()
    }));
  };

  publish({
    status: 'running',
    phase: 'initializing',
    message: `starting image sync scopes=${scopes.join(',')}`,
    current: 0,
    total: scopes.length || 1
  });

  // Nothing may reach MinIO before the standardized bytes are proven to be the
  // exact output of item image source promotion, and before the packet that
  // authorizes this sync has been verified.
  if (apply && scopes.includes('items')) {
    assertPromotionLineage({
      repoRoot,
      readJson,
      managedUrlPrefixes: resolveEntityManagedUrlPrefixes('items', managedUrlPrefixes),
      itemsPath: path.join(standardizedRoot, 'items.standardized.json'),
      promotionResultPath: rawOptions.promotionResultPath
        ?? path.join(repoRoot, DEFAULT_PROMOTION_RESULT_PATH)
    });
  }
  if (apply && rawOptions.requireAuthorization) {
    const authorizedContext = loadAuthorizedContext();
    consumePermit(authorizedContext);
  }

  const uploader = apply
    ? await (dependencies.createUploader ?? createMinioImageUploader)({
        apiBase: rawOptions.apiBase,
        adminUsername: rawOptions.adminUsername,
        adminPassword: rawOptions.adminPassword,
        managedUrlPrefixes,
        repoRoot
      })
    : null;

  const summary = {
    apply,
    generatedAt: now(),
    managedUrlPrefixes,
    modules: {},
    reportPath,
    scopes,
    status: 'running'
  };

  const context = {
    apply,
    localEvidence: normalizeLocalEvidence(rawOptions.localEvidence),
    managedObjectOrigin: text(rawOptions.managedObjectOrigin),
    probeObject: dependencies.probeObject ?? defaultProbeObject,
    managedUrlPrefixes,
    publish,
    readJson,
    repoRoot,
    resolveWikiImageUrl,
    standardizedRoot,
    uploader,
    writeJson,
    inputPath: rawOptions.inputPath ?? null,
    startedAt
  };

  try {
    for (const scope of scopes) {
      summary.modules[scope] = await syncScope(scope, context);
    }
  } catch (error) {
    summary.status = 'failed';
    Object.assign(summary, aggregate(summary.modules));
    summary.message = error?.message ?? String(error);
    writeJson(reportPath, summary);
    publish({
      status: 'failed',
      phase: 'failed',
      message: summary.message,
      current: scopes.length || 1,
      total: scopes.length || 1
    });
    throw error;
  }

  Object.assign(summary, aggregate(summary.modules));
  if (summary.failedKeys.length > 0) {
    summary.status = 'failed';
    summary.message = `image sync failed for ${summary.failedKeys.length} image(s)`;
    // Evidence first: the report must survive before the terminal state, and
    // `completed` must never be published for a partial upload set.
    writeJson(reportPath, summary);
    publish({
      status: 'failed',
      phase: 'failed',
      message: summary.message,
      current: scopes.length || 1,
      total: scopes.length || 1
    });
    throw new Error(summary.message);
  }

  summary.status = 'completed';
  writeJson(reportPath, summary);
  publish({
    status: 'completed',
    phase: 'completed',
    message: `finished image sync scopes=${scopes.join(',')}`,
    current: scopes.length || 1,
    total: scopes.length || 1
  });
  return summary;
}

// Lineage, not immutability. Byte equality would make sync single-shot: the
// first run rewrites imageUrl by design, so a second run could never pass its
// own gate. What must hold is that the promoted fields are still exactly what
// promotion wrote, and that imageUrl is either promotion's value or a managed
// URL this lane produced.
function assertPromotionLineage({ readJson, itemsPath, promotionResultPath, managedUrlPrefixes }) {
  const result = readJson(promotionResultPath);
  if (result?.resultKind !== 'canonical_item_image_source_promotion_result'
      || result?.status !== 'COMPLETED') {
    throw new Error('a completed item image source promotion result is required before image sync');
  }
  const actual = sha256Bytes(fs.readFileSync(itemsPath));
  if (result?.after?.sha256 === actual) return;

  const records = new Map(
    (readJson(itemsPath)?.records ?? []).map((record) => [text(record?.internalName), record])
  );
  for (const change of Array.isArray(result?.changes) ? result.changes : []) {
    const key = text(change?.itemInternalName);
    const record = records.get(key);
    if (!record) {
      throw new Error(`promoted identity ${key} is missing from the standardized records`);
    }
    for (const [field, values] of Object.entries(change?.fields ?? {})) {
      const expected = values?.after ?? null;
      const found = record[field] ?? null;
      if (canonicalJson(expected) === canonicalJson(found)) continue;
      if (field === 'imageUrl' && isManagedUrl(String(found), managedUrlPrefixes)) continue;
      throw new Error(
        `promoted field ${field} drifted for ${key}: expected ${JSON.stringify(expected)}, `
        + `found ${JSON.stringify(found)}`
      );
    }
  }
}

function canonicalJson(value) {
  return JSON.stringify(value ?? null);
}

async function syncScope(scope, context) {
  const { standardizedRoot, readJson, inputPath, repoRoot } = context;
  if (scope === 'items') {
    const filePath = path.join(standardizedRoot, 'items.standardized.json');
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'items',
      filePath,
      payload,
      records: recordsOf(payload),
      sourceUrlAccessor: (record) => toText(record?.imageUrl),
      fallbackSourceUrlResolver: (record) => context.resolveWikiImageUrl(record?.imageFileTitle),
      targetUrlWriter: (record, url) => {
        record.imageUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'item')}${guessExtension(url)}`,
      nameHint: (record) => record?.internalName || record?.name || 'item',
      localFileTitleAccessor: (record) => record?.imageFileTitle
    });
  }
  if (scope === 'npcs') {
    const filePath = path.join(standardizedRoot, 'npcs.standardized.json');
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'npcs',
      filePath,
      payload,
      records: recordsOf(payload),
      sourceUrlAccessor: (record) => toText(record?.imageUrl),
      fallbackSourceUrlResolver: (record) => context.resolveWikiImageUrl(record?.imageFileTitle),
      targetUrlWriter: (record, url) => {
        record.imageUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'npc')}${guessExtension(url)}`,
      nameHint: (record) => record?.internalName || record?.name || 'npc'
    });
  }
  if (scope === 'projectiles') {
    const filePath = path.join(standardizedRoot, 'projectiles.standardized.json');
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'projectiles',
      filePath,
      payload,
      records: recordsOf(payload),
      sourceUrlAccessor: (record) => toText(record?.imageUrl),
      fallbackSourceUrlResolver: (record) => context.resolveWikiImageUrl(
        record?.imageFileTitle ?? record?.extras?.image ?? record?.image
      ),
      targetUrlWriter: (record, url) => {
        record.imageUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'projectile')}${guessExtension(url)}`,
      nameHint: (record) => record?.internalName || record?.name || 'projectile'
    });
  }
  if (scope === 'buffs') {
    const filePath = path.join(standardizedRoot, 'buffs.standardized.json');
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'items',
      filePath,
      payload,
      records: recordsOf(payload),
      sourceUrlAccessor: (record) => toText(record?.imageUrl),
      fallbackSourceUrlResolver: (record) => context.resolveWikiImageUrl(
        record?.imageFileTitle ?? record?.image
      ),
      targetUrlWriter: (record, url) => {
        record.imageUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.internalName || record?.englishName || 'buff')}${guessExtension(url)}`,
      nameHint: (record) => record?.internalName || record?.englishName || 'buff'
    });
  }
  if (scope === 'armor_item_images') {
    const filePath = path.resolve(
      repoRoot,
      inputPath ?? path.join('reports', `armor-item-image-evidence-${context.startedAt.slice(0, 10)}.json`)
    );
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'items',
      filePath,
      payload,
      records: Array.isArray(payload?.candidates) ? payload.candidates : [],
      sourceUrlAccessor: (record) => toText(record?.cachedUrl) || toText(record?.sourceUrl),
      targetUrlWriter: (record, url) => {
        record.cachedUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || record?.imageFileTitle || 'armor-item')}${guessExtension(url)}`,
      nameHint: (record) => record?.internalName || record?.name || record?.imageFileTitle || 'armor-item'
    });
  }
  if (scope === 'armor_set_images') {
    const filePath = sharedDataPath('raw', 'wiki', 'armor_set_images.parsed.latest.json');
    const payload = readJson(filePath);
    return syncRecordImages({
      ...context,
      entityDomain: 'items',
      filePath,
      payload,
      records: Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [],
      sourceUrlAccessor: (record) => toText(record?.cachedUrl) || toText(record?.originalUrl),
      targetUrlWriter: (record, url) => {
        record.cachedUrl = url;
      },
      fileNameHint: (record, url) => `${slugify(record?.sourceFileTitle || record?.pageTitle || 'armor-set')}${guessExtension(url)}`,
      nameHint: (record) => record?.sourceFileTitle || record?.pageTitle || 'armor-set'
    });
  }
  const filePath = path.resolve(
    repoRoot,
    inputPath ?? path.join('data', 'generated', 'wiki-town-npc-maintenance.latest.json')
  );
  const payload = readJson(filePath);
  const records = recordsOf(payload).flatMap((record) => {
    const details = record?.wikiDetails && typeof record.wikiDetails === 'object' ? record.wikiDetails : {};
    return [
      { owner: record, field: 'spriteImage', sourceUrl: toText(details.spriteImage) },
      { owner: record, field: 'mapIconImage', sourceUrl: toText(details.mapIconImage) },
      { owner: record, field: 'dialogPortraitImage', sourceUrl: toText(details.dialogPortraitImage) }
    ].filter((entry) => entry.sourceUrl);
  });
  return syncRecordImages({
    ...context,
    entityDomain: 'npcs',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => record.sourceUrl,
    targetUrlWriter: (record, url) => {
      record.owner.wikiDetails = record.owner.wikiDetails ?? {};
      record.owner.wikiDetails[record.field] = url;
    },
    fileNameHint: (record, url) => `${slugify(`${record.owner?.internalName || 'town-npc'}-${record.field}`)}${guessExtension(url)}`,
    nameHint: (record) => `${record.owner?.internalName || 'town-npc'} ${record.field}`
  });
}

async function syncRecordImages({
  apply,
  entityDomain,
  fallbackSourceUrlResolver,
  fileNameHint,
  filePath,
  localEvidence,
  localFileTitleAccessor,
  managedObjectOrigin,
  managedUrlPrefixes,
  nameHint,
  payload,
  probeObject,
  publish,
  records,
  sourceUrlAccessor,
  targetUrlWriter,
  uploader,
  writeJson
} = {}) {
  const entityManagedUrlPrefixes = resolveEntityManagedUrlPrefixes(entityDomain, managedUrlPrefixes);
  const alreadyManagedKeys = [];
  const candidateKeys = [];
  const failedKeys = [];
  const missingSourceKeys = [];
  const uploadKeys = [];
  const uploadedKeys = [];
  const reusedKeys = [];
  const normalizedKeys = [];
  const reuseProbeFailedKeys = [];
  const managedImages = [];
  let changed = 0;

  const progress = (current) => publish({
    status: 'running',
    phase: 'syncing_images',
    message: `syncing image records ${current}/${records.length}`,
    current,
    total: records.length
  });

  progress(0);

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const key = String(nameHint(record));
    let sourceUrl = sourceUrlAccessor(record);
    if (!sourceUrl && fallbackSourceUrlResolver) {
      sourceUrl = await fallbackSourceUrlResolver(record);
    }
    if (!sourceUrl) {
      missingSourceKeys.push(key);
      progress(index + 1);
      continue;
    }
    candidateKeys.push(key);
    if (isManagedUrl(sourceUrl, entityManagedUrlPrefixes)) {
      alreadyManagedKeys.push(key);
      // An absolute URL at the origin we are configured for is the same object,
      // written in a form that dies with the endpoint. Normalize it to the path
      // the backend itself returns. A historical origin is left alone: whether
      // its object still exists is a separate, unverified question.
      const normalized = normalizeConfiguredManagedUrl(sourceUrl, managedObjectOrigin);
      const storedUrl = normalized ?? sourceUrl;
      if (normalized) {
        targetUrlWriter(record, normalized);
        changed += 1;
        normalizedKeys.push(key);
      }
      managedImages.push({ key, originalUrl: null, managedUrl: storedUrl, contentHash: sha256Bytes(storedUrl) });
      progress(index + 1);
      continue;
    }
    uploadKeys.push(key);
    if (!apply || !uploader) {
      changed += 1;
      progress(index + 1);
      continue;
    }

    // An earlier crawl may already hold this exact file in managed storage.
    // Reuse it only when the stored file title is the one verification selected
    // and the object actually answers, so a stale or wrong-variant record can
    // never silently become the item's image.
    const reusable = await resolveReusableManagedUrl({
      key,
      localEvidence,
      localFileTitle: localFileTitleAccessor ? localFileTitleAccessor(record) : null,
      managedObjectOrigin,
      managedUrlPrefixes,
      probeObject,
      onProbeFailure: () => reuseProbeFailedKeys.push(key)
    });
    if (reusable) {
      targetUrlWriter(record, reusable.storedUrl);
      changed += 1;
      reusedKeys.push(key);
      managedImages.push({
        key,
        originalUrl: sourceUrl,
        managedUrl: reusable.storedUrl,
        probedUrl: reusable.probedUrl,
        contentHash: sha256Bytes(reusable.storedUrl),
        reused: true
      });
      progress(index + 1);
      continue;
    }

    let managedUrl = await uploader.uploadImageUrl(sourceUrl, {
      entityDomain,
      fileName: fileNameHint(record, sourceUrl),
      nameHint: key
    });
    if (!managedUrl && fallbackSourceUrlResolver) {
      const fallbackSourceUrl = await fallbackSourceUrlResolver(record);
      if (fallbackSourceUrl && fallbackSourceUrl !== sourceUrl) {
        managedUrl = await uploader.uploadImageUrl(fallbackSourceUrl, {
          entityDomain,
          fileName: fileNameHint(record, fallbackSourceUrl),
          nameHint: key
        });
      }
    }
    if (!managedUrl) {
      // A null upload is a failure, never a silent skip.
      failedKeys.push(key);
      progress(index + 1);
      continue;
    }
    targetUrlWriter(record, managedUrl);
    changed += 1;
    uploadedKeys.push(key);
    managedImages.push({
      key,
      originalUrl: sourceUrl,
      managedUrl,
      contentHash: sha256Bytes(managedUrl)
    });
    progress(index + 1);
  }

  if (apply && (uploadedKeys.length > 0 || reusedKeys.length > 0 || normalizedKeys.length > 0)) {
    writeJson(filePath, payload);
  }

  return {
    alreadyManaged: alreadyManagedKeys.length,
    alreadyManagedKeys: [...alreadyManagedKeys].sort(),
    apply,
    candidates: candidateKeys.length,
    candidateKeys: [...candidateKeys].sort(),
    changed,
    completedKeys: [...uploadedKeys, ...reusedKeys, ...alreadyManagedKeys].sort(),
    failedKeys: [...failedKeys].sort(),
    filePath,
    managedImages,
    missingSource: missingSourceKeys.length,
    missingSourceKeys: [...missingSourceKeys].sort(),
    total: records.length,
    normalizedKeys: [...normalizedKeys].sort(),
    reused: reusedKeys.length,
    reusedKeys: [...reusedKeys].sort(),
    reuseProbeFailedKeys: [...reuseProbeFailedKeys].sort(),
    uploadKeys: [...uploadKeys].sort(),
    uploaded: uploadedKeys.length,
    uploadedKeys: [...uploadedKeys].sort()
  };
}

// Reuse gate. Three independent conditions, all required: the earlier crawl
// recorded a local object for this identity, the file title it stored is the one
// verification selected, and the object answers at the configured managed
// origin. Anything less falls through to a real upload.
async function resolveReusableManagedUrl({
  key,
  localEvidence,
  localFileTitle,
  managedObjectOrigin,
  managedUrlPrefixes,
  probeObject,
  onProbeFailure
}) {
  const evidence = localEvidence?.get?.(key);
  if (!evidence || !localFileTitle) return null;
  if (comparableFileTitle(evidence.sourceFileTitle) !== comparableFileTitle(localFileTitle)) {
    return null;
  }
  const probedUrl = reoriginManagedUrl(evidence.cachedUrl, managedObjectOrigin);
  if (!probedUrl || !isManagedUrl(probedUrl, managedUrlPrefixes)) return null;
  const reachable = await probeObject(probedUrl);
  if (!reachable) {
    onProbeFailure?.();
    return null;
  }
  // Store the path, not the origin. The origin is a probe-time detail; baking a
  // host:port into standardized data is what stranded 331 rows on a dead port.
  return { storedUrl: managedPathOf(probedUrl), probedUrl };
}

// Only an origin we are configured for may be rewritten. Anything else keeps
// its recorded form.
function normalizeConfiguredManagedUrl(value, managedObjectOrigin) {
  const origin = text(managedObjectOrigin);
  if (!origin) return null;
  try {
    const parsed = new URL(String(value));
    const target = new URL(origin);
    if (parsed.protocol !== target.protocol || parsed.host !== target.host) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function managedPathOf(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

// Local reuse evidence comes from the promotion bundle's comparison block, which
// records what an earlier crawl stored for each identity.
export function buildLocalImageEvidenceFromPromotionBundle(bundle) {
  const evidence = new Map();
  for (const row of Array.isArray(bundle?.rows) ? bundle.rows : []) {
    const local = row?.comparison?.local;
    const key = text(row?.itemInternalName);
    const cachedUrl = text(local?.cachedUrl);
    const sourceFileTitle = text(local?.sourceFileTitle);
    if (!key || !cachedUrl || !sourceFileTitle) continue;
    evidence.set(key, { sourceFileTitle, cachedUrl });
  }
  return evidence;
}

function normalizeLocalEvidence(value) {
  if (value instanceof Map) return value;
  if (!value || typeof value !== 'object') return new Map();
  return new Map(Object.entries(value));
}

function comparableFileTitle(value) {
  return String(value ?? '').trim().replace(/^File:/i, '').replaceAll('_', ' ').toLowerCase();
}

function reoriginManagedUrl(cachedUrl, managedObjectOrigin) {
  const value = text(cachedUrl);
  if (!value) return null;
  const origin = text(managedObjectOrigin);
  if (!origin) return value;
  try {
    const parsed = new URL(value);
    const target = new URL(origin);
    parsed.protocol = target.protocol;
    parsed.host = target.host;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function defaultProbeObject(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function aggregate(modules) {
  const entries = Object.values(modules ?? {});
  const concat = (field) => entries.flatMap((entry) => entry?.[field] ?? []).sort();
  return {
    total: entries.reduce((sum, entry) => sum + Number(entry?.total ?? 0), 0),
    candidates: entries.reduce((sum, entry) => sum + Number(entry?.candidates ?? 0), 0),
    uploaded: entries.reduce((sum, entry) => sum + Number(entry?.uploaded ?? 0), 0),
    alreadyManaged: entries.reduce((sum, entry) => sum + Number(entry?.alreadyManaged ?? 0), 0),
    missingSource: entries.reduce((sum, entry) => sum + Number(entry?.missingSource ?? 0), 0),
    reused: entries.reduce((sum, entry) => sum + Number(entry?.reused ?? 0), 0),
    reusedKeys: concat('reusedKeys'),
    normalizedKeys: concat('normalizedKeys'),
    reuseProbeFailedKeys: concat('reuseProbeFailedKeys'),
    candidateKeys: concat('candidateKeys'),
    alreadyManagedKeys: concat('alreadyManagedKeys'),
    uploadKeys: concat('uploadKeys'),
    uploadedKeys: concat('uploadedKeys'),
    missingSourceKeys: concat('missingSourceKeys'),
    completedKeys: concat('completedKeys'),
    failedKeys: concat('failedKeys'),
    managedImages: entries.flatMap((entry) => entry?.managedImages ?? [])
  };
}

export function buildImageSyncProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  outputPath,
  progressPath,
  repoRoot = process.cwd(),
  startedAt,
  now = new Date().toISOString()
} = {}) {
  const generatedAt = typeof now === 'string' ? now : now.toISOString();
  const childStatusPath = progressPath
    ? (path.relative(repoRoot, progressPath) || progressPath)
    : null;
  return {
    actionId: process.env.TERRAPEDIA_CRAWLER_ACTION_ID || 'image-sync',
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath,
    phase,
    message,
    current,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, current / total * 100)) : 0,
    startedAt: startedAt ?? generatedAt,
    outputPath
  };
}

function createWikiImageUrlResolver() {
  const cache = new Map();
  return async (fileTitle) => {
    const normalized = normalizeFileTitle(fileTitle);
    if (!normalized) return null;
    if (cache.has(normalized)) return cache.get(normalized);
    let resolvedUrl = null;
    try {
      const imageInfo = await fetchWikiImageInfo({ fileTitle: normalized });
      resolvedUrl = toText(imageInfo?.url);
    } catch {
      resolvedUrl = null;
    }
    cache.set(normalized, resolvedUrl);
    return resolvedUrl;
  };
}

function recordsOf(payload) {
  return Array.isArray(payload?.records) ? payload.records : [];
}

function normalizeFileTitle(fileTitle) {
  const value = toText(fileTitle);
  if (!value) return null;
  return value.replace(/^File:/i, '');
}

function normalizeScopes(rawValue) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue ?? '').split(',');
  return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))]
    .filter((scope) => SUPPORTED_SCOPES.includes(scope));
}

function guessExtension(sourceUrl) {
  const url = toText(sourceUrl);
  if (!url) return '.png';
  try {
    const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '.png';
  } catch {
    return '.png';
  }
}

function writeJsonAtPath(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseCliArgs(process.argv.slice(2));
  const managedUrlPrefix = Array.isArray(options.managedUrlPrefix)
    ? options.managedUrlPrefix
    : (toText(options.managedUrlPrefix) ? [toText(options.managedUrlPrefix)] : null);
  runImageSync({
    repoRoot: process.cwd(),
    apply: booleanOption(options.apply, false),
    scopes: options.scopes ?? options.scope ?? 'projectiles,buffs',
    apiBase: options.apiBase,
    adminUsername: options.adminUsername,
    adminPassword: options.adminPassword,
    inputPath: options.input,
    outputPath: options.output,
    ...(options['local-evidence']
      ? {
          localEvidence: buildLocalImageEvidenceFromPromotionBundle(
            JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options['local-evidence']), 'utf8'))
          )
        }
      : {}),
    ...(options['managed-object-origin'] ? { managedObjectOrigin: options['managed-object-origin'] } : {}),
    progressPath: options.progressPath ?? options['progress-path'],
    // Only the items scope is the governed canonical-image-sync operation, whose
    // manifest freezes `--scopes=items`. The other scopes are separate lanes and
    // are not covered by that packet.
    requireAuthorization: booleanOption(options.apply, false)
      && normalizeScopes(options.scopes ?? options.scope ?? 'projectiles,buffs').includes('items'),
    ...(managedUrlPrefix ? { managedUrlPrefixes: managedUrlPrefix } : {})
  }).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  });
}
