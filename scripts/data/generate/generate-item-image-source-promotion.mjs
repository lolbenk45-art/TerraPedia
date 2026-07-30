#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const DEFAULT_ITEMS_PATH = 'data/standardized/items.standardized.json';
const DEFAULT_ITEM_PAGES_PATH = 'data/standardized/item_pages.standardized.json';
const DEFAULT_RAW_DIR = '/home/lolben/data/terraPedia/raw/wiki/item-pages';

export function buildItemImageSourcePromotionArtifacts({
  standardizedBytes,
  itemPagesBytes,
  candidateReportBytes,
  verificationReportBytes = null,
  rawEvidenceBytesByFile,
  producerCodeSha256,
  generatedAt
} = {}) {
  const standardizedPayload = parseJsonBytes(standardizedBytes, 'standardizedBytes');
  const itemPagesPayload = parseJsonBytes(itemPagesBytes, 'itemPagesBytes');
  const candidateReport = parseJsonBytes(candidateReportBytes, 'candidateReportBytes');
  const verificationReport = verificationReportBytes == null
    ? null
    : parseJsonBytes(verificationReportBytes, 'verificationReportBytes');
  const standardizedRecords = requireRecords(standardizedPayload?.records, 'standardized records');
  requireRecords(itemPagesPayload?.records, 'item page records');
  assertUniqueStandardizedIdentities(standardizedRecords);
  if (candidateReport?.schemaVersion !== '2.0.0') {
    throw new Error('candidate report schemaVersion must be 2.0.0');
  }
  assertSha256(producerCodeSha256, 'producerCodeSha256');

  const standardizedSha256 = sha256Bytes(standardizedBytes);
  const itemPagesSha256 = sha256Bytes(itemPagesBytes);
  const identitySetSha256 = buildIdentitySetSha256(standardizedRecords);
  assertHashEqual(candidateReport?.inputs?.items?.sha256, standardizedSha256, 'standardized SHA-256');
  assertHashEqual(candidateReport?.inputs?.itemPages?.sha256, itemPagesSha256, 'item-pages SHA-256');
  assertHashEqual(candidateReport?.inputs?.identitySetSha256, identitySetSha256, 'identity-set SHA-256');

  const rawBytes = rawEvidenceBytesByFile instanceof Map
    ? rawEvidenceBytesByFile
    : new Map(Object.entries(rawEvidenceBytesByFile ?? {}));
  const rawDescriptors = verifyRawEvidence(candidateReport, verificationReport, rawBytes);
  const candidateRecords = indexEvidenceRecords(candidateReport?.records, 'candidate report');
  const verificationRecords = indexEvidenceRecords(
    verificationReport?.records ?? [],
    'verification report'
  );
  const rows = [];
  const counters = {
    total: standardizedRecords.length,
    existing: 0,
    promoted: 0,
    unresolved: 0,
    ambiguous: 0,
    duplicate: 0,
    conflict: 0
  };

  for (const item of [...standardizedRecords].sort(compareStandardizedItems)) {
    const identity = itemIdentity(item);
    const key = identity.itemInternalName;
    const hasFileTitle = Boolean(text(item?.imageFileTitle));
    const hasImageUrl = Boolean(text(item?.imageUrl));
    const evidenceRows = [
      ...(candidateRecords.get(key) ?? []),
      ...(verificationRecords.get(key) ?? [])
    ];

    if (hasFileTitle !== hasImageUrl) {
      counters.conflict += 1;
      rows.push({ ...identity, status: 'conflict', source: null, comparison: null });
      continue;
    }

    if (hasFileTitle && hasImageUrl) {
      if (evidenceRows.length > 0) {
        counters.conflict += 1;
        rows.push({ ...identity, status: 'conflict', source: null, comparison: null });
        continue;
      }
      counters.existing += 1;
      rows.push({
        ...identity,
        status: 'existing',
        source: buildExistingSource(item),
        comparison: null
      });
      continue;
    }

    if (evidenceRows.length > 1) {
      counters.duplicate += evidenceRows.length - 1;
      rows.push({ ...identity, status: 'duplicate', source: null, comparison: null });
      continue;
    }
    if (evidenceRows.length === 0) {
      counters.unresolved += 1;
      rows.push({ ...identity, status: 'unresolved', source: null, comparison: null });
      continue;
    }

    const evidence = evidenceRows[0];
    if (!evidenceMatchesIdentity(evidence, identity)) {
      counters.conflict += 1;
      rows.push({ ...identity, status: 'conflict', source: null, comparison: evidence?.comparison ?? null });
      continue;
    }
    if (evidence.classification === 'ambiguous') {
      counters.ambiguous += 1;
      rows.push({ ...identity, status: 'ambiguous', source: null, comparison: evidence.comparison ?? null });
      continue;
    }
    if (!isVerifiedClassification(evidence.classification) || !evidence.source) {
      counters.unresolved += 1;
      rows.push({ ...identity, status: 'unresolved', source: null, comparison: evidence.comparison ?? null });
      continue;
    }

    verifyEvidenceSource(evidence.source, rawBytes);
    counters.promoted += 1;
    rows.push({
      ...identity,
      status: 'promoted',
      source: structuredClone(evidence.source),
      comparison: structuredClone(evidence.comparison ?? null)
    });
  }

  const descriptor = {
    schemaVersion: 1,
    producerCodeSha256,
    standardized: {
      sha256: standardizedSha256,
      identitySetSha256,
      recordCount: standardizedRecords.length
    },
    itemPages: { sha256: itemPagesSha256 },
    candidateReport: { sha256: sha256Bytes(candidateReportBytes) },
    verificationReport: verificationReportBytes == null
      ? null
      : { sha256: sha256Bytes(verificationReportBytes) },
    rawEvidence: rawDescriptors
  };
  const review = {
    schemaVersion: 1,
    entity: 'item_image_source_promotion_review',
    generatedAt: generatedAt ?? candidateReport.generatedAt ?? null,
    descriptor,
    counters,
    rows
  };
  const canPublishBundle = counters.total === rows.length
    && counters.unresolved === 0
    && counters.ambiguous === 0
    && counters.duplicate === 0
    && counters.conflict === 0
    && counters.existing + counters.promoted === counters.total;
  if (!canPublishBundle) return { review, bundle: null };

  const generationId = sha256Canonical(descriptor).slice('sha256:'.length);
  const bundleRows = rows.map((row) => ({
    itemId: row.itemId,
    itemInternalName: row.itemInternalName,
    itemName: row.itemName,
    status: row.status,
    source: row.source,
    comparison: row.comparison
  }));
  const bundlePayload = { descriptor, counters, rows: bundleRows };
  return {
    review,
    bundle: {
      schemaVersion: 1,
      entity: 'item_image_source_promotion_bundle',
      generationId,
      generatedAt: review.generatedAt,
      descriptor,
      counters,
      rows: bundleRows,
      bundlePayloadSha256: sha256Canonical(bundlePayload)
    }
  };
}

export async function runItemImageSourcePromotionGeneration(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const standardizedBytes = await fs.promises.readFile(options.itemsPath);
  const itemPagesBytes = await fs.promises.readFile(options.itemPagesPath);
  const candidateReportBytes = await fs.promises.readFile(options.candidateReportPath);
  const candidateReport = JSON.parse(candidateReportBytes.toString('utf8'));
  const verificationReportBytes = options.verificationReportPath
    ? await fs.promises.readFile(options.verificationReportPath)
    : null;
  const verificationReport = verificationReportBytes
    ? JSON.parse(verificationReportBytes.toString('utf8'))
    : null;
  const rawEvidenceBytesByFile = new Map();
  for (const descriptor of collectRawDescriptors(candidateReport, verificationReport)) {
    const rawPath = path.isAbsolute(descriptor.path)
      ? descriptor.path
      : path.join(options.rawDir, descriptor.path);
    rawEvidenceBytesByFile.set(descriptor.path, await fs.promises.readFile(rawPath));
  }
  const producerCodeSha256 = sha256Bytes(await fs.promises.readFile(fileURLToPath(import.meta.url)));
  const artifacts = buildItemImageSourcePromotionArtifacts({
    standardizedBytes,
    itemPagesBytes,
    candidateReportBytes,
    verificationReportBytes,
    rawEvidenceBytesByFile,
    producerCodeSha256,
    generatedAt: options.generatedAt
  });
  writeJsonFile(options.reviewOutputPath, artifacts.review);
  let bundleOutputPath = null;
  if (artifacts.bundle) {
    bundleOutputPath = options.bundleOutputPath ?? path.resolve(
      `reports/audit/item-image-source-promotion-${artifacts.bundle.generationId}.bundle.json`
    );
    writeJsonFile(bundleOutputPath, artifacts.bundle);
  }
  return {
    bundleWritten: Boolean(artifacts.bundle),
    reviewOutputPath: options.reviewOutputPath,
    bundleOutputPath,
    counters: artifacts.review.counters
  };
}

function verifyRawEvidence(candidateReport, verificationReport, rawBytes) {
  const descriptors = collectRawDescriptors(candidateReport, verificationReport);
  for (const descriptor of descriptors) {
    assertSha256(descriptor.sha256, `raw evidence ${descriptor.path} sha256`);
    if (!rawBytes.has(descriptor.path)) {
      throw new Error(`missing raw evidence bytes for ${descriptor.path}`);
    }
    assertHashEqual(
      descriptor.sha256,
      sha256Bytes(rawBytes.get(descriptor.path)),
      'raw evidence SHA-256',
      descriptor.path
    );
  }
  return descriptors;
}

function collectRawDescriptors(...reports) {
  const byPath = new Map();
  for (const report of reports.filter(Boolean)) {
    for (const descriptor of requireRecords(report?.inputs?.rawFiles ?? [], 'raw file descriptors')) {
      const rawPath = text(descriptor?.path);
      if (!rawPath) throw new Error('raw file descriptor path is required');
      const current = byPath.get(rawPath);
      if (current && current.sha256 !== descriptor.sha256) {
        throw new Error(`conflicting raw evidence descriptor for ${rawPath}`);
      }
      byPath.set(rawPath, { path: rawPath, sha256: descriptor.sha256 });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function verifyEvidenceSource(source, rawBytes) {
  if (source.authority !== 'raw_wiki_evidence') {
    throw new Error(`unsupported promoted source authority ${source.authority}`);
  }
  const rawSourceFile = text(source.rawSourceFile);
  if (!rawSourceFile || !rawBytes.has(rawSourceFile)) {
    throw new Error(`missing raw evidence bytes for ${rawSourceFile ?? 'unknown source'}`);
  }
  assertHashEqual(
    source.rawFileSha256,
    sha256Bytes(rawBytes.get(rawSourceFile)),
    'raw evidence SHA-256',
    rawSourceFile
  );
  for (const field of ['evidenceKind', 'anchorTitle', 'fileTitle', 'originalUrl', 'contentType']) {
    if (!text(source[field])) throw new Error(`promoted source ${field} is required`);
  }
  if (!Number.isInteger(Number(source.blockOrdinal)) || Number(source.blockOrdinal) < 1) {
    throw new Error('promoted source blockOrdinal must be a positive integer');
  }
}

function buildExistingSource(item) {
  return {
    authority: 'standardized_existing',
    fileTitle: text(item.imageFileTitle),
    originalUrl: text(item.imageUrl),
    width: nullableNumber(item.imageWidth),
    height: nullableNumber(item.imageHeight),
    contentType: text(item.imageContentType)
  };
}

function indexEvidenceRecords(value, label) {
  const output = new Map();
  for (const record of requireRecords(value ?? [], `${label} records`)) {
    const key = text(record?.itemInternalName);
    if (!key) throw new Error(`${label} record itemInternalName is required`);
    if (!output.has(key)) output.set(key, []);
    output.get(key).push(record);
  }
  return output;
}

function evidenceMatchesIdentity(evidence, identity) {
  return String(evidence?.itemId) === String(identity.itemId)
    && text(evidence?.itemInternalName) === identity.itemInternalName
    && text(evidence?.itemName) === identity.itemName;
}

function isVerifiedClassification(value) {
  return value === 'raw_verified' || value === 'verified';
}

function assertUniqueStandardizedIdentities(records) {
  const ids = new Set();
  const internalNames = new Set();
  for (const record of records) {
    const identity = itemIdentity(record);
    if (!identity.itemInternalName) throw new Error('standardized item internalName is required');
    if (ids.has(String(identity.itemId)) || internalNames.has(identity.itemInternalName)) {
      throw new Error(`duplicate standardized item identity ${identity.itemInternalName}`);
    }
    ids.add(String(identity.itemId));
    internalNames.add(identity.itemInternalName);
  }
}

function buildIdentitySetSha256(records) {
  return sha256Canonical(records.map(itemIdentity).sort(compareItemIdentity));
}

function itemIdentity(item) {
  return {
    itemId: item?.id ?? null,
    itemInternalName: text(item?.internalName),
    itemName: text(item?.name)
  };
}

function compareStandardizedItems(left, right) {
  return compareItemIdentity(itemIdentity(left), itemIdentity(right));
}

function compareItemIdentity(left, right) {
  const leftId = Number(left.itemId);
  const rightId = Number(right.itemId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
  return String(left.itemInternalName).localeCompare(String(right.itemInternalName));
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  try {
    return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error?.message ?? error}`);
  }
}

function requireRecords(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function assertHashEqual(expected, actual, label, context = null) {
  assertSha256(expected, `${label} expected hash`);
  if (expected !== actual) {
    const suffix = context ? ` for ${context}` : '';
    throw new Error(`${label} mismatch${suffix}: expected ${expected}, actual ${actual}`);
  }
}

function assertSha256(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value ?? ''))) {
    throw new Error(`${label} must be a sha256 hash`);
  }
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Canonical(value) {
  return sha256Bytes(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeOptions(rawOptions = {}) {
  const generatedAt = rawOptions.generatedAt ?? new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const candidateReportPath = path.resolve(
    rawOptions.candidateReportPath
      ?? rawOptions['candidate-report']
      ?? `reports/audit/item-image-source-candidates-${dateTag}-v2.json`
  );
  return {
    itemsPath: path.resolve(rawOptions.itemsPath ?? rawOptions.items ?? DEFAULT_ITEMS_PATH),
    itemPagesPath: path.resolve(rawOptions.itemPagesPath ?? rawOptions['item-pages'] ?? DEFAULT_ITEM_PAGES_PATH),
    rawDir: path.resolve(rawOptions.rawDir ?? rawOptions['raw-dir'] ?? DEFAULT_RAW_DIR),
    candidateReportPath,
    verificationReportPath: optionalPath(rawOptions.verificationReportPath ?? rawOptions['verification-report']),
    reviewOutputPath: path.resolve(
      rawOptions.reviewOutputPath
        ?? rawOptions['review-output']
        ?? `reports/audit/item-image-source-promotion-review-${dateTag}.json`
    ),
    bundleOutputPath: optionalPath(rawOptions.bundleOutputPath ?? rawOptions['bundle-output']),
    generatedAt
  };
}

function optionalPath(value) {
  return text(value) ? path.resolve(value) : null;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runItemImageSourcePromotionGeneration(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.bundleWritten) process.exitCode = 1;
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
