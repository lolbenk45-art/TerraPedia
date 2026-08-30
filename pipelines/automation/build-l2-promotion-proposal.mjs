#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalServerFingerprint, hashCanonicalServerFingerprint } from './automation-database-contract.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { verifyFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import { assertApprovedL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import { assertAuthoritativeL2PolicyCeilingRegistration } from './register-l2-policy-ceiling.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
  resolveTrustedEvidenceRoot,
} from '../lib/private-repository-path.mjs';
import {
  assertL2SerialTransition,
  L2_SERIAL_PROMOTION_ORDER,
} from './l2-promotion-serial-contract.mjs';

export { L2_SERIAL_PROMOTION_ORDER } from './l2-promotion-serial-contract.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DOMAIN_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-promotion',
  npcs: 'automation-npcs-l2-promotion',
  projectiles: 'automation-projectiles-l2-promotion',
  armor_sets: 'automation-armor-sets-l2-promotion',
  buffs: 'automation-buffs-l2-promotion',
  audio: 'automation-audio-l2-promotion',
  bosses: 'automation-bosses-l2-promotion',
  shimmer: 'automation-shimmer-l2-promotion',
});

export function buildL2PromotionProposal({
  repoRoot = process.cwd(),
  evidenceRoot = null,
  readiness,
  policyArtifact,
  policyArtifactPath,
  policyArtifactFileSha256,
  policyRegistration,
  serverFingerprint,
  promotionCurrentPolicyRows = null,
  promotionTargetPolicyRows = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const trustedEvidence = resolveTrustedEvidenceRoot({
    repoRoot: root,
    evidenceRoot,
    label: 'L2 evidence root',
  });
  const domainId = requireDomain(readiness?.domainId);
  const operationId = DOMAIN_OPERATION_IDS[domainId];
  if (readiness.verdict !== 'READY_FOR_L2' || (readiness.blockingGates ?? []).length !== 0) {
    throw new Error('L2 proposal requires a READY_FOR_L2 readiness record with no blocking gates');
  }
  if (readiness.proposalInput !== true) {
    throw new Error('L2 proposal requires a formal proposal-input readiness record; display-only readiness records cannot be upgraded');
  }
  assertApprovedL2PolicyCeilingArtifact(policyArtifact);
  assertAuthoritativeL2PolicyCeilingRegistration(policyRegistration, policyArtifact);
  const policyArtifactRef = readPolicyArtifactRef(root, policyArtifact, policyArtifactPath, policyArtifactFileSha256);
  if (policyArtifact.domainId !== domainId) throw new Error('policy ceiling domain does not match readiness');
  assertCurrentPolicy(readiness.currentPolicy, policyArtifact);
  const serialTransition = assertL2SerialTransition(readiness.serialTransition, {
    domainId,
    operationId,
  });
  const l1EvidencePolicySetHash = requireHash(
    readiness.l1EvidencePolicySetHash,
    'l1EvidencePolicySetHash',
  );
  const currentRows = normalizePromotionPolicyRows(
    promotionCurrentPolicyRows ?? policyArtifact.currentPolicyRows,
    'promotion current policy rows',
  );
  const currentPolicySetHash = computePolicySetHash(currentRows);
  if (currentPolicySetHash !== readiness.currentPolicy.policySetHash) {
    throw new Error('promotion current policy rows do not match the live policy-set hash');
  }
  const targetRows = normalizePromotionPolicyRows(
    promotionTargetPolicyRows ?? currentRows.map((row) => (
      row.domainId === domainId
        ? { domainId, policyVersion: policyArtifact.targetPolicy.policyVersion, policyHash: policyArtifact.targetPolicy.policyHash }
        : row
    )),
    'promotion target policy rows',
  );
  const targetPolicySetHash = computePolicySetHash(targetRows);
  const expectedTargetRows = currentRows.map((row) => (
    row.domainId === domainId
      ? { domainId, policyVersion: policyArtifact.targetPolicy.policyVersion, policyHash: policyArtifact.targetPolicy.policyHash }
      : row
  ));
  if (stableJson(targetRows) !== stableJson(normalizePromotionPolicyRows(expectedTargetRows, 'expected promotion target policy rows'))) {
    throw new Error('promotion target policy rows do not match the exact domain target policy');
  }
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  const l1Runs = readQualifyingL1Runs(
    trustedEvidence.root,
    readiness,
    domainId,
    l1EvidencePolicySetHash,
  );
  if (l1Runs.length < 3) throw new Error('L2 proposal requires at least three qualifying L1 runs');
  const reconciliation = readFullReconciliation(
    trustedEvidence.root,
    readiness,
    l1Runs,
    l1EvidencePolicySetHash,
  );
  const payload = {
    schemaVersion: 1,
    artifactKind: 'l2-promotion-proposal',
    operationId,
    domainId,
    databaseName: 'terria_v1_local',
    proposalOnly: true,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    generatedAt: requireTimestamp(generatedAt),
    serverFingerprint: fingerprint,
    serverFingerprintHash: hashCanonicalServerFingerprint(fingerprint),
    currentPolicy: policyArtifact.currentPolicy,
    currentPolicySetHash,
    l1EvidencePolicySetHash,
    targetPolicy: policyArtifact.targetPolicy,
    targetPolicySetHash,
    policyArtifactCurrentPolicySetHash: policyArtifact.currentPolicySetHash,
    policyArtifactTargetPolicySetHash: policyArtifact.targetPolicySetHash,
    promotionCurrentPolicyRows: currentRows,
    promotionTargetPolicyRows: targetRows,
    serialTransition,
    policyArtifactHash: policyArtifact.artifactHash,
    policyArtifactPath: policyArtifactRef.path,
    policyArtifactFileSha256: policyArtifactRef.sha256,
    policyRegistration: serializePolicyRegistration(policyRegistration),
    ownedTables: policyArtifact.targetPolicy.policyJson.ownedTables,
    minimumSuccessfulL1Runs: 3,
    l1Runs,
    fullReconciliation: reconciliation,
    forbidden: ['source-refresh', 'external-request', 'direct-sql', 'replay', 'scheduler-activation'],
  };
  return Object.freeze({ ...payload, proposalHash: hashPayload(payload) });
}

export function writeL2PromotionProposal({ repoRoot = process.cwd(), proposal } = {}) {
  assertProposal(proposal);
  const root = path.resolve(repoRoot);
  const outputPath = path.resolve(
    root,
    'reports/authorization/canonical',
    proposal.operationId,
    proposal.proposalHash.slice(7),
    'proposal.json',
  );
  const confined = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: outputPath,
    label: 'L2 promotion proposal',
    createParent: true,
  });
  assertNoExistingEntry(confined, 'L2 promotion proposal');
  const bytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({
    path: path.relative(root, confined).replaceAll('\\', '/'),
    sha256: hashBytes(bytes),
    proposalHash: proposal.proposalHash,
    policyArtifactHash: proposal.policyArtifactHash,
    policyArtifactPath: proposal.policyArtifactPath,
    policyArtifactFileSha256: proposal.policyArtifactFileSha256,
  });
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

export function buildL2PromotionExecutionInput({ proposal, proposalPath, proposalFileSha256 } = {}) {
  assertProposal(proposal);
  const normalizedPath = normalizeProposalPath(proposalPath, proposal.operationId);
  if (normalizedPath.split('/').at(-2) !== proposal.proposalHash.slice(7)) {
    throw new Error('proposalPath content address does not match proposalHash');
  }
  requireHash(proposalFileSha256, 'proposalFileSha256');
  return Object.freeze({
    schemaVersion: 1,
    operationId: proposal.operationId,
    databaseName: proposal.databaseName,
    domainId: proposal.domainId,
    policyVersion: proposal.currentPolicy.policyVersion,
    policyHash: proposal.currentPolicy.policyHash,
    policySetHash: proposal.currentPolicySetHash,
    l1EvidencePolicySetHash: proposal.l1EvidencePolicySetHash,
    minimumSuccessfulL1Runs: proposal.minimumSuccessfulL1Runs,
    targetPolicyVersion: proposal.targetPolicy.policyVersion,
    targetPolicyHash: proposal.targetPolicy.policyHash,
    targetPolicySetHash: proposal.targetPolicySetHash,
    targetPolicyLevel: proposal.targetPolicy.level,
    targetPolicyJson: proposal.targetPolicy.policyJson,
    policyArtifactHash: proposal.policyArtifactHash,
    policyArtifactPath: proposal.policyArtifactPath,
    policyArtifactFileSha256: proposal.policyArtifactFileSha256,
    policyRegistrationResultPath: proposal.policyRegistration.resultPath,
    policyRegistrationResultFileSha256: proposal.policyRegistration.resultFileSha256,
    policyRegistrationCommitMarkerPath: proposal.policyRegistration.commitMarkerPath,
    policyRegistrationCommitMarkerFileSha256: proposal.policyRegistration.commitMarkerFileSha256,
    policyArtifactCurrentPolicySetHash: proposal.policyArtifactCurrentPolicySetHash,
    policyArtifactTargetPolicySetHash: proposal.policyArtifactTargetPolicySetHash,
    promotionCurrentPolicyRows: proposal.promotionCurrentPolicyRows,
    promotionTargetPolicyRows: proposal.promotionTargetPolicyRows,
    serialTransition: proposal.serialTransition,
    proposalOnly: false,
    proposalPath: normalizedPath,
    proposalSha256: proposalFileSha256,
    proposalHash: proposal.proposalHash,
  });
}

export function assertProposal(proposal) {
  if (!proposal || proposal.artifactKind !== 'l2-promotion-proposal' || proposal.proposalOnly !== true) {
    throw new Error('L2 promotion proposalOnly artifact is required');
  }
  const expectedKeys = [
    'artifactKind', 'authorizationStatus', 'databaseName', 'databaseWrites', 'domainId',
    'forbidden', 'fullReconciliation', 'generatedAt', 'l1Runs', 'minimumSuccessfulL1Runs',
    'networkAccess', 'operationId', 'ownedTables', 'policyArtifactFileSha256',
    'policyArtifactHash', 'policyArtifactPath', 'policyRegistration', 'proposalHash',
    'proposalOnly', 'schemaVersion', 'serverFingerprint', 'serverFingerprintHash',
    'targetPolicy', 'targetPolicySetHash', 'currentPolicy', 'currentPolicySetHash',
    'l1EvidencePolicySetHash', 'policyArtifactCurrentPolicySetHash',
    'policyArtifactTargetPolicySetHash', 'promotionCurrentPolicyRows',
    'promotionTargetPolicyRows', 'serialTransition',
  ].sort();
  if (JSON.stringify(Object.keys(proposal).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('L2 promotion proposal schema is not exact');
  }
  const { proposalHash, ...payload } = proposal;
  if (proposalHash !== hashPayload(payload)) throw new Error('L2 promotion proposal hash drifted');
  const domainId = requireDomain(proposal.domainId);
  if (DOMAIN_OPERATION_IDS[domainId] !== proposal.operationId) throw new Error('L2 proposal operation identity is invalid');
  if (proposal.schemaVersion !== 1 || proposal.databaseName !== 'terria_v1_local'
      || proposal.authorizationStatus !== 'AWAITING_OWNER'
      || proposal.databaseWrites !== false || proposal.networkAccess !== false) {
    throw new Error('L2 promotion proposal must be an awaiting-owner read-only artifact');
  }
  const fingerprint = canonicalServerFingerprint(proposal.serverFingerprint);
  if (proposal.serverFingerprintHash !== hashCanonicalServerFingerprint(fingerprint)) {
    throw new Error('L2 promotion proposal server fingerprint is invalid');
  }
  const current = proposal.currentPolicy;
  if (!current || current.domainId !== domainId || current.level !== 'L1'
      || current.operationalState !== 'ACTIVE' || !Number.isSafeInteger(Number(current.policyVersion))
      || !HASH_PATTERN.test(current.policyHash ?? '') || !HASH_PATTERN.test(proposal.currentPolicySetHash ?? '')) {
    throw new Error('L2 promotion proposal current policy identity is invalid');
  }
  const target = proposal.targetPolicy;
  requireHash(proposal.l1EvidencePolicySetHash, 'l1EvidencePolicySetHash');
  requireHash(proposal.policyArtifactCurrentPolicySetHash, 'policyArtifactCurrentPolicySetHash');
  requireHash(proposal.policyArtifactTargetPolicySetHash, 'policyArtifactTargetPolicySetHash');
  const promotionCurrentRows = normalizePromotionPolicyRows(
    proposal.promotionCurrentPolicyRows,
    'promotion current policy rows',
  );
  const promotionTargetRows = normalizePromotionPolicyRows(
    proposal.promotionTargetPolicyRows,
    'promotion target policy rows',
  );
  if (computePolicySetHash(promotionCurrentRows) !== proposal.currentPolicySetHash
      || computePolicySetHash(promotionTargetRows) !== proposal.targetPolicySetHash) {
    throw new Error('L2 promotion proposal policy-set rows do not match their hashes');
  }
  const expectedTargetRows = promotionCurrentRows.map((row) => (
    row.domainId === domainId
      ? { domainId, policyVersion: target.policyVersion, policyHash: target.policyHash }
      : row
  ));
  if (stableJson(promotionTargetRows) !== stableJson(normalizePromotionPolicyRows(expectedTargetRows, 'expected promotion target policy rows'))) {
    throw new Error('L2 promotion proposal target policy rows are not the exact serial transition');
  }
  assertL2SerialTransition(proposal.serialTransition, { domainId, operationId: proposal.operationId });
  if (!target || target.level !== 'L2' || !Number.isSafeInteger(Number(target.policyVersion))
      || Number(target.policyVersion) <= Number(current.policyVersion)
      || !HASH_PATTERN.test(target.policyHash ?? '')
      || computePolicyHash(target.policyJson) !== target.policyHash
      || !HASH_PATTERN.test(proposal.targetPolicySetHash ?? '')) {
    throw new Error('L2 promotion proposal target policy identity is invalid');
  }
  if (!Array.isArray(proposal.ownedTables)
      || stableJson(proposal.ownedTables) !== stableJson(target.policyJson?.ownedTables)) {
    throw new Error('L2 promotion proposal owned table scope is invalid');
  }
  if (!Number.isSafeInteger(Number(proposal.minimumSuccessfulL1Runs))
      || Number(proposal.minimumSuccessfulL1Runs) < 3
      || !Array.isArray(proposal.l1Runs) || proposal.l1Runs.length < 3
      || proposal.l1Runs.some((run) => run?.status !== 'COMPLETED'
        || run?.applyStatus !== 'COMMITTED' || !requireText(run?.runId, 'L1 runId')
        || !HASH_PATTERN.test(run?.bundleSha256 ?? '') || !HASH_PATTERN.test(run?.evidenceSha256 ?? '')
        || run?.policySetHash !== proposal.l1EvidencePolicySetHash
        || !HASH_PATTERN.test(run?.policySetHash ?? ''))) {
    throw new Error('L2 promotion proposal requires three qualifying committed L1 runs');
  }
  if (proposal.fullReconciliation?.status !== 'verified'
      || !requireText(proposal.fullReconciliation?.path, 'full reconciliation path')
      || !HASH_PATTERN.test(proposal.fullReconciliation?.sha256 ?? '')) {
    throw new Error('L2 promotion proposal requires verified full reconciliation evidence');
  }
  const requiredForbidden = ['source-refresh', 'external-request', 'direct-sql', 'replay', 'scheduler-activation'];
  if (!Array.isArray(proposal.forbidden) || requiredForbidden.some((operation) => !proposal.forbidden.includes(operation))) {
    throw new Error('L2 promotion proposal must declare forbidden operations');
  }
  requireHash(proposal.policyArtifactHash, 'policyArtifactHash');
  normalizePolicyArtifactPath(proposal.policyArtifactPath);
  requireHash(proposal.policyArtifactFileSha256, 'policyArtifactFileSha256');
  assertSerializedPolicyRegistration(proposal.policyRegistration, proposal);
  return true;
}

function serializePolicyRegistration(proof) {
  return Object.freeze({
    schemaVersion: 1,
    status: 'registered',
    authoritative: true,
    operationId: proof.operationId,
    domainId: proof.domainId,
    policyVersion: proof.policyVersion,
    policyHash: proof.policyHash,
    policySetHash: proof.policySetHash,
    artifactHash: proof.artifactHash,
    resultPath: proof.resultPath,
    resultFileSha256: proof.resultFileSha256,
    commitMarkerPath: proof.commitMarkerPath,
    commitMarkerFileSha256: proof.commitMarkerFileSha256,
    registrationDecisionIdentity: proof.registrationDecisionIdentity,
    commitMarkerDecisionIdentity: proof.commitMarkerDecisionIdentity,
  });
}

function assertSerializedPolicyRegistration(registration, proposal) {
  const expectedOperationId = proposal.operationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
  const expectedResultPath = `reports/authorization/canonical/${expectedOperationId}.result.json`;
  if (!registration || registration.schemaVersion !== 1 || registration.status !== 'registered'
      || registration.authoritative !== true || registration.operationId !== expectedOperationId
      || registration.domainId !== proposal.domainId
      || registration.policyVersion !== proposal.targetPolicy?.policyVersion
      || registration.policyHash !== proposal.targetPolicy?.policyHash
      || registration.policySetHash !== proposal.policyArtifactTargetPolicySetHash
      || registration.artifactHash !== proposal.policyArtifactHash
      || registration.resultPath !== expectedResultPath
      || registration.commitMarkerPath !== `${expectedResultPath}.commit.json`
      || !HASH_PATTERN.test(registration.resultFileSha256 ?? '')
      || !HASH_PATTERN.test(registration.commitMarkerFileSha256 ?? '')
      || !requireText(registration.registrationDecisionIdentity, 'registration decision identity')
      || !requireText(registration.commitMarkerDecisionIdentity, 'registration commit marker decision identity')) {
    throw new Error('L2 proposal requires an exact authoritative policy registration binding');
  }
}

function readQualifyingL1Runs(root, readiness, domainId, l1EvidencePolicySetHash) {
  if (!Array.isArray(readiness.l1Runs)) throw new Error('readiness l1Runs are required');
  const seen = new Set();
  return readiness.l1Runs.map((run) => {
    if (run?.status !== 'COMPLETED' || run?.applyStatus !== 'COMMITTED') {
      throw new Error('qualifying L1 run must be COMPLETED with a COMMITTED apply');
    }
    const runId = requireText(run?.runId, 'L1 runId');
    if (seen.has(runId)) throw new Error('readiness contains duplicate L1 run IDs');
    seen.add(runId);
    const bundle = readBoundJson(root, run.bundlePath, run.bundleSha256, 'L1 bundle', { canonical: true });
    assertL1BundleIntegrity(bundle);
    if (bundle.runId !== runId || bundle.domainId !== domainId || bundle.operationId !== DOMAIN_L1_OPERATION_IDS[domainId]
        || bundle.databaseName !== 'terria_v1_local' || bundle.policy?.domainId !== domainId
        || bundle.policy?.level !== 'L1' || bundle.policy?.operationalState !== 'ACTIVE'
        || bundle.policy?.policyVersion !== readiness.currentPolicy.policyVersion
        || bundle.policy?.policyHash !== readiness.currentPolicy.policyHash
        || bundle.policy?.policySetHash !== l1EvidencePolicySetHash) {
      throw new Error(`L1 run ${runId} is not bound to the exact current policy`);
    }
    if (!bundle.source || !HASH_PATTERN.test(bundle.source.sha256 ?? '')) {
      throw new Error(`L1 run ${runId} source identity is invalid`);
    }
    readBoundJson(root, bundle.source.path, bundle.source.sha256, 'L1 bundle source');
    const evidence = readBoundJson(root, run.evidencePath, run.evidenceSha256, 'L1 evidence');
    assertL1EvidenceIdentity(evidence, {
      root,
      run,
      bundle,
      domainId,
      currentPolicy: {
        ...readiness.currentPolicy,
        policySetHash: l1EvidencePolicySetHash,
      },
    });
    return {
      runId,
      status: run.status,
      applyStatus: run.applyStatus,
      bundlePath: normalizeReportsPath(run.bundlePath, 'bundlePath'),
      bundleSha256: run.bundleSha256,
      evidencePath: normalizeReportsPath(run.evidencePath, 'evidencePath'),
      evidenceSha256: run.evidenceSha256,
      policySetHash: bundle.policy.policySetHash,
    };
  });
}

function assertL1BundleIntegrity(bundle) {
  if (!HASH_PATTERN.test(bundle?.bundleHash ?? '') || !HASH_PATTERN.test(bundle?.evidenceHash ?? '')) {
    throw new Error('L1 bundle content identity is invalid');
  }
  const { bundleHash, ...body } = bundle;
  if (hashPayload(body) !== bundleHash) {
    throw new Error('L1 bundle hash or content mismatch');
  }
}

function assertL1EvidenceIdentity(evidence, {
  root,
  run,
  bundle,
  domainId,
  currentPolicy,
}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
      || evidence.runId !== run.runId || evidence.domainId !== domainId) {
    throw new Error(`L1 evidence for ${run.runId} is not bound to its run and domain`);
  }
  const policy = evidence.policy ?? evidence;
  if (Number(policy.policyVersion) !== Number(currentPolicy.policyVersion)
      || policy.policyHash !== currentPolicy.policyHash
      || policy.policySetHash !== currentPolicy.policySetHash) {
    throw new Error(`L1 evidence for ${run.runId} is not bound to the current policy`);
  }
  if (evidence.fullReconciliation === true) {
    verifyFullReconciliationEvidence(evidence, {
      domainId,
      runId: run.runId,
      policyVersion: currentPolicy.policyVersion,
      policyHash: currentPolicy.policyHash,
      policySetHash: currentPolicy.policySetHash,
    });
    verifyReconciliationArtifactFiles(root, evidence);
    return;
  }
  const bundleHash = evidence.bundleHash ?? evidence.bundle?.bundleHash;
  const bundleFileSha256 = evidence.bundleFileSha256 ?? evidence.bundleFileHash;
  if (bundleHash !== bundle.bundleHash && bundleFileSha256 !== run.bundleSha256) {
    throw new Error(`L1 evidence for ${run.runId} is not bound to its L1 bundle`);
  }
  if (evidence.evidenceHash !== bundle.evidenceHash) {
    throw new Error(`L1 evidence for ${run.runId} is not bound to its evidence set`);
  }
}

function verifyReconciliationArtifactFiles(root, evidence) {
  for (const [pathField, hashField, label] of [
    ['sourceArtifactPath', 'sourceHash', 'reconciliation source artifact'],
    ['ownedTableReadbackPath', 'ownedTableReadbackHash', 'reconciliation table readback'],
    ['attemptStatePath', 'attemptStateHash', 'reconciliation attempt state'],
  ]) {
    const normalized = normalizeReportsPath(evidence[pathField], label);
    const absolute = assertRepositoryOrdinaryFile({
      repoRoot: root,
      filePath: path.resolve(root, normalized),
      label,
    });
    if (hashBytes(fs.readFileSync(absolute)) !== evidence[hashField]) {
      throw new Error(`${label} hash drifted`);
    }
  }
}

function readFullReconciliation(root, readiness, l1Runs, l1EvidencePolicySetHash) {
  if (readiness.fullReconciliation?.status !== 'verified') throw new Error('full reconciliation readiness is required');
  const pathValue = normalizeReportsPath(readiness.fullReconciliation.evidence, 'full reconciliation evidence');
  const match = l1Runs.find((run) => run.evidencePath === pathValue);
  if (!match || match.evidenceSha256 !== readiness.fullReconciliation.evidenceSha256) {
    throw new Error('full reconciliation evidence is not one of the exact L1 runs');
  }
  const evidence = readBoundJson(root, pathValue, match.evidenceSha256, 'full reconciliation evidence');
  verifyFullReconciliationEvidence(evidence, {
    domainId: readiness.domainId,
    runId: match.runId,
    policyVersion: readiness.currentPolicy.policyVersion,
    policyHash: readiness.currentPolicy.policyHash,
    policySetHash: l1EvidencePolicySetHash,
  });
  return { path: pathValue, sha256: match.evidenceSha256, status: 'verified' };
}

function assertCurrentPolicy(current, artifact) {
  if (!current || current.level !== 'L1' || current.operationalState !== 'ACTIVE'
      || current.policyVersion !== artifact.currentPolicy.policyVersion
      || current.policyHash !== artifact.currentPolicy.policyHash) {
    throw new Error('readiness current policy does not match approved L2 policy artifact');
  }
}

function readPolicyArtifactRef(root, artifact, artifactPath, expectedFileHash) {
  const normalized = normalizePolicyArtifactPath(artifactPath);
  const prefix = 'reports/authorization/canonical/l2-policy-ceiling/';
  const [domainId, contentAddress] = normalized.slice(prefix.length).split('/');
  if (domainId !== artifact.domainId || contentAddress !== artifact.artifactHash.slice(7)) {
    throw new Error('policyArtifactPath content address does not match the approved artifact');
  }
  requireHash(expectedFileHash, 'policyArtifactFileSha256');
  const absolute = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, normalized), label: 'L2 policy ceiling artifact' });
  if ((fs.lstatSync(absolute).mode & 0o077) !== 0) {
    throw new Error('L2 policy ceiling artifact must be private');
  }
  const bytes = fs.readFileSync(absolute);
  if (hashBytes(bytes) !== expectedFileHash) throw new Error('policy ceiling artifact file hash drifted');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch (error) { throw new Error(`policy ceiling artifact is invalid JSON: ${error.message}`); }
  if (JSON.stringify(parsed) !== JSON.stringify(artifact)) throw new Error('policy ceiling artifact content drifted');
  return { path: normalized, sha256: expectedFileHash };
}

function readBoundJson(root, filePath, expectedHash, label, { canonical = false } = {}) {
  const normalized = normalizeReportsPath(filePath, label);
  if (canonical && !normalized.startsWith('reports/authorization/canonical/')) throw new Error(`${label} must be canonical`);
  requireHash(expectedHash, `${label} hash`);
  const absolute = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, normalized), label });
  const bytes = fs.readFileSync(absolute);
  if (hashBytes(bytes) !== expectedHash) throw new Error(`${label} hash drifted`);
  try { return JSON.parse(bytes.toString('utf8')); } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
}

const DOMAIN_L1_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l1', npcs: 'automation-npcs-l1', projectiles: 'automation-projectiles-l1',
  armor_sets: 'automation-armor-sets-l1', buffs: 'automation-buffs-l1', audio: 'automation-audio-first-l1',
  bosses: 'automation-bosses-first-l1', shimmer: 'automation-shimmer-first-l1',
});
function requireDomain(value) { const domain = requireText(value, 'domainId'); if (!Object.hasOwn(DOMAIN_OPERATION_IDS, domain)) throw new Error(`unsupported L2 domain: ${domain}`); return domain; }
function normalizeReportsPath(value, label) { const text = requireText(value, label).replaceAll('\\', '/'); if (!text.startsWith('reports/') || text.includes('..') || text.startsWith('/')) throw new Error(`${label} must be a confined reports path`); return text; }
function normalizeProposalPath(value, operationId) { const text = normalizeReportsPath(value, 'proposalPath'); const prefix = `reports/authorization/canonical/${operationId}/`; if (!text.startsWith(prefix) || !/^[a-f0-9]{64}\/proposal\.json$/.test(text.slice(prefix.length))) throw new Error('proposalPath must be content-addressed'); return text; }
function normalizePolicyArtifactPath(value) { const text = normalizeReportsPath(value, 'policyArtifactPath'); if (!text.startsWith('reports/authorization/canonical/l2-policy-ceiling/') || !/^[a-z][a-z0-9_]{0,63}\/[a-f0-9]{64}\/artifact\.json$/.test(text.slice('reports/authorization/canonical/l2-policy-ceiling/'.length))) throw new Error('policyArtifactPath must be content-addressed'); return text; }
function normalizePromotionPolicyRows(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} are required`);
  const seen = new Set();
  return value.map((row) => {
    const domainId = requireText(row?.domainId, `${label} domainId`);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(domainId) || seen.has(domainId)) {
      throw new Error(`${label} contain duplicate or invalid domains`);
    }
    seen.add(domainId);
    const policyVersion = Number(row?.policyVersion);
    if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) {
      throw new Error(`${label} policyVersion is invalid`);
    }
    const policyHash = requireHash(row?.policyHash, `${label} policyHash`);
    return { domainId, policyVersion, policyHash };
  }).sort((left, right) => left.domainId.localeCompare(right.domainId));
}
function requireHash(value, label) { if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`); return value; }
function requireText(value, label) { const text = String(value ?? '').trim(); if (!text) throw new Error(`${label} is required`); return text; }
function requireTimestamp(value) { const text = requireText(value, 'generatedAt'); if (!Number.isFinite(Date.parse(text))) throw new Error('generatedAt must be an ISO timestamp'); return text; }
function hashBytes(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function hashPayload(value) { return hashBytes(Buffer.from(canonicalJson(value), 'utf8')); }
function canonicalJson(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; }
function stableJson(value) { return canonicalJson(value); }
