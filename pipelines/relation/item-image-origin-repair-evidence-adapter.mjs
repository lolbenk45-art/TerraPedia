import { createHash } from 'node:crypto';

import { isManagedImagePath, normalizeManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';

const RESULT_OPERATION_ID = 'canonical-item-image-origin-repair';
const REQUIRED_QUARANTINE = Object.freeze(['FallenStar', 'SeveredHandBanner']);

export function buildItemImageOriginRepairEvidence({
  originRepairResultPath,
  originRepairResultBytes,
  keys,
  relationRows,
  projectionBeforeRows,
  expectedRelationBeforeHashes,
  expectedRelationRecordKeys,
  expectedProjectionBeforeHashes,
  expectedProjectionRelationRecordKeys,
  managedUrlPrefixes,
  quarantineIdentities,
} = {}) {
  const resultPath = requireText(originRepairResultPath, 'originRepairResultPath');
  const resultBytes = Buffer.isBuffer(originRepairResultBytes)
    ? originRepairResultBytes
    : Buffer.from(String(originRepairResultBytes ?? ''));
  const result = parseJson(resultBytes, 'origin repair result');
  if (result.operationId !== RESULT_OPERATION_ID || result.status !== 'COMPLETED') {
    throw new Error('origin repair result must be completed canonical item repair evidence');
  }
  if (result.databaseWrites !== true || result.externalRequests !== false) {
    throw new Error('origin repair result must record the completed local-only repair');
  }
  const prefixes = normalizeManagedImageUrlPrefixes(managedUrlPrefixes).sort();
  if (prefixes.length === 0) throw new Error('managed URL prefixes are required');
  const normalizedKeys = sortedUnique(keys, 'keys');
  const quarantine = sortedUnique(quarantineIdentities, 'quarantine identities');
  for (const identity of REQUIRED_QUARANTINE) {
    if (!quarantine.includes(identity)) throw new Error(`quarantine identity is missing: ${identity}`);
  }
  const relation = normalizeRelationRows(relationRows, prefixes);
  const projection = normalizeProjectionRows(projectionBeforeRows);
  assertKeySet(relation, normalizedKeys, 'relation');
  assertKeySet(projection, normalizedKeys, 'projection');
  assertExpectedBeforeHashes(relation, expectedRelationBeforeHashes, 'relation');
  assertExpectedRelationRecordKeys(relation, expectedRelationRecordKeys);
  assertExpectedBeforeHashes(projection, expectedProjectionBeforeHashes, 'projection');
  assertExpectedProjectionRelationKeys(projection, expectedProjectionRelationRecordKeys);
  for (const row of projection) {
    requireText(row.relationRecordKey, `projection relation record key for ${row.internalName}`);
  }
  if (Number(result.relationBefore) !== Number(result.relationUpdated)
      || Number(result.projectionBefore) !== Number(result.projectionUpdated)) {
    throw new Error('origin repair counts are not internally consistent');
  }
  return Object.freeze({
    kind: 'origin-repair-bound',
    originRepairResultPath: resultPath,
    originRepairResultSha256: sha256Bytes(resultBytes),
    originRepairScopeHash: requireSha256(result.scopeHash, 'origin repair scopeHash'),
    originRepairOperationId: result.operationId,
    originRepairStatus: result.status,
    keys: normalizedKeys,
    relationRows: relation,
    projectionBeforeRows: projection,
    managedUrlPrefixes: prefixes,
    quarantineIdentities: quarantine,
    targetRowCount: normalizedKeys.length,
    externalRequests: false,
    freshnessUpdates: false,
  });
}

function normalizeRelationRows(rows, prefixes) {
  if (!Array.isArray(rows)) throw new Error('relation rows must be an array');
  const seen = new Set();
  const seenKeys = new Set();
  return rows.map((row) => {
    const internalName = requireText(row?.internalName, 'relation internalName');
    const recordKey = requireText(row?.recordKey ?? row?.relationRecordKey, 'relation record key');
    const cachedUrl = requireText(row?.cachedUrl, 'relation cached URL');
    if (seen.has(internalName)) throw new Error(`duplicate relation identity ${internalName}`);
    if (seenKeys.has(recordKey)) throw new Error(`duplicate relation record key ${recordKey}`);
    if (!isManagedImagePath(cachedUrl, prefixes)) throw new Error(`relation cached URL must be managed for ${internalName}`);
    seen.add(internalName);
    seenKeys.add(recordKey);
    return {
      recordKey,
      relationRecordKey: recordKey,
      internalName,
      cachedUrl,
      beforeHash: requireSha256(row?.beforeHash, `relation before hash for ${internalName}`),
    };
  }).sort(compareName);
}

function normalizeProjectionRows(rows) {
  if (!Array.isArray(rows)) throw new Error('projection before rows must be an array');
  const seen = new Set();
  const seenIds = new Set();
  return rows.map((row) => {
    const internalName = requireText(row?.internalName, 'projection internalName');
    const relationRecordKey = requireText(row?.relationRecordKey, 'projection relation record key');
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`projection id is invalid for ${internalName}`);
    if (seen.has(internalName) || seenIds.has(id)) throw new Error(`duplicate projection row for ${internalName}`);
    seen.add(internalName);
    seenIds.add(id);
    return {
      id,
      relationRecordKey,
      internalName,
      image: requireText(row?.image, `projection image for ${internalName}`),
      beforeHash: requireSha256(row?.beforeHash, `projection before hash for ${internalName}`),
    };
  }).sort(compareName);
}

function assertKeySet(rows, keys, label) {
  const actual = rows.map((row) => row.internalName).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new Error(`${label} identity key set drifted`);
  }
}

function assertExpectedBeforeHashes(rows, expected, label) {
  if (expected == null) return;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error(`${label} expected before hashes must be an object`);
  }
  for (const row of rows) {
    const value = expected[row.internalName];
    if (value !== row.beforeHash) {
      throw new Error(`${label} before hash drifted for ${row.internalName}`);
    }
  }
}

function assertExpectedProjectionRelationKeys(rows, expected) {
  if (expected == null) return;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('projection expected relation record keys must be an object');
  }
  for (const row of rows) {
    if (expected[row.internalName] !== row.relationRecordKey) {
      throw new Error(`projection relation record key drifted for ${row.internalName}`);
    }
  }
}

function assertExpectedRelationRecordKeys(rows, expected) {
  if (expected == null) return;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('relation expected record keys must be an object');
  }
  for (const row of rows) {
    if (expected[row.internalName] !== row.recordKey) {
      throw new Error(`relation record key drifted for ${row.internalName}`);
    }
  }
}

function sortedUnique(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  const normalized = values.map((value) => requireText(value, label));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates`);
  return normalized.sort();
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`${label} must be valid JSON`); }
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireSha256(value, label) {
  const text = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be a SHA-256 identity`);
  return text;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function compareName(left, right) {
  return left.internalName.localeCompare(right.internalName, 'en');
}
