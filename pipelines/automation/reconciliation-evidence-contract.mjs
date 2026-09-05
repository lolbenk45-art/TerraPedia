import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DOMAIN_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const RECONCILIATION_EVIDENCE_SCHEMA_VERSION = 1;

/**
 * Build the immutable evidence payload that a completed L1 run must attach to
 * its bundle. The producer accepts hashes of independently generated source,
 * table-readback, and attempt-state artifacts; it never invents those facts.
 */
export function buildFullReconciliationEvidence(input = {}) {
  const payload = normalizeEvidencePayload(input);
  return Object.freeze({
    ...payload,
    fullReconciliation: true,
    evidenceHash: hashEvidencePayload(payload),
  });
}

export function verifyFullReconciliationEvidence(value, expected = {}) {
  const payload = normalizeEvidencePayload(value);
  const expectedFields = {
    domainId: expected.domainId,
    runId: expected.runId,
    policyVersion: expected.policyVersion,
    policyHash: expected.policyHash,
    policySetHash: expected.policySetHash,
  };
  for (const [field, expectedValue] of Object.entries(expectedFields)) {
    if (expectedValue !== undefined && payload[field] !== expectedValue) {
      const label = field === 'policySetHash' ? 'policy-set hash' : field;
      throw new Error(`reconciliation evidence ${label} does not match the bound run`);
    }
  }
  if (expected.sourceDispatchIdentity !== undefined
      && !sameSourceDispatchIdentity(
        payload.sourceDispatchIdentity ?? null,
        normalizeSourceDispatchIdentity(expected.sourceDispatchIdentity),
      )) {
    throw new Error('reconciliation evidence source dispatch identity does not match the bound run');
  }
  const expectedHash = hashEvidencePayload(payload);
  if (value.evidenceHash !== expectedHash) {
    throw new Error('reconciliation evidence hash does not match its payload');
  }
  if (value.fullReconciliation !== true) {
    throw new Error('reconciliation evidence fullReconciliation flag is required');
  }
  return Object.freeze({ ...payload, fullReconciliation: true, evidenceHash: value.evidenceHash });
}

function normalizeEvidencePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reconciliation evidence must be an object');
  }
  if ((value.schemaVersion ?? RECONCILIATION_EVIDENCE_SCHEMA_VERSION)
      !== RECONCILIATION_EVIDENCE_SCHEMA_VERSION) {
    throw new Error('reconciliation evidence schemaVersion is invalid');
  }
  const domainId = String(value.domainId ?? '').trim();
  if (!DOMAIN_PATTERN.test(domainId)) throw new Error('reconciliation evidence domainId is invalid');
  const runId = String(value.runId ?? '').trim();
  if (!runId) throw new Error('reconciliation evidence runId is required');
  const policyVersion = Number(value.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    throw new Error('reconciliation evidence policyVersion is invalid');
  }
  for (const [field, label] of [
    ['policyHash', 'policy hash'],
    ['policySetHash', 'policy-set hash'],
    ['sourceHash', 'source hash'],
    ['ownedTableReadbackHash', 'owned-table readback hash'],
    ['attemptStateHash', 'attempt-state hash'],
  ]) {
    if (!HASH_PATTERN.test(String(value[field] ?? ''))) {
      throw new Error(`reconciliation evidence ${label} is invalid`);
    }
  }
  for (const [field, label] of [
    ['sourceArtifactPath', 'source artifact path'],
    ['ownedTableReadbackPath', 'owned-table readback path'],
    ['attemptStatePath', 'attempt-state path'],
  ]) {
    const normalized = String(value[field] ?? '').replaceAll('\\', '/');
    if (!normalized.startsWith('reports/') || normalized.includes('..')) {
      throw new Error(`reconciliation evidence ${label} is invalid`);
    }
  }
  for (const [field, label] of [
    ['completeSourceCoverage', 'complete source coverage'],
    ['terminalProgress', 'terminal progress'],
    ['changedUnchangedClassified', 'changed/unchanged classification'],
    ['generationReadback', 'generation readback'],
  ]) {
    if (value[field] !== true) throw new Error(`reconciliation evidence ${label} is required`);
  }
  for (const [field, label] of [
    ['unclassifiedMutationCount', 'unclassified mutation count'],
    ['unauthorizedMutationCount', 'unauthorized mutation count'],
    ['activeAttemptCount', 'active attempt count'],
    ['overdueAttemptCount', 'overdue attempt count'],
  ]) {
    if (!Number.isSafeInteger(Number(value[field])) || Number(value[field]) !== 0) {
      throw new Error(`reconciliation evidence ${label} must be zero`);
    }
  }
  const sourceDispatchIdentity = normalizeSourceDispatchIdentity(value.sourceDispatchIdentity);
  return {
    schemaVersion: RECONCILIATION_EVIDENCE_SCHEMA_VERSION,
    domainId,
    runId,
    policyVersion,
    policyHash: value.policyHash,
    policySetHash: value.policySetHash,
    sourceHash: value.sourceHash,
    ownedTableReadbackHash: value.ownedTableReadbackHash,
    attemptStateHash: value.attemptStateHash,
    sourceArtifactPath: String(value.sourceArtifactPath).replaceAll('\\', '/'),
    ownedTableReadbackPath: String(value.ownedTableReadbackPath).replaceAll('\\', '/'),
    attemptStatePath: String(value.attemptStatePath).replaceAll('\\', '/'),
    completeSourceCoverage: true,
    terminalProgress: true,
    changedUnchangedClassified: true,
    unclassifiedMutationCount: 0,
    unauthorizedMutationCount: 0,
    generationReadback: true,
    activeAttemptCount: 0,
    overdueAttemptCount: 0,
    ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
  };
}

function normalizeSourceDispatchIdentity(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reconciliation evidence source dispatch identity is invalid');
  }
  const sourceFingerprint = String(value.sourceFingerprint ?? '').trim();
  const sourceRunIdentity = String(value.sourceRunIdentity ?? '').trim();
  const sourceContentIdentity = String(value.sourceContentIdentity ?? '').trim();
  if (!HASH_PATTERN.test(sourceFingerprint)
      || !Number.isFinite(Date.parse(sourceRunIdentity))
      || !HASH_PATTERN.test(sourceContentIdentity)) {
    throw new Error('reconciliation evidence source dispatch identity is invalid');
  }
  return { sourceFingerprint, sourceRunIdentity, sourceContentIdentity };
}

function sameSourceDispatchIdentity(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return left.sourceFingerprint === right.sourceFingerprint
    && left.sourceRunIdentity === right.sourceRunIdentity
    && left.sourceContentIdentity === right.sourceContentIdentity;
}

function hashEvidencePayload(payload) {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')}`;
}
