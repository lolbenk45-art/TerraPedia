#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertApprovedL2PolicyCeilingArtifact,
  readL2PolicyCeilingArtifact,
} from './l2-policy-ceiling-artifact.mjs';
import {
  readHistoricalSourceHashDisposition,
} from './historical-source-hash-disposition.mjs';
import { verifyFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import { canonicalServerFingerprint, hashCanonicalServerFingerprint } from './automation-database-contract.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertRepositoryOrdinaryDirectory,
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
  resolveTrustedEvidenceRoot,
} from '../lib/private-repository-path.mjs';
import {
  assertL2SerialTransition,
  L2_SERIAL_PROMOTION_ORDER,
} from './l2-promotion-serial-contract.mjs';

export const FORMAL_L2_READINESS_SCHEMA = 'terrapedia-l2-readiness-proposal-input-v1';
export const FORMAL_L2_READINESS_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-promotion',
  npcs: 'automation-npcs-l2-promotion',
  projectiles: 'automation-projectiles-l2-promotion',
  armor_sets: 'automation-armor-sets-l2-promotion',
  buffs: 'automation-buffs-l2-promotion',
  audio: 'automation-audio-l2-promotion',
  bosses: 'automation-bosses-l2-promotion',
  shimmer: 'automation-shimmer-l2-promotion',
});

const TARGET_DOMAINS = Object.freeze(Object.keys(FORMAL_L2_READINESS_OPERATION_IDS));
const DOMAIN_L1_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l1',
  npcs: 'automation-npcs-l1',
  projectiles: 'automation-projectiles-l1',
  armor_sets: 'automation-armor-sets-l1',
  buffs: 'automation-buffs-l1',
  audio: 'automation-audio-first-l1',
  bosses: 'automation-bosses-first-l1',
  shimmer: 'automation-shimmer-first-l1',
});
const REQUIRED_PANEL_IDS = Object.freeze({
  items: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  npcs: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  projectiles: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  armor_sets: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  buffs: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  audio: ['sourceReadiness'],
  bosses: ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'],
  shimmer: ['sourceReadiness'],
});
const REMOVABLE_BLOCKERS = Object.freeze(['owner_l2_promotion', 'separate_l2_scheduler_decision']);
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REPORTS_PREFIX = 'reports/';

/**
 * Convert one immutable Phase 2 display record into the separately validated
 * proposal input consumed by the L2 proposal builder.  This function is
 * intentionally read-only: every source, bundle, reconciliation, policy,
 * registration, and boundary artifact is re-read and hashed before the two
 * authorization blockers are removed.
 */
export function formalizeL2ReadinessInput({
  repoRoot = process.cwd(),
  evidenceRoot,
  readinessRoot,
  domainId,
  serialTransition = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = canonicalRoot(repoRoot, 'repository root');
  const evidence = resolveExplicitPrimaryEvidenceRoot(root, evidenceRoot);
  const domain = requireDomain(domainId);
  const timestamp = requireTimestamp(generatedAt, 'formalization timestamp');
  const sourceRoot = resolveReadinessRoot(root, readinessRoot);
  const source = readAndValidateDisplayEvidence({
    repoRoot: root,
    evidenceRoot: evidence.root,
    readinessRoot: sourceRoot,
    domainId: domain,
  });
  const base = source.record;
  const policySetBinding = source.policySetBinding;
  const l1EvidencePolicySetHash = deriveL1EvidencePolicySetHash(base, domain);
  const transition = assertL2SerialTransition(
    serialTransition ?? defaultSerialTransition(domain),
    {
      domainId: domain,
      operationId: FORMAL_L2_READINESS_OPERATION_IDS[domain],
    },
  );
  const formalization = {
    schemaVersion: FORMAL_L2_READINESS_SCHEMA,
    formalizedAt: timestamp,
    sourceReadinessRoot: relativePath(root, sourceRoot, 'source readiness root'),
    sourceReadinessIndexPath: relativePath(root, source.indexPath, 'source readiness index path'),
    sourceReadinessIndexSha256: source.indexSha256,
    sourceReadinessMatrixPath: relativePath(root, source.matrixPath, 'source readiness matrix path'),
    sourceReadinessMatrixSha256: source.matrixSha256,
    evidenceRoot: evidence.identity,
    l1EvidencePolicySetHash,
    serialTransition: transition,
    policyArtifactCurrentPolicySetHash: policySetBinding.currentPolicySetHash,
    policyArtifactTargetPolicySetHash: policySetBinding.targetPolicySetHash,
    removedBlockingGates: [...REMOVABLE_BLOCKERS],
  };
  const record = {
    ...base,
    schemaVersion: FORMAL_L2_READINESS_SCHEMA,
    mode: 'proposal-input',
    operationId: FORMAL_L2_READINESS_OPERATION_IDS[domain],
    blockingGates: [],
    verdict: 'READY_FOR_L2',
    proposalInput: true,
    readinessRecordRole: 'proposal-input',
    l1EvidencePolicySetHash,
    serialTransition: transition,
    policyArtifactCurrentPolicySetHash: policySetBinding.currentPolicySetHash,
    policyArtifactTargetPolicySetHash: policySetBinding.targetPolicySetHash,
    formalization,
  };
  return Object.freeze({
    record: Object.freeze({
      ...record,
      formalizationHash: hashCanonical(record),
    }),
    source: Object.freeze({
      indexPath: relativePath(root, source.indexPath, 'source readiness index path'),
      matrixPath: relativePath(root, source.matrixPath, 'source readiness matrix path'),
      indexSha256: source.indexSha256,
      matrixSha256: source.matrixSha256,
      evidenceRoot: evidence.identity,
      // In-memory handoff metadata only. This absolute path is never included
      // in the persisted record or its content hash; the writer revalidates it
      // through resolveTrustedEvidenceRoot before reading any artifact.
      evidenceRootPath: evidence.root,
    }),
  });
}

/**
 * Rebuild and compare a proposal-input record.  A caller cannot turn a
 * display-only record into an input by changing two flags: the source index,
 * matrix, every referenced artifact, and the formalization hash must all
 * reproduce exactly.
 */
export function assertFormalL2ReadinessInput(record, {
  repoRoot = process.cwd(),
  evidenceRoot,
  now = null,
} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('formal L2 readiness input must be an object');
  }
  if (record.schemaVersion !== FORMAL_L2_READINESS_SCHEMA
      || record.proposalInput !== true
      || record.readinessRecordRole !== 'proposal-input'
      || record.verdict !== 'READY_FOR_L2'
      || !Array.isArray(record.blockingGates)
      || record.blockingGates.length !== 0
      || !record.formalization
      || record.formalization.schemaVersion !== FORMAL_L2_READINESS_SCHEMA) {
    throw new Error('formal L2 readiness proposal-input envelope is invalid');
  }
  const { formalizationHash, ...payload } = record;
  if (!HASH_PATTERN.test(formalizationHash ?? '') || formalizationHash !== hashCanonical(payload)) {
    throw new Error('formal L2 readiness input hash drifted');
  }
  const sourceRoot = resolveReadinessRoot(repoRoot, record.formalization.sourceReadinessRoot);
  const rebuilt = formalizeL2ReadinessInput({
    repoRoot,
    evidenceRoot: evidenceRoot ?? inferEvidenceRootPath(repoRoot, record.formalization.evidenceRoot),
    readinessRoot: sourceRoot,
    domainId: record.domainId,
    serialTransition: record.serialTransition,
    generatedAt: now ?? record.formalization.formalizedAt,
  }).record;
  if (stableJson(rebuilt) !== stableJson(record)) {
    throw new Error('formal L2 readiness input does not reproduce from its immutable evidence');
  }
  return true;
}

/** Write one immutable, content-addressed proposal-input readiness record. */
export function writeFormalL2ReadinessInput({
  repoRoot = process.cwd(),
  evidenceRoot = null,
  formalized,
} = {}) {
  const root = canonicalRoot(repoRoot, 'repository root');
  const record = formalized?.record ?? formalized;
  if (!record || typeof record !== 'object') throw new TypeError('formalized readiness input is required');
  const handoffEvidenceRoot = evidenceRoot ?? formalized?.source?.evidenceRootPath;
  assertFormalL2ReadinessInput(record, { repoRoot: root, evidenceRoot: handoffEvidenceRoot });
  const operationId = FORMAL_L2_READINESS_OPERATION_IDS[record.domainId];
  if (!operationId) throw new Error('formal readiness domain has no L2 operation');
  const outputPath = path.join(
    root,
    'reports/authorization/canonical',
    operationId,
    'proposal-input',
    record.formalizationHash.slice(7),
    'readiness.json',
  );
  const confined = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: outputPath,
    label: 'formal L2 readiness input',
    createParent: true,
  });
  assertNoExistingEntry(confined, 'formal L2 readiness input');
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { flag: 'wx', mode: 0o600 });
  return Object.freeze({
    path: relativePath(root, confined, 'formal L2 readiness input path'),
    sha256: hashBytes(bytes),
    formalizationHash: record.formalizationHash,
  });
}

function readAndValidateDisplayEvidence({ repoRoot, evidenceRoot, readinessRoot, domainId }) {
  const indexPath = ordinaryFile(readinessRoot, 'readiness-index.json', 'readiness index');
  const matrixPath = ordinaryFile(readinessRoot, 'l2-readiness-matrix.json', 'readiness matrix');
  const index = readJson(indexPath, 'readiness index');
  const matrix = readJson(matrixPath, 'readiness matrix');
  validateIndex(index, domainId);
  validateMatrix(matrix, domainId, index);
  const indexEntry = index.domains.find((entry) => entry?.domainId === domainId);
  const matrixEntry = matrix.domains.find((entry) => entry?.domainId === domainId);
  const recordPath = resolveReadinessArtifact(repoRoot, readinessRoot, indexEntry.readinessPath, 'domain readiness record');
  const record = readJson(recordPath, 'domain readiness record');
  const recordBytesHash = hashFile(recordPath);
  if (recordBytesHash !== indexEntry.readinessSha256) {
    throw new Error('domain readiness record hash drifted from the index');
  }
  const policySetBinding = validateDisplayRecord({
    repoRoot,
    evidenceRoot,
    readinessRoot,
    index,
    matrix,
    indexEntry,
    matrixEntry,
    record,
    domainId,
  });
  return {
    indexPath,
    matrixPath,
    indexSha256: hashFile(indexPath),
    matrixSha256: hashFile(matrixPath),
    record,
    policySetBinding,
  };
}

function validateIndex(index, domainId) {
  if (!index || index.schemaVersion !== 'terrapedia-l2-readiness-index-v1'
      || index.mode !== 'read-only' || index.aggregateVerdict !== 'BLOCKED'
      || !Array.isArray(index.domains) || !index.domains.some((entry) => entry?.domainId === domainId)) {
    throw new Error('readiness index is not a blocked Phase 2 display index');
  }
  requireText(index.runId, 'readiness index runId');
  requireTimestamp(index.generatedAt, 'readiness index generatedAt');
  const domains = index.domains.map((entry) => entry?.domainId);
  if (new Set(domains).size !== domains.length) throw new Error('readiness index contains duplicate domains');
  if (domains.some((value) => !TARGET_DOMAINS.includes(value))) throw new Error('readiness index contains an unsupported domain');
  return true;
}

function validateMatrix(matrix, domainId, index) {
  if (!matrix || matrix.schemaVersion !== 'terrapedia-l2-readiness-matrix-v2'
      || matrix.mode !== 'read-only' || matrix.runId !== index.runId
      || matrix.generatedAt !== index.generatedAt || !Array.isArray(matrix.scope)
      || !matrix.scope.includes(domainId) || !Array.isArray(matrix.domains)) {
    throw new Error('readiness matrix is not bound to the display index');
  }
  const expectedHash = matrix.policySet?.recomputedCurrentHash;
  requireHash(expectedHash, 'matrix current policy-set hash');
  const currentRows = normalizePolicyRows(matrix.policySet?.currentRows, 'matrix current policy rows');
  if (computePolicySetHash(currentRows) !== expectedHash) {
    throw new Error('matrix current policy rows do not match the current policy-set hash');
  }
  const domains = matrix.domains.map((entry) => entry?.domainId);
  if (new Set(domains).size !== domains.length || domains.some((value) => !TARGET_DOMAINS.includes(value))) {
    throw new Error('readiness matrix contains duplicate or unsupported domains');
  }
  if (!matrix.domains.some((entry) => entry?.domainId === domainId)) {
    throw new Error('readiness matrix is missing the requested domain');
  }
  return true;
}

function validateDisplayRecord({
  repoRoot,
  evidenceRoot,
  readinessRoot,
  index,
  matrix,
  indexEntry,
  matrixEntry,
  record,
  domainId,
}) {
  if (!record || record.schemaVersion !== 'terrapedia-l2-domain-readiness-v1'
      || record.mode !== 'read-only' || record.domainId !== domainId
      || record.runId !== index.runId || record.generatedAt !== index.generatedAt
      || record.proposalInput !== false || record.readinessRecordRole !== 'evidence-display-only'
      || record.verdict !== 'BLOCKED' || !Array.isArray(record.blockingGates)) {
    throw new Error('domain record is not an immutable display-only readiness record');
  }
  const blockerSet = new Set(record.blockingGates);
  if (blockerSet.size !== REMOVABLE_BLOCKERS.length
      || REMOVABLE_BLOCKERS.some((blocker) => !blockerSet.has(blocker))) {
    throw new Error(`formalization can remove only ${REMOVABLE_BLOCKERS.join(' and ')} blockers`);
  }
  if (record.ownerPromotion?.status !== 'missing' || record.schedulerDecision?.status !== 'missing') {
    throw new Error('display record must still be awaiting Owner and scheduler decisions');
  }
  if (indexEntry.panelCount !== record.evidence?.panelReports?.length
      || matrixEntry.verdict !== record.verdict
      || matrixEntry.proposalInput !== false
      || matrixEntry.readinessRecordRole !== 'evidence-display-only') {
    throw new Error('index/matrix/domain readiness identities disagree');
  }
  validateDatabaseBoundary(record, index, matrix, domainId);
  validatePanels(repoRoot, readinessRoot, record, domainId);
  validateSharedAndRuntimeEvidence(repoRoot, readinessRoot, record, index);
  const policySetBinding = validatePolicyCeiling(repoRoot, record, domainId);
  validatePromotionBindings({ record, matrix, domainId, policySetBinding });
  const l1EvidencePolicySetHash = deriveL1EvidencePolicySetHash(record, domainId);
  validateL1Evidence(repoRoot, evidenceRoot, record, domainId, l1EvidencePolicySetHash);
  validateAdapterReadback(repoRoot, evidenceRoot, record, domainId);
  return policySetBinding;
}

function validateDatabaseBoundary(record, index, matrix, domainId) {
  const boundary = record.evidence?.databaseBoundary;
  const indexBoundary = index.databaseBoundary;
  const matrixBoundary = matrix.databaseBoundary;
  const fingerprint = canonicalBoundaryFingerprint(boundary, domainId);
  for (const candidate of [indexBoundary, matrixBoundary]) {
    const other = canonicalBoundaryFingerprint(candidate, domainId);
    if (stableJson(other) !== stableJson(fingerprint)) {
      throw new Error('database fingerprint drifted between readiness artifacts');
    }
  }
  if (boundary?.serverFingerprintHash != null
      && boundary.serverFingerprintHash !== hashCanonicalServerFingerprint(fingerprint)) {
    throw new Error('database server fingerprint hash drifted');
  }
  if (boundary?.observedDatabases?.some((name) => !FORMAL_DATABASES.includes(name))) {
    // Extra local schemas are recorded as out-of-scope, never silently folded
    // into the authorization identity.
    if (boundary.scopeStatus !== 'extra_database_observed_out_of_scope'
        && boundary.extraObservedDatabases?.length === 0) {
      throw new Error('extra observed database is not explicitly out of scope');
    }
  }
  return true;
}

function canonicalBoundaryFingerprint(boundary, domainId) {
  if (!boundary || typeof boundary !== 'object') throw new Error(`${domainId} database boundary is required`);
  const fingerprint = boundary.serverFingerprint ?? {
    host: boundary.host,
    port: boundary.serverPort,
    serverUuid: boundary.serverUuid,
    databases: FORMAL_DATABASES,
  };
  const canonical = canonicalServerFingerprint(fingerprint);
  if (!FORMAL_DATABASES.every((name) => canonical.databases.includes(name))) {
    throw new Error('database fingerprint must include the exact formal database set');
  }
  if (canonical.databases.some((name) => !FORMAL_DATABASES.includes(name))) {
    throw new Error('database fingerprint must exclude out-of-scope databases');
  }
  return canonical;
}

function validatePanels(repoRoot, readinessRoot, record, domainId) {
  const expected = REQUIRED_PANEL_IDS[domainId];
  const panels = record.evidence?.panelReports;
  if (!Array.isArray(panels) || panels.length !== expected.length) throw new Error(`${domainId} panel coverage is incomplete`);
  const seen = new Set();
  for (const panel of panels) {
    const file = resolveReadinessArtifact(repoRoot, readinessRoot, panel?.path, `${domainId} panel`);
    const actual = hashFile(file);
    if (actual !== panel.sha256) throw new Error(`${domainId} panel hash drifted`);
    const value = readJson(file, `${domainId} panel`);
    if (value.domainId !== domainId || !expected.includes(value.panelId)
        || seen.has(value.panelId) || !['pass', 'warning'].includes(value.status)
        || (Array.isArray(value.blockingReasons) && value.blockingReasons.length > 0)
        || Number(value.summary?.blockedCount ?? value.summary?.blockingCount ?? 0) > 0) {
      throw new Error(`${domainId} panel is blocked, duplicated, or invalid`);
    }
    seen.add(value.panelId);
  }
  if (seen.size !== expected.length) throw new Error(`${domainId} panel coverage is incomplete`);
}

function validateSharedAndRuntimeEvidence(repoRoot, readinessRoot, record, index) {
  const shared = record.evidence?.sharedReports;
  if (!Array.isArray(shared) || shared.length < 3) throw new Error('shared readiness reports are required');
  for (const ref of shared) {
    const file = resolveRepositoryArtifact(repoRoot, ref.path, 'shared readiness report');
    if (hashFile(file) !== ref.sha256) throw new Error('shared readiness report hash drifted');
  }
  const ui = record.evidence?.uiReadiness;
  if (!ui || ui.status !== 'pass') throw new Error('UI readiness evidence is required');
  const uiFile = resolveRepositoryArtifact(repoRoot, ui.path, 'UI readiness report');
  if (hashFile(uiFile) !== ui.sha256) throw new Error('UI readiness report hash drifted');
  const uiJson = readJson(uiFile, 'UI readiness report');
  if (uiJson.schemaVersion !== 'terrapedia-l2-ui-readiness-v1' || uiJson.mode !== 'read-only') {
    throw new Error('UI readiness report schema is invalid');
  }
  const preflight = record.evidence?.v2Preflight;
  if (!preflight || preflight.status !== 'blocked') throw new Error('V2 preflight evidence is required');
  const preflightFile = resolveReadinessArtifact(repoRoot, readinessRoot, preflight.path, 'V2 preflight report');
  if (hashFile(preflightFile) !== preflight.sha256) throw new Error('V2 preflight report hash drifted');
  const preflightJson = readJson(preflightFile, 'V2 preflight report');
  if (preflightJson.schemaVersion !== 'terrapedia-l2-v2-preflight-readback-v1'
      || preflightJson.mode !== 'read-only' || Number(preflightJson.httpStatus) !== 200
      || preflightJson.responseSuccess !== true
      || preflightJson.snapshot?.policySetHash !== record.currentPolicy.policySetHash
      || Number(preflightJson.snapshot?.counts?.liveAttempts) !== 0
      || Number(preflightJson.snapshot?.counts?.sweepClaims) !== 0) {
    throw new Error('V2 preflight evidence is stale or not clean');
  }
  if (index.uiReadiness?.path !== ui.path || index.runtimeBoundary?.schedulerPreflight?.path !== preflight.path) {
    throw new Error('runtime evidence references drifted from the index');
  }
}

function validatePolicyCeiling(repoRoot, record, domainId) {
  const ceiling = record.policyCeiling;
  if (!ceiling || ceiling.status !== 'verified' || ceiling.level !== 'L2'
      || Number(ceiling.policyVersion) <= Number(record.currentPolicy?.policyVersion)) {
    throw new Error('verified L2 policy ceiling is required');
  }
  // The content-addressed directory is keyed by the immutable artifact hash,
  // not by the target policy hash. The target policy hash is checked against
  // the approved artifact payload below.
  const artifactPath = requireCanonicalPolicyArtifactPath(ceiling.artifactPath, domainId);
  const artifactFile = ordinaryFile(repoRoot, artifactPath, 'L2 policy ceiling artifact');
  if (hashFile(artifactFile) !== ceiling.artifactFileSha256) throw new Error('L2 policy ceiling artifact file hash drifted');
  const artifact = readL2PolicyCeilingArtifact({ repoRoot, artifactPath, requireApproved: true });
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const artifactCurrent = artifact.currentPolicy;
  const recordCurrent = record.currentPolicy;
  if (artifact.domainId !== domainId
      || !artifactCurrent
      || artifactCurrent.domainId !== domainId
      || (recordCurrent.domainId != null && recordCurrent.domainId !== domainId)
      || Number(artifactCurrent.policyVersion) !== Number(recordCurrent.policyVersion)
      || artifactCurrent.policyHash !== recordCurrent.policyHash
      || artifactCurrent.level !== recordCurrent.level
      || artifactCurrent.operationalState !== recordCurrent.operationalState
      || Number(artifact.targetPolicy.policyVersion) !== Number(ceiling.policyVersion)
      || artifact.targetPolicy.policyHash !== ceiling.policyHash
      || artifact.targetPolicySetHash !== ceiling.policySetHash
      || computePolicyHash(artifact.targetPolicy.policyJson) !== artifact.targetPolicy.policyHash) {
    throw new Error('L2 policy ceiling artifact identity does not match the display record');
  }
  const registration = ceiling.registration;
  if (!registration || !requireText(registration.resultPath, 'registration result path')
      || !requireText(registration.commitMarkerPath, 'registration commit marker path')) {
    throw new Error('authoritative L2 policy registration is required');
  }
  const resultPath = requireRegistrationPath(registration.resultPath, domainId, false);
  const markerPath = requireRegistrationPath(registration.commitMarkerPath, domainId, true);
  const resultFile = ordinaryFile(repoRoot, resultPath, 'L2 policy registration result');
  const markerFile = ordinaryFile(repoRoot, markerPath, 'L2 policy registration commit marker');
  if (hashFile(resultFile) !== registration.resultFileSha256
      || hashFile(markerFile) !== registration.commitMarkerFileSha256) {
    throw new Error('L2 policy registration file hash drifted');
  }
  const result = readJson(resultFile, 'L2 policy registration result');
  const marker = readJson(markerFile, 'L2 policy registration commit marker');
  if (result.schemaVersion !== 1 || result.status !== 'pending' || result.authoritative !== false
      || result.domainId !== domainId || result.policyHash !== ceiling.policyHash
      || result.policySetHash !== ceiling.policySetHash || result.artifactHash !== artifact.artifactHash
      || !requireText(result.actor, 'registration actor') || !requireText(result.reason, 'registration reason')
      || !requireText(result.authorizationReference, 'registration authorization reference')
      || !requireText(result.decisionIdentity, 'registration decision identity')
      || !HASH_PATTERN.test(result.packetHash ?? '')) {
    throw new Error('L2 policy registration result semantics are invalid');
  }
  if (marker.schemaVersion !== 1 || marker.status !== 'committed' || marker.authoritative !== true
      || marker.registrationStatus !== 'registered' || marker.operationId !== result.operationId
      || marker.domainId !== result.domainId || marker.policyHash !== result.policyHash
      || marker.policySetHash !== result.policySetHash || marker.artifactHash !== result.artifactHash
      || marker.registrationDecisionIdentity !== result.decisionIdentity
      || marker.registrationPacketHash !== result.packetHash) {
    throw new Error('L2 policy registration commit marker semantics are invalid');
  }
  return Object.freeze({
    artifactHash: artifact.artifactHash,
    artifactPath,
    artifactFileSha256: hashFile(artifactFile),
    currentPolicySetHash: artifact.currentPolicySetHash,
    targetPolicySetHash: artifact.targetPolicySetHash,
    currentPolicyRows: artifact.currentPolicyRows,
    registration: Object.freeze({
      resultPath,
      resultFileSha256: registration.resultFileSha256,
      commitMarkerPath: markerPath,
      commitMarkerFileSha256: registration.commitMarkerFileSha256,
      registrationDecisionIdentity: result.decisionIdentity,
      commitMarkerDecisionIdentity: marker.finalizerDecisionIdentity
        ?? marker.registrationDecisionIdentity,
    }),
  });
}

function validatePromotionBindings({ record, matrix, domainId, policySetBinding }) {
  const currentRows = normalizePolicyRows(
    record.promotionCurrentPolicyRows,
    'promotion current policy rows',
  );
  const targetRows = normalizePolicyRows(
    record.promotionTargetPolicyRows,
    'promotion target policy rows',
  );
  if (computePolicySetHash(currentRows) !== record.currentPolicy.policySetHash) {
    throw new Error('promotion current policy rows do not match the live policy-set hash');
  }
  if (stableJson(normalizePolicyRows(matrix.policySet.currentRows, 'matrix current policy rows'))
      !== stableJson(currentRows)) {
    throw new Error('promotion current policy rows drifted from the readiness matrix');
  }
  const artifactRows = normalizePolicyRows(
    policySetBinding.currentPolicyRows,
    'policy artifact current policy rows',
  );
  const artifactDomains = artifactRows.map((row) => row.domainId);
  const currentDomains = currentRows.map((row) => row.domainId);
  const targetDomains = targetRows.map((row) => row.domainId);
  if (stableJson(currentDomains) !== stableJson(artifactDomains)
      || stableJson(targetDomains) !== stableJson(artifactDomains)) {
    throw new Error('promotion policy rows must carry the complete registered policy domain set');
  }
  const current = currentRows.find((row) => row.domainId === domainId);
  if (!current
      || Number(current.policyVersion) !== Number(record.currentPolicy.policyVersion)
      || current.policyHash !== record.currentPolicy.policyHash) {
    throw new Error('promotion current policy rows do not carry the exact domain policy');
  }
  const expectedTargetRows = currentRows.map((row) => (
    row.domainId === domainId
      ? {
        domainId,
        policyVersion: Number(record.policyCeiling.policyVersion),
        policyHash: record.policyCeiling.policyHash,
      }
      : row
  ));
  if (stableJson(targetRows) !== stableJson(normalizePolicyRows(
    expectedTargetRows,
    'expected promotion target policy rows',
  ))) {
    throw new Error('promotion target policy rows do not match the exact domain target policy');
  }
  const expectedProvenance = {
    artifactHash: policySetBinding.artifactHash,
    artifactPath: policySetBinding.artifactPath,
    artifactFileSha256: policySetBinding.artifactFileSha256,
    currentPolicySetHash: policySetBinding.currentPolicySetHash,
    targetPolicySetHash: policySetBinding.targetPolicySetHash,
    registration: policySetBinding.registration,
  };
  if (stableJson(record.policyArtifactProvenance) !== stableJson(expectedProvenance)) {
    throw new Error('immutable policy artifact provenance is required and must match the registered artifact');
  }
  return true;
}

function normalizePolicyRows(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} are required`);
  }
  try {
    return canonicalizePolicySet(value.map((row) => ({
      domainId: row?.domainId,
      policyVersion: Number(row?.policyVersion),
      policyHash: row?.policyHash,
    })));
  } catch (error) {
    throw new Error(`${label} are invalid: ${error.message}`);
  }
}

function validateL1Evidence(repoRoot, evidenceRoot, record, domainId, l1EvidencePolicySetHash) {
  const current = record.currentPolicy;
  // Older display captures may omit currentPolicy.domainId, but an explicitly
  // present value must never name another lane. All identity fields remain
  // mandatory regardless of whether that optional domain field is present.
  if (!current
      || (current.domainId != null && current.domainId !== domainId)
      || current.level !== 'L1'
      || current.operationalState !== 'ACTIVE'
      || !Number.isSafeInteger(Number(current.policyVersion))
      || Number(current.policyVersion) < 1
      || !HASH_PATTERN.test(current.policyHash ?? '')
      || !HASH_PATTERN.test(current.policySetHash ?? '')) {
    throw new Error('current L1 policy identity is invalid for the requested domain');
  }
  const runs = record.l1Runs;
  if (!Array.isArray(runs) || runs.length < 3 || new Set(runs.map((run) => run?.runId)).size !== runs.length) {
    throw new Error('at least three distinct L1 runs are required');
  }
  let fullCount = 0;
  for (const run of runs) {
    if (run?.status !== 'COMPLETED' || run?.applyStatus !== 'COMMITTED'
        || run.operationId !== DOMAIN_L1_OPERATION_IDS[domainId]
        || run.policySetHash !== l1EvidencePolicySetHash) {
      throw new Error(`L1 run ${run?.runId ?? ''} is not bound to the current policy`);
    }
    const bundlePath = resolveEvidenceArtifact(evidenceRoot, run.bundlePath, 'L1 bundle');
    if (hashFile(bundlePath) !== run.bundleSha256) throw new Error(`L1 bundle ${run.runId} file hash drifted`);
    const bundle = readJson(bundlePath, `L1 bundle ${run.runId}`);
    const { bundleHash, ...bundleBody } = bundle;
    if (!HASH_PATTERN.test(bundleHash ?? '') || hashCanonical(bundleBody) !== bundleHash
        || bundle.runId !== run.runId || bundle.domainId !== domainId
        || bundle.operationId !== DOMAIN_L1_OPERATION_IDS[domainId]
        || bundle.databaseName !== 'terria_v1_local'
        || bundle.policy?.level !== 'L1' || bundle.policy?.operationalState !== 'ACTIVE'
        || Number(bundle.policy?.policyVersion) !== Number(current.policyVersion)
        || bundle.policy?.policyHash !== current.policyHash
        || bundle.policy?.policySetHash !== l1EvidencePolicySetHash) {
      throw new Error(`L1 bundle ${run.runId} content identity is invalid`);
    }
    const sourcePath = resolveEvidenceArtifact(evidenceRoot, bundle.source?.path, 'L1 source');
    if (hashFile(sourcePath) !== bundle.source.sha256) throw new Error(`L1 source ${run.runId} hash drifted`);
    readJson(sourcePath, `L1 source ${run.runId}`);
    const evidencePath = resolveEvidenceArtifact(evidenceRoot, run.evidencePath, 'L1 reconciliation evidence');
    if (hashFile(evidencePath) !== run.evidenceSha256) throw new Error(`L1 evidence ${run.runId} hash drifted`);
    const evidence = readJson(evidencePath, `L1 reconciliation evidence ${run.runId}`);
    verifyFullReconciliationEvidence(evidence, {
      domainId,
      runId: run.runId,
      policyVersion: current.policyVersion,
      policyHash: current.policyHash,
      policySetHash: l1EvidencePolicySetHash,
    });
    verifyReconciliationFiles(evidenceRoot, evidence);
    if (run.fullReconciliation !== true) throw new Error(`L1 run ${run.runId} is not full reconciliation evidence`);
    fullCount += 1;
  }
  if (fullCount < 1 || record.fullReconciliation?.status !== 'verified') {
    throw new Error('one verified full reconciliation run is required');
  }
  const selected = runs.find((run) => run.runId === record.fullReconciliation.runId
    || run.evidencePath === record.fullReconciliation.evidence);
  if (!selected || selected.evidencePath !== record.fullReconciliation.evidence
      || selected.evidenceSha256 !== record.fullReconciliation.evidenceSha256) {
    throw new Error('full reconciliation pointer is not bound to a selected L1 run');
  }
  return true;
}

function deriveL1EvidencePolicySetHash(record, domainId) {
  const candidates = [
    ...(Array.isArray(record?.l1EvidenceAdapterReadback?.qualifyingL1Runs)
      ? record.l1EvidenceAdapterReadback.qualifyingL1Runs
      : []),
    ...(Array.isArray(record?.l1Runs) ? record.l1Runs : []),
  ];
  const hashes = [...new Set(candidates
    .filter((run) => run?.policySetHash != null)
    .map((run) => run.policySetHash))];
  if (hashes.length !== 1 || !HASH_PATTERN.test(hashes[0])) {
    throw new Error(`${domainId} L1 evidence policy-set identity is incomplete`);
  }
  return hashes[0];
}

function defaultSerialTransition(domainId) {
  const sequenceIndex = L2_SERIAL_PROMOTION_ORDER.indexOf(domainId);
  if (sequenceIndex < 0) throw new Error('serial transition domain is unsupported');
  return {
    schemaVersion: 1,
    order: L2_SERIAL_PROMOTION_ORDER,
    sequenceIndex,
    predecessor: null,
  };
}

/**
 * Build the serial transition envelope from explicit CLI arguments.
 *
 * The first domain may omit the sequence index (it defaults to zero), but it
 * may not carry any predecessor fields. Every later domain must provide the
 * complete predecessor identity observed from the immediately preceding
 * committed promotion. Keeping this translation here makes the CLI obey the
 * same fail-closed contract as the programmatic API; silently defaulting a
 * later domain to a null predecessor would permit an unsafe reorder.
 */
export function buildSerialTransitionFromCliArgs({ domainId, args = {} } = {}) {
  const domain = requireDomain(domainId);
  const sequenceIndex = L2_SERIAL_PROMOTION_ORDER.indexOf(domain);
  const rawSequenceIndex = args?.['sequence-index'] ?? args?.['serial-sequence-index'];
  const predecessorKeys = [
    'predecessor-domain',
    'predecessor-operation-id',
    'predecessor-decision-identity',
    'predecessor-packet-hash',
    'predecessor-post-policy-set-hash',
  ];
  const suppliedPredecessor = predecessorKeys.some((key) => Object.hasOwn(args ?? {}, key));
  const parsedSequenceIndex = rawSequenceIndex == null || String(rawSequenceIndex).trim() === ''
    ? (sequenceIndex === 0 ? 0 : null)
    : parseSequenceIndex(rawSequenceIndex);

  if (sequenceIndex === 0) {
    if (parsedSequenceIndex !== 0) {
      throw new Error('first serial L2 promotion requires sequence-index 0');
    }
    if (suppliedPredecessor) {
      throw new Error('first serial L2 promotion must not declare predecessor arguments');
    }
    return assertL2SerialTransition(defaultSerialTransition(domain), {
      domainId: domain,
      operationId: FORMAL_L2_READINESS_OPERATION_IDS[domain],
    });
  }

  if (parsedSequenceIndex == null) {
    throw new Error('non-first serial L2 promotion requires an explicit sequence-index');
  }
  const predecessor = {
    domainId: requireText(args?.['predecessor-domain'], 'predecessor-domain'),
    operationId: requireText(args?.['predecessor-operation-id'], 'predecessor-operation-id'),
    decisionIdentity: requireText(
      args?.['predecessor-decision-identity'],
      'predecessor-decision-identity',
    ),
    packetHash: requireHash(
      args?.['predecessor-packet-hash'],
      'predecessor-packet-hash',
    ),
    postPolicySetHash: requireHash(
      args?.['predecessor-post-policy-set-hash'],
      'predecessor-post-policy-set-hash',
    ),
  };
  return assertL2SerialTransition({
    schemaVersion: 1,
    order: L2_SERIAL_PROMOTION_ORDER,
    sequenceIndex: parsedSequenceIndex,
    predecessor,
  }, {
    domainId: domain,
    operationId: FORMAL_L2_READINESS_OPERATION_IDS[domain],
  });
}

function parseSequenceIndex(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('sequence-index must be a non-negative integer');
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error('sequence-index must be a safe integer');
  return parsed;
}

function verifyReconciliationFiles(evidenceRoot, evidence) {
  for (const [pathField, hashField, label] of [
    ['sourceArtifactPath', 'sourceHash', 'reconciliation source artifact'],
    ['ownedTableReadbackPath', 'ownedTableReadbackHash', 'reconciliation table readback'],
    ['attemptStatePath', 'attemptStateHash', 'reconciliation attempt state'],
  ]) {
    const file = resolveEvidenceArtifact(evidenceRoot, evidence[pathField], label);
    if (hashFile(file) !== evidence[hashField]) throw new Error(`${label} hash drifted`);
  }
}

function validateAdapterReadback(repoRoot, evidenceRoot, record, domainId) {
  const adapter = record.l1EvidenceAdapterReadback;
  if (!adapter || adapter.status !== 'pass' || Number(adapter.distinctCommittedL1Runs) < 3
      || !Array.isArray(adapter.qualifyingL1Runs) || adapter.qualifyingL1Runs.length < 3) {
    throw new Error('adapter-qualified three-run evidence is required');
  }
  const runIds = new Set(record.l1Runs.map((run) => run.runId));
  if (adapter.qualifyingL1Runs.some((run) => !runIds.has(run?.runId))) {
    throw new Error('adapter qualifying runs are not the exact display runs');
  }
  const excluded = adapter.excludedHistoricalRuns;
  if (excluded != null && !Array.isArray(excluded)) throw new Error('excluded historical runs must be an array');
  for (const entry of excluded ?? []) {
    if (entry?.domainId !== domainId || !requireText(entry.runId, 'excluded historical runId')
        || entry.reasonCode !== 'legacy_semantic_json_source_hash'
        || entry.disposition !== 'exclude_from_l1_qualification') {
      throw new Error('historical disposition metadata is invalid');
    }
    const dispositionPath = requireText(entry.dispositionPath, 'historical disposition path');
    const disposition = readHistoricalSourceHashDisposition({
      repoRoot,
      dispositionPath,
      now: new Date().toISOString(),
    });
    if (disposition.disposition.domainId !== domainId
        || disposition.disposition.artifactHash !== entry.dispositionArtifactHash
        || disposition.disposition.entries?.[0]?.runId !== entry.runId) {
      throw new Error('historical disposition does not match excluded run metadata');
    }
  }
  if (adapter.databaseEvidenceRoot
      && stableJson(adapter.databaseEvidenceRoot) !== stableJson(record.evidence.databaseEvidenceRoot)) {
    throw new Error('adapter evidence root identity drifted');
  }
  // Ensure each adapter-selected path is also readable from the trusted root;
  // this catches a linked-worktree root/hash mismatch before proposal input is
  // emitted.
  for (const run of adapter.qualifyingL1Runs) {
    resolveEvidenceArtifact(evidenceRoot, run.bundlePath, 'adapter L1 bundle');
    resolveEvidenceArtifact(evidenceRoot, run.evidencePath, 'adapter L1 evidence');
  }
  return true;
}

function resolveExplicitPrimaryEvidenceRoot(repoRoot, evidenceRoot) {
  if (evidenceRoot == null || String(evidenceRoot).trim() === '') {
    throw new Error('an explicit corresponding primary-worktree evidence root is required');
  }
  const descriptor = resolveTrustedEvidenceRoot({ repoRoot, evidenceRoot });
  if (descriptor.kind !== 'primary-worktree') {
    throw new Error('formal readiness input requires an explicit primary-worktree evidence root');
  }
  return Object.freeze({ root: descriptor.root, identity: {
    kind: descriptor.kind,
    repositoryRelativeRoot: descriptor.repositoryRelativeRoot,
  } });
}

function inferEvidenceRootPath(repoRoot, identity) {
  if (identity?.kind === 'caller-worktree') return path.resolve(repoRoot);
  // The identity intentionally does not carry an arbitrary filesystem path;
  // callers must supply it when rebuilding from a linked worktree.
  throw new Error('explicit primary-worktree evidence root is required when rebuilding formal readiness input');
}

function resolveReadinessRoot(repoRoot, value) {
  const raw = requireText(value, 'readiness root').replaceAll('\\', '/');
  // Persisted readiness roots are repository-relative. Resolve those against
  // the supplied caller root rather than the process CWD (which may be a
  // different worktree); absolute values are still checked against that same
  // root below.
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repoRoot, raw);
  const relative = path.relative(path.resolve(repoRoot), candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('readiness root must remain inside the caller worktree');
  }
  return assertRepositoryOrdinaryDirectory({ repoRoot, filePath: candidate, label: 'readiness root' });
}

function resolveReadinessArtifact(repoRoot, readinessRoot, value, label) {
  const normalized = normalizeReportPath(value, label);
  const absolute = path.resolve(repoRoot, normalized);
  const relativeToRun = path.relative(path.resolve(readinessRoot), absolute);
  if (!relativeToRun || relativeToRun === '..' || relativeToRun.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRun)) {
    throw new Error(`${label} must remain inside the readiness root`);
  }
  return ordinaryFile(repoRoot, normalized, label);
}

function resolveRepositoryArtifact(repoRoot, value, label) {
  return ordinaryFile(repoRoot, normalizeReportPath(value, label), label);
}

function resolveEvidenceArtifact(evidenceRoot, value, label) {
  const normalized = normalizeReportPath(value, label);
  return ordinaryFile(evidenceRoot, normalized, label);
}

function requireCanonicalPolicyArtifactPath(value, domainId) {
  const normalized = normalizeReportPath(value, 'L2 policy artifact path');
  const match = /^reports\/authorization\/canonical\/l2-policy-ceiling\/([a-z][a-z0-9_]{0,63})\/([a-f0-9]{64})\/artifact\.json$/.exec(normalized);
  if (!match || match[1] !== domainId) {
    throw new Error('L2 policy artifact path is not bound to the exact domain and policy hash');
  }
  return normalized;
}

function requireRegistrationPath(value, domainId, marker) {
  const normalized = normalizeReportPath(value, 'registration path');
  const operationId = FORMAL_L2_READINESS_OPERATION_IDS[domainId]
    .replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
  const expected = `reports/authorization/canonical/${operationId}.result.json${marker ? '.commit.json' : ''}`;
  if (normalized !== expected) throw new Error('registration path is not the exact domain-scoped path');
  return normalized;
}

function normalizeReportPath(value, label) {
  const text = requireText(value, label).replaceAll('\\', '/');
  if (path.posix.isAbsolute(text) || !text.startsWith(REPORTS_PREFIX) || text.includes('..')) {
    throw new Error(`${label} must be a confined reports path`);
  }
  return text;
}

function ordinaryFile(root, relativeOrAbsolute, label) {
  const absolute = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(root, relativeOrAbsolute);
  return assertRepositoryOrdinaryFile({ repoRoot: root, filePath: absolute, label });
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function readJsonAt(root, relativePath, label) {
  return readJson(ordinaryFile(root, relativePath, label), label);
}

function canonicalRoot(value, label) {
  const resolved = path.resolve(requireText(value, label));
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  return resolved;
}

function relativePath(root, value, label) {
  const absolute = path.resolve(value);
  const relative = path.relative(path.resolve(root), absolute).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
  return relative;
}

function requireDomain(value) {
  const domain = requireText(value, 'domainId');
  if (!TARGET_DOMAINS.includes(domain)) throw new Error(`unsupported L2 readiness domain: ${domain}`);
  return domain;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function hashFile(filePath) {
  return hashBytes(fs.readFileSync(filePath));
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashCanonical(value) {
  return hashBytes(Buffer.from(canonicalJson(value), 'utf8'));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function stableJson(value) {
  return canonicalJson(value);
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

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const index = arg.indexOf('=');
    if (index < 0) result[arg.slice(2)] = true;
    else result[arg.slice(2, index)] = arg.slice(index + 1);
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const evidenceRoot = requireText(args['evidence-root'], 'evidence-root');
  const readinessRoot = requireText(args['readiness-root'], 'readiness-root');
  const domainId = requireDomain(args.domain);
  const formalized = formalizeL2ReadinessInput({
    repoRoot,
    evidenceRoot,
    readinessRoot,
    domainId,
    serialTransition: buildSerialTransitionFromCliArgs({ domainId, args }),
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
  });
  const written = writeFormalL2ReadinessInput({ repoRoot, evidenceRoot, formalized });
  process.stdout.write(`${JSON.stringify({ ...written, domainId, proposalInput: true })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`formal L2 readiness input failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
