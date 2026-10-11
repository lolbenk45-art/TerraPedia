import { createHash } from 'node:crypto';

export const ARMOR_CANONICAL_OPERATION_ID = 'canonical-armor-ingestion';
export const ARMOR_CANONICAL_OPERATION_BINDING_SCHEMA = 'armor-canonical-operation-binding/v1';

const HASH = /^sha256:[0-9a-f]{64}$/;
const LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORMAL_DATABASES = Object.freeze([
  'terria_v1_local',
  'terria_v1_maint',
  'terria_v1_relation',
]);

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
}

function hashValue(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function requireFenceCommit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Number.isSafeInteger(value.generation) || value.generation < 1
      || typeof value.marker !== 'string' || !value.marker.trim()) {
    throw new Error('Armor operation fence commit binding is invalid');
  }
  return Object.freeze({ generation: value.generation, marker: value.marker });
}

function requireIntentIdentity(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new Error('Armor operation packet binding intent is required');
  }
  if (intent.schemaVersion !== 'armor-canonical-full-chain-intent/v1'
      || intent.operationId !== ARMOR_CANONICAL_OPERATION_ID
      || intent.executable !== false
      || intent.executionBlocker !== 'registered-full-chain-executor-required') {
    throw new Error('Armor operation packet binding intent identity is invalid');
  }
  hashValue(intent.fullChainSha256, 'Armor operation packet binding full-chain hash');
  return intent;
}

export function buildArmorCanonicalIntentArtifactBinding({
  resultLabel, intent, intentFileSha256, serverFingerprint, policySetHash,
  runId, fenceToken, fenceCommit,
} = {}) {
  const label = text(resultLabel, 'Armor operation result label');
  if (!LABEL.test(label)) throw new Error('Armor operation result label is invalid');
  const value = requireIntentIdentity(intent);
  const fileHash = hashValue(intentFileSha256, 'Armor operation intent file hash');
  const serverHash = hashValue(serverFingerprint, 'Armor operation server fingerprint');
  const policyHash = hashValue(policySetHash, 'Armor operation policy set');
  const boundRunId = text(runId, 'Armor operation run id');
  const boundFenceToken = text(fenceToken, 'Armor operation fence token');
  const boundFenceCommit = requireFenceCommit(fenceCommit);
  return Object.freeze({
    schemaVersion: ARMOR_CANONICAL_OPERATION_BINDING_SCHEMA,
    operationId: ARMOR_CANONICAL_OPERATION_ID,
    resultLabel: label,
    intentPath: `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.${label}.intent.json`,
    intentFileSha256: fileHash,
    fullChainSha256: value.fullChainSha256,
    serverFingerprint: serverHash,
    policySetHash: policyHash,
    runId: boundRunId,
    fenceToken: boundFenceToken,
    fenceCommit: boundFenceCommit,
  });
}

export function assertArmorCanonicalPacketBinding({ authorizedContext, binding, intent } = {}) {
  if (!authorizedContext || typeof authorizedContext !== 'object' || Array.isArray(authorizedContext)) {
    throw new Error('Armor operation packet binding context is required');
  }
  if (!binding || binding.schemaVersion !== ARMOR_CANONICAL_OPERATION_BINDING_SCHEMA
      || binding.operationId !== ARMOR_CANONICAL_OPERATION_ID) {
    throw new Error('Armor operation packet binding is invalid');
  }
  const value = requireIntentIdentity(intent);
  if (value.fullChainSha256 !== binding.fullChainSha256) {
    throw new Error('Armor operation packet binding full-chain hash drifted');
  }
  if (authorizedContext.serverFingerprint !== binding.serverFingerprint) {
    throw new Error('Armor operation packet binding server fingerprint drifted');
  }
  if (authorizedContext.policySetHash !== binding.policySetHash) {
    throw new Error('Armor operation packet binding policy set drifted');
  }
  if (authorizedContext.runId !== binding.runId
      || authorizedContext.fenceToken !== binding.fenceToken
      || !same(authorizedContext.fenceCommit, binding.fenceCommit)) {
    throw new Error('Armor operation packet binding fence drifted');
  }
  if (authorizedContext.operationId !== ARMOR_CANONICAL_OPERATION_ID) {
    throw new Error('Armor operation packet binding operationId drifted');
  }
  const manifestBinding = authorizedContext.executionManifest?.armorCanonicalIntent;
  if (!same(manifestBinding, binding)
      || authorizedContext.executionManifest?.resultLabel !== binding.resultLabel) {
    throw new Error('Armor operation packet binding manifest drifted');
  }
  if (!Array.isArray(authorizedContext.targetDatabases)
      || JSON.stringify(authorizedContext.targetDatabases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('Armor operation packet binding target databases drifted');
  }
  for (const field of ['serverFingerprint', 'policySetHash', 'dataBundleSha256', 'executionManifestHash']) {
    if (!authorizedContext.requiredTechnicalFields?.includes(field)) {
      throw new Error(`Armor operation packet binding required technical field is missing: ${field}`);
    }
  }
  hashValue(authorizedContext.serverFingerprint, 'Armor operation packet binding server fingerprint');
  hashValue(authorizedContext.policySetHash, 'Armor operation packet binding policy set');
  hashValue(authorizedContext.dataBundleSha256, 'Armor operation packet binding data bundle');
  hashValue(authorizedContext.executionManifestHash, 'Armor operation packet binding execution manifest');
  if (!Array.isArray(authorizedContext.dataBundleEntries)
      || !authorizedContext.dataBundleEntries.some(entry => (
        entry?.path === binding.intentPath && entry?.contentHash === binding.intentFileSha256
      ))) {
    throw new Error('Armor operation packet binding intent entry is missing or drifted');
  }
  return true;
}

export function hashArmorCanonicalIntentBytes(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new Error('Armor operation intent bytes are required');
  }
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export { FORMAL_DATABASES };
