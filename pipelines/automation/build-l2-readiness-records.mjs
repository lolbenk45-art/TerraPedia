#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryOrdinaryDirectory,
  assertRepositoryPathConfinement,
  resolveTrustedEvidenceRoot,
} from '../lib/private-repository-path.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { createMysqlAutomationPolicyDecisionAdapter } from './run-automation-policy-decision.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';
import { readL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import {
  buildL2PolicyCeilingRegistrationInput,
  readAuthoritativeL2PolicyCeilingRegistration,
} from './register-l2-policy-ceiling.mjs';

export const TARGET_DOMAINS = Object.freeze([
  'items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer',
]);
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

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const V2_PREFLIGHT_OPERATION_ID = 'canonical-crawler-v2-scheduler-activation';
const UI_PUBLIC_TARGETS = Object.freeze([
  Object.freeze({ domain: 'items', list: '/items', detail: '/items/1' }),
  Object.freeze({ domain: 'npcs', list: '/npcs', detail: '/npcs/17' }),
  Object.freeze({ domain: 'projectiles', list: '/projectiles' }),
  Object.freeze({ domain: 'armor-sets', list: '/armor-sets', detail: '/armor-sets/1' }),
  Object.freeze({ domain: 'buffs', list: '/buffs', detail: '/buffs/1' }),
  Object.freeze({ domain: 'audio', list: '/audio' }),
  Object.freeze({ domain: 'bosses', list: '/bosses', detail: '/bosses/34' }),
  Object.freeze({ domain: 'shimmer', list: '/shimmer' }),
]);
const UI_ADMIN_ROUTES = Object.freeze([
  '/items',
  '/entities/npcs',
  '/entities/projectiles',
  '/entities/armor-sets',
  '/entities/buffs',
  '/operations/audio-assets',
  '/entities/bosses',
  '/recipes/shimmer',
]);
const REQUIRED_PANEL_IDS = Object.freeze({
  items: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  npcs: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  projectiles: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  armor_sets: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  buffs: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  audio: Object.freeze(['sourceReadiness']),
  bosses: Object.freeze(['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend']),
  shimmer: Object.freeze(['sourceReadiness']),
});
const L2_CEILING_REGISTRATION_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-policy-ceiling-registration',
  npcs: 'automation-npcs-l2-policy-ceiling-registration',
  projectiles: 'automation-projectiles-l2-policy-ceiling-registration',
  armor_sets: 'automation-armor-sets-l2-policy-ceiling-registration',
  buffs: 'automation-buffs-l2-policy-ceiling-registration',
  audio: 'automation-audio-l2-policy-ceiling-registration',
  bosses: 'automation-bosses-l2-policy-ceiling-registration',
  shimmer: 'automation-shimmer-l2-policy-ceiling-registration',
});
const FORBIDDEN_ACTIONS = Object.freeze([
  'create_l2_proposal',
  'create_packet_or_permit',
  'owner_promotion',
  'scheduler_activation',
  'database_write',
  'source_refresh',
  'replay_consumed_operation',
]);

export function buildL2ReadinessArtifacts({
  repoRoot = process.cwd(),
  databaseEvidenceRoot = null,
  historicalEvidenceRoot = null,
  evidenceRoot = null,
  l1EvidencePolicySetHash,
  runId,
  generatedAt,
  runRoot,
  priorRoot,
  panelRoot,
  sharedReports,
  uiReadinessPath,
  uiReadiness,
  v2PreflightPath,
  v2Preflight,
  adapterReadback,
  databaseBoundary,
  crossDb,
  relation,
  acceptancePath = null,
  acceptanceSummary = null,
  priorMatrixHash = null,
  domains = TARGET_DOMAINS,
} = {}) {
  const root = path.resolve(repoRoot);
  const evidenceRootInputs = [databaseEvidenceRoot, historicalEvidenceRoot, evidenceRoot]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  for (const value of evidenceRootInputs) {
    if (!path.isAbsolute(value) || path.resolve(value) !== value || value.endsWith(path.sep)) {
      throw new Error('evidence root must be a canonical absolute directory path');
    }
  }
  const normalizedEvidenceRoots = [...new Set(evidenceRootInputs.map((value) => path.resolve(value)))];
  if (normalizedEvidenceRoots.length > 1) throw new Error('conflicting evidence root inputs');
  const evidenceRootDescriptor = resolveTrustedEvidenceRoot({
    repoRoot: root,
    evidenceRoot: evidenceRootInputs[0] ?? null,
  });
  const evidenceRootPath = evidenceRootDescriptor.root;
  const evidenceRootIdentity = Object.freeze({
    kind: evidenceRootDescriptor.kind,
    repositoryRelativeRoot: evidenceRootDescriptor.repositoryRelativeRoot,
  });
  const normalizedRunId = requireRunId(runId);
  const timestamp = requireTimestamp(generatedAt);
  const absoluteRunRoot = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, runRoot ?? `reports/runtime/local-data-chain-closure/${normalizedRunId.slice(0, 8)}/l2-readiness/${normalizedRunId}`),
    label: 'L2 readiness run root',
  });
  const selectedDomains = normalizeDomains(domains);
  if (!adapterReadback || typeof adapterReadback !== 'object') throw new Error('adapter readback is required');
  if (!HASH_PATTERN.test(adapterReadback.policySetHash ?? '')) throw new Error('adapter policy-set hash is required');
  const evidencePolicySetHash = requireHash(
    l1EvidencePolicySetHash,
    'l1 evidence policy-set hash',
  );
  if (adapterReadback.l1EvidencePolicySetHash != null
      && adapterReadback.l1EvidencePolicySetHash !== evidencePolicySetHash) {
    throw new Error('adapter L1 evidence policy-set hash does not match the explicit input');
  }
  const promotionCurrentPolicyRows = normalizePolicyRows(
    adapterReadback.policyRows,
    'adapter current policy rows',
  );
  if (computePolicySetHash(promotionCurrentPolicyRows) !== adapterReadback.policySetHash) {
    throw new Error('adapter current policy rows do not match the policy-set hash');
  }
  for (const adapterRootIdentity of [adapterReadback.evidenceRoot, adapterReadback.databaseEvidenceRoot]) {
    if (adapterRootIdentity
        && JSON.stringify(adapterRootIdentity) !== JSON.stringify(evidenceRootIdentity)) {
    throw new Error('adapter evidence root identity drifted from the readiness evidence root');
    }
  }
  if (!databaseBoundary || typeof databaseBoundary !== 'object') throw new Error('database boundary is required');
  assertHistoricalDispositionServerFingerprintBinding(adapterReadback, databaseBoundary);
  if (!crossDb || !relation) throw new Error('shared read-only reports are required');
  assertBoundReport(root, sharedReports?.crossDbPath, crossDb, 'cross-db report', timestamp);
  assertBoundReport(root, sharedReports?.relationJsonPath, relation, 'relation-health report', timestamp);
  const uiEvidence = buildUiReadinessEvidence({
    repoRoot: root,
    reportPath: uiReadinessPath,
    report: uiReadiness,
    generatedAt: timestamp,
  });
  const v2PreflightEvidence = buildV2PreflightEvidence({
    repoRoot: root,
    runRoot: absoluteRunRoot,
    reportPath: v2PreflightPath,
    report: v2Preflight,
    generatedAt: timestamp,
    policySetHash: adapterReadback.policySetHash,
  });
  const acceptanceEvidence = buildAcceptanceEvidence({
    repoRoot: root,
    reportPath: acceptancePath,
    summary: acceptanceSummary,
    databaseBoundary,
    generatedAt: timestamp,
  });
  const panelDirectory = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, panelRoot ?? path.join(absoluteRunRoot, 'domain')),
    label: 'L2 readiness panel root',
  });
  if (path.relative(absoluteRunRoot, panelDirectory) !== 'domain') {
    throw new Error('L2 readiness panel root must belong to the current readiness run root');
  }
  const priorRootDescriptor = resolvePriorReadRoot({
    repoRoot: root,
    evidenceRootPath,
    priorRoot,
  });
  const priorDirectory = priorRootDescriptor.path;
  const priorRepoRoot = priorRootDescriptor.root;
  const records = selectedDomains.map((domainId) => {
    const templatePath = assertRepositoryOrdinaryFile({
      repoRoot: priorRepoRoot,
      filePath: path.join(priorDirectory, 'domain', domainId, 'readiness.json'),
      label: `${domainId} readiness template`,
    });
    const template = readJson(templatePath, `${domainId} readiness template`);
    const adapterResult = adapterReadback.domains?.[domainId];
    const adapterEvidence = adapterResult?.evidence;
    const alreadyL2 = adapterResult?.policy?.currentLevel === 'L2';
    const adapterRunsBound = !alreadyL2 && adapterResult?.status === 'pass'
      && Array.isArray(adapterEvidence?.qualifyingL1Runs);
    // Once an adapter result is present, the prior display template is never
    // an evidence source.  A failed or incomplete adapter read must produce an
    // empty, fail-closed run set rather than stale qualifying-looking rows.
    const sourceRuns = adapterRunsBound ? adapterEvidence.qualifyingL1Runs : [];
    const l1Runs = sourceRuns.map((run) => {
      const normalizedRun = adapterRunsBound
        ? normalizeAdapterL1Run(evidenceRootPath, run, domainId, evidencePolicySetHash)
        : run;
      return {
        ...normalizedRun,
        qualifyingL1Evidence: adapterResult?.status === 'pass'
          ? run.qualifyingL1Evidence !== false
          : false,
        sourceValidity: auditBundleSource(evidenceRootPath, normalizedRun),
        evidenceValidity: auditL1Evidence(evidenceRootPath, normalizedRun),
      };
    });
    const currentPolicy = adapterResult?.policy
      ? {
        domainId,
        level: adapterResult.policy.currentLevel,
        operationalState: adapterResult.policy.operationalState,
        policyVersion: Number(adapterResult.policy.policyVersion),
        policyHash: adapterResult.policy.policyHash,
        policySetHash: adapterReadback.policySetHash,
      }
      : {
        ...template.currentPolicy,
        domainId,
        policySetHash: adapterReadback.policySetHash,
      };
    const adapterStatus = adapterResult?.status ?? 'error';
    const reconciliationFallback = {
      status: 'missing',
      reason: alreadyL2
        ? 'domain_already_l2'
        : adapterStatus !== 'pass'
        ? 'adapter_readback_failed'
        : !adapterRunsBound
          ? 'adapter_qualifying_runs_missing'
        : 'adapter_full_reconciliation_missing',
    };
    const fullReconciliation = adapterRunsBound
      ? resolveAdapterFullReconciliation(adapterEvidence, l1Runs, reconciliationFallback)
      : reconciliationFallback;
    const policyCeiling = adapterResult?.policyCeiling ?? template.policyCeiling;
    const promotionTargetPolicyRows = policyCeiling?.status === 'verified'
      ? buildPromotionTargetPolicyRows(
        promotionCurrentPolicyRows,
        domainId,
        policyCeiling,
      )
      : null;
    const policyArtifactProvenance = policyCeiling?.status === 'verified'
      ? buildPolicyArtifactProvenance(policyCeiling)
      : null;
    const blockingGates = new Set(template.blockingGates ?? []);
    if (alreadyL2) {
      blockingGates.delete('three_successful_l1_runs');
      blockingGates.delete('full_reconciliation');
      blockingGates.delete('l1_bundle_evidence_integrity');
      blockingGates.add('domain_already_l2');
    }
    if (policyCeiling?.status === 'verified') {
      blockingGates.delete('policy_ceiling');
    } else {
      blockingGates.add('policy_ceiling');
    }
    const hasThreeQualifyingRuns = adapterRunsBound
      && Number(adapterEvidence?.distinctCommittedL1Runs ?? 0) >= 3
      && l1Runs.length >= 3
      && new Set(l1Runs.map((run) => run.runId)).size === l1Runs.length;
    const hasVerifiedFullReconciliation = fullReconciliation.status === 'verified';
    const hasBoundBundleEvidence = adapterRunsBound
      && l1Runs.length > 0
      && l1Runs.every((run) => (
        run.sourceValidity.status === 'match'
        && (run.evidenceValidity.status === 'match' || run.evidenceValidity.status === 'not_applicable')
      ));
    if (!alreadyL2 && hasThreeQualifyingRuns) blockingGates.delete('three_successful_l1_runs');
    if (!alreadyL2 && hasVerifiedFullReconciliation) blockingGates.delete('full_reconciliation');
    if (hasBoundBundleEvidence) {
      blockingGates.delete('l1_bundle_evidence_integrity');
    } else if (!alreadyL2 && (!adapterRunsBound || (l1Runs.length > 0 && l1Runs.some((run) => (
      run.sourceValidity.status !== 'match'
      || (run.evidenceValidity.status !== 'match' && run.evidenceValidity.status !== 'not_applicable')
    ))))) {
      blockingGates.add('l1_bundle_evidence_integrity');
    }
    const record = {
      ...template,
      runId: normalizedRunId,
      generatedAt: timestamp,
      mode: 'read-only',
      domainId,
      currentPolicy,
      policyCeiling,
      l1EvidencePolicySetHash: evidencePolicySetHash,
      promotionCurrentPolicyRows,
      promotionTargetPolicyRows,
      policyArtifactProvenance,
      l1Runs,
      successfulCommittedL1Runs: l1Runs.filter((run) => (
        (run.status ?? run.runStatus) === 'COMPLETED' && run.applyStatus === 'COMMITTED'
      )).length,
      qualifyingCommittedL1Runs: adapterRunsBound ? Number(adapterEvidence?.distinctCommittedL1Runs ?? 0) : 0,
      l1EvidenceAdapterReadback: {
        status: alreadyL2 ? 'skipped' : adapterStatus,
        policySetHash: evidencePolicySetHash,
        databaseEvidenceRoot: evidenceRootIdentity,
        distinctCommittedL1Runs: adapterRunsBound ? Number(adapterEvidence?.distinctCommittedL1Runs ?? 0) : 0,
        fullReconciliation: adapterRunsBound ? (adapterEvidence?.fullReconciliation ?? false) : false,
        qualifyingL1Runs: adapterRunsBound
          ? adapterEvidence.qualifyingL1Runs
          : [],
        excludedHistoricalRuns: adapterRunsBound && Array.isArray(adapterEvidence?.excludedHistoricalRuns)
          ? adapterEvidence.excludedHistoricalRuns
          : [],
        error: adapterResult?.error ?? null,
        ...(alreadyL2 ? { skipReason: 'domain_already_l2' } : {}),
      },
      fullReconciliation,
      blockingGates: [...blockingGates],
      verdict: 'BLOCKED',
      proposalInput: false,
      readinessRecordRole: 'evidence-display-only',
      evidence: {
        ...(template.evidence ?? {}),
        l1EvidencePolicySetHash: evidencePolicySetHash,
        databaseEvidenceRoot: evidenceRootIdentity,
        panelReports: readPanelReports(root, path.join(panelDirectory, domainId), domainId, timestamp, REQUIRED_PANEL_IDS[domainId]),
        sharedReports: buildSharedReportRefs(root, sharedReports, absoluteRunRoot),
        uiReadiness: uiEvidence,
        v2Preflight: v2PreflightEvidence,
        databaseBoundary: {
          ...(template.evidence?.databaseBoundary ?? {}),
          ...databaseBoundary,
          observedAt: timestamp,
          crossDbReportStatus: crossDb.summary?.status ?? 'unknown',
          relationHealthReportStatus: relation.summary?.status ?? 'unknown',
        },
      },
      forbiddenActions: [...FORBIDDEN_ACTIONS],
    };
    assertDisplayReadinessRecord(record);
    return {
      record,
      path: relative(root, path.join(absoluteRunRoot, 'domain', domainId, 'readiness.json')),
    };
  });

  const shared = buildSharedReportRefs(root, sharedReports, absoluteRunRoot);
  const index = {
    schemaVersion: 'terrapedia-l2-readiness-index-v1',
    runId: normalizedRunId,
    generatedAt: timestamp,
    mode: 'read-only',
    aggregateVerdict: 'BLOCKED',
    domains: records.map((entry) => ({
      domainId: entry.record.domainId,
      verdict: entry.record.verdict,
      blockingGates: entry.record.blockingGates,
      panelCount: entry.record.evidence.panelReports.length,
      readinessPath: entry.path,
    })),
    sharedReports: shared,
    uiReadiness: uiEvidence,
    databaseEvidenceRoot: evidenceRootIdentity,
    databaseBoundary,
    runtimeBoundary: {
      acceptance: acceptanceEvidence?.path ?? null,
      acceptanceSha256: acceptanceEvidence?.sha256 ?? null,
      acceptanceSummary: acceptanceEvidence?.summary ?? null,
      schedulerPreflight: v2PreflightEvidence,
      proposalGeneration: 'forbidden_while_any_domain_blocked',
      ownerAuthorization: 'missing',
    },
    forbiddenActions: [...FORBIDDEN_ACTIONS],
  };
  const matrix = {
    schemaVersion: 'terrapedia-l2-readiness-matrix-v2',
    generatedAt: timestamp,
    mode: 'read-only',
    runId: normalizedRunId,
    scope: selectedDomains,
    databaseEvidenceRoot: evidenceRootIdentity,
    database: {
      host: databaseBoundary.host ?? '127.0.0.1',
      port: Number(databaseBoundary.serverPort ?? 13306),
      serverUuid: databaseBoundary.serverUuid ?? null,
      maintainedDatabases: [...FORMAL_DATABASES],
      observedDatabases: databaseBoundary.observedDatabases ?? [...FORMAL_DATABASES],
      extraObservedDatabases: (databaseBoundary.observedDatabases ?? []).filter((name) => !FORMAL_DATABASES.includes(name)),
      scopeStatus: (databaseBoundary.observedDatabases ?? []).some((name) => !FORMAL_DATABASES.includes(name))
        ? 'extra_database_observed_out_of_scope' : 'exact',
    },
    policySet: {
      recomputedCurrentHash: adapterReadback.policySetHash,
      l1EvidencePolicySetHash: evidencePolicySetHash,
      currentRows: promotionCurrentPolicyRows,
      priorMatrixHash,
      hashMatchesPriorMatrix: priorMatrixHash == null ? null : adapterReadback.policySetHash === priorMatrixHash,
    },
    databaseBoundary,
    runtimeEvidence: {
      domainReportRoot: relative(root, path.join(absoluteRunRoot, 'domain')),
      crossDbReportPath: shared[0].path,
      relationHealthReportPath: shared[1].path,
      uiReadinessPath: uiEvidence.path,
      uiReadinessSha256: uiEvidence.sha256,
      acceptanceReportPath: acceptanceEvidence?.path ?? null,
      acceptanceReportSha256: acceptanceEvidence?.sha256 ?? null,
      acceptanceSummary: acceptanceEvidence?.summary ?? null,
      v2Preflight: v2PreflightEvidence,
    },
    domains: records.map((entry) => ({
      domainId: entry.record.domainId,
      currentPolicy: entry.record.currentPolicy,
      policyCeiling: entry.record.policyCeiling,
      proposalInput: entry.record.proposalInput,
      readinessRecordRole: entry.record.readinessRecordRole,
      l1Runs: entry.record.l1Runs,
      successfulCommittedL1Runs: entry.record.successfulCommittedL1Runs,
      qualifyingCommittedL1Runs: entry.record.qualifyingCommittedL1Runs,
      l1EvidenceAdapterReadback: entry.record.l1EvidenceAdapterReadback,
      l1EvidencePolicySetHash: entry.record.l1EvidencePolicySetHash,
      databaseEvidenceRoot: evidenceRootIdentity,
      fullReconciliation: entry.record.fullReconciliation,
      downstreamReports: {
        status: 'pass',
        panelCount: entry.record.evidence.panelReports.length,
        reports: entry.record.evidence.panelReports,
      },
      uiReadiness: entry.record.evidence.uiReadiness,
      ownerPromotion: entry.record.ownerPromotion,
      schedulerDecision: entry.record.schedulerDecision,
      verdict: entry.record.verdict,
      blockingGates: entry.record.blockingGates,
    })),
    forbiddenActions: [...FORBIDDEN_ACTIONS],
  };
  const hashes = records.map((entry) => ({
    ...entry,
    sha256: hashBytes(Buffer.from(`${JSON.stringify(entry.record, null, 2)}\n`, 'utf8')),
  }));
  index.domains = hashes.map(({ record, path: readinessPath, sha256 }) => ({
    domainId: record.domainId,
    verdict: record.verdict,
    blockingGates: record.blockingGates,
    panelCount: record.evidence.panelReports.length,
    readinessPath,
    readinessSha256: sha256,
  }));
  const indexHash = hashBytes(Buffer.from(`${JSON.stringify(index, null, 2)}\n`, 'utf8'));
  const matrixHash = hashBytes(Buffer.from(`${JSON.stringify(matrix, null, 2)}\n`, 'utf8'));
  const indexMarkdown = renderIndexMarkdown(hashes, normalizedRunId, timestamp, indexHash);
  const matrixMarkdown = renderMatrixMarkdown(hashes, normalizedRunId, timestamp, matrixHash, adapterReadback.policySetHash);
  return Object.freeze({
    runRoot: absoluteRunRoot,
    records: hashes,
    index,
    matrix,
    indexMarkdown,
    matrixMarkdown,
  });
}

function assertDisplayReadinessRecord(record) {
  if (!record || typeof record !== 'object' || !record.currentPolicy
      || !record.policyCeiling || !Array.isArray(record.l1Runs)
      || !record.ownerPromotion || !record.schedulerDecision
      || record.verdict !== 'BLOCKED' || record.proposalInput !== false
      || record.readinessRecordRole !== 'evidence-display-only'
      || !Array.isArray(record.blockingGates) || record.blockingGates.length === 0
      || !HASH_PATTERN.test(record.l1EvidencePolicySetHash ?? '')
      || record.l1EvidenceAdapterReadback?.policySetHash !== record.l1EvidencePolicySetHash
      || record.evidence?.l1EvidencePolicySetHash !== record.l1EvidencePolicySetHash
      || !record.evidence || !Array.isArray(record.evidence.panelReports)
      || record.evidence.uiReadiness?.status !== 'pass'
      || !HASH_PATTERN.test(record.evidence.uiReadiness?.sha256 ?? '')
      || record.evidence.v2Preflight?.status !== 'blocked'
      || !HASH_PATTERN.test(record.evidence.v2Preflight?.sha256 ?? '')) {
    throw new Error('readiness display record schema is incomplete');
  }
  normalizePolicyRows(record.promotionCurrentPolicyRows, 'promotion current policy rows');
}

export function writeL2ReadinessArtifacts({ repoRoot = process.cwd(), artifacts } = {}) {
  if (!artifacts || !Array.isArray(artifacts.records) || !artifacts.index || !artifacts.matrix) {
    throw new TypeError('readiness artifacts are required');
  }
  const root = path.resolve(repoRoot);
  const targets = [
    ...artifacts.records.map((entry) => path.resolve(root, entry.path)),
    path.join(artifacts.runRoot, 'readiness-index.json'),
    path.join(artifacts.runRoot, 'readiness-index.md'),
    path.join(artifacts.runRoot, 'l2-readiness-matrix.json'),
    path.join(artifacts.runRoot, 'l2-readiness-matrix.md'),
  ];
  for (const target of targets) {
    assertRepositoryPathConfinement({ repoRoot: root, filePath: target, label: 'L2 readiness output' });
    try {
      fs.lstatSync(target);
      throw new Error(`L2 readiness output already exists; overwrite is forbidden: ${target}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  for (const entry of artifacts.records) writeNoOverwrite(path.resolve(root, entry.path), entry.record);
  writeNoOverwrite(path.join(artifacts.runRoot, 'readiness-index.json'), artifacts.index);
  writeNoOverwrite(path.join(artifacts.runRoot, 'readiness-index.md'), artifacts.indexMarkdown, false);
  writeNoOverwrite(path.join(artifacts.runRoot, 'l2-readiness-matrix.json'), artifacts.matrix);
  writeNoOverwrite(path.join(artifacts.runRoot, 'l2-readiness-matrix.md'), artifacts.matrixMarkdown, false);
  return Object.freeze({
    readinessPaths: artifacts.records.map((entry) => entry.path),
    indexPath: relative(root, path.join(artifacts.runRoot, 'readiness-index.json')),
    matrixPath: relative(root, path.join(artifacts.runRoot, 'l2-readiness-matrix.json')),
  });
}

export async function readRegisteredL2PolicyCeilingEvidence({
  repoRoot = process.cwd(),
  connection,
  domainId,
} = {}) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('database connection is required for L2 policy ceiling readback');
  }
  const operationId = L2_CEILING_REGISTRATION_OPERATION_IDS[domainId];
  if (!operationId) throw new Error('unsupported L2 policy ceiling registration domain');
  const root = path.resolve(repoRoot);
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const inputFile = readPrivateJsonIfPresent(root, inputPath, 'L2 policy ceiling registration input');
  if (inputFile == null) {
    return Object.freeze({ status: 'missing', reason: 'registration_input_missing' });
  }
  const input = inputFile.value;
  if (input?.operationId !== operationId || input.domainId !== domainId || input.proposalOnly !== false) {
    throw new Error('L2 policy ceiling registration input identity is invalid');
  }
  const artifact = readL2PolicyCeilingArtifact({
    repoRoot: root,
    artifactPath: input.artifactPath,
    requireApproved: true,
  });
  const artifactAbsolutePath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, input.artifactPath),
    label: 'L2 policy ceiling artifact',
  });
  const artifactFileSha256 = hashFile(artifactAbsolutePath);
  const expectedInput = buildL2PolicyCeilingRegistrationInput({
    artifact,
    artifactPath: input.artifactPath,
    artifactFileSha256,
  });
  for (const [field, expected] of Object.entries(expectedInput)) {
    if (input[field] !== expected) {
      throw new Error(`L2 policy ceiling registration input ${field} drifted from the approved artifact`);
    }
  }
  if (input.approvalReference != null && input.approvalReference !== artifact.approval.reference) {
    throw new Error('L2 policy ceiling registration approval reference drifted from the approved artifact');
  }
  const proof = await readAuthoritativeL2PolicyCeilingRegistration({
    repoRoot: root,
    connection,
    artifact,
  });
  const ceiling = artifact.targetPolicy.policyJson;
  return Object.freeze({
    status: 'verified',
    artifactHash: artifact.artifactHash,
    currentPolicySetHash: artifact.currentPolicySetHash,
    policyVersion: artifact.targetPolicy.policyVersion,
    level: artifact.targetPolicy.level,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    requireSnapshot: ceiling.requireSnapshot,
    ratioInsertCap: ceiling.ratioInsertCap,
    ratioUpdateCap: ceiling.ratioUpdateCap,
    ratioRelationshipDeleteCap: ceiling.ratioRelationshipDeleteCap,
    ratioDisableCap: ceiling.ratioDisableCap,
    absoluteInsertCap: ceiling.absoluteInsertCap,
    absoluteUpdateCap: ceiling.absoluteUpdateCap,
    absoluteRelationshipDeleteCap: ceiling.absoluteRelationshipDeleteCap,
    absoluteDisableCap: ceiling.absoluteDisableCap,
    sourceFreshnessMaxAgeMinutes: ceiling.sourceFreshnessMaxAgeMinutes,
    anomalyAction: ceiling.anomalyAction,
    ownedTables: ceiling.ownedTables,
    artifactPath: input.artifactPath,
    artifactFileSha256,
    registration: {
      resultPath: proof.resultPath,
      resultFileSha256: proof.resultFileSha256,
      commitMarkerPath: proof.commitMarkerPath,
      commitMarkerFileSha256: proof.commitMarkerFileSha256,
      decisionIdentity: proof.registrationDecisionIdentity,
      commitMarkerDecisionIdentity: proof.commitMarkerDecisionIdentity,
    },
  });
}

function writeNoOverwrite(filePath, value, json = true) {
  const bytes = Buffer.from(json ? `${JSON.stringify(value, null, 2)}\n` : String(value), 'utf8');
  fs.writeFileSync(filePath, bytes, { flag: 'wx', mode: json ? 0o600 : 0o600 });
}

function readPrivateJsonIfPresent(repoRoot, relativePath, label) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  try {
    fs.lstatSync(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const confinedPath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: absolutePath,
    label,
  });
  if ((fs.lstatSync(confinedPath).mode & 0o077) !== 0) {
    throw new Error(`${label} must be private`);
  }
  return { path: relative(repoRoot, confinedPath), value: readJson(confinedPath, label) };
}

function readPanelReports(repoRoot, directory, domainId, generatedAt, expectedPanelIds = []) {
  const confinedDirectory = assertRepositoryPathConfinement({ repoRoot, filePath: directory, label: `${domainId} panel root` });
  const entries = fs.readdirSync(confinedDirectory).filter((name) => name.endsWith('.json')).sort();
  if (entries.length === 0) throw new Error(`${domainId} has no panel reports`);
  const panelIds = [];
  const reports = entries.map((name) => {
    const filePath = assertRepositoryOrdinaryFile({ repoRoot, filePath: path.join(confinedDirectory, name), label: `${domainId} panel report` });
    const report = readJson(filePath, `${domainId} panel report`);
    const acceptedStatus = report.status === 'pass' || report.status === 'warning';
    const blockingReasons = Array.isArray(report.blockingReasons) ? report.blockingReasons : [];
    const blockedCount = Number(report.summary?.blockedCount ?? report.summary?.blockingCount ?? 0);
    if (report.domainId !== domainId || !acceptedStatus || !report.panelId
        || blockingReasons.length > 0
        || !Number.isSafeInteger(blockedCount) || blockedCount > 0) {
      throw new Error(`invalid ${domainId} panel report`);
    }
    if (report.generatedAt !== generatedAt) throw new Error(`${domainId} panel report generatedAt is stale or mismatched`);
    if (report.reportPath !== relative(repoRoot, filePath)) throw new Error(`${domainId} panel reportPath drifted`);
    panelIds.push(report.panelId);
    return { path: relative(repoRoot, filePath), sha256: hashFile(filePath), status: report.status };
  });
  const expected = [...expectedPanelIds];
  if (panelIds.length !== expected.length || new Set(panelIds).size !== panelIds.length
      || expected.some((panelId) => !panelIds.includes(panelId))) {
    throw new Error(`${domainId} panel coverage is incomplete or duplicated`);
  }
  return reports;
}

function buildSharedReportRefs(repoRoot, reports = {}, runRoot = null) {
  const paths = [reports.crossDbPath, reports.relationJsonPath, reports.relationMarkdownPath];
  if (paths.some((value) => !value)) throw new Error('shared report paths are required');
  return paths.map((value) => {
    const filePath = assertRepositoryOrdinaryFile({ repoRoot, filePath: path.resolve(repoRoot, value), label: 'shared readiness report' });
    if (runRoot) assertPathWithin(runRoot, filePath, 'shared readiness report');
    return { path: relative(repoRoot, filePath), sha256: hashFile(filePath) };
  });
}

function assertPathWithin(parentPath, candidatePath, label) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  if (!relativePath || relativePath.startsWith(`..${path.sep}`)
      || relativePath === '..' || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside the current readiness run root`);
  }
}

function buildUiReadinessEvidence({ repoRoot, reportPath, report, generatedAt }) {
  if (!reportPath || !report || typeof report !== 'object') throw new Error('UI readiness evidence is required');
  const filePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, reportPath),
    label: 'UI readiness report',
  });
  const persisted = readJson(filePath, 'UI readiness report');
  if (JSON.stringify(persisted) !== JSON.stringify(report)) throw new Error('UI readiness report does not match the supplied evidence');
  if (persisted.schemaVersion !== 'terrapedia-l2-ui-readiness-v1' || persisted.mode !== 'read-only') {
    throw new Error('UI readiness report schema or mode is invalid');
  }
  assertFreshReport(persisted, 'UI readiness report', generatedAt);
  const summary = persisted.summary ?? {};
  const requiredZeroes = [
    'navigationFailures',
    'failedRequestCount',
    'consoleErrorCount',
    'hydrationMismatchCount',
    'horizontalOverflowCount',
    'focusFailureCount',
  ];
  if (summary.publicListCount !== 8 || summary.publicDetailCount !== 5 || summary.adminRouteCount !== 8
      || requiredZeroes.some((key) => Number(summary[key]) !== 0)) {
    throw new Error('UI readiness summary counts or failure counters are not a passing eight-domain consumer capture');
  }
  if (Number(summary.mutationRequestCount) !== 0) {
    throw new Error('UI readiness reports a same-origin mutation request');
  }
  if (Number(summary.httpErrorResponseCount) !== 0) {
    throw new Error('UI readiness reports a local HTTP error response');
  }
  const authenticationMode = persisted.login?.authenticationMode;
  if (persisted.login?.status !== 200 || persisted.login?.finalRoute !== '/entities/npcs'
      || !['offline_local_read_token', 'preconfigured_read_token'].includes(authenticationMode)
      || Number(persisted.login?.loginPostRequestCount) !== 0
      || !Array.isArray(persisted.login?.sameOriginMutationRequests)
      || persisted.login.sameOriginMutationRequests.length !== 0
      || !Array.isArray(persisted.login?.httpErrorResponses)
      || persisted.login.httpErrorResponses.length !== 0
      || !Array.isArray(persisted.login?.hydrationErrors) || persisted.login.hydrationErrors.length !== 0) {
    throw new Error('UI readiness must use read-only authentication without a login POST');
  }
  const securityAuditLog = persisted.securityAuditLog;
  const auditBefore = securityAuditLog?.before;
  const auditAfter = securityAuditLog?.after;
  if (securityAuditLog?.unchanged !== true
      || !Number.isSafeInteger(Number(auditBefore?.count)) || Number(auditBefore.count) < 0
      || !Number.isSafeInteger(Number(auditBefore?.maxId)) || Number(auditBefore.maxId) < 0
      || !Number.isSafeInteger(Number(auditAfter?.count)) || Number(auditAfter.count) < 0
      || !Number.isSafeInteger(Number(auditAfter?.maxId)) || Number(auditAfter.maxId) < 0
      || Number(auditBefore.count) !== Number(auditAfter.count)
      || Number(auditBefore.maxId) !== Number(auditAfter.maxId)) {
    throw new Error('UI readiness security-audit watermark changed during capture');
  }
  const suppressedMutationAttempts = persisted.suppressedOutOfScopeMutationAttempts;
  if (!Array.isArray(suppressedMutationAttempts)
      || suppressedMutationAttempts.some((entry) => entry?.method !== 'POST'
        || entry?.source !== 'browser-route-guard'
        || !/^\/api\/user\/history\/(?:ITEM|ARTICLE)\/[1-9]\d*$/.test(String(entry?.path ?? '')))) {
    throw new Error('UI readiness suppressed mutation evidence exceeds the exact history fence');
  }
  const publicEntries = assertUiPublicCoverage(persisted.public);
  const adminEntries = assertUiAdminCoverage(persisted.admin);
  const observedPublicDetailCount = publicEntries.filter((entry) => entry.detail).length;
  if (summary.publicListCount !== publicEntries.length
      || summary.publicDetailCount !== observedPublicDetailCount
      || summary.adminRouteCount !== adminEntries.length) {
    throw new Error('UI readiness summary counts do not match route evidence');
  }
  const entries = [
    ...publicEntries.flatMap((entry) => [entry.listDesktop, entry.listMobile, entry.detailDesktop, entry.detailMobile]),
    ...adminEntries.flatMap((entry) => [entry.desktop, entry.mobile]),
  ].filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => entry.finalRoute !== entry.route)) {
    throw new Error('UI readiness route final route does not match the requested route');
  }
  if (entries.some((entry) => (
    entry.status !== 200
      || entry.navigationError
      || !Array.isArray(entry.failedRequests) || entry.failedRequests.length > 0
      || !Array.isArray(entry.sameOriginMutationRequests) || entry.sameOriginMutationRequests.length > 0
      || !Array.isArray(entry.httpErrorResponses) || entry.httpErrorResponses.length > 0
      || !Array.isArray(entry.consoleErrors) || entry.consoleErrors.length > 0
      || entry.horizontalOverflow !== false
      || entry.focusedAfterTab !== true
      || (!entry.focusOutline && !entry.focusBoxShadow)
  ))) {
    throw new Error('UI readiness route evidence contains a failed consumer check');
  }
  return {
    status: 'pass',
    path: relative(repoRoot, filePath),
    sha256: hashFile(filePath),
    generatedAt: persisted.generatedAt,
    summary,
  };
}

function buildV2PreflightEvidence({
  repoRoot,
  runRoot,
  reportPath,
  report,
  generatedAt,
  policySetHash,
}) {
  if (!reportPath || !report || typeof report !== 'object') {
    throw new Error('V2 preflight evidence is required');
  }
  const filePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, reportPath),
    label: 'V2 preflight report',
  });
  assertPathWithin(runRoot, filePath, 'V2 preflight report');
  const persisted = readJson(filePath, 'V2 preflight report');
  if (JSON.stringify(persisted) !== JSON.stringify(report)) {
    throw new Error('V2 preflight report does not match the supplied evidence');
  }
  if (persisted.schemaVersion !== 'terrapedia-l2-v2-preflight-readback-v1'
      || persisted.mode !== 'read-only'
      || Number(persisted.httpStatus) !== 200
      || persisted.responseSuccess !== true) {
    throw new Error('V2 preflight report is not a successful read-only response');
  }
  assertFreshReport(persisted, 'V2 preflight report', generatedAt);
  const snapshot = persisted.snapshot;
  if (!snapshot || snapshot.operationId !== V2_PREFLIGHT_OPERATION_ID
      || snapshot.policySetHash !== policySetHash
      || !HASH_PATTERN.test(snapshot.policySetHash ?? '')) {
    throw new Error('V2 preflight policy-set identity does not match the adapter');
  }
  const control = snapshot.control;
  if (!control || typeof control.enabled !== 'boolean' || control.mode !== 'changed-only'
      || !Number.isSafeInteger(Number(control.sweepIntervalMinutes))
      || Number(control.sweepIntervalMinutes) < 1) {
    throw new Error('V2 preflight control state is invalid');
  }
  if (Number(snapshot.counts?.liveAttempts) !== 0 || Number(snapshot.counts?.sweepClaims) !== 0
      || snapshot.reconciler?.status !== 'healthy'
      || Number(snapshot.reconciler?.overdueAttemptCount) !== 0
      || Number(snapshot.reconciler?.failureCount) !== 0
      || snapshot.databaseWrites !== false
      || snapshot.networkAccess !== false
      || snapshot.isolatedResourceWrites !== false
      || persisted.databaseWrites !== false
      || persisted.networkAccess !== false
      || persisted.isolatedResourceWrites !== false) {
    throw new Error('V2 preflight boundary is not clean and read-only');
  }
  const expectedDomains = new Set(TARGET_DOMAINS);
  const observedDomains = snapshot.domains;
  if (!Array.isArray(observedDomains) || observedDomains.length !== expectedDomains.size
      || observedDomains.some((entry) => !expectedDomains.has(entry?.domain)
        || entry?.readinessStatus !== 'blocked'
        || !entry?.actionId
        || !HASH_PATTERN.test(entry?.sourceHash ?? '')
        || typeof entry?.evidencePath !== 'string'
        || entry.evidencePath.trim() === '')) {
    throw new Error('V2 preflight does not bind the exact blocked eight-domain set');
  }
  if (new Set(observedDomains.map((entry) => entry.domain)).size !== expectedDomains.size) {
    throw new Error('V2 preflight has duplicate domain evidence');
  }
  const auditBefore = persisted.securityAuditLog?.before;
  const auditAfter = persisted.securityAuditLog?.after;
  if (persisted.securityAuditLog?.unchanged !== true
      || !Number.isSafeInteger(Number(auditBefore?.count))
      || !Number.isSafeInteger(Number(auditBefore?.maxId))
      || !Number.isSafeInteger(Number(auditAfter?.count))
      || !Number.isSafeInteger(Number(auditAfter?.maxId))
      || Number(auditBefore.count) !== Number(auditAfter.count)
      || Number(auditBefore.maxId) !== Number(auditAfter.maxId)) {
    throw new Error('V2 preflight security-audit watermark changed during capture');
  }
  return {
    status: 'blocked',
    path: relative(repoRoot, filePath),
    sha256: hashFile(filePath),
    generatedAt: persisted.generatedAt,
    httpStatus: Number(persisted.httpStatus),
    policySetHash: snapshot.policySetHash,
    control: {
      enabled: control.enabled,
      mode: control.mode,
      sweepIntervalMinutes: Number(control.sweepIntervalMinutes),
    },
    liveAttempts: Number(snapshot.counts.liveAttempts),
    sweepClaims: Number(snapshot.counts.sweepClaims),
    reconciler: snapshot.reconciler.status,
    securityAuditLog: {
      before: { count: Number(auditBefore.count), maxId: Number(auditBefore.maxId) },
      after: { count: Number(auditAfter.count), maxId: Number(auditAfter.maxId) },
      unchanged: true,
    },
  };
}

function assertUiPublicCoverage(publicEvidence) {
  if (!Array.isArray(publicEvidence) || publicEvidence.length !== UI_PUBLIC_TARGETS.length) {
    throw new Error('UI readiness public route coverage is incomplete or duplicated');
  }
  const targetsByDomain = new Map(UI_PUBLIC_TARGETS.map((target) => [target.domain, target]));
  const seenDomains = new Set();
  for (const entry of publicEvidence) {
    const target = targetsByDomain.get(entry?.domain);
    if (!target || seenDomains.has(entry.domain) || entry.list !== target.list
        || (target.detail ? entry.detail !== target.detail : entry.detail != null)) {
      throw new Error('UI readiness public route coverage is incomplete or duplicated');
    }
    seenDomains.add(entry.domain);
    if (!entry.listDesktop || !entry.listMobile
        || (target.detail && (!entry.detailDesktop || !entry.detailMobile))
        || (!target.detail && (entry.detailDesktop != null || entry.detailMobile != null))) {
      throw new Error('UI readiness public route coverage is incomplete or duplicated');
    }
  }
  if (seenDomains.size !== UI_PUBLIC_TARGETS.length) {
    throw new Error('UI readiness public route coverage is incomplete or duplicated');
  }
  return publicEvidence;
}

function assertUiAdminCoverage(adminEvidence) {
  if (!Array.isArray(adminEvidence) || adminEvidence.length !== UI_ADMIN_ROUTES.length) {
    throw new Error('UI readiness admin route coverage is incomplete or duplicated');
  }
  const expectedRoutes = new Set(UI_ADMIN_ROUTES);
  const seenRoutes = new Set();
  for (const entry of adminEvidence) {
    if (!expectedRoutes.has(entry?.route) || seenRoutes.has(entry.route)
        || !entry.desktop || !entry.mobile) {
      throw new Error('UI readiness admin route coverage is incomplete or duplicated');
    }
    seenRoutes.add(entry.route);
  }
  if (seenRoutes.size !== UI_ADMIN_ROUTES.length) {
    throw new Error('UI readiness admin route coverage is incomplete or duplicated');
  }
  return adminEvidence;
}

function normalizeAdapterL1Run(repoRoot, run, domainId, policySetHash) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    throw new Error('adapter qualifying L1 run is invalid');
  }
  const runId = requireText(run.runId, 'adapter L1 runId');
  const status = run.status ?? run.runStatus;
  if (status !== 'COMPLETED' || run.applyStatus !== 'COMMITTED') {
    throw new Error(`adapter L1 run ${runId} is not a committed completed run`);
  }
  const bundlePath = normalizeEvidencePath(repoRoot, run.bundlePath ?? run.evidence?.path, 'adapter L1 bundle path');
  const bundleSha256 = run.bundleSha256 ?? run.evidence?.sha256 ?? run.evidence?.bundleFileHash;
  if (!bundlePath || !HASH_PATTERN.test(bundleSha256 ?? '')) {
    throw new Error(`adapter L1 run ${runId} bundle identity is invalid`);
  }
  if (!bundlePath.startsWith('reports/authorization/canonical/')) {
    throw new Error(`adapter L1 run ${runId} bundle path is not canonical`);
  }
  if (run.operationId !== DOMAIN_L1_OPERATION_IDS[domainId]
      || run.policySetHash !== policySetHash) {
    throw new Error(`adapter L1 run ${runId} policy or operation identity is invalid`);
  }
  const evidencePath = run.evidencePath == null
    ? null
    : normalizeEvidencePath(repoRoot, run.evidencePath, 'adapter L1 evidence path');
  if (evidencePath != null && !HASH_PATTERN.test(run.evidenceSha256 ?? '')) {
    throw new Error(`adapter L1 run ${runId} evidence identity is invalid`);
  }
  if (evidencePath == null && run.fullReconciliation === true) {
    throw new Error(`adapter L1 run ${runId} full reconciliation path is missing`);
  }
  return {
    ...run,
    status,
    runStatus: run.runStatus ?? status,
    applyStatus: run.applyStatus,
    bundlePath,
    bundleSha256,
    evidencePath,
    evidenceSha256: run.evidenceSha256 ?? null,
    evidence: run.evidence ?? (bundlePath ? { path: bundlePath, sha256: bundleSha256 } : null),
  };
}

function normalizePolicyRows(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} are required`);
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

function buildPromotionTargetPolicyRows(currentRows, domainId, policyCeiling) {
  const targetVersion = Number(policyCeiling.policyVersion);
  const targetHash = policyCeiling.policyHash;
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 1 || !HASH_PATTERN.test(targetHash ?? '')) {
    throw new Error('verified L2 policy ceiling target identity is invalid');
  }
  return currentRows.map((row) => (
    row.domainId === domainId
      ? { domainId, policyVersion: targetVersion, policyHash: targetHash }
      : row
  ));
}

function buildPolicyArtifactProvenance(policyCeiling) {
  const registration = policyCeiling.registration;
  // The adapter's registered-ceiling readback names the immutable target set
  // `policySetHash`, while older in-memory/display fixtures used the more
  // explicit `targetPolicySetHash` alias.  Normalize both at this boundary so
  // a real readback cannot be rejected merely because of the field spelling;
  // downstream validation still compares the value against the artifact.
  const targetPolicySetHash = policyCeiling.targetPolicySetHash
    ?? policyCeiling.policySetHash;
  const provenance = {
    artifactHash: policyCeiling.artifactHash,
    artifactPath: policyCeiling.artifactPath,
    artifactFileSha256: policyCeiling.artifactFileSha256,
    currentPolicySetHash: policyCeiling.currentPolicySetHash,
    targetPolicySetHash,
    registration: registration == null ? null : {
      resultPath: registration.resultPath,
      resultFileSha256: registration.resultFileSha256,
      commitMarkerPath: registration.commitMarkerPath,
      commitMarkerFileSha256: registration.commitMarkerFileSha256,
      registrationDecisionIdentity: registration.decisionIdentity,
      commitMarkerDecisionIdentity: registration.commitMarkerDecisionIdentity
        ?? registration.decisionIdentity,
    },
  };
  if (!HASH_PATTERN.test(provenance.artifactHash ?? '')
      || !HASH_PATTERN.test(provenance.artifactFileSha256 ?? '')
      || !HASH_PATTERN.test(provenance.currentPolicySetHash ?? '')
      || !HASH_PATTERN.test(provenance.targetPolicySetHash ?? '')
      || !provenance.artifactPath
      || !provenance.registration
      || !HASH_PATTERN.test(provenance.registration.resultFileSha256 ?? '')
      || !HASH_PATTERN.test(provenance.registration.commitMarkerFileSha256 ?? '')
      || !provenance.registration.resultPath
      || !provenance.registration.commitMarkerPath
      || !provenance.registration.registrationDecisionIdentity
      || !provenance.registration.commitMarkerDecisionIdentity) {
    throw new Error('verified L2 policy ceiling artifact provenance is incomplete');
  }
  return provenance;
}

function resolveAdapterFullReconciliation(adapterEvidence, l1Runs, fallback) {
  const candidate = adapterEvidence?.fullReconciliation;
  if (!candidate || candidate === false) return fallback;
  const match = l1Runs.find((run) => run.fullReconciliation === true
    && typeof run.evidencePath === 'string' && run.evidencePath.trim() !== ''
    && (candidate.runId == null || candidate.runId === run.runId));
  if (!match || !match.evidenceSha256) return fallback;
  return {
    status: 'verified',
    evidence: match.evidencePath,
    evidenceSha256: match.evidenceSha256,
    runId: match.runId,
  };
}

function normalizeEvidencePath(repoRoot, value, label) {
  const text = String(value ?? '').trim().replaceAll('\\', '/');
  if (!text) return null;
  if (path.isAbsolute(text)) {
    const relativePath = path.relative(path.resolve(repoRoot), path.resolve(text)).replaceAll('\\', '/');
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
      throw new Error(`${label} escapes the repository root`);
    }
    return relativePath;
  }
  if (!text.startsWith('reports/') || text.includes('..')) throw new Error(`${label} must be a confined reports path`);
  return text;
}

/**
 * Resolve the immutable prior readiness templates without granting them any
 * write capability.  Relative paths are intentionally confined to the
 * caller worktree.  An absolute path may target the explicitly trusted
 * corresponding primary worktree, which is how linked-worktree database rows
 * can retain their historical display templates without copying them into a
 * new evidence root.
 */
export function resolvePriorReadRoot({ repoRoot, evidenceRootPath, priorRoot } = {}) {
  const callerRoot = path.resolve(String(repoRoot ?? ''));
  const trustedRoot = path.resolve(String(evidenceRootPath ?? callerRoot));
  const raw = String(priorRoot ?? '').trim();
  if (!raw) throw new Error('prior readiness root is required');
  const candidate = path.resolve(raw);
  const roots = path.isAbsolute(raw)
    ? [callerRoot, trustedRoot].filter((value, index, values) => values.indexOf(value) === index)
    : [callerRoot];
  for (const root of roots) {
    const relativePath = path.relative(root, candidate);
    if (relativePath && relativePath !== '..'
        && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)) {
      return {
        root,
        path: assertRepositoryOrdinaryDirectory({
          repoRoot: root,
          filePath: candidate,
          label: 'prior readiness root',
        }),
      };
    }
    if (!relativePath && root === candidate) {
      return {
        root,
        path: assertRepositoryOrdinaryDirectory({
          repoRoot: root,
          filePath: candidate,
          label: 'prior readiness root',
        }),
      };
    }
  }
  throw new Error('prior readiness root must remain inside the caller or explicitly trusted evidence worktree');
}

function auditBundleSource(repoRoot, run) {
  const bundlePath = String(run?.bundlePath ?? run?.evidence?.path ?? '').trim();
  if (!bundlePath) return { status: 'missing', reason: 'bundle_path_missing' };
  const absolute = path.isAbsolute(bundlePath) ? bundlePath : path.resolve(repoRoot, bundlePath);
  const result = { bundlePath: safeRelative(repoRoot, absolute), expectedBundleSha256: run.bundleSha256 ?? run.evidence?.sha256 ?? null };
  try {
    const confined = assertRepositoryOrdinaryFile({ repoRoot, filePath: absolute, label: 'L1 bundle artifact' });
    const stat = fs.lstatSync(confined);
    if (!stat.isFile() || stat.isSymbolicLink()) return { ...result, status: 'invalid', reason: 'bundle_not_ordinary_file' };
    const bundleBytes = fs.readFileSync(confined);
    result.bundleActualSha256 = hashBytes(bundleBytes);
    if (result.expectedBundleSha256 && result.bundleActualSha256 !== result.expectedBundleSha256) return { ...result, status: 'mismatch', reason: 'bundle_file_hash_drift' };
    const bundle = JSON.parse(bundleBytes.toString('utf8'));
    const sourcePath = String(bundle.source?.path ?? '').replaceAll('\\', '/');
    const sourceHash = String(bundle.source?.sha256 ?? '');
    result.sourcePath = sourcePath;
    result.expectedSourceSha256 = sourceHash || null;
    if (!sourcePath.startsWith('reports/') || sourcePath.includes('..') || sourcePath.startsWith('/') || !HASH_PATTERN.test(sourceHash)) return { ...result, status: 'invalid', reason: 'source_identity_invalid' };
    const sourceAbsolute = path.resolve(repoRoot, sourcePath);
    const sourceConfined = assertRepositoryOrdinaryFile({ repoRoot, filePath: sourceAbsolute, label: 'L1 source artifact' });
    const sourceStat = fs.lstatSync(sourceConfined);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) return { ...result, status: 'invalid', reason: 'source_not_ordinary_file' };
    result.sourceActualSha256 = hashFile(sourceConfined);
    JSON.parse(fs.readFileSync(sourceConfined, 'utf8'));
    return { ...result, status: result.sourceActualSha256 === sourceHash ? 'match' : 'mismatch', reason: result.sourceActualSha256 === sourceHash ? null : 'source_artifact_hash_drift' };
  } catch (error) {
    return { ...result, status: error?.code === 'ENOENT' ? 'missing' : 'invalid', reason: error.message };
  }
}

function auditL1Evidence(repoRoot, run) {
  const evidencePath = String(run?.evidencePath ?? '').trim();
  if (!evidencePath) {
    return { status: run?.fullReconciliation === true ? 'missing' : 'not_applicable', reason: run?.fullReconciliation === true ? 'reconciliation_path_missing' : null };
  }
  const absolute = path.isAbsolute(evidencePath) ? evidencePath : path.resolve(repoRoot, evidencePath);
  const result = {
    evidencePath: safeRelative(repoRoot, absolute),
    expectedEvidenceSha256: run.evidenceSha256 ?? null,
  };
  try {
    const confined = assertRepositoryOrdinaryFile({ repoRoot, filePath: absolute, label: 'L1 evidence artifact' });
    const bytes = fs.readFileSync(confined);
    result.evidenceActualSha256 = hashBytes(bytes);
    if (!HASH_PATTERN.test(run.evidenceSha256 ?? '') || result.evidenceActualSha256 !== run.evidenceSha256) {
      return { ...result, status: 'mismatch', reason: 'evidence_file_hash_drift' };
    }
    JSON.parse(bytes.toString('utf8'));
    return { ...result, status: 'match', reason: null };
  } catch (error) {
    return { ...result, status: error?.code === 'ENOENT' ? 'missing' : 'invalid', reason: error.message };
  }
}

function renderIndexMarkdown(records, runId, generatedAt, indexHash) {
  return [
    '# L2 Readiness Index', '', `Run: ${runId}`, `Generated At: ${generatedAt}`, 'Aggregate Verdict: BLOCKED', '',
    '| Domain | Verdict | Panel Reports | Blocking Gates | Readiness SHA-256 |',
    '| --- | --- | ---: | --- | --- |',
    ...records.map(({ record, path: readinessPath, sha256 }) => `| ${record.domainId} | ${record.verdict} | ${record.evidence.panelReports.length} | ${record.blockingGates.join(', ')} | ${sha256} |`),
    '', `Index SHA-256: ${indexHash}`, '',
    'This is an adapter-backed, read-only evidence-display capture. All domains remain BLOCKED; display records cannot be supplied directly to the L2 proposal builder.', '',
  ].join('\n');
}

function renderMatrixMarkdown(records, runId, generatedAt, matrixHash, policySetHash) {
  return [
    '# L2 Readiness Matrix', '', `Run: ${runId}`, `Generated At: ${generatedAt}`, 'Aggregate Verdict: BLOCKED', '',
    '| Domain | Policy | Qualifying L1 | Full reconciliation | Verdict | Blocking gates |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...records.map(({ record }) => `| ${record.domainId} | ${record.currentPolicy.level}/${record.currentPolicy.operationalState} | ${record.qualifyingCommittedL1Runs} | ${record.fullReconciliation.status} | ${record.verdict} | ${record.blockingGates.join(', ')} |`),
    '', `Matrix SHA-256: ${matrixHash}`, '',
    `The current policy-set hash was recomputed by the real MySQL adapter as ${policySetHash}. The read transaction was rolled back; no L2 authorization or database write was executed.`, '',
  ].join('\n');
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
}
function assertBoundReport(repoRoot, reportPath, report, label, generatedAt) {
  const filePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, String(reportPath ?? '')),
    label,
  });
  const persisted = readJson(filePath, label);
  if (JSON.stringify(persisted) !== JSON.stringify(report)) {
    throw new Error(`${label} does not match the supplied evidence object`);
  }
  assertFreshReport(persisted, label, generatedAt);
  return filePath;
}
function buildAcceptanceEvidence({ repoRoot, reportPath, summary, databaseBoundary, generatedAt }) {
  const hasPath = reportPath != null && String(reportPath).trim() !== '';
  const hasSummary = summary != null;
  if (!hasPath && !hasSummary) return null;
  if (!hasPath || !hasSummary) throw new Error('acceptance report path and summary must be supplied together');
  const filePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, String(reportPath)),
    label: 'acceptance report',
  });
  const persisted = readJson(filePath, 'acceptance report');
  const persistedSummary = {
    timestamp: String(persisted.timestamp ?? ''),
    passed: Number(persisted.passed),
    failed: Number(persisted.failed),
    skipped: Number(persisted.skipped),
  };
  if (JSON.stringify(persistedSummary) !== JSON.stringify(summary)) {
    throw new Error('acceptance report does not match the supplied evidence summary');
  }
  if (persisted.dbAvailable !== true
      || persisted.dbHost !== databaseBoundary.host
      || Number(persisted.dbPort) !== Number(databaseBoundary.serverPort)
      || Number(persisted.totalSteps) !== 19
      || persistedSummary.passed !== 19
      || persistedSummary.failed !== 0
      || persistedSummary.skipped !== 0) {
    throw new Error('acceptance report is not a passing 19-step database-bound capture');
  }
  assertFreshAcceptanceReport(persisted, generatedAt);
  return {
    path: relative(repoRoot, filePath),
    sha256: hashFile(filePath),
    summary: persistedSummary,
  };
}
function assertFreshAcceptanceReport(report, generatedAt) {
  const match = String(report?.timestamp ?? '').match(/^(\d{8})-(\d{6})$/);
  if (!match) throw new Error('acceptance report timestamp is invalid');
  const [, date, time] = match;
  const reportTime = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`);
  const runTime = Date.parse(generatedAt);
  if (!Number.isFinite(reportTime) || !Number.isFinite(runTime)) throw new Error('acceptance report timestamp is invalid');
  const ageMs = runTime - reportTime;
  if (ageMs < -5 * 60 * 1000 || ageMs > 24 * 60 * 60 * 1000) {
    throw new Error('acceptance report is stale, too far in the future, or outside the 24-hour readiness freshness window');
  }
}
function assertFreshReport(report, label, generatedAt) {
  const reportTime = Date.parse(String(report?.generatedAt ?? ''));
  const runTime = Date.parse(generatedAt);
  if (!Number.isFinite(reportTime) || !Number.isFinite(runTime)) throw new Error(`${label} generatedAt is invalid`);
  const ageMs = runTime - reportTime;
  if (ageMs < -5 * 60 * 1000 || ageMs > 24 * 60 * 60 * 1000) throw new Error(`${label} is stale, too far in the future, or outside the 24-hour readiness freshness window`);
  if (Number(report?.summary?.blockingCount ?? 0) > 0) throw new Error(`${label} has blocking checks`);
}
function hashFile(filePath) { return hashBytes(fs.readFileSync(filePath)); }
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function relative(repoRoot, filePath) {
  const value = path.relative(repoRoot, filePath).replaceAll('\\', '/');
  if (!value || value.startsWith('../') || path.isAbsolute(value)) throw new Error(`path escapes repository: ${filePath}`);
  return value;
}
function safeRelative(repoRoot, filePath) { try { return relative(repoRoot, filePath); } catch { return String(filePath).replaceAll('\\', '/'); } }
function requireRunId(value) {
  const runId = String(value ?? '').trim();
  if (!/^\d{8}-[A-Za-z0-9._-]+$/.test(runId)) throw new Error('runId must start with YYYYMMDD and contain only safe characters');
  return runId;
}
function requireTimestamp(value) {
  const timestamp = String(value ?? '').trim();
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) throw new Error('generatedAt must be an ISO timestamp');
  return timestamp;
}
function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}
function normalizeDomains(domains) {
  if (!Array.isArray(domains) || domains.length === 0 || domains.some((domain) => !TARGET_DOMAINS.includes(domain))) throw new Error('domains must be a non-empty subset of the eight L2 domains');
  return [...new Set(domains)];
}

function assertHistoricalDispositionServerFingerprintBinding(adapterReadback, databaseBoundary) {
  const dispositionPaths = Array.isArray(adapterReadback.historicalDispositionPaths)
    ? adapterReadback.historicalDispositionPaths.filter(Boolean)
    : [];
  const hasExcludedHistoricalRuns = Object.values(adapterReadback.domains ?? {}).some((domainResult) => {
    const excluded = domainResult?.evidence?.excludedHistoricalRuns;
    return excluded !== undefined && excluded !== null
      && (!Array.isArray(excluded) || excluded.length > 0);
  });
  if (dispositionPaths.length === 0 && !hasExcludedHistoricalRuns) return;
  const adapterFingerprint = adapterReadback.serverFingerprint;
  const boundaryFingerprint = databaseBoundary.serverFingerprint;
  if (!adapterFingerprint || !boundaryFingerprint) {
    throw new Error('historical disposition readiness requires adapter and database boundary server fingerprints');
  }
  let canonicalAdapterFingerprint;
  let canonicalBoundaryFingerprint;
  try {
    canonicalAdapterFingerprint = canonicalServerFingerprint(adapterFingerprint);
    canonicalBoundaryFingerprint = canonicalServerFingerprint(boundaryFingerprint);
  } catch (error) {
    throw new Error(`historical disposition server fingerprint is invalid: ${error.message}`);
  }
  if (JSON.stringify(canonicalAdapterFingerprint) !== JSON.stringify(canonicalBoundaryFingerprint)) {
    throw new Error('historical disposition server fingerprint drifted between adapter and database boundary reads');
  }
}

async function readAdapterEvidence({
  repoRoot,
  dbConfig,
  domains,
  l1EvidencePolicySetHash,
  historicalDispositionPaths = [],
  databaseEvidenceRoot = null,
  historicalEvidenceRoot = null,
  evidenceRoot = null,
}) {
  const evidencePolicySetHash = requireHash(
    l1EvidencePolicySetHash,
    'l1 evidence policy-set hash',
  );
  const mysql = loadMysqlModule({ repoRoot });
  const connection = await mysql.createConnection(dbConfig);
  const result = {
    policySetHash: null,
    l1EvidencePolicySetHash: evidencePolicySetHash,
    policyRows: null,
    historicalDispositionPaths: [...historicalDispositionPaths],
    serverFingerprint: null,
    databaseEvidenceRoot: null,
    domains: {},
  };
  try {
    await connection.beginTransaction();
    const historicalDispositionServerFingerprint = historicalDispositionPaths.length > 0
      ? await readConnectionServerFingerprint(connection, dbConfig)
      : null;
    result.serverFingerprint = historicalDispositionServerFingerprint;
    const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, {
      repoRoot,
      databaseEvidenceRoot,
      historicalEvidenceRoot,
      evidenceRoot,
      historicalSourceHashDispositionPaths: historicalDispositionPaths,
      historicalDispositionServerFingerprint,
    });
    result.databaseEvidenceRoot = adapter.evidenceRoot;
    result.policyRows = await adapter.readCurrentPolicyRows();
    result.policySetHash = computePolicySetHash(result.policyRows);
    for (const domainId of domains) {
      const domainResult = {
        status: 'pass', policy: null, evidence: null, error: null,
        policyCeiling: { status: 'missing', reason: 'registration_input_missing' },
      };
      try {
        domainResult.policy = await adapter.readPolicyForUpdate(domainId);
        if (!domainResult.policy) throw new Error('policy_missing');
        if (domainResult.policy.currentLevel === 'L2') {
          domainResult.status = 'skipped';
          domainResult.evidence = {
            distinctCommittedL1Runs: 0,
            fullReconciliation: false,
            qualifyingL1Runs: [],
            excludedHistoricalRuns: [],
            policySetHash: evidencePolicySetHash,
            skipReason: 'domain_already_l2',
          };
        } else {
          domainResult.evidence = await adapter.readQualifyingL1Evidence(domainId, {
            policyVersion: Number(domainResult.policy.policyVersion),
            policyHash: domainResult.policy.policyHash,
            policySetHash: evidencePolicySetHash,
          });
        }
      } catch (error) {
        domainResult.status = 'error';
        domainResult.error = error.message;
      }
      try {
        domainResult.policyCeiling = await readRegisteredL2PolicyCeilingEvidence({
          repoRoot,
          connection,
          domainId,
        });
      } catch (error) {
        domainResult.policyCeiling = { status: 'error', error: error.message };
      }
      result.domains[domainId] = domainResult;
    }
    await connection.rollback();
  } finally {
    await connection.end();
  }
  return result;
}

async function readDatabaseBoundary({ dbConfig, domains, repoRoot }) {
  const mysql = loadMysqlModule({ repoRoot });
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
    const [flywayRows] = await connection.query('SELECT MAX(CAST(version AS UNSIGNED)) AS latestVersion FROM flyway_schema_history WHERE success = 1');
    const [databaseRows] = await connection.query('SHOW DATABASES');
    const observedDatabases = (databaseRows ?? []).map((row) => row.Database ?? row.database).filter((name) => String(name).startsWith('terria_v1_')).sort();
    const count = async (sql, params = [domains]) => { const [rows] = await connection.query(sql, params); return Number(rows?.[0]?.total ?? 0); };
    const latestVersion = Number(flywayRows?.[0]?.latestVersion ?? 0);
    const server = serverRows?.[0] ?? {};
    const serverFingerprint = canonicalServerFingerprint({
      host: dbConfig.host,
      port: Number(server.port),
      serverUuid: server.serverUuid,
      databases: FORMAL_DATABASES,
    });
    return {
      host: dbConfig.host,
      serverPort: Number(server.port),
      serverUuid: server.serverUuid,
      serverFingerprint,
      observedDatabases,
      flywayLatestVersion: latestVersion,
      v59Applied: latestVersion >= 59,
      l2PolicyVersionRowsObserved: await count('SELECT COUNT(*) AS total FROM crawler_automation_policy_version WHERE domain_id IN (?) AND level = "L2"'),
      l2PromotionDecisionsObserved: await count('SELECT COUNT(*) AS total FROM crawler_automation_activation_decision WHERE domain_id IN (?) AND decision_kind = "L2_PROMOTION"'),
      liveAttempts: await count("SELECT COUNT(*) AS total FROM crawler_automation_run_attempt WHERE domain_id IN (?) AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')"),
      activeReservations: await count("SELECT COUNT(*) AS total FROM crawler_automation_attempt_reservation WHERE domain_id IN (?) AND status NOT IN ('RELEASED', 'CONSUMED', 'EXPIRED')"),
      activeWriteFences: await count("SELECT COUNT(*) AS total FROM crawler_automation_write_fence WHERE database_role = 'local' AND expires_at > NOW()", []),
      currentActivationDecisions: await count("SELECT COUNT(*) AS total FROM crawler_automation_activation_decision WHERE decision_kind = 'SCHEDULER_ACTIVATION' AND expires_at > NOW()", []),
    };
  } finally {
    await connection.end();
  }
}

async function readConnectionServerFingerprint(connection, dbConfig) {
  const [serverRows] = await connection.query(
    'SELECT @@server_uuid AS serverUuid, @@port AS port',
  );
  const server = serverRows?.[0] ?? {};
  return canonicalServerFingerprint({
    host: dbConfig.host,
    port: Number(server.port),
    serverUuid: server.serverUuid,
    databases: FORMAL_DATABASES,
  });
}

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`argument must use --key=value: ${arg}`);
    values[match[1]] = match[2];
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(process.env.WORKTREE_ROOT ?? process.cwd());
  const runId = requireRunId(args['run-id']);
  const generatedAt = requireTimestamp(args['generated-at'] ?? new Date().toISOString());
  const runRoot = path.resolve(repoRoot, args['run-root'] ?? `reports/runtime/local-data-chain-closure/${runId.slice(0, 8)}/l2-readiness/${runId}`);
  const config = loadLocalStackConfig(repoRoot);
  const dbConfig = {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: 'terria_v1_local',
    multipleStatements: false,
  };
  const domains = TARGET_DOMAINS;
  const historicalDispositionPaths = parsePathList(
    args['historical-source-hash-disposition']
      ?? args['historical-disposition-paths']
      ?? args['historical-disposition'],
  );
  const databaseEvidenceRoot = args['database-evidence-root'] ?? null;
  const historicalEvidenceRoot = args['historical-evidence-root'] ?? null;
  const evidenceRoot = args['evidence-root'] ?? null;
  const l1EvidencePolicySetHash = requireHash(
    args['l1-evidence-policy-set-hash'],
    '--l1-evidence-policy-set-hash',
  );
  const sharedReports = {
    crossDbPath: path.join(runRoot, 'cross-db.json'),
    relationJsonPath: path.join(runRoot, 'relation', `relation-health-${generatedAt.slice(0, 10)}.json`),
    relationMarkdownPath: path.join(runRoot, 'relation', `relation-health-${generatedAt.slice(0, 10)}.md`),
  };
  const uiReadinessPath = args['ui-readiness'];
  const uiReadiness = uiReadinessPath
    ? readJson(path.resolve(repoRoot, uiReadinessPath), 'UI readiness report')
    : null;
  const v2PreflightPath = args['v2-preflight'];
  const v2Preflight = v2PreflightPath
    ? readJson(path.resolve(repoRoot, v2PreflightPath), 'V2 preflight report')
    : null;
  Promise.all([
    readAdapterEvidence({
      repoRoot,
      dbConfig,
      domains,
      l1EvidencePolicySetHash,
      historicalDispositionPaths,
      databaseEvidenceRoot,
      historicalEvidenceRoot,
      evidenceRoot,
    }),
    readDatabaseBoundary({ repoRoot, dbConfig, domains }),
  ]).then(([adapterReadback, databaseBoundary]) => {
    const crossDb = readJson(path.resolve(repoRoot, sharedReports.crossDbPath), 'cross-db report');
    const relation = readJson(path.resolve(repoRoot, sharedReports.relationJsonPath), 'relation-health report');
    const acceptancePath = args.acceptance ? args.acceptance.replaceAll('\\', '/') : null;
    const acceptance = acceptancePath ? readJson(path.resolve(repoRoot, acceptancePath), 'acceptance report') : null;
    const priorRootDescriptor = resolvePriorReadRoot({
      repoRoot,
      evidenceRootPath: adapterReadback.databaseEvidenceRoot?.kind === 'primary-worktree'
        ? databaseEvidenceRoot
        : repoRoot,
      priorRoot: args['prior-root'],
    });
    const priorMatrix = readJson(
      path.join(priorRootDescriptor.path, 'l2-readiness-matrix.json'),
      'prior L2 readiness matrix',
    );
    const artifacts = buildL2ReadinessArtifacts({
      repoRoot, runId, generatedAt, runRoot, priorRoot: args['prior-root'],
      databaseEvidenceRoot, historicalEvidenceRoot, evidenceRoot,
      l1EvidencePolicySetHash,
      panelRoot: path.join(runRoot, 'domain'), sharedReports, uiReadinessPath, uiReadiness,
      v2PreflightPath, v2Preflight, adapterReadback,
      databaseBoundary, crossDb, relation, acceptancePath,
      acceptanceSummary: acceptance ? { timestamp: acceptance.timestamp, passed: acceptance.passed, failed: acceptance.failed, skipped: acceptance.skipped } : null,
      priorMatrixHash: priorMatrix?.policySet?.recomputedCurrentHash ?? null,
      domains,
    });
    console.log(JSON.stringify(writeL2ReadinessArtifacts({ repoRoot, artifacts }), null, 2));
  }).catch((error) => {
    console.error(error.stack ?? error.message ?? String(error));
    process.exitCode = 1;
  });
}

function parsePathList(value) {
  if (value == null || String(value).trim() === '') return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}
