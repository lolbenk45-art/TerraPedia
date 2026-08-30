import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import {
  approveL2PolicyCeilingArtifact,
  buildL2PolicyCeilingArtifact,
} from './l2-policy-ceiling-artifact.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  formalizeL2ReadinessInput,
  writeFormalL2ReadinessInput,
  assertFormalL2ReadinessInput,
} from './formalize-l2-readiness-input.mjs';
import * as formalizeModule from './formalize-l2-readiness-input.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;
const CURRENT_POLICY_HASH = HASH('a');
const POLICY_ROWS = Object.freeze([
  { domainId: 'items', policyVersion: 1, policyHash: CURRENT_POLICY_HASH },
  { domainId: 'npcs', policyVersion: 1, policyHash: HASH('e') },
  { domainId: 'projectiles', policyVersion: 1, policyHash: HASH('f') },
  { domainId: 'armor_sets', policyVersion: 1, policyHash: HASH('1') },
  { domainId: 'buffs', policyVersion: 1, policyHash: HASH('2') },
  { domainId: 'audio', policyVersion: 1, policyHash: HASH('3') },
  { domainId: 'bosses', policyVersion: 1, policyHash: HASH('4') },
  { domainId: 'shimmer', policyVersion: 1, policyHash: HASH('5') },
  { domainId: 'biomes', policyVersion: 1, policyHash: HASH('6') },
  { domainId: 'crawler_v2_scheduler', policyVersion: 1, policyHash: HASH('7') },
]);
const POLICY_SET_HASH = computePolicySetHash(POLICY_ROWS);

function makeLinkedRoots() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-formal-readiness-'));
  const primaryRoot = path.join(workspace, 'primary');
  const linkedRoot = path.join(workspace, 'linked');
  const commonGitDir = path.join(primaryRoot, '.git');
  const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'linked');
  fs.mkdirSync(path.join(commonGitDir, 'objects'), { recursive: true });
  fs.mkdirSync(worktreeGitDir, { recursive: true });
  fs.mkdirSync(linkedRoot, { recursive: true });
  fs.writeFileSync(path.join(commonGitDir, 'HEAD'), 'ref: refs/heads/test\n');
  fs.writeFileSync(path.join(commonGitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'gitdir'), `${path.join(linkedRoot, '.git')}\n`);
  fs.writeFileSync(path.join(linkedRoot, '.git'), `gitdir: ${worktreeGitDir}\n`);
  return { workspace, primaryRoot, linkedRoot };
}

function writeBytes(root, relativePath, bytes) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes, { mode: 0o600 });
  return {
    path: relativePath,
    absolute,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function writeJson(root, relativePath, value) {
  return writeBytes(root, relativePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function canonicalHash(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function fixture() {
  const roots = makeLinkedRoots();
  const readinessRoot = path.join(
    roots.linkedRoot,
    'reports/runtime/local-data-chain-closure/20260830/l2-readiness/r17',
  );
  const domainId = 'items';
  const generatedAt = '2026-08-30T00:45:38.906767259Z';
  const runs = [];
  const reconciliations = [];
  for (const index of [1, 2, 3]) {
    const runId = `items_l1_20260829_formal0${index}`;
    const source = writeJson(
      roots.primaryRoot,
      `reports/authorization/canonical/l1-runs/items/${runId}/source.json`,
      { records: [{ id: index }] },
    );
    const reconciliationInputs = {
      sourceCoverage: writeJson(
        roots.primaryRoot,
        `reports/runtime/l1-reconciliation/items/${runId}/source-coverage.json`,
        { complete: true, runId },
      ),
      ownedTableReadback: writeJson(
        roots.primaryRoot,
        `reports/runtime/l1-reconciliation/items/${runId}/owned-table-readback.json`,
        { generation: index },
      ),
      attemptState: writeJson(
        roots.primaryRoot,
        `reports/runtime/l1-reconciliation/items/${runId}/attempt-state.json`,
        { active: 0 },
      ),
    };
    const reconciliation = buildFullReconciliationEvidence({
      domainId,
      runId,
      policyVersion: 1,
      policyHash: CURRENT_POLICY_HASH,
      policySetHash: POLICY_SET_HASH,
      sourceHash: reconciliationInputs.sourceCoverage.sha256,
      ownedTableReadbackHash: reconciliationInputs.ownedTableReadback.sha256,
      attemptStateHash: reconciliationInputs.attemptState.sha256,
      sourceArtifactPath: reconciliationInputs.sourceCoverage.path,
      ownedTableReadbackPath: reconciliationInputs.ownedTableReadback.path,
      attemptStatePath: reconciliationInputs.attemptState.path,
      completeSourceCoverage: true,
      terminalProgress: true,
      changedUnchangedClassified: true,
      unclassifiedMutationCount: 0,
      unauthorizedMutationCount: 0,
      generationReadback: true,
      activeAttemptCount: 0,
      overdueAttemptCount: 0,
    });
    const evidence = writeJson(
      roots.primaryRoot,
      `reports/runtime/l1-reconciliation/items/${runId}/reconciliation-evidence.json`,
      reconciliation,
    );
    const bundleBody = {
      schemaVersion: 1,
      operationId: 'automation-items-l1',
      runId,
      domainId,
      databaseName: 'terria_v1_local',
      policy: {
        domainId,
        level: 'L1',
        operationalState: 'ACTIVE',
        policyVersion: 1,
        policyHash: CURRENT_POLICY_HASH,
        policySetHash: POLICY_SET_HASH,
      },
      source: { path: source.path, sha256: source.sha256 },
      evidenceHash: HASH('c'),
      baselineFingerprint: HASH('d'),
      reconciliationEvidence: reconciliation,
    };
    const bundle = {
      ...bundleBody,
      bundleHash: canonicalHash(bundleBody),
    };
    const bundlePath = writeJson(
      roots.primaryRoot,
      `reports/authorization/canonical/l1-runs/items/${runId}/bundle.json`,
      bundle,
    );
    runs.push({
      runId,
      status: 'COMPLETED',
      applyStatus: 'COMMITTED',
      operationId: 'automation-items-l1',
      policySetHash: POLICY_SET_HASH,
      bundlePath: bundlePath.path,
      bundleSha256: bundlePath.sha256,
      evidencePath: evidence.path,
      evidenceSha256: evidence.sha256,
      fullReconciliation: true,
    });
    reconciliations.push(reconciliation);
  }
  const run = runs[0];
  const reconciliation = reconciliations[2];
  const evidence = { path: run.evidencePath, sha256: run.evidenceSha256 };
  const panelDirectory = path.join(readinessRoot, 'domain/items');
  const panelIds = ['sourceReadiness', 'relationReadiness', 'imageReadiness', 'publicReadiness', 'unresolvedAuditTrend'];
  const panelReports = panelIds.map((panelId) => {
    const name = `${panelId}-2026-08-30.json`;
    const rel = path.join(
      'reports/runtime/local-data-chain-closure/20260830/l2-readiness/r17/domain/items',
      name,
    ).replaceAll(path.sep, '/');
    writeJson(roots.linkedRoot, rel, {
      domainId,
      panelId,
      status: 'pass',
      generatedAt,
      reportPath: rel,
      summary: { blockedCount: 0 },
      blockingReasons: [],
    });
    return {
      path: rel,
      sha256: hashFile(path.join(roots.linkedRoot, rel)),
      status: 'pass',
    };
  });
  const crossDb = writeJson(roots.linkedRoot, `${path.relative(roots.linkedRoot, readinessRoot)}/cross-db.json`, {
    generatedAt,
    summary: { status: 'warning', blockingCount: 0 },
  });
  const relation = writeJson(roots.linkedRoot, `${path.relative(roots.linkedRoot, readinessRoot)}/relation/relation-health-2026-08-30.json`, {
    generatedAt,
    summary: { status: 'warning', blockingCount: 0 },
  });
  const relationMarkdown = writeBytes(
    roots.linkedRoot,
    `${path.relative(roots.linkedRoot, readinessRoot)}/relation/relation-health-2026-08-30.md`,
    Buffer.from('# relation\n'),
  );
  const ui = writeJson(roots.linkedRoot, `${path.relative(roots.linkedRoot, readinessRoot)}/ui-readiness.json`, {
    schemaVersion: 'terrapedia-l2-ui-readiness-v1',
    generatedAt,
    mode: 'read-only',
    status: 'pass',
  });
  const preflight = writeJson(roots.linkedRoot, `${path.relative(roots.linkedRoot, readinessRoot)}/v2-preflight-readback.json`, {
    schemaVersion: 'terrapedia-l2-v2-preflight-readback-v1',
    generatedAt,
    mode: 'read-only',
    httpStatus: 200,
    responseSuccess: true,
    snapshot: { policySetHash: POLICY_SET_HASH, counts: { liveAttempts: 0, sweepClaims: 0 } },
  });
  const currentPolicy = {
    domainId,
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: 1,
    policyHash: CURRENT_POLICY_HASH,
    policySetHash: POLICY_SET_HASH,
  };
  const ceiling = {
    requireSnapshot: true,
    ratioInsertCap: 0.1,
    ratioUpdateCap: 0.1,
    ratioRelationshipDeleteCap: 0.05,
    ratioDisableCap: 0.005,
    absoluteInsertCap: 500,
    absoluteUpdateCap: 500,
    absoluteRelationshipDeleteCap: 200,
    absoluteDisableCap: 20,
    sourceFreshnessMaxAgeMinutes: 60,
    anomalyAction: 'CIRCUIT_OPEN',
    ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
  };
  const rows = POLICY_ROWS.map((row) => ({ ...row }));
  const candidate = buildL2PolicyCeilingArtifact({
    domainId,
    currentPolicy,
    currentPolicyRows: rows,
    targetPolicyVersion: 2,
    ceiling,
    generatedAt,
  });
  const approved = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'admin',
    approvalReference: 'user://conversation/test-ceiling',
    approvedAt: generatedAt,
  });
  const artifactRel = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const artifactFile = writeJson(roots.linkedRoot, artifactRel, approved);
  const registrationOperationId = 'automation-items-l2-policy-ceiling-registration';
  const resultRel = `reports/authorization/canonical/${registrationOperationId}.result.json`;
  const markerRel = `${resultRel}.commit.json`;
  const result = writeJson(roots.linkedRoot, resultRel, {
    schemaVersion: 1,
    status: 'pending',
    authoritative: false,
    operationId: registrationOperationId,
    domainId,
    policyVersion: approved.targetPolicy.policyVersion,
    policyHash: approved.targetPolicy.policyHash,
    policySetHash: approved.targetPolicySetHash,
    artifactHash: approved.artifactHash,
    actor: 'admin',
    reason: 'register approved L2 ceiling',
    authorizationReference: approved.approval.reference,
    decisionIdentity: 'items-registration-test',
    packetHash: HASH('8'),
  });
  const marker = writeJson(roots.linkedRoot, markerRel, {
    schemaVersion: 1,
    markerKind: 'l2_policy_ceiling_registration_commit',
    status: 'committed',
    authoritative: true,
    registrationStatus: 'registered',
    operationId: registrationOperationId,
    domainId,
    policyVersion: approved.targetPolicy.policyVersion,
    policyHash: approved.targetPolicy.policyHash,
    policySetHash: approved.targetPolicySetHash,
    artifactHash: approved.artifactHash,
    registrationActor: 'admin',
    registrationAuthorizationReference: approved.approval.reference,
    registrationDecisionIdentity: 'items-registration-test',
    registrationPacketHash: HASH('8'),
  });
  const promotionTargetPolicyRows = rows.map((row) => (
    row.domainId === domainId
      ? { domainId, policyVersion: approved.targetPolicy.policyVersion, policyHash: approved.targetPolicy.policyHash }
      : { ...row }
  ));
  const policyArtifactProvenance = {
    artifactHash: approved.artifactHash,
    artifactPath: artifactRel,
    artifactFileSha256: artifactFile.sha256,
    currentPolicySetHash: approved.currentPolicySetHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    registration: {
      resultPath: resultRel,
      resultFileSha256: result.sha256,
      commitMarkerPath: markerRel,
      commitMarkerFileSha256: marker.sha256,
      registrationDecisionIdentity: 'items-registration-test',
      commitMarkerDecisionIdentity: 'items-registration-test',
    },
  };
  const record = {
    schemaVersion: 'terrapedia-l2-domain-readiness-v1',
    runId: '20260830-004525-phase2-readiness-r17',
    generatedAt,
    mode: 'read-only',
    domainId,
    verdict: 'BLOCKED',
    blockingGates: ['owner_l2_promotion', 'separate_l2_scheduler_decision'],
    currentPolicy,
    policyCeiling: {
      ...approved.targetPolicy.policyJson,
      status: 'verified',
      policyVersion: approved.targetPolicy.policyVersion,
      policyHash: approved.targetPolicy.policyHash,
      policySetHash: approved.targetPolicySetHash,
      artifactPath: artifactRel,
      artifactFileSha256: artifactFile.sha256,
      registration: {
        resultPath: resultRel,
        resultFileSha256: result.sha256,
        commitMarkerPath: markerRel,
        commitMarkerFileSha256: marker.sha256,
        decisionIdentity: 'items-registration-test',
      },
    },
    promotionCurrentPolicyRows: rows,
    promotionTargetPolicyRows,
    policyArtifactProvenance,
    l1Runs: runs,
    successfulCommittedL1Runs: runs.length,
    qualifyingCommittedL1Runs: runs.length,
    fullReconciliation: {
      status: 'verified',
      evidence: runs[2].evidencePath,
      evidenceSha256: runs[2].evidenceSha256,
      runId: runs[2].runId,
    },
    ownerPromotion: { status: 'missing', decisions: [] },
    schedulerDecision: { status: 'missing', decisions: [] },
    evidence: {
      panelReports,
      sharedReports: [
        { path: crossDb.path, sha256: crossDb.sha256 },
        { path: relation.path, sha256: relation.sha256 },
        { path: relationMarkdown.path, sha256: relationMarkdown.sha256 },
      ],
      uiReadiness: { status: 'pass', path: ui.path, sha256: ui.sha256 },
      v2Preflight: { status: 'blocked', path: preflight.path, sha256: preflight.sha256 },
      databaseBoundary: {
        host: '127.0.0.1',
        serverPort: 13306,
        serverUuid: 'fixture-server',
        observedDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
        serverFingerprint: {
          host: '127.0.0.1',
          port: 13306,
          serverUuid: 'fixture-server',
          databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
        },
      },
    },
    forbiddenActions: [],
    l1EvidenceAdapterReadback: {
      status: 'pass',
      distinctCommittedL1Runs: runs.length,
      fullReconciliation: reconciliation,
      qualifyingL1Runs: runs,
      excludedHistoricalRuns: [],
    },
    proposalInput: false,
    readinessRecordRole: 'evidence-display-only',
  };
  const readinessRel = `${path.relative(roots.linkedRoot, readinessRoot).replaceAll(path.sep, '/')}/domain/items/readiness.json`;
  writeJson(roots.linkedRoot, readinessRel, record);
  const recordHash = hashFile(path.join(roots.linkedRoot, readinessRel));
  const indexRel = `${path.relative(roots.linkedRoot, readinessRoot).replaceAll(path.sep, '/')}/readiness-index.json`;
  const matrixRel = `${path.relative(roots.linkedRoot, readinessRoot).replaceAll(path.sep, '/')}/l2-readiness-matrix.json`;
  const index = {
    schemaVersion: 'terrapedia-l2-readiness-index-v1',
    runId: record.runId,
    generatedAt,
    mode: 'read-only',
    aggregateVerdict: 'BLOCKED',
    domains: [{ domainId, verdict: 'BLOCKED', blockingGates: record.blockingGates, panelCount: 5, readinessPath: readinessRel, readinessSha256: recordHash }],
    sharedReports: record.evidence.sharedReports,
    uiReadiness: record.evidence.uiReadiness,
    databaseEvidenceRoot: { kind: 'primary-worktree', repositoryRelativeRoot: '.' },
    databaseBoundary: record.evidence.databaseBoundary,
    runtimeBoundary: { acceptance: null, schedulerPreflight: record.evidence.v2Preflight },
    forbiddenActions: [],
  };
  const matrix = {
    schemaVersion: 'terrapedia-l2-readiness-matrix-v2',
    generatedAt,
    mode: 'read-only',
    runId: record.runId,
    scope: [domainId],
    databaseEvidenceRoot: { kind: 'primary-worktree', repositoryRelativeRoot: '.' },
    database: { host: '127.0.0.1', port: 13306, serverUuid: 'fixture-server', maintainedDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    policySet: { recomputedCurrentHash: POLICY_SET_HASH, currentRows: rows },
    databaseBoundary: record.evidence.databaseBoundary,
    runtimeEvidence: { domainReportRoot: `${path.relative(roots.linkedRoot, readinessRoot).replaceAll(path.sep, '/')}/domain` },
    domains: [{ domainId, currentPolicy, policyCeiling: record.policyCeiling, proposalInput: false, readinessRecordRole: 'evidence-display-only', l1Runs: record.l1Runs, successfulCommittedL1Runs: runs.length, qualifyingCommittedL1Runs: runs.length, fullReconciliation: record.fullReconciliation, downstreamReports: { status: 'pass', panelCount: 5, reports: panelReports }, ownerPromotion: record.ownerPromotion, schedulerDecision: record.schedulerDecision, verdict: 'BLOCKED', blockingGates: record.blockingGates }],
    forbiddenActions: [],
  };
  writeJson(roots.linkedRoot, indexRel, index);
  writeJson(roots.linkedRoot, matrixRel, matrix);
  return {
    ...roots,
    readinessRoot,
    readinessRootRelative: path.relative(roots.linkedRoot, readinessRoot).replaceAll(path.sep, '/'),
    domainId,
    record,
    index,
    matrix,
    indexPath: indexRel,
    matrixPath: matrixRel,
    run,
  };
}

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

test('formalizes only the two authorization blockers and binds the explicit primary evidence root', () => {
  const f = fixture();
  const result = formalizeL2ReadinessInput({
    repoRoot: f.linkedRoot,
    evidenceRoot: f.primaryRoot,
    readinessRoot: f.readinessRoot,
    domainId: f.domainId,
    generatedAt: '2026-08-30T01:00:00.000Z',
  });
  assert.equal(result.record.proposalInput, true);
  assert.equal(result.record.readinessRecordRole, 'proposal-input');
  assert.equal(result.record.verdict, 'READY_FOR_L2');
  assert.deepEqual(result.record.blockingGates, []);
  assert.equal(result.record.formalization.evidenceRoot.kind, 'primary-worktree');
  assert.equal(result.record.formalization.sourceReadinessIndexSha256, hashFile(path.join(f.linkedRoot, f.indexPath)));
  assert.equal(result.record.l1Runs[0].evidencePath, f.run.evidencePath);
  assert.equal(result.record.l1Runs[0].evidenceSha256, f.run.evidenceSha256);
  assert.equal(result.record.fullReconciliation.status, 'verified');
  assert.equal(result.record.l1EvidencePolicySetHash, POLICY_SET_HASH);
  assert.deepEqual(result.record.serialTransition, {
    schemaVersion: 1,
    order: ['items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer'],
    sequenceIndex: 0,
    predecessor: null,
  });
  assert.equal(result.record.policyArtifactCurrentPolicySetHash, POLICY_SET_HASH);
  assert.equal(result.record.policyArtifactTargetPolicySetHash, f.record.policyCeiling.policySetHash);
  assertFormalL2ReadinessInput(result.record, {
    repoRoot: f.linkedRoot,
    evidenceRoot: f.primaryRoot,
  });
});

test('rejects a display record with any blocker other than the two removable authorization blockers', () => {
  const f = fixture();
  f.record.blockingGates.push('policy_ceiling');
  const readinessPath = `${f.readinessRootRelative}/domain/items/readiness.json`;
  writeJson(f.linkedRoot, readinessPath, f.record);
  f.index.domains[0].readinessSha256 = hashFile(path.join(f.linkedRoot, readinessPath));
  writeJson(f.linkedRoot, f.indexPath, f.index);
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /only.*owner_l2_promotion|blocking gate|formal/i,
  );
});

test('rejects a display record whose current policy is explicitly bound to another domain', () => {
  const f = fixture();
  f.record.currentPolicy.domainId = 'npcs';
  const readinessPath = `${f.readinessRootRelative}/domain/items/readiness.json`;
  writeJson(f.linkedRoot, readinessPath, f.record);
  f.index.domains[0].readinessSha256 = hashFile(path.join(f.linkedRoot, readinessPath));
  writeJson(f.linkedRoot, f.indexPath, f.index);
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /current L1 policy identity|domain identity|policy.*domain|artifact identity/i,
  );
});

test('rejects a linked-worktree readiness input when the corresponding primary root is omitted', () => {
  const f = fixture();
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /explicit.*evidence root|primary worktree|evidence root/i,
  );
});

test('rejects source or reconciliation hash drift before producing proposal input', () => {
  const f = fixture();
  const sourcePath = path.join(f.primaryRoot, f.run.bundlePath.replace(/bundle\.json$/, 'source.json'));
  fs.appendFileSync(sourcePath, '\n');
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /hash drift|source|integrity/i,
  );
});

test('writes a content-addressed formal input once and refuses overwrite', () => {
  const f = fixture();
  const formal = formalizeL2ReadinessInput({
    repoRoot: f.linkedRoot,
    evidenceRoot: f.primaryRoot,
    readinessRoot: f.readinessRoot,
    domainId: f.domainId,
    generatedAt: '2026-08-30T01:00:00.000Z',
  });
  const first = writeFormalL2ReadinessInput({ repoRoot: f.linkedRoot, formalized: formal });
  assert.match(first.path, /proposal-input\/[a-f0-9]{64}\/readiness\.json$/);
  assert.throws(
    () => writeFormalL2ReadinessInput({ repoRoot: f.linkedRoot, formalized: formal }),
    /overwrite|exists/i,
  );
});

test('rejects proposal input when the live promotion policy rows are missing', () => {
  const f = fixture();
  delete f.record.promotionCurrentPolicyRows;
  const readinessPath = `${f.readinessRootRelative}/domain/items/readiness.json`;
  writeJson(f.linkedRoot, readinessPath, f.record);
  f.index.domains[0].readinessSha256 = hashFile(path.join(f.linkedRoot, readinessPath));
  writeJson(f.linkedRoot, f.indexPath, f.index);
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /promotion current policy rows|policy rows/i,
  );
});

test('rejects proposal input when the exact post-promotion policy rows are missing', () => {
  const f = fixture();
  delete f.record.promotionTargetPolicyRows;
  const readinessPath = `${f.readinessRootRelative}/domain/items/readiness.json`;
  writeJson(f.linkedRoot, readinessPath, f.record);
  f.index.domains[0].readinessSha256 = hashFile(path.join(f.linkedRoot, readinessPath));
  writeJson(f.linkedRoot, f.indexPath, f.index);
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /promotion target policy rows|policy rows/i,
  );
});

test('rejects proposal input when immutable policy artifact provenance is missing', () => {
  const f = fixture();
  delete f.record.policyArtifactProvenance;
  const readinessPath = `${f.readinessRootRelative}/domain/items/readiness.json`;
  writeJson(f.linkedRoot, readinessPath, f.record);
  f.index.domains[0].readinessSha256 = hashFile(path.join(f.linkedRoot, readinessPath));
  writeJson(f.linkedRoot, f.indexPath, f.index);
  assert.throws(
    () => formalizeL2ReadinessInput({
      repoRoot: f.linkedRoot,
      evidenceRoot: f.primaryRoot,
      readinessRoot: f.readinessRoot,
      domainId: f.domainId,
      generatedAt: '2026-08-30T01:00:00.000Z',
    }),
    /policy artifact provenance|provenance|artifact/i,
  );
});

test('builds an explicit non-first serial predecessor from CLI arguments', () => {
  const transition = formalizeModule.buildSerialTransitionFromCliArgs({
    domainId: 'npcs',
    args: {
      'sequence-index': '1',
      'predecessor-domain': 'items',
      'predecessor-operation-id': 'automation-items-l2-promotion',
      'predecessor-decision-identity': 'items-l2-decision-01',
      'predecessor-packet-hash': HASH('b'),
      'predecessor-post-policy-set-hash': HASH('c'),
    },
  });
  assert.deepEqual(transition, {
    schemaVersion: 1,
    order: ['items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer'],
    sequenceIndex: 1,
    predecessor: {
      domainId: 'items',
      operationId: 'automation-items-l2-promotion',
      decisionIdentity: 'items-l2-decision-01',
      packetHash: HASH('b'),
      postPolicySetHash: HASH('c'),
    },
  });
});

test('requires explicit predecessor arguments for every non-first serial domain', () => {
  assert.throws(
    () => formalizeModule.buildSerialTransitionFromCliArgs({
      domainId: 'npcs',
      args: { 'sequence-index': '1' },
    }),
    /predecessor|serial/i,
  );
});
