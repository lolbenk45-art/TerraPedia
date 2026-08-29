#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { computePolicySetHash } from './policy-set-hash.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { assertApprovedL2PolicyCeilingArtifact, readL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationServerFingerprint,
} from './authorized-operation-context.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

const DOMAIN_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-policy-ceiling-registration',
  npcs: 'automation-npcs-l2-policy-ceiling-registration',
  projectiles: 'automation-projectiles-l2-policy-ceiling-registration',
  armor_sets: 'automation-armor-sets-l2-policy-ceiling-registration',
  buffs: 'automation-buffs-l2-policy-ceiling-registration',
  audio: 'automation-audio-l2-policy-ceiling-registration',
  bosses: 'automation-bosses-l2-policy-ceiling-registration',
  shimmer: 'automation-shimmer-l2-policy-ceiling-registration',
});
const AUTHORITATIVE_REGISTRATIONS = new WeakSet();

export function buildL2PolicyCeilingRegistrationPlan({ artifact, authorizationContext } = {}) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const operationId = DOMAIN_OPERATION_IDS[artifact.domainId];
  if (!operationId) throw new Error('unsupported L2 policy ceiling registration domain');
  if (!authorizationContext || authorizationContext.operationId !== operationId) {
    throw new Error('policy ceiling registration authorization operation is not exact');
  }
  if (authorizationContext.actor !== artifact.approval.actor
      || authorizationContext.authorizationReference !== artifact.approval.reference) {
    throw new Error('policy ceiling approval identity does not match authorization context');
  }
  requireText(authorizationContext.reason, 'registration reason');
  requireText(authorizationContext.decisionIdentity, 'registration decision identity');
  if (!/^sha256:[a-f0-9]{64}$/.test(authorizationContext.packetHash ?? '')) {
    throw new Error('registration packet hash must be a sha256 hash');
  }
  return Object.freeze({
    schemaVersion: 1,
    operationId,
    domainId: artifact.domainId,
    targetLevel: 'L2',
    targetPolicyVersion: artifact.targetPolicy.policyVersion,
    targetPolicyHash: artifact.targetPolicy.policyHash,
    targetPolicyJson: artifact.targetPolicy.policyJson,
    currentPolicy: artifact.currentPolicy,
    currentPolicySetHash: artifact.currentPolicySetHash,
    targetPolicySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    actor: authorizationContext.actor,
    reason: authorizationContext.reason,
    authorizationReference: authorizationContext.authorizationReference,
    decisionIdentity: authorizationContext.decisionIdentity,
    packetHash: authorizationContext.packetHash,
    promotesCurrentPolicy: false,
    createsPromotionDecision: false,
  });
}

export function buildL2PolicyCeilingRegistrationInput({ artifact, artifactPath, artifactFileSha256 } = {}) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const normalizedPath = normalizeArtifactPath(artifactPath, artifact);
  if (!/^sha256:[a-f0-9]{64}$/.test(artifactFileSha256 ?? '')) throw new Error('artifactFileSha256 must be a sha256 hash');
  return Object.freeze({
    schemaVersion: 1,
    operationId: DOMAIN_OPERATION_IDS[artifact.domainId],
    domainId: artifact.domainId,
    artifactPath: normalizedPath,
    artifactFileSha256,
    artifactHash: artifact.artifactHash,
    targetPolicyVersion: artifact.targetPolicy.policyVersion,
    targetPolicyHash: artifact.targetPolicy.policyHash,
    targetPolicySetHash: artifact.targetPolicySetHash,
    proposalOnly: false,
  });
}

export async function registerL2PolicyCeiling({
  connection,
  artifact,
  authorizationContext,
  beforeCommit = null,
  afterCommit = null,
} = {}) {
  if (!connection || typeof connection.query !== 'function') throw new TypeError('database connection is required');
  if (beforeCommit != null && typeof beforeCommit !== 'function') throw new TypeError('beforeCommit must be a function');
  if (afterCommit != null && typeof afterCommit !== 'function') throw new TypeError('afterCommit must be a function');
  const plan = buildL2PolicyCeilingRegistrationPlan({ artifact, authorizationContext });
  await connection.beginTransaction();
  let committed = false;
  try {
    const [ownerRows] = await connection.query(
      'SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE',
    );
    const owner = ownerRows?.[0];
    if (!owner || owner.username !== plan.actor || owner.status !== 'ACTIVE') {
      throw new Error('active System Owner does not match policy ceiling approval');
    }
    const [policyRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash,'
      + ' p.current_level AS currentLevel, p.operational_state AS operationalState'
      + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
      + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
      + ' WHERE p.domain_id = ? FOR UPDATE',
      [plan.domainId],
    );
    const current = policyRows?.[0];
    if (!current || current.domainId !== plan.domainId || Number(current.policyVersion) !== plan.currentPolicy.policyVersion
        || current.policyHash !== plan.currentPolicy.policyHash || current.currentLevel !== 'L1'
        || current.operationalState !== 'ACTIVE') {
      throw new Error('current policy identity does not match the approved ceiling');
    }
    const [setRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash'
      + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
      + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
      + ' ORDER BY p.domain_id FOR UPDATE',
    );
    if (computePolicySetHash(setRows ?? []) !== plan.currentPolicySetHash) {
      throw new Error('current policy set identity does not match the approved ceiling');
    }
    const [maxRows] = await connection.query(
      'SELECT COALESCE(MAX(policy_version), 0) AS maxVersion FROM crawler_automation_policy_version WHERE domain_id = ?',
      [plan.domainId],
    );
    const maxVersion = Number(maxRows?.[0]?.maxVersion ?? 0);
    if (!Number.isSafeInteger(maxVersion) || maxVersion + 1 !== plan.targetPolicyVersion) {
      throw new Error('target policy version already exists or is not the next immutable version');
    }
    const [existingRows] = await connection.query(
      'SELECT policy_version AS policyVersion FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_hash = ?',
      [plan.domainId, plan.targetPolicyHash],
    );
    if (existingRows?.length) throw new Error('target policy hash already exists');
    const [insert] = await connection.query(
      'INSERT INTO crawler_automation_policy_version'
      + ' (domain_id, policy_version, level, policy_json, policy_hash, created_by, approved_by, reason)'
      + ' VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)',
      [plan.domainId, plan.targetPolicyVersion, 'L2', JSON.stringify(plan.targetPolicyJson),
        plan.targetPolicyHash, plan.actor, plan.actor, plan.reason],
    );
    if (Number(insert?.affectedRows) !== 1) throw new Error('L2 policy ceiling registration was not persisted');
    const pendingResult = buildRegistrationResult(plan, { status: 'pending', authoritative: false });
    if (beforeCommit != null) await beforeCommit(pendingResult);
    await connection.commit();
    committed = true;
    const result = buildRegistrationResult(plan, { status: 'registered', authoritative: true });
    if (afterCommit != null) await afterCommit(result);
    return result;
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  }
}

// A process can die before or after COMMIT and before the filesystem marker is
// published. Recovery is separately authorized and idempotently creates or
// verifies the exact immutable policy row, then publishes only the marker.
export async function recoverL2PolicyCeilingRegistration({
  connection,
  artifact,
  pendingResult,
  authorizationContext,
  publishMarker = null,
} = {}) {
  assertRecoveryConnection(connection);
  if (publishMarker != null && typeof publishMarker !== 'function') {
    throw new TypeError('publishMarker must be a function');
  }
  const plan = buildRecoveryRegistrationPlan({ artifact, authorizationContext });
  assertPendingResult(pendingResult, plan);
  if (authorizationContext.decisionIdentity === pendingResult.decisionIdentity
      || authorizationContext.packetHash === pendingResult.packetHash) {
    throw new Error('recovery requires a fresh authorization identity');
  }
  await connection.beginTransaction();
  let committed = false;
  try {
    await assertRecoveryOwner(connection, authorizationContext.actor);
    const row = await readRegisteredPolicyForUpdate(connection, plan);
    if (row == null) {
      await assertRecoveryInsertPreconditions(connection, artifact, plan);
      await insertMissingRegisteredPolicy(connection, plan, pendingResult);
    } else {
      assertRegisteredPolicyRow(row, plan, pendingResult);
    }
    const marker = buildCommitMarker(
      { ...pendingResult, status: 'registered', authoritative: true },
      authorizationContext,
    );
    await connection.commit();
    committed = true;
    if (publishMarker != null) await publishMarker(marker);
    return marker;
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  }
}

export async function readAuthoritativeL2PolicyCeilingRegistration({
  repoRoot = process.cwd(),
  connection,
  artifact,
} = {}) {
  if (!connection || typeof connection.query !== 'function') throw new TypeError('database connection is required');
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const operationId = DOMAIN_OPERATION_IDS[artifact.domainId];
  if (!operationId) throw new Error('unsupported L2 policy ceiling registration domain');
  const root = path.resolve(repoRoot);
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  const markerPath = `${resultPath}.commit.json`;
  const resultFile = readPrivateJsonFile(root, resultPath, 'L2 policy registration result');
  const markerFile = readPrivateJsonFile(root, markerPath, 'L2 policy registration commit marker');
  const pending = resultFile.value;
  // Readback proves the already-approved registration; it is not a recovery
  // authorization and must not require a fresh recovery packet or reason.
  const plan = registrationPlanFromArtifact(artifact);
  assertPendingResult(pending, plan);
  assertCommitMarker(markerFile.value, pending);
  const row = await readRegisteredPolicy(connection, plan);
  assertRegisteredPolicyRow(row, plan, pending);
  const proof = Object.freeze({
    schemaVersion: 1,
    status: 'registered',
    authoritative: true,
    operationId,
    domainId: artifact.domainId,
    policyVersion: artifact.targetPolicy.policyVersion,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    resultPath,
    resultFileSha256: resultFile.sha256,
    commitMarkerPath: markerPath,
    commitMarkerFileSha256: markerFile.sha256,
    registrationDecisionIdentity: pending.decisionIdentity,
    commitMarkerDecisionIdentity: markerFile.value.finalizerDecisionIdentity
      ?? markerFile.value.registrationDecisionIdentity,
  });
  AUTHORITATIVE_REGISTRATIONS.add(proof);
  return proof;
}

export function assertAuthoritativeL2PolicyCeilingRegistration(proof, artifact) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  if (!proof || !AUTHORITATIVE_REGISTRATIONS.has(proof)
      || proof.status !== 'registered' || proof.authoritative !== true
      || proof.domainId !== artifact.domainId
      || proof.policyVersion !== artifact.targetPolicy.policyVersion
      || proof.policyHash !== artifact.targetPolicy.policyHash
      || proof.policySetHash !== artifact.targetPolicySetHash
      || proof.artifactHash !== artifact.artifactHash) {
    throw new Error('authoritative L2 policy ceiling registration proof is required');
  }
  return true;
}

function assertRecoveryConnection(connection) {
  if (!connection || typeof connection.query !== 'function'
      || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function'
      || typeof connection.rollback !== 'function') {
    throw new TypeError('database connection with transaction support is required');
  }
}

function buildRecoveryRegistrationPlan({ artifact, authorizationContext }) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const plan = registrationPlanFromArtifact(artifact);
  const operationId = plan.operationId;
  if (!operationId || authorizationContext?.operationId !== operationId) {
    throw new Error('policy ceiling recovery authorization operation is not exact');
  }
  if (authorizationContext.actor !== artifact.approval.actor) {
    throw new Error('policy ceiling recovery Owner does not match the approved artifact');
  }
  requireText(authorizationContext.reason, 'recovery reason');
  requireText(authorizationContext.authorizationReference, 'recovery authorization reference');
  requireText(authorizationContext.decisionIdentity, 'recovery decision identity');
  if (!/^sha256:[a-f0-9]{64}$/.test(authorizationContext.packetHash ?? '')) {
    throw new Error('recovery packet hash must be a sha256 hash');
  }
  return plan;
}

function registrationPlanFromArtifact(artifact) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const operationId = DOMAIN_OPERATION_IDS[artifact.domainId];
  if (!operationId) throw new Error('unsupported L2 policy ceiling registration domain');
  return Object.freeze({
    operationId, domainId: artifact.domainId,
    targetPolicyVersion: artifact.targetPolicy.policyVersion,
    targetPolicyHash: artifact.targetPolicy.policyHash,
    targetPolicyJson: artifact.targetPolicy.policyJson,
    targetPolicySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash, actor: artifact.approval.actor,
    authorizationReference: artifact.approval.reference,
  });
}

async function assertRecoveryInsertPreconditions(connection, artifact, plan) {
  const [policyRows] = await connection.query(
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash,'
    + ' p.current_level AS currentLevel, p.operational_state AS operationalState'
    + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
    + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
    + ' WHERE p.domain_id = ? FOR UPDATE',
    [plan.domainId],
  );
  const current = policyRows?.[0];
  if (!current || current.domainId !== plan.domainId
      || Number(current.policyVersion) !== artifact.currentPolicy.policyVersion
      || current.policyHash !== artifact.currentPolicy.policyHash
      || current.currentLevel !== 'L1' || current.operationalState !== 'ACTIVE') {
    throw new Error('current policy identity does not permit L2 ceiling recovery');
  }
  const [setRows] = await connection.query(
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash'
    + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
    + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
    + ' ORDER BY p.domain_id FOR UPDATE',
  );
  if (computePolicySetHash(setRows ?? []) !== artifact.currentPolicySetHash) {
    throw new Error('current policy set identity does not permit L2 ceiling recovery');
  }
  const [maxRows] = await connection.query(
    'SELECT COALESCE(MAX(policy_version), 0) AS maxVersion FROM crawler_automation_policy_version WHERE domain_id = ?',
    [plan.domainId],
  );
  if (Number(maxRows?.[0]?.maxVersion ?? 0) + 1 !== plan.targetPolicyVersion) {
    throw new Error('target policy version is not the next immutable version during recovery');
  }
  const [existingRows] = await connection.query(
    'SELECT policy_version AS policyVersion FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_hash = ?',
    [plan.domainId, plan.targetPolicyHash],
  );
  if (existingRows?.length) throw new Error('target policy hash already exists during recovery');
}

async function assertRecoveryOwner(connection, actor) {
  const [ownerRows] = await connection.query(
    'SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1 FOR SHARE',
  );
  const owner = ownerRows?.[0];
  if (!owner || owner.username !== actor || owner.status !== 'ACTIVE') {
    throw new Error('active System Owner does not match recovery authorization');
  }
}

async function readRegisteredPolicyForUpdate(connection, plan) {
  const [policyRows] = await connection.query(
    'SELECT domain_id AS domainId, policy_version AS policyVersion, level, policy_json AS policyJson,'
    + ' policy_hash AS policyHash, created_by AS createdBy, approved_by AS approvedBy, reason'
    + ' FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_version = ? FOR UPDATE',
    [plan.domainId, plan.targetPolicyVersion],
  );
  if (!Array.isArray(policyRows) || policyRows.length > 1) {
    throw new Error('database L2 policy version readback is ambiguous');
  }
  return policyRows[0] ?? null;
}

async function readRegisteredPolicy(connection, plan) {
  const [policyRows] = await connection.query(
    'SELECT domain_id AS domainId, policy_version AS policyVersion, level, policy_json AS policyJson,'
    + ' policy_hash AS policyHash, created_by AS createdBy, approved_by AS approvedBy, reason'
    + ' FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_version = ?',
    [plan.domainId, plan.targetPolicyVersion],
  );
  if (!Array.isArray(policyRows) || policyRows.length !== 1) {
    throw new Error('committed L2 policy version is missing from the authoritative database readback');
  }
  return policyRows[0];
}

async function insertMissingRegisteredPolicy(connection, plan, pendingResult) {
  const [insert] = await connection.query(
    'INSERT INTO crawler_automation_policy_version'
    + ' (domain_id, policy_version, level, policy_json, policy_hash, created_by, approved_by, reason)'
    + ' VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)',
    [plan.domainId, plan.targetPolicyVersion, 'L2', JSON.stringify(plan.targetPolicyJson),
      plan.targetPolicyHash, plan.actor, plan.actor, pendingResult.reason],
  );
  if (Number(insert?.affectedRows) !== 1) {
    throw new Error('L2 policy ceiling recovery was not persisted');
  }
}

function assertRegisteredPolicyRow(row, plan, pendingResult) {
  if (row.domainId !== plan.domainId || Number(row.policyVersion) !== plan.targetPolicyVersion
      || row.level !== 'L2' || row.policyHash !== plan.targetPolicyHash
      || row.createdBy !== plan.actor || row.approvedBy !== plan.actor
      || row.reason !== pendingResult.reason) {
    throw new Error('database L2 policy version readback does not match the approved artifact');
  }
  let policyJson;
  try {
    policyJson = typeof row.policyJson === 'string' ? JSON.parse(row.policyJson) : row.policyJson;
  } catch {
    throw new Error('database L2 policy JSON readback is invalid');
  }
  if (computePolicyHash(policyJson) !== plan.targetPolicyHash) {
    throw new Error('database L2 policy JSON readback does not match the approved artifact');
  }
}

function buildRegistrationResult(plan, { status, authoritative }) {
  return Object.freeze({
    schemaVersion: 1,
    status,
    authoritative,
    operationId: plan.operationId,
    domainId: plan.domainId,
    policyVersion: plan.targetPolicyVersion,
    policyHash: plan.targetPolicyHash,
    policySetHash: plan.targetPolicySetHash,
    artifactHash: plan.artifactHash,
    actor: plan.actor,
    reason: plan.reason,
    authorizationReference: plan.authorizationReference,
    decisionIdentity: plan.decisionIdentity,
    packetHash: plan.packetHash,
  });
}

function buildCommitMarker(registrationResult, finalizer = null) {
  return Object.freeze({
    schemaVersion: 1,
    markerKind: 'l2_policy_ceiling_registration_commit',
    status: 'committed',
    authoritative: true,
    registrationStatus: registrationResult.status,
    operationId: registrationResult.operationId,
    domainId: registrationResult.domainId,
    policyVersion: registrationResult.policyVersion,
    policyHash: registrationResult.policyHash,
    policySetHash: registrationResult.policySetHash,
    artifactHash: registrationResult.artifactHash,
    registrationActor: registrationResult.actor,
    registrationAuthorizationReference: registrationResult.authorizationReference,
    registrationDecisionIdentity: registrationResult.decisionIdentity,
    registrationPacketHash: registrationResult.packetHash,
    ...(finalizer == null ? {} : {
      finalizerActor: finalizer.actor,
      finalizerAuthorizationReference: finalizer.authorizationReference,
      finalizerDecisionIdentity: finalizer.decisionIdentity,
      finalizerPacketHash: finalizer.packetHash,
    }),
  });
}

function assertPendingResult(pending, plan) {
  if (!pending || pending.schemaVersion !== 1 || pending.status !== 'pending' || pending.authoritative !== false) {
    throw new Error('a non-authoritative pending registration result is required for recovery');
  }
  if (pending.operationId !== plan.operationId || pending.domainId !== plan.domainId
      || Number(pending.policyVersion) !== plan.targetPolicyVersion
      || pending.policyHash !== plan.targetPolicyHash || pending.policySetHash !== plan.targetPolicySetHash
      || pending.artifactHash !== plan.artifactHash
      || pending.actor !== plan.actor || pending.authorizationReference !== plan.authorizationReference
      || !pending.reason || !pending.decisionIdentity || !pending.packetHash) {
    throw new Error('pending registration identity does not match the approved artifact');
  }
}

function assertCommitMarker(marker, pending) {
  if (!marker || marker.schemaVersion !== 1
      || marker.markerKind !== 'l2_policy_ceiling_registration_commit'
      || marker.status !== 'committed' || marker.authoritative !== true
      || marker.registrationStatus !== 'registered'
      || marker.operationId !== pending.operationId || marker.domainId !== pending.domainId
      || Number(marker.policyVersion) !== Number(pending.policyVersion)
      || marker.policyHash !== pending.policyHash || marker.policySetHash !== pending.policySetHash
      || marker.artifactHash !== pending.artifactHash
      || marker.registrationActor !== pending.actor
      || marker.registrationAuthorizationReference !== pending.authorizationReference
      || marker.registrationDecisionIdentity !== pending.decisionIdentity
      || marker.registrationPacketHash !== pending.packetHash) {
    throw new Error('L2 policy registration commit marker does not match the pending result');
  }
  const finalizerFields = [
    marker.finalizerActor, marker.finalizerAuthorizationReference,
    marker.finalizerDecisionIdentity, marker.finalizerPacketHash,
  ];
  if (finalizerFields.some((value) => value != null)
      && (finalizerFields.some((value) => typeof value !== 'string' || !value.trim())
        || marker.finalizerActor !== pending.actor
        || !/^sha256:[a-f0-9]{64}$/.test(marker.finalizerPacketHash))) {
    throw new Error('L2 policy registration recovery marker identity is incomplete');
  }
}

function readPrivateJsonFile(repoRoot, relativePath, label) {
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot, filePath: path.resolve(repoRoot, relativePath), label,
  });
  const stat = fs.lstatSync(absolute);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  const bytes = fs.readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${label} must be valid JSON`); }
  return { value, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}

export async function runL2PolicyCeilingRegistrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
  loadAuthorizationContext = loadAuthorizedOperationContext,
  assertDataBundle = assertAuthorizedOperationDataBundle,
  loadServerFingerprint = loadAuthorizedOperationServerFingerprint,
  consumeDispatchPermit = consumeAuthorizedOperationDispatchPermit,
  assertServerFingerprint = assertRegistrationServerFingerprint,
} = {}) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(env.WORKTREE_ROOT ?? process.cwd());
  const operationId = requireText(args['operation-id'], '--operation-id');
  if (!Object.values(DOMAIN_OPERATION_IDS).includes(operationId)) {
    throw new Error('--operation-id is not a supported L2 policy ceiling registration operation');
  }
  const expectedInputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const expectedOutputPath = `reports/authorization/canonical/${operationId}.result.json`;
  if (requireText(args.input, '--input').replaceAll('\\', '/') !== expectedInputPath) {
    throw new Error('--input must use the exact operation-derived input path');
  }
  if (requireText(args.output, '--output').replaceAll('\\', '/') !== expectedOutputPath) {
    throw new Error('--output must use the exact operation-derived result path under the canonical authorization root');
  }
  const inputPath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, expectedInputPath),
    label: 'registration input',
  });
  const authorizationRoot = path.resolve(repoRoot, 'reports/authorization/canonical');
  const requestedOutputPath = path.resolve(repoRoot, expectedOutputPath);
  let pendingIdentity = null;
  if (requestedOutputPath !== authorizationRoot
      && !requestedOutputPath.startsWith(`${authorizationRoot}${path.sep}`)) {
    throw new Error('registration result must remain under the canonical authorization root');
  }
  const outputPath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: requestedOutputPath,
    label: 'registration result',
    createParent: true,
  });
  const commitMarkerPath = `${outputPath}.commit.json`;
  assertAuthorizationRootPath(commitMarkerPath, repoRoot, 'registration commit marker');
  const confinedCommitMarkerPath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: commitMarkerPath,
    label: 'registration commit marker',
  });
  const recovery = args.recover === 'true';
  if (recovery) {
    if (args.apply === 'true') throw new Error('--recover=true cannot be combined with --apply=true');
    const pendingPath = assertRepositoryOrdinaryFile({ repoRoot, filePath: outputPath, label: 'pending registration result' });
    pendingIdentity = fs.lstatSync(pendingPath);
    assertNoExistingEntry(confinedCommitMarkerPath, 'registration commit marker');
  } else {
    assertNoExistingEntry(outputPath, 'registration result');
    assertNoExistingEntry(confinedCommitMarkerPath, 'registration commit marker');
  }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (operationId !== input.operationId) throw new Error('--operation-id must match the frozen input');
  if (!recovery && args.apply !== 'true') throw new Error('--apply=true is required');
  if (input.proposalOnly !== false || !input.artifactHash || input.targetPolicyVersion == null
      || input.targetPolicyHash == null || input.targetPolicySetHash == null) {
    throw new Error('policy ceiling registration input identity is incomplete');
  }
  const authorizationContext = loadAuthorizationContext({ env, operationId: input.operationId, now });
  const artifact = readL2PolicyCeilingArtifact({ repoRoot, artifactPath: input.artifactPath, requireApproved: true });
  if (artifact.domainId !== input.domainId || artifact.artifactHash !== input.artifactHash) {
    throw new Error('policy ceiling artifact does not match the frozen input');
  }
  if (artifact.targetPolicy.policyVersion !== input.targetPolicyVersion
      || artifact.targetPolicy.policyHash !== input.targetPolicyHash
      || artifact.targetPolicySetHash !== input.targetPolicySetHash) {
    throw new Error('policy ceiling registration target identity drifted');
  }
  const artifactAbsolutePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, input.artifactPath),
    label: 'policy ceiling artifact',
  });
  const artifactBytes = fs.readFileSync(artifactAbsolutePath);
  const actualArtifactFileSha256 = `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`;
  if (actualArtifactFileSha256 !== input.artifactFileSha256) {
    throw new Error('policy ceiling artifact file hash does not match the frozen input');
  }
  assertDataBundle({ repoRoot, authorizedContext: authorizationContext });
  const authorizedServerFingerprint = loadServerFingerprint({
    authorizedContext: authorizationContext,
    env,
  });
  consumeDispatchPermit({
    env,
    authorizedContext: authorizationContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT')),
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
  });
  let transactionCommitted = false;
  try {
    await assertServerFingerprint(connection, authorizedServerFingerprint, env);
    if (recovery) {
      const pendingResult = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const marker = await recoverL2PolicyCeilingRegistration({
        connection,
        artifact,
        pendingResult,
        authorizationContext,
        publishMarker: async (value) => {
          fs.writeFileSync(confinedCommitMarkerPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
        },
      });
      return marker;
    }
    const result = await registerL2PolicyCeiling({
      connection,
      artifact,
      authorizationContext,
      beforeCommit: async (pendingResult) => {
        fs.writeFileSync(outputPath, `${JSON.stringify(pendingResult, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
        pendingIdentity = fs.lstatSync(outputPath);
      },
      afterCommit: async (committedResult) => {
        // Mark the transaction boundary before publication so a marker write
        // failure leaves the pending file available for DB readback.
        transactionCommitted = true;
        const marker = buildCommitMarker(committedResult);
        fs.writeFileSync(confinedCommitMarkerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      },
    });
    return result;
  } catch (error) {
    if (!recovery && !transactionCommitted && pendingIdentity) removeOwnedPendingResult(outputPath, pendingIdentity);
    throw error;
  } finally {
    await connection.end();
  }
}

async function assertRegistrationServerFingerprint(connection, expected, env) {
  const [rows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
  const actual = canonicalServerFingerprint({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: Number(rows?.[0]?.port),
    serverUuid: rows?.[0]?.serverUuid,
    databases: expected.databases,
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('current database server fingerprint does not match the authorized packet');
  }
}

function removeOwnedPendingResult(filePath, expectedIdentity) {
  try {
    const current = fs.lstatSync(filePath);
    if (current.dev === expectedIdentity.dev && current.ino === expectedIdentity.ino) fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

function normalizeArtifactPath(value, artifact = null) {
  const text = requireText(value, 'artifactPath').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/l2-policy-ceiling/';
  const match = text.startsWith(prefix)
    ? /^([a-z][a-z0-9_]{0,63})\/([a-f0-9]{64})\/artifact\.json$/.exec(text.slice(prefix.length))
    : null;
  if (!match || (artifact && (match[1] !== artifact.domainId || match[2] !== artifact.artifactHash.slice(7)))) {
    throw new Error('artifactPath must be content-addressed');
  }
  return text;
}

function assertNoExistingEntry(filePath, label) {
  try {
    fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function assertAuthorizationRootPath(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain under reports/authorization/canonical`);
  }
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runL2PolicyCeilingRegistrationCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
