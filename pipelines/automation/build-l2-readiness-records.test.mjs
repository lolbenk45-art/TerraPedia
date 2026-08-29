import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildL2ReadinessArtifacts,
  readRegisteredL2PolicyCeilingEvidence,
  writeL2ReadinessArtifacts,
} from './build-l2-readiness-records.mjs';
import {
  approveL2PolicyCeilingArtifact,
  buildL2PolicyCeilingArtifact,
  writeL2PolicyCeilingArtifact,
} from './l2-policy-ceiling-artifact.mjs';
import { buildL2PolicyCeilingRegistrationInput } from './register-l2-policy-ceiling.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-readiness-records-'));
  const runId = '20260827-010203-fixture';
  const generatedAt = '2026-08-27T01:02:03.000Z';
  const runRoot = path.join(repoRoot, 'reports/runtime/local-data-chain-closure/20260827/l2-readiness', runId);
  const priorRoot = path.join(repoRoot, 'prior');
  const writeJson = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    fs.writeFileSync(filePath, bytes, { mode: 0o600 });
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  };
  const panelPath = path.join(runRoot, 'domain/items/source-readiness-2026-08-27.json');
  writeJson(panelPath, {
    domainId: 'items', panelId: 'sourceReadiness', status: 'pass', generatedAt,
    reportPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/'
      + `${runId}/domain/items/source-readiness-2026-08-27.json`,
  });
  const additionalPanels = [
    ['relationReadiness', 'relation-readiness-2026-08-27.json'],
    ['imageReadiness', 'image-readiness-2026-08-27.json'],
    ['publicReadiness', 'public-readiness-2026-08-27.json'],
    ['unresolvedAuditTrend', 'unresolved-audit-trend-2026-08-27.json'],
  ];
  for (const [panelId, fileName] of additionalPanels) {
    const additionalPanelPath = path.join(runRoot, 'domain/items', fileName);
    writeJson(additionalPanelPath, {
      domainId: 'items', panelId, status: 'pass', generatedAt,
      reportPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/'
        + `${runId}/domain/items/${fileName}`,
    });
  }
  const crossDbPath = path.join(runRoot, 'cross-db.json');
  const relationJsonPath = path.join(runRoot, 'relation/relation-health-2026-08-27.json');
  const relationMarkdownPath = path.join(runRoot, 'relation/relation-health-2026-08-27.md');
  writeJson(crossDbPath, { generatedAt, summary: { status: 'warning', blockingCount: 0 } });
  writeJson(relationJsonPath, { generatedAt, summary: { status: 'warning', blockingCount: 0 } });
  fs.mkdirSync(path.dirname(relationMarkdownPath), { recursive: true });
  fs.writeFileSync(relationMarkdownPath, '# relation health\n', { mode: 0o600 });
  const uiReadinessPath = path.join(runRoot, 'ui-readiness.json');
  const passingRoute = (route) => ({
    route,
    finalRoute: route,
    status: 200,
    navigationError: null,
    failedRequests: [],
    sameOriginMutationRequests: [],
    httpErrorResponses: [],
    consoleErrors: [],
    horizontalOverflow: false,
    focusedAfterTab: true,
    focusOutline: 'solid/2px',
  });
  const publicRoutes = ['items', 'npcs', 'projectiles', 'armor-sets', 'buffs', 'audio', 'bosses', 'shimmer']
    .map((domain) => ({
      domain,
      list: `/${domain}`,
      detail: {
        items: '/items/1',
        npcs: '/npcs/17',
        'armor-sets': '/armor-sets/1',
        buffs: '/buffs/1',
        bosses: '/bosses/34',
      }[domain],
      listDesktop: passingRoute(`/${domain}`),
      listMobile: passingRoute(`/${domain}`),
      detailDesktop: ['items', 'npcs', 'armor-sets', 'buffs', 'bosses'].includes(domain) ? passingRoute({
        items: '/items/1',
        npcs: '/npcs/17',
        'armor-sets': '/armor-sets/1',
        buffs: '/buffs/1',
        bosses: '/bosses/34',
      }[domain]) : null,
      detailMobile: ['items', 'npcs', 'armor-sets', 'buffs', 'bosses'].includes(domain) ? passingRoute({
        items: '/items/1',
        npcs: '/npcs/17',
        'armor-sets': '/armor-sets/1',
        buffs: '/buffs/1',
        bosses: '/bosses/34',
      }[domain]) : null,
    }));
  const adminRoutes = [
    '/items',
    '/entities/npcs',
    '/entities/projectiles',
    '/entities/armor-sets',
    '/entities/buffs',
    '/operations/audio-assets',
    '/entities/bosses',
    '/recipes/shimmer',
  ].map((route) => ({ route, desktop: passingRoute(route), mobile: passingRoute(route) }));
  writeJson(uiReadinessPath, {
    schemaVersion: 'terrapedia-l2-ui-readiness-v1',
    generatedAt,
    mode: 'read-only',
    summary: {
      publicListCount: 8,
      publicDetailCount: 5,
      adminRouteCount: 8,
      navigationFailures: 0,
      failedRequestCount: 0,
      consoleErrorCount: 0,
      hydrationMismatchCount: 0,
      horizontalOverflowCount: 0,
      focusFailureCount: 0,
      mutationRequestCount: 0,
      httpErrorResponseCount: 0,
    },
    login: {
      status: 200,
      finalRoute: '/entities/npcs',
      hydrationErrors: [],
      authenticationMode: 'offline_local_read_token',
      loginPostRequestCount: 0,
      sameOriginMutationRequests: [],
      httpErrorResponses: [],
    },
    securityAuditLog: {
      before: { count: 10, maxId: 10 },
      after: { count: 10, maxId: 10 },
      unchanged: true,
    },
    suppressedOutOfScopeMutationAttempts: [],
    public: publicRoutes,
    admin: adminRoutes,
  });
  const v2PreflightPath = path.join(runRoot, 'v2-preflight-readback.json');
  const v2Preflight = {
    schemaVersion: 'terrapedia-l2-v2-preflight-readback-v1',
    generatedAt,
    mode: 'read-only',
    httpStatus: 200,
    responseSuccess: true,
    snapshot: {
      operationId: 'canonical-crawler-v2-scheduler-activation',
      observedAt: generatedAt,
      control: { enabled: true, mode: 'changed-only', sweepIntervalMinutes: 1 },
      v2: { stateStoreEpoch: 'epoch-fixture', namespace: 'terrapedia:crawler:wiki-monitor:v2:', queueContractVersion: 2 },
      counts: { liveAttempts: 0, sweepClaims: 0 },
      reconciler: { status: 'healthy', overdueAttemptCount: 0, failureCount: 0 },
      domains: ['items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer'].map((domain) => ({
        domain,
        actionId: `fixture-${domain}`,
        readinessStatus: 'blocked',
        sourceHash: HASH,
        evidencePath: `reports/domain/${domain}/fixture.json`,
        observedAt: generatedAt,
      })),
      policySetHash: HASH,
      databaseWrites: false,
      networkAccess: false,
      isolatedResourceWrites: false,
    },
    securityAuditLog: {
      before: { count: 10, maxId: 10 },
      after: { count: 10, maxId: 10 },
      unchanged: true,
    },
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
  };
  writeJson(v2PreflightPath, v2Preflight);
  writeJson(path.join(priorRoot, 'domain/items/readiness.json'), {
    schemaVersion: 'terrapedia-l2-domain-readiness-v1',
    domainId: 'items', verdict: 'BLOCKED', blockingGates: ['policy_ceiling', 'three_successful_l1_runs'],
    currentPolicy: {
      level: 'L1', operationalState: 'ACTIVE', policyVersion: 1,
      policyHash: HASH, policySetHash: HASH,
    },
    policyCeiling: { status: 'missing' },
    l1Runs: [], successfulCommittedL1Runs: 0, qualifyingCommittedL1Runs: 0,
    fullReconciliation: { status: 'missing' },
    ownerPromotion: { status: 'missing', decisions: [] },
    schedulerDecision: { status: 'missing', decisions: [] },
    evidence: { panelReports: [], sharedReports: [], databaseBoundary: {} },
    forbiddenActions: [],
  });
  const sharedReports = {
    crossDbPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/' + `${runId}/cross-db.json`,
    relationJsonPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/' + `${runId}/relation/relation-health-2026-08-27.json`,
    relationMarkdownPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/' + `${runId}/relation/relation-health-2026-08-27.md`,
  };
  return {
    repoRoot, runId, generatedAt, runRoot, priorRoot,
    panelRoot: path.join(runRoot, 'domain'),
    sharedReports,
    adapterReadback: {
      policySetHash: HASH,
      domains: { items: { status: 'pass', evidence: { distinctCommittedL1Runs: 0, fullReconciliation: false }, error: null } },
    },
    databaseBoundary: {
      flywayLatestVersion: 58, v59Applied: false, l2PolicyVersionRowsObserved: 0,
      l2PromotionDecisionsObserved: 0, liveAttempts: 0, activeReservations: 0,
      activeWriteFences: 0, currentActivationDecisions: 0, observedAt: generatedAt,
      host: '127.0.0.1', serverUuid: 'uuid', serverPort: 13306,
    },
    crossDb: { generatedAt, summary: { status: 'warning', blockingCount: 0 } },
    relation: { generatedAt, summary: { status: 'warning', blockingCount: 0 } },
    uiReadinessPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/' + `${runId}/ui-readiness.json`,
    uiReadiness: JSON.parse(fs.readFileSync(uiReadinessPath, 'utf8')),
    v2PreflightPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/' + `${runId}/v2-preflight-readback.json`,
    v2Preflight,
  };
}

test('builds display-only readiness artifacts from adapter-backed evidence', () => {
  const f = fixture();
  const artifacts = buildL2ReadinessArtifacts({ ...f, domains: ['items'] });
  assert.equal(artifacts.records.length, 1);
  assert.equal(artifacts.records[0].record.proposalInput, false);
  assert.equal(artifacts.records[0].record.readinessRecordRole, 'evidence-display-only');
  assert.equal(artifacts.records[0].record.l1EvidenceAdapterReadback.distinctCommittedL1Runs, 0);
  assert.equal(artifacts.index.aggregateVerdict, 'BLOCKED');
  assert.equal(artifacts.matrix.domains[0].proposalInput, false);
  assert.equal(artifacts.records[0].record.evidence.uiReadiness.status, 'pass');
  assert.equal(artifacts.records[0].record.evidence.v2Preflight.status, 'blocked');
});

test('requires a bound current V2 preflight report', () => {
  const f = fixture();
  const { v2PreflightPath, v2Preflight, ...withoutPreflight } = f;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...withoutPreflight, domains: ['items'] }),
    /V2 preflight/i,
  );
});

test('rejects a V2 preflight whose policy-set hash drifts from the adapter', () => {
  const f = fixture();
  const preflightPath = path.join(f.repoRoot, f.v2PreflightPath);
  const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
  preflight.snapshot.policySetHash = `sha256:${'b'.repeat(64)}`;
  fs.writeFileSync(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`, { mode: 0o600 });
  f.v2Preflight = preflight;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /V2 preflight.*policy-set/i,
  );
});

test('uses a verified registered L2 ceiling and removes only the ceiling blocker', () => {
  const f = fixture();
  const verifiedCeiling = {
    status: 'verified',
    policyVersion: 2,
    level: 'L2',
    policyHash: `sha256:${'b'.repeat(64)}`,
    policySetHash: `sha256:${'c'.repeat(64)}`,
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
    artifactPath: 'reports/authorization/canonical/l2-policy-ceiling/items/' + `${'d'.repeat(64)}/artifact.json`,
    artifactFileSha256: `sha256:${'e'.repeat(64)}`,
    registration: {
      resultPath: 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json',
      resultFileSha256: `sha256:${'f'.repeat(64)}`,
      commitMarkerPath: 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json.commit.json',
      commitMarkerFileSha256: `sha256:${'1'.repeat(64)}`,
      decisionIdentity: 'automation-items-l2-policy-ceiling-registration-20260828-owner-01',
    },
  };
  f.adapterReadback.domains.items.policyCeiling = verifiedCeiling;

  const artifacts = buildL2ReadinessArtifacts({ ...f, domains: ['items'] });

  assert.deepEqual(artifacts.records[0].record.policyCeiling, verifiedCeiling);
  assert.equal(artifacts.records[0].record.blockingGates.includes('policy_ceiling'), false);
  assert.deepEqual(artifacts.records[0].record.blockingGates, ['three_successful_l1_runs']);
  assert.equal(artifacts.matrix.domains[0].policyCeiling.status, 'verified');
});

test('reads a registered L2 ceiling only when artifact, marker, and database row agree', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-ceiling-readback-'));
  const currentPolicy = {
    domainId: 'items', policyVersion: 1, policyHash: HASH, level: 'L1', operationalState: 'ACTIVE',
  };
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy,
    currentPolicyRows: [{ domainId: 'items', policyVersion: 1, policyHash: HASH }],
    targetPolicyVersion: 2,
    ceiling: {
      schemaVersion: 1,
      level: 'L2',
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
    },
    generatedAt: '2026-08-28T04:00:00.000Z',
  });
  const artifact = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'owner',
    approvalReference: 'owner://items/l2-ceiling/1',
    approvedAt: '2026-08-28T04:01:00.000Z',
  });
  const artifactFile = writeL2PolicyCeilingArtifact({ repoRoot, artifact });
  const operationId = 'automation-items-l2-policy-ceiling-registration';
  const input = {
    ...buildL2PolicyCeilingRegistrationInput({
      artifact,
      artifactPath: artifactFile.path,
      artifactFileSha256: artifactFile.sha256,
    }),
    approvalReference: artifact.approval.reference,
  };
  const inputPath = path.join(repoRoot, 'reports/authorization/canonical', `${operationId}.input.json`);
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
  const pending = {
    schemaVersion: 1,
    status: 'pending',
    authoritative: false,
    operationId,
    domainId: 'items',
    policyVersion: 2,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    actor: 'owner',
    reason: 'register L2 ceiling',
    authorizationReference: artifact.approval.reference,
    decisionIdentity: 'automation-items-l2-policy-ceiling-registration-20260828-owner-01',
    packetHash: `sha256:${'b'.repeat(64)}`,
  };
  const resultPath = path.join(repoRoot, 'reports/authorization/canonical', `${operationId}.result.json`);
  fs.writeFileSync(resultPath, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  const marker = {
    schemaVersion: 1,
    markerKind: 'l2_policy_ceiling_registration_commit',
    status: 'committed',
    authoritative: true,
    registrationStatus: 'registered',
    operationId,
    domainId: 'items',
    policyVersion: 2,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    registrationActor: 'owner',
    registrationAuthorizationReference: artifact.approval.reference,
    registrationDecisionIdentity: pending.decisionIdentity,
    registrationPacketHash: pending.packetHash,
  };
  fs.writeFileSync(`${resultPath}.commit.json`, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  const connection = {
    query: async (sql) => {
      assert.match(sql, /crawler_automation_policy_version/);
      return [[{
        domainId: 'items',
        policyVersion: 2,
        level: 'L2',
        policyJson: JSON.stringify(artifact.targetPolicy.policyJson),
        policyHash: artifact.targetPolicy.policyHash,
        createdBy: 'owner',
        approvedBy: 'owner',
        reason: pending.reason,
      }]];
    },
  };

  const ceiling = await readRegisteredL2PolicyCeilingEvidence({ repoRoot, connection, domainId: 'items' });

  assert.equal(ceiling.status, 'verified');
  assert.equal(ceiling.policyVersion, 2);
  assert.equal(ceiling.policyHash, artifact.targetPolicy.policyHash);
  assert.equal(ceiling.artifactPath, artifactFile.path);
  assert.equal(ceiling.registration.resultPath, `reports/authorization/canonical/${operationId}.result.json`);
  assert.equal(ceiling.registration.decisionIdentity, pending.decisionIdentity);
});

test('accepts the canonical registration input shape without an approval-reference duplicate', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-ceiling-canonical-input-'));
  const currentPolicy = {
    domainId: 'items', policyVersion: 1, policyHash: HASH, level: 'L1', operationalState: 'ACTIVE',
  };
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy,
    currentPolicyRows: [{ domainId: 'items', policyVersion: 1, policyHash: HASH }],
    targetPolicyVersion: 2,
    ceiling: {
      schemaVersion: 1,
      level: 'L2',
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
    },
    generatedAt: '2026-08-28T04:00:00.000Z',
  });
  const artifact = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'owner',
    approvalReference: 'owner://items/l2-ceiling/1',
    approvedAt: '2026-08-28T04:01:00.000Z',
  });
  const artifactFile = writeL2PolicyCeilingArtifact({ repoRoot, artifact });
  const operationId = 'automation-items-l2-policy-ceiling-registration';
  const input = buildL2PolicyCeilingRegistrationInput({
    artifact,
    artifactPath: artifactFile.path,
    artifactFileSha256: artifactFile.sha256,
  });
  const inputPath = path.join(repoRoot, 'reports/authorization/canonical', `${operationId}.input.json`);
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
  const pending = {
    schemaVersion: 1,
    status: 'pending',
    authoritative: false,
    operationId,
    domainId: 'items',
    policyVersion: 2,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    actor: 'owner',
    reason: 'register L2 ceiling',
    authorizationReference: artifact.approval.reference,
    decisionIdentity: 'automation-items-l2-policy-ceiling-registration-20260828-owner-02',
    packetHash: `sha256:${'b'.repeat(64)}`,
  };
  const resultPath = path.join(repoRoot, 'reports/authorization/canonical', `${operationId}.result.json`);
  fs.writeFileSync(resultPath, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(`${resultPath}.commit.json`, `${JSON.stringify({
    schemaVersion: 1,
    markerKind: 'l2_policy_ceiling_registration_commit',
    status: 'committed',
    authoritative: true,
    registrationStatus: 'registered',
    operationId,
    domainId: 'items',
    policyVersion: 2,
    policyHash: artifact.targetPolicy.policyHash,
    policySetHash: artifact.targetPolicySetHash,
    artifactHash: artifact.artifactHash,
    registrationActor: 'owner',
    registrationAuthorizationReference: artifact.approval.reference,
    registrationDecisionIdentity: pending.decisionIdentity,
    registrationPacketHash: pending.packetHash,
  }, null, 2)}\n`, { mode: 0o600 });
  const connection = {
    query: async () => [[{
      domainId: 'items',
      policyVersion: 2,
      level: 'L2',
      policyJson: JSON.stringify(artifact.targetPolicy.policyJson),
      policyHash: artifact.targetPolicy.policyHash,
      createdBy: 'owner',
      approvedBy: 'owner',
      reason: pending.reason,
    }]],
  };

  const ceiling = await readRegisteredL2PolicyCeilingEvidence({ repoRoot, connection, domainId: 'items' });

  assert.equal(ceiling.status, 'verified');
  assert.equal(ceiling.registration.decisionIdentity, pending.decisionIdentity);
});

test('rejects UI evidence with a hydration mismatch before producing readiness records', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.summary.hydrationMismatchCount = 1;
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /UI readiness|hydration|mismatch/i,
  );
});

test('rejects a readiness build without bound UI evidence', () => {
  const f = fixture();
  delete f.uiReadiness;
  delete f.uiReadinessPath;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /UI readiness|uiReadiness/i,
  );
});

test('rejects UI evidence whose public domain coverage is duplicated or missing', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.public[1] = { ...ui.public[1], domain: 'items', list: '/items' };
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /public.*coverage|domain.*route|duplicate/i,
  );
});

test('rejects UI evidence whose admin route coverage is duplicated or missing', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.admin[1] = { ...ui.admin[1], route: '/items' };
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /admin.*coverage|route.*coverage|duplicate/i,
  );
});

test('rejects UI evidence when an admin route redirects to login', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.admin[0].desktop = { ...ui.admin[0].desktop, finalRoute: '/login' };
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /final route|redirect|admin.*route/i,
  );
});

test('rejects UI evidence that records a same-origin mutation request', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.summary.mutationRequestCount = 1;
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /mutation|read-only/i,
  );
});

test('rejects UI evidence that obtains authentication through a login POST', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.login.loginPostRequestCount = 1;
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /login.*post|read-only.*authentication/i,
  );
});

test('rejects UI evidence whose security-audit watermark changed during capture', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.securityAuditLog = {
    before: { count: 10, maxId: 10 },
    after: { count: 11, maxId: 11 },
    unchanged: false,
  };
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /security.*audit|watermark|write/i,
  );
});

test('rejects UI evidence with an unreported local HTTP error response', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.summary.httpErrorResponseCount = 1;
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /http.*error|response/i,
  );
});

test('rejects UI evidence that suppresses a mutation outside the exact history fence', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.suppressedOutOfScopeMutationAttempts = [
    { method: 'DELETE', path: '/api/items/1', source: 'browser-route-guard' },
  ];
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /suppressed.*mutation|history/i,
  );
});

test('rejects UI summary counts that do not match its route evidence', () => {
  const f = fixture();
  const uiPath = path.join(f.repoRoot, f.uiReadinessPath);
  const ui = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  ui.summary.publicDetailCount = 4;
  fs.writeFileSync(uiPath, `${JSON.stringify(ui, null, 2)}\n`, { mode: 0o600 });
  f.uiReadiness = ui;

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /summary.*count|route.*count|coverage/i,
  );
});

test('rejects panel evidence from a different readiness run root', () => {
  const f = fixture();
  const foreignRoot = path.join(f.repoRoot, 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/foreign');
  const foreignPanel = path.join(foreignRoot, 'domain/items/source-readiness-2026-08-27.json');
  fs.mkdirSync(path.dirname(foreignPanel), { recursive: true });
  fs.copyFileSync(path.join(f.runRoot, 'domain/items/source-readiness-2026-08-27.json'), foreignPanel);
  f.panelRoot = path.join(foreignRoot, 'domain');

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /panel.*run root|readiness panel root|current.*root/i,
  );
});

test('rejects shared reports from a different readiness run root', () => {
  const f = fixture();
  const foreignRoot = path.join(f.repoRoot, 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/foreign');
  const foreignCrossDb = path.join(foreignRoot, 'cross-db.json');
  const foreignRelation = path.join(foreignRoot, 'relation/relation-health-2026-08-27.json');
  const foreignRelationMarkdown = path.join(foreignRoot, 'relation/relation-health-2026-08-27.md');
  fs.mkdirSync(path.dirname(foreignRelation), { recursive: true });
  fs.copyFileSync(path.join(f.runRoot, 'cross-db.json'), foreignCrossDb);
  fs.copyFileSync(path.join(f.runRoot, 'relation/relation-health-2026-08-27.json'), foreignRelation);
  fs.copyFileSync(path.join(f.runRoot, 'relation/relation-health-2026-08-27.md'), foreignRelationMarkdown);
  f.sharedReports = {
    crossDbPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/foreign/cross-db.json',
    relationJsonPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/foreign/relation/relation-health-2026-08-27.json',
    relationMarkdownPath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/foreign/relation/relation-health-2026-08-27.md',
  };

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /shared.*run root|shared readiness report|current.*root/i,
  );
});

test('rejects a readiness domain whose required panel set is incomplete', () => {
  const f = fixture();
  fs.unlinkSync(path.join(f.runRoot, 'domain/items/public-readiness-2026-08-27.json'));

  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /panel.*coverage|panel.*required|missing.*panel/i,
  );
});

test('rejects shared report metadata that differs from its persisted file', () => {
  const f = fixture();

  assert.throws(
    () => buildL2ReadinessArtifacts({
      ...f,
      domains: ['items'],
      crossDb: { ...f.crossDb, summary: { status: 'pass', blockingCount: 0 } },
    }),
    /cross-db.*match|supplied.*evidence|persisted/i,
  );
});

test('rejects acceptance metadata that differs from its persisted report', () => {
  const f = fixture();
  const acceptancePath = path.join(f.runRoot, 'acceptance.json');
  const acceptance = {
    timestamp: '20260827-010203',
    dbAvailable: true,
    dbHost: '127.0.0.1',
    dbPort: 13306,
    totalSteps: 19,
    passed: 19,
    failed: 0,
    skipped: 0,
  };
  fs.writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, { mode: 0o600 });

  assert.throws(
    () => buildL2ReadinessArtifacts({
      ...f,
      domains: ['items'],
      acceptancePath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/'
        + `${f.runId}/acceptance.json`,
      acceptanceSummary: { timestamp: acceptance.timestamp, passed: 18, failed: 1, skipped: 0 },
    }),
    /acceptance.*match|supplied.*evidence|persisted/i,
  );
});

test('rejects an acceptance report outside the readiness freshness window', () => {
  const f = fixture();
  const acceptancePath = path.join(f.runRoot, 'acceptance.json');
  const acceptance = {
    timestamp: '20260825-010203',
    dbAvailable: true,
    dbHost: '127.0.0.1',
    dbPort: 13306,
    totalSteps: 19,
    passed: 19,
    failed: 0,
    skipped: 0,
  };
  fs.writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, { mode: 0o600 });

  assert.throws(
    () => buildL2ReadinessArtifacts({
      ...f,
      domains: ['items'],
      acceptancePath: 'reports/runtime/local-data-chain-closure/20260827/l2-readiness/'
        + `${f.runId}/acceptance.json`,
      acceptanceSummary: { timestamp: acceptance.timestamp, passed: 19, failed: 0, skipped: 0 },
    }),
    /acceptance.*stale|freshness/i,
  );
});

test('preflights every target and rejects a broken readiness symlink before writing siblings', () => {
  const f = fixture();
  const artifacts = buildL2ReadinessArtifacts({ ...f, domains: ['items'] });
  const readinessPath = path.join(f.runRoot, 'domain/items/readiness.json');
  fs.symlinkSync(path.join(f.runRoot, 'domain/items/missing.json'), readinessPath);
  assert.throws(
    () => writeL2ReadinessArtifacts({ ...f, artifacts }),
    /overwrite|exists|symlink/i,
  );
  assert.equal(fs.existsSync(path.join(f.runRoot, 'readiness-index.json')), false);
  assert.equal(fs.existsSync(path.join(f.runRoot, 'l2-readiness-matrix.json')), false);
});

test('rejects a passing panel whose generatedAt is stale for the readiness run', () => {
  const f = fixture();
  const panelPath = path.join(f.runRoot, 'domain/items/source-readiness-2026-08-27.json');
  const panel = JSON.parse(fs.readFileSync(panelPath, 'utf8'));
  fs.writeFileSync(panelPath, `${JSON.stringify({ ...panel, generatedAt: '2026-08-26T00:00:00.000Z' }, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /generatedAt|stale|fresh/i,
  );
});

test('rejects a shared report older than the 24-hour readiness freshness window', () => {
  const f = fixture();
  const crossDb = { ...f.crossDb, generatedAt: '2026-08-25T00:00:00.000Z' };
  fs.writeFileSync(
    path.join(f.repoRoot, f.sharedReports.crossDbPath),
    `${JSON.stringify(crossDb, null, 2)}\n`,
    { mode: 0o600 },
  );
  assert.throws(
    () => buildL2ReadinessArtifacts({
      ...f,
      domains: ['items'],
      crossDb,
    }),
    /cross-db.*stale|freshness/i,
  );
});

test('allows a small report-generation clock skew but rejects a report far in the future', () => {
  const f = fixture();
  const relationPath = path.join(f.repoRoot, f.sharedReports.relationJsonPath);
  const nearFutureRelation = { ...f.relation, generatedAt: '2026-08-27T01:04:00.000Z' };
  fs.writeFileSync(relationPath, `${JSON.stringify(nearFutureRelation, null, 2)}\n`, { mode: 0o600 });
  assert.doesNotThrow(() => buildL2ReadinessArtifacts({
    ...f,
    domains: ['items'],
    relation: nearFutureRelation,
  }));
  const farFutureRelation = { ...f.relation, generatedAt: '2026-08-27T03:04:00.000Z' };
  fs.writeFileSync(relationPath, `${JSON.stringify(farFutureRelation, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => buildL2ReadinessArtifacts({
      ...f,
      domains: ['items'],
      relation: farFutureRelation,
    }),
    /future|freshness/i,
  );
});

test('rejects a readiness template that cannot produce the required display schema', () => {
  const f = fixture();
  const templatePath = path.join(f.priorRoot, 'domain/items/readiness.json');
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  delete template.policyCeiling;
  fs.writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => buildL2ReadinessArtifacts({ ...f, domains: ['items'] }),
    /readiness.*schema|currentPolicy|display/i,
  );
});
