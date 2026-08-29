import { createHash } from 'node:crypto';
import path from 'node:path';

export const ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID = 'canonical-item-source-local-npc-admission';

const ATTEMPT_PREFIX = 'reports/authorization/canonical/canonical-item-source-local-npc-admission/';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity) {
  const identity = requireText(decisionIdentity, 'Item-source admission decision identity');
  const attemptId = createHash('sha256').update(identity, 'utf8').digest('hex');
  const attemptRoot = `${ATTEMPT_PREFIX}${attemptId}`;
  return Object.freeze({
    attemptId,
    attemptRoot,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`,
    packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`,
    resultPath: `${attemptRoot}/result.json`,
  });
}

export function buildItemSourceLocalNpcAdmissionInputContract({
  proposal,
  proposalPath,
  proposalSha256,
  decisionIdentity,
} = {}) {
  assertAuthorizationEligibleProposal(proposal);
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity);
  const input = {
    schemaVersion: 'item-source-local-npc-admission-input-v1',
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    apply: true,
    attemptId: paths.attemptId,
    attemptRoot: paths.attemptRoot,
    proposalPath: requireRelativePath(proposalPath, 'Item-source admission proposal path'),
    proposalSha256: requireHash(proposalSha256, 'Item-source admission proposal SHA-256'),
    proposalScopeHash: requireHash(proposal.scopeHash, 'Item-source admission proposal scope hash'),
    databaseFingerprint: assertDatabaseFingerprint(proposal.databaseFingerprint),
    sourceFreeze: assertSourceFreeze(proposal.sourceFreeze),
    selectedIdentityHash: requireHash(proposal.selectedIdentityHash, 'Item-source admission selected identity hash'),
    tableBeforeFingerprints: assertTableBeforeFingerprints(proposal.tableBeforeFingerprints),
    beforeFingerprint: requireHash(proposal.beforeFingerprint, 'Item-source admission before fingerprint'),
    afterFingerprint: requireHash(proposal.afterFingerprint, 'Item-source admission after fingerprint'),
    expectedChangedRowCount: requirePositiveInteger(proposal.changedRowCount, 'Item-source admission changed row count'),
    expectedAcceptedCount: requirePositiveInteger(proposal.summary?.accepted, 'Item-source admission accepted count'),
    expectedLocalSourceReconciliationCount: requireNonNegativeInteger(
      proposal.summary?.localSourceReconciliation,
      'Item-source admission reconciliation count',
    ),
    proposalAuthorization: {
      decisionIdentity: requireText(decisionIdentity, 'Item-source admission decision identity'),
    },
  };
  return Object.freeze(input);
}

export function assertItemSourceLocalNpcAdmissionInputContract(input) {
  if (!input || input.schemaVersion !== 'item-source-local-npc-admission-input-v1'
      || input.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID || input.apply !== true) {
    throw new Error('Item-source admission input contract identity is invalid');
  }
  const decisionIdentity = requireText(
    input.proposalAuthorization?.decisionIdentity,
    'Item-source admission decision identity',
  );
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity);
  if (input.attemptId !== paths.attemptId || input.attemptRoot !== paths.attemptRoot) {
    throw new Error('Item-source admission input attempt root is not derived from the exact decision identity');
  }
  requireRelativePath(input.proposalPath, 'Item-source admission proposal path');
  requireHash(input.proposalSha256, 'Item-source admission proposal SHA-256');
  requireHash(input.proposalScopeHash, 'Item-source admission proposal scope hash');
  assertDatabaseFingerprint(input.databaseFingerprint);
  assertSourceFreeze(input.sourceFreeze);
  requireHash(input.selectedIdentityHash, 'Item-source admission selected identity hash');
  assertTableBeforeFingerprints(input.tableBeforeFingerprints);
  requireHash(input.beforeFingerprint, 'Item-source admission before fingerprint');
  requireHash(input.afterFingerprint, 'Item-source admission after fingerprint');
  requirePositiveInteger(input.expectedChangedRowCount, 'Item-source admission changed row count');
  requirePositiveInteger(input.expectedAcceptedCount, 'Item-source admission accepted count');
  requireNonNegativeInteger(input.expectedLocalSourceReconciliationCount, 'Item-source admission reconciliation count');
  return input;
}

export function assertAuthorizationEligibleProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== 'item-source-local-npc-admission-proposal-v1'
      || proposal.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID
      || proposal.readOnly !== true || proposal.authorizationAllowed !== true) {
    throw new Error('Item-source admission proposal is not authorization-eligible');
  }
  if (Number(proposal.summary?.accepted) < 1
      || Number(proposal.summary?.blocked) !== 0
      || Number(proposal.summary?.unclassified) !== 0) {
    throw new Error('Item-source admission proposal contains blocked or unclassified rows');
  }
  return proposal;
}

function assertDatabaseFingerprint(value) {
  const fingerprint = value ?? {};
  const host = requireText(fingerprint.host, 'Item-source admission database host');
  const port = Number(fingerprint.port);
  const serverUuid = requireText(fingerprint.serverUuid, 'Item-source admission database server UUID');
  const databases = Array.isArray(fingerprint.databases) ? fingerprint.databases.map((entry) => requireText(entry, 'Item-source admission database name')) : [];
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535
      || JSON.stringify(databases) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Item-source admission database fingerprint is invalid');
  }
  return { host, port, serverUuid, databases };
}

function assertSourceFreeze(value) {
  const partition = value?.partition ?? {};
  const snapshotPairs = Array.isArray(value?.snapshotPairs) ? value.snapshotPairs : null;
  if (snapshotPairs == null || snapshotPairs.length === 0) {
    throw new Error('Item-source admission source freeze requires paired NPC snapshots');
  }
  const normalized = {
    partition: {
      path: requireRelativePath(partition.path, 'Item-source admission partition path'),
      sha256: requireHash(partition.sha256, 'Item-source admission partition SHA-256'),
      scopeHash: requireHash(partition.scopeHash, 'Item-source admission partition scope hash'),
      candidateCount: requirePositiveInteger(partition.candidateCount, 'Item-source admission partition candidate count'),
    },
    snapshotPairs: snapshotPairs.map((pair) => ({
      entityId: requireText(pair?.entityId, 'Item-source admission snapshot entity ID'),
      normalizedPath: requireRelativePath(pair?.normalizedPath, 'Item-source admission normalized snapshot path'),
      normalizedSha256: requireHash(pair?.normalizedSha256, 'Item-source admission normalized snapshot SHA-256'),
      auditPath: requireRelativePath(pair?.auditPath, 'Item-source admission audit path'),
      auditSha256: requireHash(pair?.auditSha256, 'Item-source admission audit SHA-256'),
    })),
  };
  return normalized;
}

function assertTableBeforeFingerprints(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    throw new Error('Item-source admission table before fingerprints are required');
  }
  return Object.fromEntries(Object.entries(value).map(([table, hash]) => [
    requireText(table, 'Item-source admission table name'),
    requireHash(hash, 'Item-source admission table before fingerprint'),
  ]));
}

function requireRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return normalized;
}

function requireHash(value, label) {
  const hash = requireText(value, label);
  if (!HASH_PATTERN.test(hash)) throw new Error(`${label} must be a SHA-256 value`);
  return hash;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

function requireNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
