import crypto from 'node:crypto';
import fs from 'node:fs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const NPC_SOURCE_KEY = 'wiki.module.npcinfo';
const EXPECTED_RECORD_COUNT = 762;

function hashBytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(filePath, label) {
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`${label} is unreadable: ${filePath}`, { cause: error });
  }
  try {
    return { value: JSON.parse(bytes.toString('utf8')), bytes };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`, { cause: error });
  }
}

function requirePageIdentity(value, label) {
  const pageId = Number(value?.pageId);
  const revisionTimestamp = String(value?.revisionTimestamp ?? '').trim();
  if (!Number.isSafeInteger(pageId) || pageId <= 0 || !revisionTimestamp) {
    throw new Error(`${label} requires pageId and revisionTimestamp`);
  }
  if (!Number.isFinite(Date.parse(revisionTimestamp))) {
    throw new Error(`${label} revisionTimestamp is invalid`);
  }
  const revisionId = value?.revisionId == null ? null : Number(value.revisionId);
  if (revisionId != null && (!Number.isSafeInteger(revisionId) || revisionId <= 0)) {
    throw new Error(`${label} revisionId is invalid`);
  }
  return Object.freeze({ pageId, revisionId, revisionTimestamp });
}

function assertStableNpcRows(records, label) {
  if (!Array.isArray(records) || records.length !== EXPECTED_RECORD_COUNT) {
    throw new Error(`${label} must contain exactly ${EXPECTED_RECORD_COUNT} records`);
  }
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    const id = Number(record?.id ?? record?.gameId);
    if (!Number.isSafeInteger(id)) throw new Error(`${label} record ${index} has no stable NPC ID`);
    if (ids.has(id)) throw new Error(`${label} has duplicate stable NPC IDs: ${id}`);
    ids.add(id);
    if (!String(record?.internalName ?? '').trim()) {
      throw new Error(`${label} record ${index} has no stable internalName`);
    }
  }
  return ids;
}

export function buildLocalNpcSourceBinding({
  standardizedPath,
  viewMetaPath,
  mapPath,
  wikiManifestRecord,
} = {}) {
  if (wikiManifestRecord?.sourceKey != null && wikiManifestRecord.sourceKey !== NPC_SOURCE_KEY) {
    throw new Error(`NPC local source manifest must bind ${NPC_SOURCE_KEY}`);
  }
  const standardized = readJson(standardizedPath, 'standardized NPC source');
  const metadata = readJson(viewMetaPath, 'NPC standardized-view metadata');
  const map = readJson(mapPath, 'NPC standardized identity map');
  const records = standardized.value?.records;
  const sourceIds = assertStableNpcRows(records, 'standardized NPC source');
  if (metadata.value?.totalRecords !== EXPECTED_RECORD_COUNT) {
    throw new Error(`NPC standardized-view metadata must declare ${EXPECTED_RECORD_COUNT} records`);
  }
  const mapRecords = map.value?.records;
  if (!mapRecords || typeof mapRecords !== 'object' || Object.keys(mapRecords).length !== EXPECTED_RECORD_COUNT) {
    throw new Error(`NPC standardized identity map must contain ${EXPECTED_RECORD_COUNT} records`);
  }
  const mapIds = new Set(Object.keys(mapRecords).map(Number));
  if (mapIds.size !== EXPECTED_RECORD_COUNT || [...sourceIds].some((id) => !mapIds.has(id))) {
    throw new Error('NPC standardized identity map does not match the exact stable source ID set');
  }
  const sourceIdentity = requirePageIdentity(wikiManifestRecord, 'local NPC source manifest');
  const contentHash = hashBytes(standardized.bytes);
  return Object.freeze({
    sourceKey: NPC_SOURCE_KEY,
    mode: 'local',
    recordCount: records.length,
    stableIdCount: EXPECTED_RECORD_COUNT,
    standardizedPath,
    viewMetaPath,
    mapPath,
    standardizedSha256: contentHash,
    viewMetaSha256: hashBytes(metadata.bytes),
    identityMapSha256: hashBytes(map.bytes),
    sourceIdentity,
    sourceManifestContentHash: wikiManifestRecord.contentHash ?? null,
  });
}

export function decideNpcHybridSource({ remoteFingerprint, localBinding, privateCapture = null } = {}) {
  if (!localBinding || localBinding.recordCount !== EXPECTED_RECORD_COUNT) {
    throw new Error('NPC hybrid source requires a complete local source binding');
  }
  const status = String(remoteFingerprint?.status ?? '').trim();
  if (status !== 'ok') {
    throw new Error(`NPC hybrid source decision is fail-closed: ${status || 'probe_unavailable'}`);
  }
  const remote = requirePageIdentity(remoteFingerprint, 'remote NPC fingerprint');
  const local = localBinding.sourceIdentity;
  const revisionMatches = remote.pageId === local.pageId
    && remote.revisionTimestamp === local.revisionTimestamp
    && (remote.revisionId == null || local.revisionId == null || remote.revisionId === local.revisionId);
  if (revisionMatches) {
    return Object.freeze({
      mode: 'local-unchanged',
      sourceKey: NPC_SOURCE_KEY,
      recordCount: EXPECTED_RECORD_COUNT,
      localBinding,
      remoteFingerprint: remote,
    });
  }
  if (!privateCapture || !String(privateCapture.path ?? '').startsWith('.local/tmp/')) {
    throw new Error('changed NPC fingerprint requires a private run capture');
  }
  if (privateCapture.recordCount !== EXPECTED_RECORD_COUNT || !HASH_PATTERN.test(privateCapture.contentHash ?? '')) {
    throw new Error('changed NPC fingerprint requires a validated 762-record private capture');
  }
  return Object.freeze({
    mode: 'wiki-changed',
    sourceKey: NPC_SOURCE_KEY,
    recordCount: EXPECTED_RECORD_COUNT,
    localBinding,
    remoteFingerprint: remote,
    privateCapture: Object.freeze({
      path: privateCapture.path,
      contentHash: privateCapture.contentHash,
      recordCount: privateCapture.recordCount,
    }),
  });
}

export function buildNpcOfflineLocalDecision({ localBinding, failedProbe, authorization } = {}) {
  if (authorization !== 'user-directed-local-offline') {
    throw new Error('offline NPC source requires the explicit user-directed local-offline authorization');
  }
  if (!localBinding || localBinding.sourceKey !== NPC_SOURCE_KEY
      || localBinding.recordCount !== EXPECTED_RECORD_COUNT
      || localBinding.stableIdCount !== EXPECTED_RECORD_COUNT
      || !HASH_PATTERN.test(localBinding.standardizedSha256 ?? '')) {
    throw new Error('offline NPC source requires a complete hash-bound 762-record local source');
  }
  if (failedProbe?.status !== 'probe_unavailable' || failedProbe.actionId !== 'domain-source-npcs'
      || failedProbe.phase !== 'wiki-revision-probe') {
    throw new Error('offline NPC source requires the hash-bound failed NPC Wiki probe artifact');
  }
  if (!String(failedProbe.artifactPath ?? '').startsWith('.local/tmp/')) {
    throw new Error('failed NPC Wiki probe artifact must stay in the private run root');
  }
  if (!HASH_PATTERN.test(failedProbe.artifactSha256 ?? '')) {
    throw new Error('failed NPC Wiki probe artifact hash is invalid');
  }
  const bindingFields = [
    'sourceKey', 'mode', 'recordCount', 'stableIdCount',
    'standardizedSha256', 'sourceIdentity', 'sourceManifestContentHash',
  ];
  const capturedBinding = failedProbe.localBinding;
  const sourceMatchesProbe = capturedBinding
    && capturedBinding.sourceKey === 'wiki.module.npcinfo'
    && capturedBinding.recordCount === EXPECTED_RECORD_COUNT
    && capturedBinding.stableIdCount === EXPECTED_RECORD_COUNT
    && HASH_PATTERN.test(capturedBinding.standardizedSha256 ?? '')
    && bindingFields.every((field) => JSON.stringify(capturedBinding[field]) === JSON.stringify(localBinding[field]));
  if (!sourceMatchesProbe) {
    throw new Error('local NPC source differs from the source captured by the failed Wiki probe');
  }
  return Object.freeze({
    mode: 'local-offline-authorized',
    sourceKey: NPC_SOURCE_KEY,
    recordCount: EXPECTED_RECORD_COUNT,
    localBinding,
    failedProbe: Object.freeze({
      actionId: failedProbe.actionId,
      phase: failedProbe.phase,
      artifactPath: failedProbe.artifactPath,
      artifactSha256: failedProbe.artifactSha256,
      reason: String(failedProbe.reason ?? ''),
      localBinding: Object.freeze(Object.fromEntries(bindingFields.map((field) => [field, capturedBinding[field]]))),
    }),
    authorization,
  });
}

export function assertNpcHybridSourceDecision(decision) {
  if (!['local-unchanged', 'wiki-changed', 'local-offline-authorized'].includes(decision?.mode)) {
    throw new Error('NPC hybrid source decision is not accepted');
  }
  if (decision.recordCount !== EXPECTED_RECORD_COUNT) {
    throw new Error('NPC hybrid source decision record count is not 762');
  }
  if (decision.mode === 'wiki-changed' && !decision.privateCapture) {
    throw new Error('NPC changed-source decision is missing its private capture');
  }
  if (decision.mode === 'local-offline-authorized'
      && (decision.authorization !== 'user-directed-local-offline' || !decision.failedProbe)) {
    throw new Error('NPC offline local decision is missing its explicit authorization evidence');
  }
  return decision;
}

export { EXPECTED_RECORD_COUNT, NPC_SOURCE_KEY };
