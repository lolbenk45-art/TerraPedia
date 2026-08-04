import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import {
  isManagedImagePath,
  normalizeManagedImageUrlPrefixes,
} from './managed-image-url-policy.mjs';

export const ITEM_IMAGE_PROJECTION_OPERATION_ID = 'canonical-item-image-projection-apply';
export const ITEM_IMAGE_PROJECTION_CONTRACT_VERSION = 'item-image-projection-apply-v1';
export const ITEM_IMAGE_PROJECTION_ATTEMPT_ROOT_PREFIX =
  'reports/authorization/canonical/item-image-projection-apply';
export const ITEM_IMAGE_PROJECTION_POLICY_PATH =
  'scripts/data/relation/managed-image-url-policy.mjs';

const PROPOSAL_KEYS = Object.freeze([
  'operationId',
  'contractVersion',
  'attemptId',
  'attemptRoot',
  'generatedAt',
  'expiresAt',
  'apply',
  'proposalAuthorization',
  'lineage',
  'target',
  'snapshotPath',
  'snapshotSha256',
  'managedUrlPolicy',
  'managedUrlPrefixes',
  'keys',
  'keySetSha256',
  'relationRows',
  'relationRowsSha256',
  'projectionBeforeRows',
  'projectionBeforeSha256',
  'projectionAfterRows',
  'projectionAfterSha256',
  'targetRowCount',
  'changedRowCount',
]);
const INPUT_KEYS = Object.freeze([...PROPOSAL_KEYS, 'proposalPath', 'proposalSha256']);
const PROPOSAL_AUTHORIZATION_KEYS = Object.freeze([
  'path',
  'sha256',
  'decisionIdentity',
  'authorizationHash',
]);
const LINEAGE_KEYS = Object.freeze([
  'inputContractPath',
  'inputContractSha256',
  'resultPath',
  'resultSha256',
  'bundlePath',
  'bundleSha256',
  'applySnapshotPath',
  'applySnapshotSha256',
  'authorizationPacketPath',
  'authorizationPacketSha256',
  'decisionIdentity',
  'packetHash',
  'dispatchPermitHash',
  'completedRowCount',
]);
const TARGET_KEYS = Object.freeze([
  'host',
  'port',
  'serverUuid',
  'databases',
  'ownedDatabase',
  'ownedTable',
  'ownedColumn',
  'fingerprintSha256',
]);
const MANAGED_POLICY_KEYS = Object.freeze([
  'sourcePath',
  'sourceSha256',
  'resolvedPrefixesSha256',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'snapshotKind',
  'operationId',
  'contractVersion',
  'generatedAt',
  'target',
  'managedUrlPolicy',
  'managedUrlPrefixes',
  'keys',
  'keySetSha256',
  'relationRows',
  'relationRowsSha256',
  'projectionBeforeRows',
  'projectionBeforeSha256',
  'targetRowCount',
]);
const RESULT_KEYS = Object.freeze([
  'resultKind',
  'operationId',
  'contractVersion',
  'status',
  'apply',
  'inputContractPath',
  'inputContractSha256',
  'proposalPath',
  'proposalSha256',
  'snapshotPath',
  'snapshotSha256',
  'proposalAuthorization',
  'managedUrlPolicy',
  'lineage',
  'target',
  'keySetSha256',
  'relationRowsSha256',
  'projectionBeforeSha256',
  'projectionAfterSha256',
  'targetRowCount',
  'changedRowCount',
  'completedAt',
]);
const FAILED_RESULT_KEYS = Object.freeze([
  ...RESULT_KEYS.filter((key) => key !== 'completedAt'),
  'startedAt',
  'failedAt',
  'transaction',
  'error',
]);

export function canonicalItemImageProjectionHash(value) {
  const bytes = JSON.stringify(stableValue(value));
  return sha256Bytes(bytes);
}

export function deriveItemImageProjectionAttemptId(decisionIdentity) {
  const identity = requireText(decisionIdentity, 'decisionIdentity');
  return createHash('sha256').update(identity, 'utf8').digest('hex');
}

export function deriveItemImageProjectionAttemptRoot(decisionIdentity) {
  return `${ITEM_IMAGE_PROJECTION_ATTEMPT_ROOT_PREFIX}/${deriveItemImageProjectionAttemptId(decisionIdentity)}`;
}

export function buildItemImageProjectionAttemptPaths(decisionIdentity) {
  const attemptRoot = deriveItemImageProjectionAttemptRoot(decisionIdentity);
  return Object.freeze({
    attemptId: deriveItemImageProjectionAttemptId(decisionIdentity),
    attemptRoot,
    proposalReadOwnerInputPath: `${attemptRoot}/proposal-read.owner-input.json`,
    snapshotPath: `${attemptRoot}/snapshot.json`,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`,
    packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`,
    resultPath: `${attemptRoot}/result.json`,
  });
}

export function recomputeItemImageProjectionPacketHash(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('authorization packet must be an object');
  }
  const { packetHash: _packetHash, ...payload } = packet;
  return canonicalItemImageProjectionHash(payload);
}

export function assertItemImageProjectionAuthorizationPacket(packet) {
  const packetHash = requireSha256(packet?.packetHash, 'authorization packet packetHash');
  if (recomputeItemImageProjectionPacketHash(packet) !== packetHash) {
    throw new Error('authorization packet content hash drifted');
  }
  return packet;
}

export function buildItemImageProjectionProposal({
  attemptId,
  attemptRoot,
  generatedAt,
  expiresAt,
  proposalAuthorization,
  lineage,
  lineageKeys,
  target,
  snapshotPath,
  snapshotSha256,
  managedUrlPolicy,
  managedUrlPrefixes,
  relationRows,
  projectionRows,
} = {}) {
  const normalizedProposalAuthorization = normalizeProposalAuthorization(proposalAuthorization);
  const resolvedAttemptId = attemptId == null
    ? deriveItemImageProjectionAttemptId(normalizedProposalAuthorization.decisionIdentity)
    : requireAttemptId(attemptId);
  const resolvedAttemptRoot = attemptRoot == null
    ? deriveItemImageProjectionAttemptRoot(normalizedProposalAuthorization.decisionIdentity)
    : requireRelativePath(attemptRoot, 'attemptRoot');
  assertAttemptBinding({
    attemptId: resolvedAttemptId,
    attemptRoot: resolvedAttemptRoot,
    decisionIdentity: normalizedProposalAuthorization.decisionIdentity,
  });
  assertAttemptPath(
    normalizedProposalAuthorization.path,
    resolvedAttemptRoot,
    'proposalAuthorization.path',
    'proposal-read.owner-input.json',
  );
  const snapshot = buildItemImageProjectionSnapshot({
    attemptId: resolvedAttemptId,
    attemptRoot: resolvedAttemptRoot,
    generatedAt,
    target,
    managedUrlPolicy,
    managedUrlPrefixes,
    lineageKeys,
    relationRows,
    projectionRows,
  });
  const keys = snapshot.keys;
  const normalizedPrefixes = snapshot.managedUrlPrefixes;
  const normalizedLineage = normalizeLineage(lineage);
  if (normalizedLineage.completedRowCount !== keys.length) {
    throw new Error('lineage completed row count must match the exact key set');
  }
  const normalizedRelationRows = snapshot.relationRows;
  const normalizedProjectionRows = snapshot.projectionBeforeRows;

  const relationByKey = new Map(normalizedRelationRows.map((row) => [row.internalName, row]));
  const projectionAfterRows = normalizedProjectionRows.map((row) => ({
    id: row.id,
    relationRecordKey: row.relationRecordKey,
    internalName: row.internalName,
    image: relationByKey.get(row.internalName).cachedUrl,
  }));
  const proposal = {
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_CONTRACT_VERSION,
    attemptId: resolvedAttemptId,
    attemptRoot: resolvedAttemptRoot,
    generatedAt: snapshot.generatedAt,
    expiresAt: requireTimestamp(expiresAt, 'expiresAt'),
    apply: false,
    proposalAuthorization: normalizedProposalAuthorization,
    lineage: normalizedLineage,
    target: snapshot.target,
    snapshotPath: requireRelativePath(snapshotPath, 'snapshotPath'),
    snapshotSha256: requireSha256(snapshotSha256, 'snapshotSha256'),
    managedUrlPolicy: snapshot.managedUrlPolicy,
    managedUrlPrefixes: normalizedPrefixes.sort(),
    keys,
    keySetSha256: canonicalItemImageProjectionHash(keys),
    relationRows: normalizedRelationRows,
    relationRowsSha256: canonicalItemImageProjectionHash(normalizedRelationRows),
    projectionBeforeRows: normalizedProjectionRows,
    projectionBeforeSha256: canonicalItemImageProjectionHash(normalizedProjectionRows),
    projectionAfterRows,
    projectionAfterSha256: canonicalItemImageProjectionHash(projectionAfterRows),
    targetRowCount: keys.length,
    changedRowCount: projectionAfterRows.filter((row, index) => (
      row.image !== normalizedProjectionRows[index].image
    )).length,
  };
  assertItemImageProjectionProposal(proposal);
  return freezeDeep(proposal);
}

export function buildItemImageProjectionSnapshot({
  attemptId,
  attemptRoot,
  generatedAt,
  target,
  managedUrlPolicy,
  managedUrlPrefixes,
  lineageKeys,
  relationRows,
  projectionRows,
} = {}) {
  const keys = sortedUniqueText(lineageKeys, 'lineage keys');
  if (keys.length === 0) throw new Error('lineage keys must not be empty');
  const normalizedPrefixes = normalizeManagedImageUrlPrefixes(managedUrlPrefixes).sort();
  if (normalizedPrefixes.length === 0) throw new Error('managed item image URL prefixes are required');
  const normalizedPolicy = normalizeManagedUrlPolicy(managedUrlPolicy, normalizedPrefixes);
  const normalizedRelationRows = normalizeRelationRows(relationRows, normalizedPrefixes);
  const normalizedProjectionRows = normalizeProjectionRows(projectionRows);
  assertExactKeySet(normalizedRelationRows, keys, 'relation');
  assertExactKeySet(normalizedProjectionRows, keys, 'projection');
  const snapshot = {
    snapshotKind: 'canonical_item_image_projection_snapshot',
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_CONTRACT_VERSION,
    generatedAt: requireTimestamp(generatedAt, 'generatedAt'),
    target: normalizeTarget(target),
    managedUrlPolicy: normalizedPolicy,
    managedUrlPrefixes: normalizedPrefixes,
    keys,
    keySetSha256: canonicalItemImageProjectionHash(keys),
    relationRows: normalizedRelationRows,
    relationRowsSha256: canonicalItemImageProjectionHash(normalizedRelationRows),
    projectionBeforeRows: normalizedProjectionRows,
    projectionBeforeSha256: canonicalItemImageProjectionHash(normalizedProjectionRows),
    targetRowCount: keys.length,
  };
  assertItemImageProjectionSnapshot(snapshot);
  return freezeDeep(snapshot);
}

export function assertItemImageProjectionSnapshot(snapshot) {
  assertExactKeys(snapshot, SNAPSHOT_KEYS, 'projection snapshot');
  if (snapshot.snapshotKind !== 'canonical_item_image_projection_snapshot') {
    throw new Error('projection snapshot kind drifted');
  }
  if (snapshot.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID
      || snapshot.contractVersion !== ITEM_IMAGE_PROJECTION_CONTRACT_VERSION) {
    throw new Error('projection snapshot operation contract drifted');
  }
  requireTimestamp(snapshot.generatedAt, 'snapshot generatedAt');
  normalizeTarget(snapshot.target);
  const prefixes = normalizeManagedImageUrlPrefixes(snapshot.managedUrlPrefixes).sort();
  normalizeManagedUrlPolicy(snapshot.managedUrlPolicy, prefixes);
  const keys = sortedUniqueText(snapshot.keys, 'snapshot keys');
  if (snapshot.keySetSha256 !== canonicalItemImageProjectionHash(keys)) {
    throw new Error('projection snapshot key set hash drifted');
  }
  if (snapshot.relationRowsSha256 !== canonicalItemImageProjectionHash(snapshot.relationRows)) {
    throw new Error('projection snapshot relation rows hash drifted');
  }
  if (snapshot.projectionBeforeSha256 !== canonicalItemImageProjectionHash(snapshot.projectionBeforeRows)) {
    throw new Error('projection snapshot before rows hash drifted');
  }
  assertExactKeySet(snapshot.relationRows, keys, 'snapshot relation');
  assertExactKeySet(snapshot.projectionBeforeRows, keys, 'snapshot projection');
  assertProjectionRelationBindings(snapshot.relationRows, snapshot.projectionBeforeRows);
  if (snapshot.targetRowCount !== keys.length) throw new Error('projection snapshot target count drifted');
  return snapshot;
}

export function buildItemImageProjectionInputContract({
  proposal,
  proposalPath,
  proposalSha256,
} = {}) {
  assertItemImageProjectionProposal(proposal);
  const inputContract = {
    ...proposal,
    apply: true,
    proposalPath: requireRelativePath(proposalPath, 'proposalPath'),
    proposalSha256: requireSha256(proposalSha256, 'proposalSha256'),
  };
  assertItemImageProjectionInputContract(inputContract);
  return freezeDeep(inputContract);
}

export function assertItemImageProjectionProposal(proposal) {
  assertExactKeys(proposal, PROPOSAL_KEYS, 'projection proposal');
  assertCommonContract(proposal, false);
  return proposal;
}

export function assertItemImageProjectionInputContract(inputContract) {
  assertExactKeys(inputContract, INPUT_KEYS, 'projection input contract');
  assertCommonContract(inputContract, true);
  requireRelativePath(inputContract.proposalPath, 'proposalPath');
  assertAttemptPath(inputContract.proposalPath, inputContract.attemptRoot, 'proposalPath', 'proposal.json');
  requireSha256(inputContract.proposalSha256, 'proposalSha256');
  return inputContract;
}

export function buildItemImageProjectionCompletedResult({
  inputContract,
  inputContractPath,
  inputContractSha256,
  completedAt,
} = {}) {
  assertItemImageProjectionInputContract(inputContract);
  const result = {
    resultKind: 'canonical_item_image_projection_apply_result',
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_CONTRACT_VERSION,
    status: 'completed',
    apply: true,
    inputContractPath: requireRelativePath(inputContractPath, 'inputContractPath'),
    inputContractSha256: requireSha256(inputContractSha256, 'inputContractSha256'),
    proposalPath: inputContract.proposalPath,
    proposalSha256: inputContract.proposalSha256,
    snapshotPath: inputContract.snapshotPath,
    snapshotSha256: inputContract.snapshotSha256,
    proposalAuthorization: inputContract.proposalAuthorization,
    managedUrlPolicy: inputContract.managedUrlPolicy,
    lineage: inputContract.lineage,
    target: inputContract.target,
    keySetSha256: inputContract.keySetSha256,
    relationRowsSha256: inputContract.relationRowsSha256,
    projectionBeforeSha256: inputContract.projectionBeforeSha256,
    projectionAfterSha256: inputContract.projectionAfterSha256,
    targetRowCount: inputContract.targetRowCount,
    changedRowCount: inputContract.changedRowCount,
    completedAt: requireTimestamp(completedAt, 'completedAt'),
  };
  assertItemImageProjectionCompletedResult({ result, inputContract });
  return freezeDeep(result);
}

export function assertItemImageProjectionCompletedResult({ result, inputContract } = {}) {
  assertItemImageProjectionInputContract(inputContract);
  assertExactKeys(result, RESULT_KEYS, 'projection completed result');
  if (result.resultKind !== 'canonical_item_image_projection_apply_result') {
    throw new Error('projection completed result kind drifted');
  }
  if (result.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID) {
    throw new Error('projection completed result operationId drifted');
  }
  if (result.contractVersion !== ITEM_IMAGE_PROJECTION_CONTRACT_VERSION) {
    throw new Error('projection completed result contract version drifted');
  }
  if (result.status !== 'completed') throw new Error('projection result status must be completed');
  if (result.apply !== true) throw new Error('projection result apply must be true');
  requireRelativePath(result.inputContractPath, 'inputContractPath');
  assertAttemptPath(result.inputContractPath, inputContract.attemptRoot, 'inputContractPath', 'input.json');
  requireSha256(result.inputContractSha256, 'inputContractSha256');
  requireTimestamp(result.completedAt, 'completedAt');

  for (const key of [
    'proposalPath',
    'proposalSha256',
    'snapshotPath',
    'snapshotSha256',
    'keySetSha256',
    'relationRowsSha256',
    'projectionBeforeSha256',
    'projectionAfterSha256',
  ]) {
    if (result[key] !== inputContract[key]) {
      throw new Error(`projection completed result ${key} drifted`);
    }
  }
  if (Number(result.targetRowCount) !== inputContract.targetRowCount) {
    throw new Error('projection completed result target row count drifted');
  }
  if (Number(result.changedRowCount) !== inputContract.changedRowCount) {
    throw new Error('projection completed result changed row count drifted');
  }
  if (canonicalItemImageProjectionHash(result.lineage)
      !== canonicalItemImageProjectionHash(inputContract.lineage)) {
    throw new Error('projection completed result lineage drifted');
  }
  if (canonicalItemImageProjectionHash(result.target)
      !== canonicalItemImageProjectionHash(inputContract.target)) {
    throw new Error('projection completed result target drifted');
  }
  if (canonicalItemImageProjectionHash(result.managedUrlPolicy)
      !== canonicalItemImageProjectionHash(inputContract.managedUrlPolicy)) {
    throw new Error('projection completed result managed URL policy drifted');
  }
  if (canonicalItemImageProjectionHash(result.proposalAuthorization)
      !== canonicalItemImageProjectionHash(inputContract.proposalAuthorization)) {
    throw new Error('projection completed result proposal authorization drifted');
  }
  return result;
}

export function buildItemImageProjectionFailedResult({
  inputContract,
  inputContractPath,
  inputContractSha256,
  startedAt,
  failedAt,
  transaction,
  error,
} = {}) {
  assertItemImageProjectionInputContract(inputContract);
  const base = buildCommonResultBinding({
    inputContract,
    inputContractPath,
    inputContractSha256,
  });
  const result = {
    ...base,
    status: 'failed',
    startedAt: requireTimestamp(startedAt, 'startedAt'),
    failedAt: requireTimestamp(failedAt, 'failedAt'),
    transaction: normalizeFailedTransaction(transaction),
    error: normalizeFailedError(error),
  };
  assertItemImageProjectionFailedResult({ result, inputContract });
  return freezeDeep(result);
}

export function assertItemImageProjectionFailedResult({ result, inputContract } = {}) {
  assertItemImageProjectionInputContract(inputContract);
  assertExactKeys(result, FAILED_RESULT_KEYS, 'projection failed result');
  if (result.resultKind !== 'canonical_item_image_projection_apply_result'
      || result.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID
      || result.contractVersion !== ITEM_IMAGE_PROJECTION_CONTRACT_VERSION) {
    throw new Error('projection failed result operation contract drifted');
  }
  if (result.status !== 'failed') throw new Error('projection failed result status must be failed');
  if (result.apply !== true) throw new Error('projection failed result apply must be true');
  requireRelativePath(result.inputContractPath, 'inputContractPath');
  assertAttemptPath(result.inputContractPath, inputContract.attemptRoot, 'inputContractPath', 'input.json');
  requireSha256(result.inputContractSha256, 'inputContractSha256');
  requireTimestamp(result.startedAt, 'startedAt');
  requireTimestamp(result.failedAt, 'failedAt');
  normalizeFailedTransaction(result.transaction);
  normalizeFailedError(result.error);
  assertCommonResultMatchesInput(result, inputContract, 'failed');
  return result;
}

export function readItemImageProjectionInputContract({
  repoRoot,
  inputContractPath,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const absolutePath = path.resolve(root, requireRelativePath(inputContractPath, 'inputContractPath'));
  assertRepositoryOrdinaryFile({ repoRoot: root, filePath: absolutePath, label: 'projection input contract' });
  assertPrivateMode(absolutePath, 'projection input contract');
  const contract = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  assertItemImageProjectionInputContract(contract);
  const currentTime = Date.parse(requireTimestamp(now, 'now'));
  if (currentTime < Date.parse(contract.generatedAt)) {
    throw new Error('projection input contract is not yet valid');
  }
  if (Date.parse(contract.expiresAt) <= currentTime) {
    throw new Error('projection input contract is expired');
  }
  return contract;
}

export function readItemImageProjectionSnapshot({
  repoRoot,
  snapshotPath,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const absolutePath = path.resolve(root, requireRelativePath(snapshotPath, 'snapshotPath'));
  assertRepositoryOrdinaryFile({ repoRoot: root, filePath: absolutePath, label: 'projection snapshot' });
  assertPrivateMode(absolutePath, 'projection snapshot');
  const snapshot = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  assertItemImageProjectionSnapshot(snapshot);
  return snapshot;
}

export function writeItemImageProjectionPrivateJson({
  repoRoot,
  outputPath,
  value,
  label = 'projection evidence',
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const relativePath = requireRelativePath(outputPath, 'outputPath');
  const absolutePath = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label,
    createParent: true,
  });
  if (fs.existsSync(absolutePath)) throw new Error(`${label} already exists; overwrite is forbidden`);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.linkSync(temporaryPath, absolutePath);
    fs.unlinkSync(temporaryPath);
    fs.chmodSync(absolutePath, 0o600);
    return {
      relativePath,
      absolutePath,
      sha256: sha256Bytes(bytes),
    };
  } catch (error) {
    if (descriptor != null) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
    if (error?.code === 'EEXIST') {
      throw new Error(`${label} already exists; overwrite is forbidden`);
    }
    throw error;
  }
}

function assertCommonContract(contract, expectedApply) {
  if (contract.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID) {
    throw new Error(`operationId must be ${ITEM_IMAGE_PROJECTION_OPERATION_ID}`);
  }
  if (contract.contractVersion !== ITEM_IMAGE_PROJECTION_CONTRACT_VERSION) {
    throw new Error(`contractVersion must be ${ITEM_IMAGE_PROJECTION_CONTRACT_VERSION}`);
  }
  const attemptId = requireAttemptId(contract.attemptId);
  const attemptRoot = requireRelativePath(contract.attemptRoot, 'attemptRoot');
  if (attemptRoot !== `${ITEM_IMAGE_PROJECTION_ATTEMPT_ROOT_PREFIX}/${attemptId}`) {
    throw new Error('attemptRoot must be derived from attemptId');
  }
  assertAttemptBinding({
    attemptId,
    attemptRoot,
    decisionIdentity: contract.proposalAuthorization?.decisionIdentity,
  });
  const proposalAuthorization = normalizeProposalAuthorization(contract.proposalAuthorization);
  assertAttemptPath(
    proposalAuthorization.path,
    attemptRoot,
    'proposalAuthorization.path',
    'proposal-read.owner-input.json',
  );
  requireTimestamp(contract.generatedAt, 'generatedAt');
  requireTimestamp(contract.expiresAt, 'expiresAt');
  if (Date.parse(contract.expiresAt) <= Date.parse(contract.generatedAt)) {
    throw new Error('expiresAt must be after generatedAt');
  }
  if (contract.apply !== expectedApply) throw new Error(`apply must be ${expectedApply}`);
  normalizeLineage(contract.lineage);
  const target = normalizeTarget(contract.target);
  if (target.fingerprintSha256 !== contract.target.fingerprintSha256) {
    throw new Error('target fingerprint hash drifted');
  }
  requireRelativePath(contract.snapshotPath, 'snapshotPath');
  assertAttemptPath(contract.snapshotPath, attemptRoot, 'snapshotPath', 'snapshot.json');
  requireSha256(contract.snapshotSha256, 'snapshotSha256');
  const prefixes = normalizeManagedImageUrlPrefixes(contract.managedUrlPrefixes).sort();
  if (prefixes.length === 0 || canonicalItemImageProjectionHash(prefixes)
      !== canonicalItemImageProjectionHash(contract.managedUrlPrefixes)) {
    throw new Error('managed URL prefixes must be canonical');
  }
  normalizeManagedUrlPolicy(contract.managedUrlPolicy, prefixes);
  const keys = sortedUniqueText(contract.keys, 'keys');
  if (canonicalItemImageProjectionHash(keys) !== canonicalItemImageProjectionHash(contract.keys)) {
    throw new Error('keys must be sorted and unique');
  }
  if (contract.keySetSha256 !== canonicalItemImageProjectionHash(keys)) {
    throw new Error('key set hash drifted');
  }
  if (!Array.isArray(contract.relationRows) || !Array.isArray(contract.projectionBeforeRows)
      || !Array.isArray(contract.projectionAfterRows)) {
    throw new Error('projection contract row arrays are required');
  }
  if (contract.relationRowsSha256 !== canonicalItemImageProjectionHash(contract.relationRows)) {
    throw new Error('relation rows hash drifted');
  }
  if (contract.projectionBeforeSha256 !== canonicalItemImageProjectionHash(contract.projectionBeforeRows)) {
    throw new Error('projection before hash drifted');
  }
  if (contract.projectionAfterSha256 !== canonicalItemImageProjectionHash(contract.projectionAfterRows)) {
    throw new Error('projection after hash drifted');
  }
  assertExactKeySet(contract.relationRows, keys, 'relation');
  assertExactKeySet(contract.projectionBeforeRows, keys, 'projection before');
  assertExactKeySet(contract.projectionAfterRows, keys, 'projection after');
  const relationByName = new Map(contract.relationRows.map((row) => [row.internalName, row]));
  for (const row of contract.relationRows) {
    assertExactKeys(row, ['recordKey', 'internalName', 'cachedUrl'], 'relation row');
    if (!isManagedImagePath(row.cachedUrl, prefixes)) throw new Error('relation cached URL must be managed');
  }
  for (const row of [...contract.projectionBeforeRows, ...contract.projectionAfterRows]) {
    assertExactKeys(row, ['id', 'relationRecordKey', 'internalName', 'image'], 'projection row');
    if (row.relationRecordKey !== relationByName.get(row.internalName)?.recordKey) {
      throw new Error(`projection relationRecordKey must match relation recordKey for ${row.internalName}`);
    }
  }
  if (!Number.isInteger(contract.targetRowCount) || contract.targetRowCount !== keys.length) {
    throw new Error('target row count must match keys');
  }
  const changed = contract.projectionAfterRows.filter((row, index) => (
    row.image !== contract.projectionBeforeRows[index]?.image
  )).length;
  if (!Number.isInteger(contract.changedRowCount) || contract.changedRowCount !== changed) {
    throw new Error('changed row count drifted');
  }
}

function buildCommonResultBinding({ inputContract, inputContractPath, inputContractSha256 }) {
  return {
    resultKind: 'canonical_item_image_projection_apply_result',
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_CONTRACT_VERSION,
    status: 'completed',
    apply: true,
    inputContractPath: requireRelativePath(inputContractPath, 'inputContractPath'),
    inputContractSha256: requireSha256(inputContractSha256, 'inputContractSha256'),
    proposalPath: inputContract.proposalPath,
    proposalSha256: inputContract.proposalSha256,
    snapshotPath: inputContract.snapshotPath,
    snapshotSha256: inputContract.snapshotSha256,
    proposalAuthorization: inputContract.proposalAuthorization,
    managedUrlPolicy: inputContract.managedUrlPolicy,
    lineage: inputContract.lineage,
    target: inputContract.target,
    keySetSha256: inputContract.keySetSha256,
    relationRowsSha256: inputContract.relationRowsSha256,
    projectionBeforeSha256: inputContract.projectionBeforeSha256,
    projectionAfterSha256: inputContract.projectionAfterSha256,
    targetRowCount: inputContract.targetRowCount,
    changedRowCount: inputContract.changedRowCount,
  };
}

function assertCommonResultMatchesInput(result, inputContract, label) {
  for (const key of [
    'proposalPath',
    'proposalSha256',
    'snapshotPath',
    'snapshotSha256',
    'keySetSha256',
    'relationRowsSha256',
    'projectionBeforeSha256',
    'projectionAfterSha256',
  ]) {
    if (result[key] !== inputContract[key]) {
      throw new Error(`projection ${label} result ${key} drifted`);
    }
  }
  if (Number(result.targetRowCount) !== inputContract.targetRowCount
      || Number(result.changedRowCount) !== inputContract.changedRowCount) {
    throw new Error(`projection ${label} result row counts drifted`);
  }
  for (const key of ['proposalAuthorization', 'lineage', 'target', 'managedUrlPolicy']) {
    if (canonicalItemImageProjectionHash(result[key])
        !== canonicalItemImageProjectionHash(inputContract[key])) {
      throw new Error(`projection ${label} result ${key} drifted`);
    }
  }
}

function normalizeFailedTransaction(transaction) {
  assertExactKeys(
    transaction,
    ['began', 'rolledBack', 'permitConsumed', 'dmlAttempted'],
    'projection failed transaction',
  );
  const normalized = Object.fromEntries(Object.entries(transaction).map(([key, value]) => {
    if (typeof value !== 'boolean') throw new Error(`projection failed transaction ${key} must be boolean`);
    return [key, value];
  }));
  if (normalized.began && !normalized.rolledBack) {
    throw new Error('projection failed transaction must record rollback after begin');
  }
  if (normalized.dmlAttempted && !normalized.permitConsumed) {
    throw new Error('projection failed transaction cannot attempt DML before permit consumption');
  }
  return normalized;
}

function normalizeFailedError(error) {
  assertExactKeys(error, ['name', 'message'], 'projection failed error');
  return {
    name: requireText(error.name, 'projection failed error name'),
    message: requireText(error.message, 'projection failed error message'),
  };
}

function normalizeLineage(lineage) {
  assertExactKeys(lineage, LINEAGE_KEYS, 'lineage binding');
  return {
    inputContractPath: requireRelativePath(lineage.inputContractPath, 'lineage inputContractPath'),
    inputContractSha256: requireSha256(lineage.inputContractSha256, 'lineage inputContractSha256'),
    resultPath: requireRelativePath(lineage.resultPath, 'lineage resultPath'),
    resultSha256: requireSha256(lineage.resultSha256, 'lineage resultSha256'),
    bundlePath: requireRelativePath(lineage.bundlePath, 'lineage bundlePath'),
    bundleSha256: requireSha256(lineage.bundleSha256, 'lineage bundleSha256'),
    applySnapshotPath: requireRelativePath(lineage.applySnapshotPath, 'lineage applySnapshotPath'),
    applySnapshotSha256: requireSha256(lineage.applySnapshotSha256, 'lineage applySnapshotSha256'),
    authorizationPacketPath: requireRelativePath(
      lineage.authorizationPacketPath,
      'lineage authorizationPacketPath',
    ),
    authorizationPacketSha256: requireSha256(
      lineage.authorizationPacketSha256,
      'lineage authorizationPacketSha256',
    ),
    decisionIdentity: requireText(lineage.decisionIdentity, 'lineage decisionIdentity'),
    packetHash: requireSha256(lineage.packetHash, 'lineage packetHash'),
    dispatchPermitHash: requireSha256(lineage.dispatchPermitHash, 'lineage dispatchPermitHash'),
    completedRowCount: requirePositiveInteger(lineage.completedRowCount, 'lineage completedRowCount'),
  };
}

function normalizeProposalAuthorization(value) {
  assertExactKeys(value, PROPOSAL_AUTHORIZATION_KEYS, 'proposal authorization binding');
  return {
    path: requireRelativePath(value.path, 'proposal authorization path'),
    sha256: requireSha256(value.sha256, 'proposal authorization sha256'),
    decisionIdentity: requireText(value.decisionIdentity, 'proposal authorization decisionIdentity'),
    authorizationHash: requireSha256(
      value.authorizationHash,
      'proposal authorization authorizationHash',
    ),
  };
}

function normalizeTarget(target) {
  const rawKeys = Object.keys(target ?? {}).sort();
  const allowedWithoutHash = [
    'databases',
    'host',
    'ownedColumn',
    'ownedDatabase',
    'ownedTable',
    'port',
    'serverUuid',
  ];
  const allowedWithHash = [...TARGET_KEYS].sort();
  if (canonicalItemImageProjectionHash(rawKeys) !== canonicalItemImageProjectionHash(allowedWithoutHash)
      && canonicalItemImageProjectionHash(rawKeys) !== canonicalItemImageProjectionHash(allowedWithHash)) {
    throw new Error('target has unexpected keys');
  }
  assertExactKeys(target?.databases, ['local', 'maint', 'relation'], 'target databases');
  const base = {
    host: requireText(target.host, 'target host'),
    port: requirePositiveInteger(target.port, 'target port'),
    serverUuid: requireText(target.serverUuid, 'target serverUuid'),
    databases: {
      local: requireIdentifier(target.databases.local, 'local database'),
      maint: requireIdentifier(target.databases.maint, 'maint database'),
      relation: requireIdentifier(target.databases.relation, 'relation database'),
    },
    ownedDatabase: requireIdentifier(target.ownedDatabase, 'owned database'),
    ownedTable: requireIdentifier(target.ownedTable, 'owned table'),
    ownedColumn: requireIdentifier(target.ownedColumn, 'owned column'),
  };
  if (base.databases.local !== 'terria_v1_local'
      || base.databases.maint !== 'terria_v1_maint'
      || base.databases.relation !== 'terria_v1_relation') {
    throw new Error('target must use the formal terria_v1 database triplet');
  }
  if (base.ownedDatabase !== base.databases.relation
      || base.ownedTable !== 'projection_items'
      || base.ownedColumn !== 'image') {
    throw new Error('target ownership must be relation projection_items.image');
  }
  const fingerprintSha256 = canonicalItemImageProjectionHash(base);
  if (target.fingerprintSha256 && target.fingerprintSha256 !== fingerprintSha256) {
    throw new Error('target fingerprint hash drifted');
  }
  return { ...base, fingerprintSha256 };
}

function normalizeManagedUrlPolicy(policy, prefixes) {
  assertExactKeys(policy, MANAGED_POLICY_KEYS, 'managed URL policy');
  const normalized = {
    sourcePath: requireRelativePath(policy.sourcePath, 'managed policy sourcePath'),
    sourceSha256: requireSha256(policy.sourceSha256, 'managed policy sourceSha256'),
    resolvedPrefixesSha256: requireSha256(
      policy.resolvedPrefixesSha256,
      'managed policy resolvedPrefixesSha256',
    ),
  };
  if (normalized.sourcePath !== ITEM_IMAGE_PROJECTION_POLICY_PATH) {
    throw new Error('managed URL policy source path drifted');
  }
  if (normalized.resolvedPrefixesSha256 !== canonicalItemImageProjectionHash(prefixes)) {
    throw new Error('managed URL policy resolved prefixes hash drifted');
  }
  return normalized;
}

function normalizeRelationRows(rows, prefixes) {
  if (!Array.isArray(rows)) throw new Error('relation rows must be an array');
  const seen = new Set();
  const seenRecordKeys = new Set();
  return rows.map((row) => {
    if (Number(row?.status) !== 1 || Number(row?.deleted) !== 0) {
      throw new Error('active relation image rows are required');
    }
    if (requireText(row?.role, 'relation role') !== 'icon' || Number(row?.isPrimary) !== 1) {
      throw new Error('relation image row must be the primary icon');
    }
    const internalName = requireText(row?.internalName, 'relation internalName');
    if (seen.has(internalName)) throw new Error(`duplicate primary relation image for ${internalName}`);
    seen.add(internalName);
    const cachedUrl = requireText(row?.cachedUrl, 'relation cachedUrl');
    if (!isManagedImagePath(cachedUrl, prefixes)) {
      throw new Error(`relation cachedUrl must be managed for ${internalName}`);
    }
    const recordKey = requireText(row?.recordKey, 'relation recordKey');
    if (seenRecordKeys.has(recordKey)) throw new Error(`duplicate relation recordKey ${recordKey}`);
    seenRecordKeys.add(recordKey);
    return {
      recordKey,
      internalName,
      cachedUrl,
    };
  }).sort(compareInternalName);
}

function normalizeProjectionRows(rows) {
  if (!Array.isArray(rows)) throw new Error('projection rows must be an array');
  const seen = new Set();
  const seenIds = new Set();
  const seenRelationRecordKeys = new Set();
  return rows.map((row) => {
    if (Number(row?.status) !== 1 || Number(row?.deleted) !== 0) {
      throw new Error('active projection rows are required');
    }
    const internalName = requireText(row?.internalName, 'projection internalName');
    if (seen.has(internalName)) throw new Error(`duplicate projection row for ${internalName}`);
    seen.add(internalName);
    const id = requirePositiveInteger(row?.id, 'projection id');
    if (seenIds.has(id)) throw new Error(`duplicate projection id ${id}`);
    seenIds.add(id);
    const relationRecordKey = requireText(row?.relationRecordKey, 'projection relationRecordKey');
    if (seenRelationRecordKeys.has(relationRecordKey)) {
      throw new Error(`duplicate projection relationRecordKey ${relationRecordKey}`);
    }
    seenRelationRecordKeys.add(relationRecordKey);
    return {
      id,
      relationRecordKey,
      internalName,
      image: text(row?.image),
    };
  }).sort(compareInternalName);
}

function assertExactKeySet(rows, keys, label) {
  const rowKeys = sortedUniqueText((rows ?? []).map((row) => row?.internalName), `${label} keys`);
  if (canonicalItemImageProjectionHash(rowKeys) !== canonicalItemImageProjectionHash(keys)) {
    throw new Error(`${label} key set must exactly match the lineage key set`);
  }
}

function assertProjectionRelationBindings(relationRows, projectionRows) {
  const relationByName = new Map((relationRows ?? []).map((row) => [row.internalName, row.recordKey]));
  for (const row of projectionRows ?? []) {
    if (relationByName.get(row.internalName) !== row.relationRecordKey) {
      throw new Error(`projection relationRecordKey must match relation recordKey for ${row.internalName}`);
    }
  }
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalItemImageProjectionHash(actual) !== canonicalItemImageProjectionHash(expected)) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function sortedUniqueText(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const normalized = values.map((value) => requireText(value, label));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates`);
  return normalized.sort();
}

function compareInternalName(left, right) {
  return left.internalName.localeCompare(right.internalName, 'en');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function assertPrivateMode(filePath, label) {
  if ((fs.statSync(filePath).mode & 0o077) !== 0) {
    throw new Error(`${label} must not be group or world accessible`);
  }
}

function requireRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')
      || normalized.includes('/../') || normalized === '.') {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return normalized;
}

function requireAttemptId(value) {
  const normalized = requireText(value, 'attemptId');
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('attemptId must be a lowercase 64-hex SHA-256 identity');
  }
  return normalized;
}

function assertAttemptBinding({ attemptId, attemptRoot, decisionIdentity }) {
  const expectedId = deriveItemImageProjectionAttemptId(decisionIdentity);
  if (attemptId !== expectedId) {
    throw new Error('attemptId must be derived from lineage decisionIdentity');
  }
  const expectedRoot = `${ITEM_IMAGE_PROJECTION_ATTEMPT_ROOT_PREFIX}/${expectedId}`;
  if (attemptRoot !== expectedRoot) {
    throw new Error('attemptRoot must be derived from lineage decisionIdentity');
  }
}

function assertAttemptPath(filePath, attemptRoot, label, expectedBasename) {
  const normalizedFilePath = requireRelativePath(filePath, label);
  const normalizedRoot = requireRelativePath(attemptRoot, 'attemptRoot');
  if (!normalizedFilePath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${label} must be inside attemptRoot`);
  }
  const remainder = normalizedFilePath.slice(normalizedRoot.length + 1);
  if (!remainder || remainder.includes('/')) {
    throw new Error(`${label} must be a direct child of attemptRoot`);
  }
  if (remainder !== expectedBasename) {
    throw new Error(`${label} must be ${expectedBasename} inside attemptRoot`);
  }
}

function requireSha256(value, label) {
  const normalized = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a SHA-256 identity`);
  return normalized;
}

function requireTimestamp(value, label) {
  const normalized = requireText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be an ISO timestamp`);
  return normalized;
}

function requireIdentifier(value, label) {
  const normalized = requireText(value, label);
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) throw new Error(`${label} must be a plain identifier`);
  return normalized;
}

function requirePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
