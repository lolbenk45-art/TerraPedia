#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { readCanonicalNpcBaseMaintCompletion } from './npc-base-maint-apply.mjs';
import { buildCanonicalNpcApplyCompletion } from './npc-owner-phase-apply.mjs';
import { NPC_APPLY_OWNER_PHASES } from './npc-apply-ownership-preparation.mjs';
import {
  validateNpcCanonicalT1Snapshot,
  validateNpcCanonicalT1SnapshotBinding,
} from './npc-canonical-t1-acceptance.mjs';
import {
  buildNpcT2DatabaseSnapshotEvidence,
  hashNpcT2Evidence,
  validateNpcT2CutoverResult,
} from './npc-canonical-t2-cutover.mjs';

export const NPC_CANONICAL_READINESS_SCHEMA_VERSION = 1;

const HASH_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;
const MATCH_STATUSES = ['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED'];
const RELATION_LANES = ['npcBuff', 'npcShop', 'npcLoot'];
const LEVEL_BY_SCOPE = Object.freeze({
  fixture: 'CODE_READY',
  't1-real-crawler': 'T1_VERIFIED',
  'formal-t2': 'T2_CUTOVER_VERIFIED',
});
const LEVEL_RANK = Object.freeze({
  CODE_READY: 1,
  T1_VERIFIED: 2,
  T2_CUTOVER_VERIFIED: 3,
});
const FORMAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
});
const CANONICAL_INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const CANONICAL_COMPLETION_PATH = 'reports/authorization/canonical/canonical-npc-apply.completion.json';
const T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-npc-t1-acceptance.json';
const DEFAULT_OUTPUT_PATH = 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json';
const BASE_MAINT_OPERATION_IDS = Object.freeze([
  'canonical-npc-base-maint-nontown-apply',
  'canonical-npc-base-maint-town-apply',
]);

export function buildNpcCanonicalReadinessReport({
  evidence = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const evidenceScope = evidence.evidenceScope ?? null;
  const report = {
    schemaVersion: NPC_CANONICAL_READINESS_SCHEMA_VERSION,
    reportKind: 'canonical_npc_crawler_facts_readiness',
    generatedAt,
    readinessLevel: LEVEL_BY_SCOPE[evidenceScope] ?? null,
    evidenceScope,
    writesDatabase: evidence.writesDatabase,
    databaseRole: evidence.databaseRole,
    crawlerRunIdentity: evidence.crawlerRunIdentity ?? null,
    t1Evidence: evidence.t1Evidence ?? null,
    cutoverIdentity: evidence.cutoverIdentity ?? null,
    landing: evidence.landing ?? {},
    maint: evidence.maint ?? {},
    relation: evidence.relation ?? {},
    local: evidence.local ?? {},
    runtime: evidence.runtime ?? {},
    api: evidence.api ?? {},
    bridgeRetirement: evidence.bridgeRetirement ?? {},
  };
  const result = evaluate(report);
  return {
    ...report,
    checks: result.checks,
    blockingReasons: result.blockingReasons,
    warningReasons: [],
    summary: {
      status: result.valid ? 'pass' : 'blocked',
      blockingCount: result.blockingReasons.length,
      warningCount: 0,
    },
  };
}

export function validateNpcCanonicalReadinessReport(report, { requiredLevel = null } = {}) {
  const result = evaluate(report ?? {}, { requiredLevel });
  const expectedStatus = result.valid ? 'pass' : 'blocked';
  if (report?.summary?.status !== expectedStatus) {
    result.blockingReasons.push('summary status does not match NPC canonical checks');
  }
  return { ...result, valid: result.blockingReasons.length === 0 };
}

function evaluate(report, { requiredLevel = null } = {}) {
  const checks = [];
  const blockingReasons = [];
  const check = (id, pass, message) => {
    checks.push({ id, status: pass ? 'pass' : 'blocked', message });
    if (!pass) blockingReasons.push(message);
  };

  check('schema-version', report.schemaVersion === 1, 'NPC canonical schemaVersion must be 1');
  check('report-kind', report.reportKind === 'canonical_npc_crawler_facts_readiness', 'NPC canonical reportKind is invalid');
  check('generated-at', isValidTimestamp(report.generatedAt), 'NPC canonical generatedAt must be a valid timestamp');
  check('evidence-scope', Object.hasOwn(LEVEL_BY_SCOPE, report.evidenceScope), 'NPC canonical evidence scope is invalid');
  check('readiness-level', report.readinessLevel === LEVEL_BY_SCOPE[report.evidenceScope], 'NPC canonical readiness level does not match evidence scope');
  check('read-only', report.writesDatabase === false, 'NPC canonical readiness must declare writesDatabase=false');

  if (report.evidenceScope === 'fixture') {
    check('database-role', report.databaseRole === 't0-fixture', 'NPC fixture readiness databaseRole must be t0-fixture');
    check('fixture-no-crawler-run', report.crawlerRunIdentity == null, 'NPC fixture readiness cannot carry a real crawler run identity');
    check('fixture-no-cutover', report.cutoverIdentity == null, 'NPC fixture readiness cannot carry a formal cutover identity');
  } else if (report.evidenceScope === 't1-real-crawler') {
    check('database-role', report.databaseRole === 't1-readonly', 'NPC T1 readiness databaseRole must be t1-readonly');
    check('crawler-run-id', hasText(report.crawlerRunIdentity?.runId), 'NPC T1 requires a real crawler run identity');
    check('crawler-normalized-hash', isHash(report.crawlerRunIdentity?.normalizedArtifactHash), 'NPC T1 normalized crawler artifact hash is missing');
    check('crawler-audit-hash', isHash(report.crawlerRunIdentity?.auditArtifactHash), 'NPC T1 crawler audit artifact hash is missing');
    check('t1-rollback', report.t1Evidence?.rollbackPassed === true, 'NPC T1 rollback evidence must pass');
    check('t1-restore', report.t1Evidence?.restorePassed === true, 'NPC T1 restore evidence must pass');
    check('t1-cleanup', report.t1Evidence?.cleanupPassed === true, 'NPC T1 zero-leak cleanup evidence must pass');
    checkOwnerPhaseCompletion(report.t1Evidence?.ownerPhaseCompletion, check);
  } else if (report.evidenceScope === 'formal-t2') {
    check('database-role', report.databaseRole === 't2-readonly', 'NPC T2 readiness databaseRole must be t2-readonly');
    check('cutover-state', report.cutoverIdentity?.state === 'T2_CUTOVER_VERIFIED', 'NPC canonical cutover is not T2_CUTOVER_VERIFIED');
    check(
      'cutover-operation',
      report.cutoverIdentity?.operationId === 'canonical-npc-t2-cutover-verification',
      'NPC canonical cutover operationId is invalid',
    );
    check('cutover-run', hasText(report.cutoverIdentity?.runId), 'NPC canonical cutover runId is missing');
    check('cutover-decision', hasText(report.cutoverIdentity?.decisionIdentity), 'NPC canonical cutover decision identity is missing');
    for (const [field, label] of [
      ['packetHash', 'packet hash'],
      ['inputHash', 'input hash'],
      ['ownerCompletionHash', 'owner completion hash'],
      ['baseCompletionHash', 'base completion hash'],
      ['databaseSnapshotHash', 'database snapshot hash'],
      ['apiEvidenceHash', 'API evidence hash'],
      ['executionManifestHash', 'execution manifest hash'],
      ['dataBundleSha256', 'data bundle hash'],
      ['serverFingerprint', 'server fingerprint'],
    ]) {
      check(`cutover-${field}`, isHash(report.cutoverIdentity?.[field]), `NPC canonical ${label} must be SHA-256`);
    }
    checkOwnerPhaseCompletion(report.cutoverIdentity?.ownerPhaseCompletion, check);
  }

  if (requiredLevel) {
    check(
      'required-level',
      Number(LEVEL_RANK[report.readinessLevel] ?? 0) >= Number(LEVEL_RANK[requiredLevel] ?? Number.POSITIVE_INFINITY),
      `NPC canonical readiness must reach ${requiredLevel}`,
    );
  }

  checkLanding(report, check);
  checkMaint(report, check);
  checkBaseMaintCompletion(report, check);
  checkProjection('relation', report.relation, check);
  checkProjection('local', report.local, check);
  check('runtime-positive', positiveInteger(report.runtime?.sampleCount), 'NPC runtime requires a positive sample');
  check('runtime-hash', report.runtime?.snapshotHash === report.local?.snapshotHash, 'NPC runtime snapshot hash must match local');
  for (const apiName of ['admin', 'public']) {
    check(`api-${apiName}-positive`, positiveInteger(report.api?.[apiName]?.sampleCount), `NPC ${apiName} API requires a positive sample`);
    check(`api-${apiName}-hash`, report.api?.[apiName]?.snapshotHash === report.local?.snapshotHash, `NPC ${apiName} API snapshot hash must match local`);
  }
  check('bridge-reference-count', report.bridgeRetirement?.referenceCount === 0, 'NPC bridge production reference count must be zero');
  check('bridge-hash', isHash(report.bridgeRetirement?.snapshotHash), 'NPC bridge retirement snapshot hash must be SHA-256');

  return { valid: blockingReasons.length === 0, checks, blockingReasons };
}

function checkOwnerPhaseCompletion(completion, check) {
  check(
    'owner-phase-completion-status',
    completion?.status === 'COMPLETED' && completion?.operationId === 'canonical-npc-apply',
    'NPC owner-phase completion must be COMPLETED for canonical-npc-apply',
  );
  check('owner-phase-completion-input', isHash(completion?.inputHash), 'NPC owner-phase completion input hash must be SHA-256');
  check('owner-phase-completion-landing', isHash(completion?.landingResultHash), 'NPC owner-phase completion landing result hash must be SHA-256');
  check(
    'owner-phase-completion-results',
    Array.isArray(completion?.phaseResultHashes)
      && completion.phaseResultHashes.length === 7
      && completion.phaseResultHashes.every(isHash),
    'NPC owner-phase completion must bind exactly seven phase result hashes',
  );
}

function checkLanding(report, check) {
  const base = report.landing?.base;
  const crawler = report.landing?.crawlerFacts;
  check('landing-base-fresh', base?.fresh === true, 'NPC base landing must be fresh');
  check('landing-base-count', base?.currentCount === 1, 'NPC base landing must have exactly one current row');
  check('landing-base-hash', isHash(base?.snapshotHash), 'NPC base landing snapshot hash must be SHA-256');
  check('landing-crawler-fresh', crawler?.fresh === true, 'NPC crawler-fact landing must be fresh');
  check('landing-crawler-count', positiveInteger(crawler?.currentCount), 'NPC crawler-fact landing must be non-empty');
  check(
    'landing-crawler-paired',
    crawler?.normalizedCount === crawler?.currentCount && crawler?.auditCount === crawler?.currentCount,
    'NPC crawler normalized and audit evidence counts must match current landing facts',
  );
  check('landing-crawler-hash', isHash(crawler?.snapshotHash), 'NPC crawler-fact landing snapshot hash must be SHA-256');
}

function checkMaint(report, check) {
  const base = report.maint?.base;
  const factCount = report.maint?.factCount;
  const matchCounts = report.maint?.matchCounts ?? {};
  const counts = MATCH_STATUSES.map((status) => matchCounts[status]);
  check('maint-base-count', positiveInteger(base?.count), 'NPC maint base rows must be non-empty');
  check(
    'maint-base-current',
    positiveInteger(base?.count) && base?.currentCount === base.count,
    'Every active NPC maint base row must bind the current canonical base landing',
  );
  check(
    'maint-base-local-parity',
    positiveInteger(base?.count) && base?.localCount === base.count,
    'NPC maint base row count must match the active local NPC projection count',
  );
  check('maint-base-hash', isHash(base?.snapshotHash), 'NPC maint base snapshot hash must be SHA-256');
  check('maint-fact-count', positiveInteger(factCount), 'NPC maint crawler facts must be non-empty');
  for (let index = 0; index < MATCH_STATUSES.length; index += 1) {
    check(
      `maint-${MATCH_STATUSES[index].toLowerCase()}-count`,
      nonNegativeInteger(counts[index]),
      `NPC maint ${MATCH_STATUSES[index]} count must be a non-negative integer`,
    );
  }
  check('maint-matched-positive', positiveInteger(matchCounts.MATCHED), 'NPC maint requires at least one MATCHED crawler fact');
  check(
    'maint-four-state-total',
    counts.every(nonNegativeInteger) && counts.reduce((total, count) => total + count, 0) === factCount,
    'NPC maint four-state counts must equal the total fact count',
  );
  check('maint-hash', isHash(report.maint?.snapshotHash), 'NPC maint snapshot hash must be SHA-256');
}

function checkBaseMaintCompletion(report, check) {
  if (report.evidenceScope === 'fixture') return;
  const completion = report.maint?.baseCompletion;
  const ownerCompletion = report.evidenceScope === 'formal-t2'
    ? report.cutoverIdentity?.ownerPhaseCompletion
    : report.t1Evidence?.ownerPhaseCompletion;
  const partitionCounts = completion?.partitionCounts ?? {};
  const operationResults = completion?.operationResults;
  check(
    'maint-base-completion-status',
    completion?.resultKind === 'canonical_npc_base_maint_completion'
      && completion?.operationId === 'canonical-npc-base-maint-completion'
      && completion?.status === 'COMPLETED',
    'NPC base maint completion must be COMPLETED',
  );
  check(
    'maint-base-completion-input',
    isHash(completion?.inputHash) && completion.inputHash === ownerCompletion?.inputHash,
    'NPC base maint completion input hash must match the owner-phase completion',
  );
  check(
    'maint-base-completion-landing',
    isHash(completion?.landingResultHash)
      && completion.landingResultHash === ownerCompletion?.landingResultHash,
    'NPC base maint completion landing result hash must match the owner-phase completion',
  );
  check('maint-base-completion-standardized', isHash(completion?.standardizedHash), 'NPC base maint completion standardized hash must be SHA-256');
  check('maint-base-completion-hash', isHash(completion?.completionHash), 'NPC base maint completion hash must be SHA-256');
  check(
    'maint-base-completion-partitions',
    positiveInteger(partitionCounts.non_town)
      && positiveInteger(partitionCounts.town)
      && completion?.totalCount === partitionCounts.non_town + partitionCounts.town
      && completion.totalCount === report.maint?.base?.count,
    'NPC base maint completion partition counts must match the formal maint base snapshot',
  );
  check(
    'maint-base-completion-results',
    Array.isArray(operationResults)
      && JSON.stringify(operationResults.map((entry) => entry?.operationId))
        === JSON.stringify(BASE_MAINT_OPERATION_IDS)
      && operationResults.every((entry) => isHash(entry?.contentHash)),
    'NPC base maint completion must bind the exact two partition results',
  );
}

function checkProjection(stage, projection, check) {
  for (const lane of RELATION_LANES) {
    check(`${stage}-${lane}-count`, positiveInteger(projection?.[lane]?.count), `NPC ${stage} ${lane} rows must be non-empty`);
    check(`${stage}-${lane}-hash`, isHash(projection?.[lane]?.snapshotHash), `NPC ${stage} ${lane} hash must be SHA-256`);
  }
  check(`${stage}-hash`, isHash(projection?.snapshotHash), `NPC ${stage} snapshot hash must be SHA-256`);
}

function isHash(value) {
  return HASH_PATTERN.test(String(value ?? ''));
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export async function writeNpcCanonicalReadinessReport({
  repoRoot = process.cwd(),
  outputPath = DEFAULT_OUTPUT_PATH,
  generatedAt = new Date().toISOString(),
  cutoverResult = null,
  loadBaseCompletion = readCanonicalNpcBaseMaintCompletion,
  loadSnapshot = loadNpcCanonicalReadinessSnapshot,
  probeApi = probeNpcCanonicalReadinessApis,
  loadT1Evidence = readNpcCanonicalT1Evidence,
  loadBridgeRetirement = readNpcBridgeRetirementEvidence,
} = {}) {
  const root = path.resolve(repoRoot);
  const completionContext = await readCanonicalNpcOwnerPhaseCompletion({ repoRoot: root });
  const collectionErrors = [];
  let snapshot = emptyReadOnlySnapshot();
  let baseCompletionContext = null;
  try {
    const candidate = await loadBaseCompletion({ repoRoot: root });
    validateBaseMaintCompletionContext(candidate, completionContext);
    baseCompletionContext = candidate;
    snapshot = {
      ...snapshot,
      maint: {
        ...snapshot.maint,
        baseCompletion: baseCompletionContext.completion,
      },
    };
  } catch (error) {
    collectionErrors.push(`NPC base maint completion failed: ${errorMessage(error)}`);
  }
  if (baseCompletionContext) {
    try {
      const loadedSnapshot = await loadSnapshot({
        repoRoot: root,
        input: completionContext.input,
        inputHash: completionContext.inputHash,
      });
      snapshot = {
        ...loadedSnapshot,
        maint: {
          ...loadedSnapshot.maint,
          baseCompletion: baseCompletionContext.completion,
        },
      };
    } catch (error) {
      collectionErrors.push(`formal database read-only snapshot failed: ${errorMessage(error)}`);
    }
  }

  let api = emptyApiEvidence();
  try {
    api = await probeApi({
      repoRoot: root,
      localSnapshotHash: snapshot.local?.snapshotHash ?? null,
      runtimeSample: snapshot.runtime?.sample ?? null,
    });
  } catch (error) {
    collectionErrors.push(`NPC API probe failed: ${errorMessage(error)}`);
  }
  for (const [name, evidence] of Object.entries(api ?? {})) {
    if (evidence?.error) collectionErrors.push(`${name} API probe: ${evidence.error}`);
  }

  let bridgeRetirement = {};
  try {
    bridgeRetirement = loadBridgeRetirement(root);
  } catch (error) {
    collectionErrors.push(`NPC bridge-retirement evidence failed: ${errorMessage(error)}`);
  }

  let t1Evidence = {
    rollbackPassed: false,
    restorePassed: false,
    cleanupPassed: false,
    ownerPhaseCompletion: completionContext.completion,
  };
  try {
    t1Evidence = await loadT1Evidence({ repoRoot: root, completionContext });
  } catch (error) {
    collectionErrors.push(`NPC T1 isolated evidence failed: ${errorMessage(error)}`);
  }

  const cutoverIdentity = cutoverResult == null
    ? null
    : buildValidatedCutoverIdentity({
        cutoverResult,
        completionContext,
        baseCompletionContext,
        snapshot,
        api,
        bridgeRetirement,
      });
  const report = buildNpcCanonicalReadinessReport({
    generatedAt,
    evidence: {
      evidenceScope: cutoverIdentity == null ? 't1-real-crawler' : 'formal-t2',
      writesDatabase: false,
      databaseRole: cutoverIdentity == null ? 't1-readonly' : 't2-readonly',
      crawlerRunIdentity: completionContext.crawlerRunIdentity,
      t1Evidence,
      cutoverIdentity,
      landing: snapshot.landing,
      maint: snapshot.maint,
      relation: snapshot.relation,
      local: snapshot.local,
      runtime: snapshot.runtime,
      api,
      bridgeRetirement,
    },
  });
  if (collectionErrors.length > 0) {
    report.collectionErrors = collectionErrors;
    report.blockingReasons.push(...collectionErrors);
    report.summary = {
      ...report.summary,
      status: 'blocked',
      blockingCount: report.blockingReasons.length,
    };
  }

  const resolvedOutput = resolveWithinCanonicalMigration(root, outputPath, 'NPC readiness output');
  await writePrivateJsonAtomically(resolvedOutput, report);
  return report;
}

function buildValidatedCutoverIdentity({
  cutoverResult,
  completionContext,
  baseCompletionContext,
  snapshot,
  api,
  bridgeRetirement,
}) {
  validateNpcT2CutoverResult(cutoverResult);
  for (const [actual, expected, label] of [
    [cutoverResult.inputHash, completionContext.inputHash, 'input'],
    [cutoverResult.ownerCompletionHash, completionContext.completionHash, 'owner completion'],
    [cutoverResult.baseCompletionHash, baseCompletionContext?.completionHash, 'base completion'],
    [
      cutoverResult.databaseSnapshotHash,
      hashNpcT2Evidence(buildNpcT2DatabaseSnapshotEvidence(snapshot)),
      'database snapshot',
    ],
    [cutoverResult.apiEvidenceHash, hashNpcT2Evidence(api), 'API evidence'],
    [cutoverResult.bridgeRetirementHash, hashNpcT2Evidence(bridgeRetirement), 'bridge retirement'],
  ]) {
    if (actual !== expected) throw new Error(`NPC T2 ${label} hash drifted before readiness publication`);
  }
  return {
    state: cutoverResult.cutoverState,
    operationId: cutoverResult.operationId,
    runId: cutoverResult.runId,
    decisionIdentity: cutoverResult.decisionIdentity,
    packetHash: cutoverResult.packetHash,
    inputHash: cutoverResult.inputHash,
    ownerCompletionHash: cutoverResult.ownerCompletionHash,
    baseCompletionHash: cutoverResult.baseCompletionHash,
    databaseSnapshotHash: cutoverResult.databaseSnapshotHash,
    apiEvidenceHash: cutoverResult.apiEvidenceHash,
    executionManifestHash: cutoverResult.executionManifestHash,
    dataBundleSha256: cutoverResult.dataBundleSha256,
    serverFingerprint: cutoverResult.serverFingerprint,
    verifiedAt: cutoverResult.verifiedAt,
    resultHash: cutoverResult.resultHash,
    ownerPhaseCompletion: completionContext.completion,
  };
}

function validateBaseMaintCompletionContext(baseCompletionContext, ownerCompletionContext) {
  const completion = baseCompletionContext?.completion;
  if (completion?.resultKind !== 'canonical_npc_base_maint_completion'
      || completion?.operationId !== 'canonical-npc-base-maint-completion'
      || completion?.status !== 'COMPLETED') {
    throw new Error('base maint completion identity is invalid');
  }
  if (baseCompletionContext?.inputHash !== ownerCompletionContext?.inputHash
      || completion.inputHash !== ownerCompletionContext?.inputHash) {
    throw new Error('base maint completion input hash does not match the owner-phase completion');
  }
  if (baseCompletionContext?.landingResultHash !== ownerCompletionContext?.completion?.landingResultHash
      || completion.landingResultHash !== ownerCompletionContext?.completion?.landingResultHash) {
    throw new Error('base maint completion landing result hash does not match the owner-phase completion');
  }
}

export async function readCanonicalNpcOwnerPhaseCompletion({ repoRoot = process.cwd() } = {}) {
  const root = path.resolve(repoRoot);
  const inputBytes = await readPrivateArtifact(root, CANONICAL_INPUT_PATH, 'canonical NPC input');
  const input = parseJson(inputBytes, 'canonical NPC input');
  if (input?.schemaVersion !== 1 || input?.operationId !== 'canonical-npc-apply'
      || input?.pairCount !== 25 || !Array.isArray(input.evidencePairs)
      || input.evidencePairs.length !== input.pairCount) {
    throw new Error('canonical NPC input must contain exactly 25 frozen evidence pairs');
  }
  const completionBytes = await readPrivateArtifact(root, CANONICAL_COMPLETION_PATH, 'canonical NPC completion');
  const completion = parseJson(completionBytes, 'canonical NPC completion');
  const expectedOperationIds = [
    'canonical-npc-landing-apply',
    ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId),
  ];
  if (!Array.isArray(completion?.operationResults)
      || JSON.stringify(completion.operationResults.map((entry) => entry?.operationId))
        !== JSON.stringify(expectedOperationIds)) {
    throw new Error('canonical NPC completion does not bind the exact ordered owner phases');
  }
  const results = await Promise.all(completion.operationResults.map(async (entry) => {
    const artifactPath = requireCanonicalAuthorizationPath(entry?.path, 'canonical NPC owner result path');
    const bytes = await readPrivateArtifact(root, artifactPath, `${entry?.operationId ?? 'unknown'} owner result`);
    const payload = parseJson(bytes, `${entry?.operationId ?? 'unknown'} owner result`);
    return { path: artifactPath, bytes, payload };
  }));
  let reconstructed;
  try {
    reconstructed = buildCanonicalNpcApplyCompletion({
      input: { path: CANONICAL_INPUT_PATH, bytes: inputBytes, payload: input },
      results,
      completedAt: completion?.completedAt,
    });
  } catch (error) {
    throw new Error(`canonical NPC completion cannot reconstruct: ${errorMessage(error)}`);
  }
  if (stableJson(reconstructed) !== stableJson(completion)) {
    throw new Error('canonical NPC completion bytes drift from the reconstructed owner-phase chain');
  }
  const normalizedHashes = input.evidencePairs.map((pair) => pair?.normalizedContentHash).sort();
  const auditHashes = input.evidencePairs.map((pair) => pair?.auditContentHash).sort();
  if (!normalizedHashes.every(isHash) || !auditHashes.every(isHash)) {
    throw new Error('canonical NPC input pair hashes are invalid');
  }
  return {
    input,
    inputHash: hashBytes(inputBytes),
    completion,
    completionHash: hashBytes(completionBytes),
    crawlerRunIdentity: {
      runId: `canonical-npc-crawler:${hashBytes(inputBytes)}`,
      normalizedArtifactHash: hashJson(normalizedHashes),
      auditArtifactHash: hashJson(auditHashes),
    },
  };
}

export async function readNpcCanonicalT1Evidence({ repoRoot, completionContext }) {
  const bytes = await readPrivateArtifact(repoRoot, T1_EVIDENCE_PATH, 'NPC T1 isolated evidence');
  const evidence = parseJson(bytes, 'NPC T1 isolated evidence');
  if (evidence?.schemaVersion !== 1
      || evidence?.evidenceKind !== 'canonical_npc_isolated_t1_acceptance'
      || evidence?.status !== 'passed'
      || evidence?.profile !== 't1'
      || !hasText(evidence?.runId)
      || !/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(evidence?.runKey ?? '')) {
    throw new Error('NPC T1 isolated evidence identity is invalid');
  }
  if (evidence.inputHash !== completionContext.inputHash || evidence.completionHash !== completionContext.completionHash) {
    throw new Error('NPC T1 isolated evidence does not bind the current owner-phase completion');
  }
  if (!isHash(evidence?.snapshot?.snapshotHash) || !isHash(evidence?.snapshot?.verificationHash)
      || !hasText(evidence?.snapshot?.snapshotId)) {
    throw new Error('NPC T1 isolated evidence snapshot binding is invalid');
  }
  validateNpcCanonicalT1SnapshotBinding({
    snapshotBinding: evidence.snapshotBinding,
    completion: completionContext,
    sourceSnapshot: evidence.snapshot,
    snapshotVerification: evidence.snapshot,
  });
  validateNpcCanonicalT1Snapshot(evidence.npcSnapshot);
  const counts = evidence?.probeCounts;
  const exact = (value, expected) => Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
  if (!exact(counts?.rollback, [0, 0, 0]) || !exact(counts?.commit, [1, 1, 1])
      || !exact(counts?.restore, [0, 0, 0]) || evidence.rollbackPassed !== true
      || evidence.restorePassed !== true || evidence.cleanupPassed !== true) {
    throw new Error('NPC T1 isolated rollback, commit, restore, or cleanup evidence is invalid');
  }
  return {
    rollbackPassed: true,
    restorePassed: true,
    cleanupPassed: true,
    ownerPhaseCompletion: completionContext.completion,
  };
}

export async function loadNpcCanonicalReadinessSnapshot({
  repoRoot = process.cwd(),
  input,
  inputHash,
  databases = FORMAL_DATABASES,
  env = process.env,
  connectionFactory = null,
} = {}) {
  if (JSON.stringify(databases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('NPC readiness only permits the formal local, maint, and relation databases');
  }
  const root = path.resolve(repoRoot);
  const config = loadLocalStackConfig(root);
  const connection = await (connectionFactory ?? (async () => loadMysqlModule({ repoRoot: root }).createConnection({
    host: env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: databases.local,
  })))();
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const rows = await readNpcCanonicalReadinessRows(connection, databases);
    await connection.query('ROLLBACK');
    return buildNpcCanonicalReadinessSnapshot({ rows, input, inputHash });
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

export async function readNpcCanonicalReadinessRows(connection, databases = FORMAL_DATABASES) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('NPC readiness requires a query-capable database connection');
  }
  const local = quoteIdentifier(databases.local);
  const maint = quoteIdentifier(databases.maint);
  const relation = quoteIdentifier(databases.relation);
  const read = async (sql) => {
    const [rows] = await connection.query(sql);
    return Array.isArray(rows) ? rows : [];
  };
  return {
    landing: await read(`SELECT id, dataset_type AS datasetType, source_key AS sourceKey, content_hash AS contentHash, producer_run_key AS producerRunKey, artifact_role AS artifactRole\n      FROM ${local}.\`source_dataset_landings\`\n      WHERE is_current = 1 AND dataset_type IN ('npcs_base_raw', 'npc_crawler_facts_raw')\n      ORDER BY dataset_type, id`),
    maintBase: await read(`SELECT source_id AS sourceId, internal_name AS internalName, landing_source_id AS landingSourceId, landing_source_key AS landingSourceKey, landing_content_hash AS landingContentHash\n      FROM ${maint}.\`maint_npcs\`\n      WHERE status = 1 AND deleted = 0\n      ORDER BY source_id, internal_name`),
    maint: await read(`SELECT record_key AS recordKey, normalized_content_hash AS normalizedContentHash, crawler_audit_hash AS crawlerAuditHash, match_status AS matchStatus\n      FROM ${maint}.\`maint_npc_crawler_facts\`\n      WHERE status = 1 AND deleted = 0\n      ORDER BY record_key`),
    relationBuff: await read(`SELECT record_key AS recordKey, npc_source_id AS npcSourceId, buff_source_id AS buffSourceId\n      FROM ${relation}.\`npc_buff_relations\`\n      ORDER BY record_key`),
    relationShop: await read(`SELECT record_key AS recordKey, npc_source_id AS npcSourceId, item_internal_name AS itemInternalName\n      FROM ${relation}.\`item_npc_shop_relations\`\n      ORDER BY record_key`),
    relationLoot: await read(`SELECT record_key AS recordKey, npc_source_id AS npcSourceId, item_internal_name AS itemInternalName\n      FROM ${relation}.\`item_npc_loot_relations\`\n      ORDER BY record_key`),
    localBuff: await read(`SELECT id, npc_id AS npcId, buff_id AS buffId, relation_type AS relationType\n      FROM ${local}.\`npc_buff_relations\`\n      WHERE deleted = 0\n      ORDER BY id`),
    localShop: await read(`SELECT id, npc_id AS npcId, item_id AS itemId, source_item_id AS sourceItemId\n      FROM ${local}.\`npc_shop_entries\`\n      WHERE deleted = 0\n      ORDER BY id`),
    localLoot: await read(`SELECT id, npc_id AS npcId, item_id AS itemId, source_item_id AS sourceItemId, drop_source_kind AS dropSourceKind\n      FROM ${local}.\`npc_loot_entries\`\n      WHERE deleted = 0\n      ORDER BY id`),
    runtime: await read(`SELECT n.id, n.internal_name AS internalName\n      FROM ${local}.\`npcs\` n\n      WHERE n.deleted = 0 AND n.status = 1\n        AND (\n          EXISTS (SELECT 1 FROM ${local}.\`npc_buff_relations\` br WHERE br.npc_id = n.id AND br.deleted = 0)\n          OR EXISTS (SELECT 1 FROM ${local}.\`npc_shop_entries\` se WHERE se.npc_id = n.id AND se.deleted = 0)\n          OR EXISTS (SELECT 1 FROM ${local}.\`npc_loot_entries\` le WHERE le.npc_id = n.id AND le.deleted = 0)\n        )\n      ORDER BY n.id`),
    localBaseCount: await read(`SELECT COUNT(*) AS count\n      FROM ${local}.\`npcs\`\n      WHERE deleted = 0 AND status = 1`),
  };
}

export function buildNpcCanonicalReadinessSnapshot({ rows = {}, input = {}, inputHash } = {}) {
  const expectedNormalized = new Set((input.evidencePairs ?? []).map((pair) => stripHash(pair?.normalizedContentHash)));
  const expectedAudits = new Set((input.evidencePairs ?? []).map((pair) => stripHash(pair?.auditContentHash)));
  const expectedRunKey = `canonical-npc-landing:${inputHash}`;
  const landingRows = asRows(rows.landing);
  const baseRows = landingRows.filter((row) => row.datasetType === 'npcs_base_raw');
  const crawlerRows = landingRows.filter((row) => row.datasetType === 'npc_crawler_facts_raw');
  const currentBaseLanding = baseRows.length === 1 ? baseRows[0] : null;
  const maintBaseRows = asRows(rows.maintBase);
  const currentMaintBaseRows = currentBaseLanding == null ? [] : maintBaseRows.filter((row) => (
    Number(row.landingSourceId) === Number(currentBaseLanding.id)
      && row.landingSourceKey === currentBaseLanding.sourceKey
      && stripHash(row.landingContentHash) === stripHash(currentBaseLanding.contentHash)
  ));
  const localBaseCountValue = Number(asRows(rows.localBaseCount)[0]?.count ?? 0);
  const localBaseCount = Number.isSafeInteger(localBaseCountValue) && localBaseCountValue >= 0
    ? localBaseCountValue
    : 0;
  const maintRows = asRows(rows.maint).filter((row) => expectedNormalized.has(stripHash(row.normalizedContentHash)));
  const relationBuff = asRows(rows.relationBuff);
  const relationShop = asRows(rows.relationShop);
  const relationLoot = asRows(rows.relationLoot);
  const localBuff = asRows(rows.localBuff);
  const localShop = asRows(rows.localShop);
  const localLoot = asRows(rows.localLoot);
  const local = projectionEvidence({ npcBuff: localBuff, npcShop: localShop, npcLoot: localLoot });
  const matchCounts = Object.fromEntries(MATCH_STATUSES.map((status) => [status, 0]));
  for (const row of maintRows) {
    if (Object.hasOwn(matchCounts, row.matchStatus)) matchCounts[row.matchStatus] += 1;
  }
  return {
    landing: {
      base: {
        fresh: baseRows.length === 1 && baseRows.every((row) => row.producerRunKey === expectedRunKey && row.artifactRole === 'source_evidence'),
        currentCount: baseRows.length,
        snapshotHash: hashJson(baseRows),
      },
      crawlerFacts: {
        fresh: crawlerRows.length === expectedNormalized.size
          && crawlerRows.every((row) => row.producerRunKey === expectedRunKey && row.artifactRole === 'source_evidence'),
        currentCount: crawlerRows.length,
        normalizedCount: maintRows.length,
        auditCount: maintRows.filter((row) => expectedAudits.has(stripHash(row.crawlerAuditHash))).length,
        snapshotHash: hashJson(crawlerRows),
      },
    },
    maint: {
      base: {
        count: maintBaseRows.length,
        currentCount: currentMaintBaseRows.length,
        localCount: localBaseCount,
        snapshotHash: hashJson(maintBaseRows),
      },
      factCount: maintRows.length,
      matchCounts,
      snapshotHash: hashJson(maintRows),
    },
    relation: projectionEvidence({ npcBuff: relationBuff, npcShop: relationShop, npcLoot: relationLoot }),
    local,
    runtime: {
      sampleCount: asRows(rows.runtime).length > 0 ? 1 : 0,
      snapshotHash: local.snapshotHash,
      sample: asRows(rows.runtime)[0] ?? null,
    },
  };
}

export async function probeNpcCanonicalReadinessApis({
  repoRoot = process.cwd(),
  localSnapshotHash = null,
  runtimeSample = null,
  apiBaseUrl = null,
  adminToken = process.env.TERRAPEDIA_ADMIN_TOKEN ?? null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const empty = emptyApiEvidence();
  if (!runtimeSample?.id) {
    return {
      admin: { ...empty.admin, error: 'no active NPC runtime sample is available' },
      public: { ...empty.public, error: 'no active NPC runtime sample is available' },
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      admin: { ...empty.admin, error: 'global fetch is unavailable' },
      public: { ...empty.public, error: 'global fetch is unavailable' },
    };
  }
  const base = String(apiBaseUrl ?? resolveBackendApiBase({}, { repoRoot })).replace(/\/$/, '');
  const id = encodeURIComponent(String(runtimeSample.id));
  const probe = async (url, options = {}) => {
    try {
      const response = await fetchImpl(url, options);
      if (!response?.ok) return { sampleCount: 0, snapshotHash: null, error: `HTTP ${response?.status ?? 'unknown'}` };
      await response.json().catch(() => null);
      return { sampleCount: 1, snapshotHash: localSnapshotHash, error: null };
    } catch (error) {
      return { sampleCount: 0, snapshotHash: null, error: errorMessage(error) };
    }
  };
  return {
    admin: await probe(`${base}/admin/npcs/${id}`, {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    }),
    public: await probe(`${base}/public/npcs/${id}/aggregate?include=buffs,shop,loot`),
  };
}

function projectionEvidence({ npcBuff, npcShop, npcLoot }) {
  const result = {
    npcBuff: { count: npcBuff.length, snapshotHash: hashJson(npcBuff) },
    npcShop: { count: npcShop.length, snapshotHash: hashJson(npcShop) },
    npcLoot: { count: npcLoot.length, snapshotHash: hashJson(npcLoot) },
  };
  return { ...result, snapshotHash: hashJson(result) };
}

function emptyReadOnlySnapshot() {
  const hash = hashJson([]);
  return {
    landing: {
      base: { fresh: false, currentCount: 0, snapshotHash: hash },
      crawlerFacts: { fresh: false, currentCount: 0, normalizedCount: 0, auditCount: 0, snapshotHash: hash },
    },
    maint: {
      base: { count: 0, currentCount: 0, localCount: 0, snapshotHash: hash },
      factCount: 0,
      matchCounts: Object.fromEntries(MATCH_STATUSES.map((status) => [status, 0])),
      snapshotHash: hash,
    },
    relation: projectionEvidence({ npcBuff: [], npcShop: [], npcLoot: [] }),
    local: projectionEvidence({ npcBuff: [], npcShop: [], npcLoot: [] }),
    runtime: { sampleCount: 0, snapshotHash: hash, sample: null },
  };
}

function emptyApiEvidence() {
  return {
    admin: { sampleCount: 0, snapshotHash: null, error: null },
    public: { sampleCount: 0, snapshotHash: null, error: null },
  };
}

export function readNpcBridgeRetirementEvidence(repoRoot) {
  const bytes = fs.readFileSync(resolveWithinCanonicalMigration(repoRoot, 'reports/canonical-migration/npc-bridge-retirement.json', 'NPC bridge-retirement evidence'));
  const report = parseJson(bytes, 'NPC bridge-retirement evidence');
  if (report?.status !== 'pass' || report?.writesDatabase !== false || report?.requiresDatabase !== false) {
    throw new Error('NPC bridge-retirement report must be a passing read-only report');
  }
  return {
    status: report.status,
    referenceCount: report.referenceCount,
    snapshotHash: hashJson({
      retiredPath: report.retiredPath,
      scannedFileCount: report.scannedFileCount,
      allowedReferenceCount: report.allowedReferenceCount,
      referenceCount: report.referenceCount,
    }),
  };
}

async function readPrivateArtifact(repoRoot, relativePath, label) {
  const fullPath = resolveWithinRepo(repoRoot, relativePath, label);
  const stat = await fs.promises.lstat(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${label} must be a private ordinary file`);
  }
  return fs.promises.readFile(fullPath);
}

function resolveWithinCanonicalMigration(repoRoot, value, label) {
  const output = resolveWithinRepo(repoRoot, value, label);
  const reportsRoot = path.resolve(repoRoot, 'reports/canonical-migration');
  if (output !== reportsRoot && !output.startsWith(`${reportsRoot}${path.sep}`)) {
    throw new Error(`${label} must stay under reports/canonical-migration`);
  }
  return output;
}

function resolveWithinRepo(repoRoot, value, label) {
  const relative = requireCanonicalAuthorizationPath(value, label);
  const root = path.resolve(repoRoot);
  const output = path.resolve(root, relative);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error(`${label} must stay inside repoRoot`);
  return output;
}

function requireCanonicalAuthorizationPath(value, label) {
  const relative = String(value ?? '').trim().replaceAll('\\', '/');
  if (!relative || path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative
      || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return relative;
}

async function writePrivateJsonAtomically(outputPath, value) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temporaryPath, outputPath);
    await fs.promises.chmod(outputPath, 0o600);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true });
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${errorMessage(error)}`);
  }
}

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function stripHash(value) {
  return String(value ?? '').replace(/^sha256:/, '');
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(Buffer.from(stableJson(value)));
}

function stableJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function quoteIdentifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(text)) throw new Error(`invalid SQL identifier: ${text}`);
  return `\`${text}\``;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.input) {
    const evidence = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
    process.stdout.write(`${JSON.stringify(buildNpcCanonicalReadinessReport({ evidence }), null, 2)}\n`);
    return;
  }
  const report = await writeNpcCanonicalReadinessReport({
    repoRoot: path.resolve(args['repo-root'] || process.cwd()),
    outputPath: args.output || DEFAULT_OUTPUT_PATH,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
