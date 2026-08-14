import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const FROZEN_SOURCE_ROOT = 'reports/authorization/canonical/';

export const SUPPLEMENTARY_L1_DOMAINS = Object.freeze([
  'audio',
  'bosses',
  'shimmer',
]);

const OPERATION_BY_DOMAIN = Object.freeze({
  audio: 'automation-audio-first-l1',
  bosses: 'automation-bosses-first-l1',
  shimmer: 'automation-shimmer-first-l1',
});

const OWNED_TABLES_BY_DOMAIN = Object.freeze({
  audio: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'audio_assets' }),
    Object.freeze({ databaseRole: 'local', table: 'audio_asset_links' }),
  ]),
  bosses: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'boss_groups' }),
    Object.freeze({ databaseRole: 'local', table: 'npcs' }),
  ]),
  shimmer: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'shimmer_item_transforms' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_decraft_rules' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_entity_transforms' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_npc_transforms' }),
  ]),
});

export function buildSupplementaryL1Bundle(input = {}) {
  const domainId = requireDomain(input.domainId);
  const operationId = requireText(input.operationId, 'operationId');
  if (operationId !== OPERATION_BY_DOMAIN[domainId]) {
    throw new Error(`operationId must match the ${domainId} first L1 operation`);
  }
  const runId = requireText(input.runId, 'runId');
  if (!new RegExp(`^${domainId}_l1_[a-z0-9_]{8,72}$`).test(runId)) {
    throw new Error(`runId must use the bounded ${domainId}_l1 identity`);
  }
  const generatedAt = requireTimestamp(input.generatedAt, 'generatedAt');
  const policy = normalizePolicy(input.policy, domainId);
  const baseline = normalizeBaseline(input.baseline);
  const source = normalizeSource(input.source);
  const ownedTables = normalizeOwnedTables(input.ownedTables);
  assertSupplementaryOwnedTables(domainId, ownedTables);
  const importPlan = cloneObject(input.importPlan, 'importPlan');
  const baselineFingerprint = hashJson(baseline);
  const logicalDiffIdentity = {
    baselineFingerprint,
    ownedTables,
    sourceSha256: source.sha256,
    importPlan,
  };
  const logicalDiffHash = hashJson(logicalDiffIdentity);
  const evidenceHash = hashJson({ source, importPlan });
  const decisionHash = hashJson({
    runId,
    domainId,
    decision: 'REQUIRES_OWNER_L1',
    policySetHash: policy.policySetHash,
    evidenceHash,
    logicalDiffHash,
    baselineFingerprint,
  });
  const body = {
    schemaVersion: 1,
    operationId,
    runId,
    domainId,
    databaseName: 'terria_v1_local',
    generatedAt,
    approvalMode: 'APPROVED_OWNER_L1',
    policy,
    baseline,
    baselineFingerprint,
    source,
    evidenceHash,
    logicalDiffIdentity,
    logicalDiffHash,
    decisionHash,
    ownedTables,
    importPlan,
  };
  return deepFreeze({ ...body, bundleHash: hashJson(body) });
}

export function validateSupplementaryL1Bundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('supplementary L1 bundle must be an object');
  }
  const { bundleHash, ...body } = value;
  requireHash(bundleHash, 'bundleHash');
  if (hashJson(body) !== bundleHash) {
    throw new Error('supplementary L1 bundle hash or content mismatch');
  }
  if (value.schemaVersion !== 1 || value.databaseName !== 'terria_v1_local'
      || value.approvalMode !== 'APPROVED_OWNER_L1') {
    throw new Error('supplementary L1 bundle execution identity is invalid');
  }
  const rebuilt = buildSupplementaryL1Bundle({
    operationId: value.operationId,
    runId: value.runId,
    domainId: value.domainId,
    generatedAt: value.generatedAt,
    policy: value.policy,
    baseline: value.baseline,
    source: value.source,
    ownedTables: value.ownedTables,
    importPlan: value.importPlan,
  });
  if (rebuilt.bundleHash !== bundleHash
      || rebuilt.baselineFingerprint !== value.baselineFingerprint
      || rebuilt.evidenceHash !== value.evidenceHash
      || rebuilt.logicalDiffHash !== value.logicalDiffHash
      || rebuilt.decisionHash !== value.decisionHash) {
    throw new Error('supplementary L1 bundle derived identity is invalid');
  }
  return true;
}

export function assertSupplementaryOwnedTables(domainId, ownedTables) {
  const domain = requireDomain(domainId);
  const normalized = normalizeOwnedTables(ownedTables);
  if (JSON.stringify(normalized) !== JSON.stringify(OWNED_TABLES_BY_DOMAIN[domain])) {
    throw new Error(`supplementary ${domain} owned table set is invalid`);
  }
  return true;
}

function normalizePolicy(policy, domainId) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || policy.domainId !== domainId
      || policy.level !== 'L1'
      || policy.operationalState !== 'ACTIVE') {
    throw new Error('supplementary automation policy must be exact L1/ACTIVE');
  }
  if (!Number.isSafeInteger(policy.policyVersion) || policy.policyVersion < 1) {
    throw new Error('policyVersion must be a positive integer');
  }
  return {
    domainId,
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: policy.policyVersion,
    policyHash: requireHash(policy.policyHash, 'policyHash'),
    policySetHash: requireHash(policy.policySetHash, 'policySetHash'),
  };
}

function normalizeBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('baseline is required');
  }
  const environmentId = requireText(baseline.environmentId, 'baseline.environmentId');
  const mutationGeneration = Number(baseline.mutationGeneration);
  if (!Number.isSafeInteger(mutationGeneration) || mutationGeneration < 0) {
    throw new Error('baseline.mutationGeneration must be a non-negative integer');
  }
  return {
    environmentId,
    mutationGeneration,
    projectionHash: requireHash(baseline.projectionHash, 'baseline.projectionHash'),
  };
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('source is required');
  }
  const sourcePath = requireText(source.path, 'source.path').replaceAll('\\', '/');
  if (!sourcePath.startsWith(FROZEN_SOURCE_ROOT)
      || sourcePath.includes('/../')
      || sourcePath.endsWith('.latest.json')
      || sourcePath.includes('.latest.')) {
    throw new Error('source.path must be a frozen authorization artifact');
  }
  return { path: sourcePath, sha256: requireHash(source.sha256, 'source.sha256') };
}

function normalizeOwnedTables(ownedTables) {
  if (!Array.isArray(ownedTables) || ownedTables.length === 0) {
    throw new Error('ownedTables must be a non-empty array');
  }
  return ownedTables.map((entry) => ({
    databaseRole: requireText(entry?.databaseRole, 'ownedTables.databaseRole'),
    table: requireText(entry?.table, 'ownedTables.table'),
  }));
}

function requireDomain(value) {
  const domain = requireText(value, 'domainId');
  if (!SUPPLEMENTARY_L1_DOMAINS.includes(domain)) {
    throw new Error(`unsupported supplementary L1 domain: ${domain}`);
  }
  return domain;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function cloneObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return JSON.parse(JSON.stringify(value));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
