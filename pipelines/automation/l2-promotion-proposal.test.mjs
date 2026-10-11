import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import { buildL2PolicyCeilingArtifact, approveL2PolicyCeilingArtifact, writeL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { readAuthoritativeL2PolicyCeilingRegistration } from './register-l2-policy-ceiling.mjs';
import {
  buildL2PromotionProposal,
  buildL2PromotionExecutionInput,
  writeL2PromotionProposal,
  assertProposal,
} from './build-l2-promotion-proposal.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;
const HASH_E = `sha256:${'e'.repeat(64)}`;

const SERIAL_L2_ORDER = Object.freeze([
  'items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer',
]);

const currentRows = [
  { domainId: 'items', policyVersion: 1, policyHash: HASH_A },
  { domainId: 'npcs', policyVersion: 1, policyHash: HASH_B },
];
const CURRENT_POLICY_SET_HASH = computePolicySetHash(currentRows);
const ceiling = {
  schemaVersion: 1, level: 'L2', requireSnapshot: true,
  absoluteInsertCap: 200, absoluteUpdateCap: 200, absoluteRelationshipDeleteCap: 200, absoluteDisableCap: 20,
  ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioRelationshipDeleteCap: 0.05,
  ratioDisableCap: 0.05, sourceFreshnessMaxAgeMinutes: 60, anomalyAction: 'CIRCUIT_OPEN',
  ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
};

function canonicalHash(value) {
  const canonical = (input) => {
    if (input === null || typeof input !== 'object') return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`;
  };
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

async function setup() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-proposal-'));
  const write = (relativePath, value) => {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value)}\n`);
    fs.writeFileSync(absolute, bytes, { mode: 0o600 });
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  };
  const l1Runs = [];
  for (let index = 1; index <= 3; index += 1) {
    const runId = `items_l1_20260826_0${index}`;
    const bundlePath = `reports/authorization/canonical/items/${runId}.bundle.json`;
    const sourcePath = `reports/authorization/canonical/items/${runId}.source.json`;
    const sourceHash = write(sourcePath, { runId });
    const bundle = {
      operationId: 'automation-items-l1', domainId: 'items', runId,
      databaseName: 'terria_v1_local',
      policy: {
        domainId: 'items', level: 'L1', operationalState: 'ACTIVE',
        policyVersion: 1, policyHash: HASH_A, policySetHash: CURRENT_POLICY_SET_HASH,
      },
      source: { path: sourcePath, sha256: sourceHash },
      evidenceHash: HASH_D,
    };
    bundle.bundleHash = canonicalHash(bundle);
    const bundleFileSha256 = write(bundlePath, bundle);
    let evidence = index === 3
      ? buildFullReconciliationEvidence({
        domainId: 'items', runId, policyVersion: 1, policyHash: HASH_A, policySetHash: CURRENT_POLICY_SET_HASH,
        sourceHash, ownedTableReadbackHash: sourceHash, attemptStateHash: sourceHash,
        sourceArtifactPath: sourcePath, ownedTableReadbackPath: sourcePath, attemptStatePath: sourcePath,
        completeSourceCoverage: true, terminalProgress: true, changedUnchangedClassified: true,
        unclassifiedMutationCount: 0, unauthorizedMutationCount: 0, generationReadback: true,
        activeAttemptCount: 0, overdueAttemptCount: 0,
      })
      : { schemaVersion: 1, artifactKind: 'l1-evidence', domainId: 'items', runId, policySetHash: CURRENT_POLICY_SET_HASH };
    evidence = {
      ...evidence,
      policyVersion: 1,
      policyHash: HASH_A,
      evidenceHash: index === 3 ? evidence.evidenceHash : HASH_D,
      bundleHash: bundle.bundleHash,
      bundleFileSha256: bundleFileSha256,
    };
    const evidencePath = `reports/runtime/l1-reconciliation/items/${runId}/reconciliation-evidence.json`;
    const evidenceSha256 = write(evidencePath, evidence);
    l1Runs.push({
      runId,
      status: 'COMPLETED',
      applyStatus: 'COMMITTED',
      bundlePath,
      bundleSha256: bundleFileSha256,
      evidencePath,
      evidenceSha256,
      policySetHash: CURRENT_POLICY_SET_HASH,
    });
  }
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items', currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: currentRows, targetPolicyVersion: 2, ceiling, generatedAt: '2026-08-26T05:00:00.000Z',
  });
  const approved = approveL2PolicyCeilingArtifact({ artifact: candidate, actor: 'owner', approvalReference: 'owner://items/1', approvedAt: '2026-08-26T05:01:00.000Z' });
  const policyArtifactFile = writeL2PolicyCeilingArtifact({ repoRoot, artifact: approved });
  const registrationOperationId = 'automation-items-l2-policy-ceiling-registration';
  const registrationResultPath = `reports/authorization/canonical/${registrationOperationId}.result.json`;
  const registrationMarkerPath = `${registrationResultPath}.commit.json`;
  const pending = {
    schemaVersion: 1, status: 'pending', authoritative: false,
    operationId: registrationOperationId, domainId: 'items',
    policyVersion: approved.targetPolicy.policyVersion, policyHash: approved.targetPolicy.policyHash,
    policySetHash: approved.targetPolicySetHash, artifactHash: approved.artifactHash,
    actor: 'owner', reason: 'register approved L2 ceiling',
    authorizationReference: 'owner://items/1', decisionIdentity: 'items-ceiling-registration-1', packetHash: HASH_C,
  };
  write(registrationResultPath, pending);
  write(registrationMarkerPath, {
    schemaVersion: 1, markerKind: 'l2_policy_ceiling_registration_commit',
    status: 'committed', authoritative: true, registrationStatus: 'registered',
    operationId: registrationOperationId, domainId: 'items',
    policyVersion: pending.policyVersion, policyHash: pending.policyHash, policySetHash: pending.policySetHash,
    artifactHash: pending.artifactHash, registrationActor: pending.actor,
    registrationAuthorizationReference: pending.authorizationReference,
    registrationDecisionIdentity: pending.decisionIdentity, registrationPacketHash: pending.packetHash,
  });
  const policyRegistration = await readAuthoritativeL2PolicyCeilingRegistration({
    repoRoot, artifact: approved, connection: { query: async () => [[{
      domainId: 'items', policyVersion: approved.targetPolicy.policyVersion, level: 'L2',
      policyJson: approved.targetPolicy.policyJson, policyHash: approved.targetPolicy.policyHash,
      createdBy: 'owner', approvedBy: 'owner', reason: pending.reason,
    }]] },
  });
  const readiness = {
    domainId: 'items', verdict: 'READY_FOR_L2', blockingGates: [], proposalInput: true,
    currentPolicy: { level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: CURRENT_POLICY_SET_HASH },
    l1EvidencePolicySetHash: CURRENT_POLICY_SET_HASH,
    serialTransition: {
      schemaVersion: 1, order: SERIAL_L2_ORDER, sequenceIndex: 0, predecessor: null,
    },
    successfulCommittedL1Runs: 3,
    l1Runs,
    fullReconciliation: { status: 'verified', evidence: l1Runs[2].evidencePath, evidenceSha256: l1Runs[2].evidenceSha256 },
    ownerPromotion: 'missing', schedulerDecision: 'missing',
  };
  return { repoRoot, readiness, approved, policyArtifactFile, policyRegistration };
}

function makeLinkedProposalRoots(primaryRoot) {
  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-proposal-linked-'));
  const commonGitDir = path.join(primaryRoot, '.git');
  const worktreeGitDir = path.join(commonGitDir, 'worktrees', path.basename(linkedRoot));
  fs.mkdirSync(path.join(commonGitDir, 'objects'), { recursive: true });
  fs.mkdirSync(worktreeGitDir, { recursive: true });
  fs.writeFileSync(path.join(commonGitDir, 'HEAD'), 'ref: refs/heads/test\n');
  fs.writeFileSync(path.join(commonGitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'gitdir'), `${path.join(linkedRoot, '.git')}\n`);
  fs.writeFileSync(path.join(linkedRoot, '.git'), `gitdir: ${worktreeGitDir}\n`);

  const copy = (relativePath) => {
    const source = path.join(primaryRoot, relativePath);
    const target = path.join(linkedRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  };
  copy('reports/authorization/canonical/l2-policy-ceiling/items'
    + `/${fs.readdirSync(path.join(primaryRoot, 'reports/authorization/canonical/l2-policy-ceiling/items'))[0]}/artifact.json`);
  copy('reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json');
  copy('reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json.commit.json');
  return linkedRoot;
}

test('proposal builder requires an explicit corresponding primary evidence root for linked worktrees', async () => {
  const fixture = await setup();
  const linkedRoot = makeLinkedProposalRoots(fixture.repoRoot);
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: linkedRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /evidence root|primary worktree|hash drift|bundle/i);

  const proposal = buildL2PromotionProposal({
    repoRoot: linkedRoot,
    evidenceRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  assert.equal(proposal.l1Runs.length, 3);
});

test('builds a deterministic exact-domain L2 proposal from approved readiness evidence', async () => {
  const fixture = await setup();
  const proposal = buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  assert.equal(proposal.proposalOnly, true);
  assert.equal(proposal.operationId, 'automation-items-l2-promotion');
  assert.equal(proposal.targetPolicy.policyVersion, 2);
  assert.equal(proposal.l1Runs.length, 3);
  assert.match(proposal.proposalHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(proposal, buildL2PromotionProposal({
    repoRoot: fixture.repoRoot, readiness: fixture.readiness, policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }));
});

test('proposal binds separate live and L1 evidence policy sets and preserves static registration provenance', async () => {
  const fixture = await setup();
  const liveRows = currentRows.map((row) => (
    row.domainId === 'npcs' ? { ...row, policyHash: HASH_C } : row
  ));
  const livePolicySetHash = computePolicySetHash(liveRows);
  const readiness = {
    ...fixture.readiness,
    currentPolicy: { ...fixture.readiness.currentPolicy, policySetHash: livePolicySetHash },
    l1EvidencePolicySetHash: CURRENT_POLICY_SET_HASH,
  };
  const proposal = buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness,
    promotionCurrentPolicyRows: liveRows,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  assert.equal(proposal.currentPolicySetHash, livePolicySetHash);
  assert.equal(proposal.l1EvidencePolicySetHash, CURRENT_POLICY_SET_HASH);
  assert.equal(proposal.policyArtifactCurrentPolicySetHash, fixture.approved.currentPolicySetHash);
  assert.equal(proposal.policyArtifactTargetPolicySetHash, fixture.approved.targetPolicySetHash);
  assert.notEqual(proposal.targetPolicySetHash, fixture.approved.targetPolicySetHash);
});

test('proposal generation rejects a readiness record without the serial transition contract', async () => {
  const fixture = await setup();
  const readiness = { ...fixture.readiness };
  delete readiness.serialTransition;
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /serial|transition/i);
});

test('accepts the complete policy set while keeping the ceiling owned by one target domain', () => {
  const fullPolicyRows = [
    ...currentRows,
    { domainId: 'projectiles', policyVersion: 1, policyHash: HASH_C },
    { domainId: 'armor_sets', policyVersion: 1, policyHash: HASH_D },
    { domainId: 'buffs', policyVersion: 1, policyHash: HASH_E },
    { domainId: 'audio', policyVersion: 1, policyHash: HASH_A },
    { domainId: 'bosses', policyVersion: 1, policyHash: HASH_B },
    { domainId: 'shimmer', policyVersion: 1, policyHash: HASH_C },
    { domainId: 'biomes', policyVersion: 1, policyHash: HASH_D },
    { domainId: 'crawler_v2_scheduler', policyVersion: 1, policyHash: HASH_E },
  ];
  const artifact = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: fullPolicyRows,
    targetPolicyVersion: 2,
    ceiling,
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  assert.equal(artifact.currentPolicyRows.length, fullPolicyRows.length);
  assert.equal(artifact.currentPolicySetHash, computePolicySetHash(fullPolicyRows));
  assert.equal(artifact.targetPolicySetHash, computePolicySetHash(fullPolicyRows.map((row) => (
    row.domainId === 'items' ? { ...row, policyVersion: 2, policyHash: artifact.targetPolicy.policyHash } : row
  ))));
});

test('writes a private content-addressed proposal and derives an execution input', async () => {
  const fixture = await setup();
  const proposal = buildL2PromotionProposal({
    repoRoot: fixture.repoRoot, readiness: fixture.readiness, policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  const written = writeL2PromotionProposal({ repoRoot: fixture.repoRoot, proposal });
  assert.match(written.path, new RegExp(`automation-items-l2-promotion/${proposal.proposalHash.slice(7)}/proposal\\.json$`));
  assert.equal(fs.statSync(path.join(fixture.repoRoot, written.path)).mode & 0o077, 0);
  assert.throws(() => writeL2PromotionProposal({ repoRoot: fixture.repoRoot, proposal }), /overwrite|exists/i);
  const input = buildL2PromotionExecutionInput({ proposal, proposalPath: written.path, proposalFileSha256: written.sha256 });
  assert.equal(input.proposalOnly, false);
  assert.equal(input.proposalSha256, written.sha256);
  assert.equal(input.operationId, proposal.operationId);
  assert.equal(input.policyArtifactPath, fixture.policyArtifactFile.path);
  assert.equal(input.policyRegistrationResultPath, fixture.policyRegistration.resultPath);
  assert.equal(input.policyRegistrationCommitMarkerPath, fixture.policyRegistration.commitMarkerPath);
  assert.throws(() => buildL2PromotionExecutionInput({
    proposal,
    proposalPath: written.path.replace(proposal.proposalHash.slice(7), 'a'.repeat(64)),
    proposalFileSha256: written.sha256,
  }), /content-addressed|proposal.*hash/i);
});

test('proposal validation rejects rehashed execution-boundary drift', async () => {
  const fixture = await setup();
  const proposal = buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  const { proposalHash, ...payload } = proposal;
  const drifted = {
    ...payload,
    databaseWrites: true,
    proposalHash: canonicalHash({ ...payload, databaseWrites: true }),
  };
  assert.throws(() => assertProposal(drifted), /databaseWrites|proposal.*read-only|boundary/i);
});

test('proposal writer rejects a broken content-addressed target before attempting to write', async () => {
  const fixture = await setup();
  const proposal = buildL2PromotionProposal({
    repoRoot: fixture.repoRoot, readiness: fixture.readiness, policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  const target = path.join(
    fixture.repoRoot,
    'reports/authorization/canonical',
    proposal.operationId,
    proposal.proposalHash.slice(7),
    'proposal.json',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.symlinkSync(path.join(fixture.repoRoot, 'missing-proposal.json'), target);
  assert.throws(
    () => writeL2PromotionProposal({ repoRoot: fixture.repoRoot, proposal }),
    /overwrite|exists|symbolic/i,
  );
  assert.equal(fs.lstatSync(target).isSymbolicLink(), true);
});

test('proposal generation remains blocked for an incomplete domain', async () => {
  const fixture = await setup();
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: { ...fixture.readiness, verdict: 'BLOCKED' },
    policyArtifact: fixture.approved,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
  }), /READY_FOR_L2|blocked/i);
});

test('proposal generation rejects a display-only readiness record', async () => {
  const fixture = await setup();
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: { ...fixture.readiness, proposalInput: false },
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /proposal-input|display-only|proposalInput/i);
});

test('proposal generation rejects a missing or hand-authored registration proof', async () => {
  const fixture = await setup();
  const base = {
    repoRoot: fixture.repoRoot, readiness: fixture.readiness, policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path, policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
  };
  assert.throws(() => buildL2PromotionProposal(base), /authoritative.*registration proof/i);
  assert.throws(() => buildL2PromotionProposal({
    ...base, policyRegistration: { ...fixture.policyRegistration },
  }), /authoritative.*registration proof/i);
});

test('proposal generation rejects L1 evidence entries that are not completed and committed', async () => {
  const fixture = await setup();
  const readiness = {
    ...fixture.readiness,
    l1Runs: fixture.readiness.l1Runs.map((run, index) => (
      index === 0 ? (({ status, ...withoutStatus }) => withoutStatus)(run) : run
    )),
  };
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /COMPLETED.*COMMITTED|qualifying L1/i);
});

test('proposal generation rejects readable evidence substituted from another L1 run', async () => {
  const fixture = await setup();
  const first = fixture.readiness.l1Runs[0];
  const second = fixture.readiness.l1Runs[1];
  const secondEvidence = fs.readFileSync(path.join(fixture.repoRoot, second.evidencePath));
  const firstEvidencePath = path.join(fixture.repoRoot, first.evidencePath);
  fs.writeFileSync(firstEvidencePath, secondEvidence, { mode: 0o600 });
  first.evidenceSha256 = `sha256:${createHash('sha256').update(secondEvidence).digest('hex')}`;
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /evidence.*bound|run|bundle/i);
});

test('proposal generation rejects an L1 bundle whose domain identity drifts', async () => {
  const fixture = await setup();
  const run = fixture.readiness.l1Runs[0];
  const bundlePath = path.join(fixture.repoRoot, run.bundlePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  bundle.domainId = 'bosses';
  bundle.bundleHash = canonicalHash(Object.fromEntries(Object.entries(bundle).filter(([key]) => key !== 'bundleHash')));
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  fs.writeFileSync(bundlePath, bytes, { mode: 0o600 });
  run.bundleSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /bound.*current policy|domain|identity/i);
});

test('proposal generation rejects an L1 bundle that is not currently active', async () => {
  const fixture = await setup();
  const run = fixture.readiness.l1Runs[0];
  const bundlePath = path.join(fixture.repoRoot, run.bundlePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  bundle.policy.operationalState = 'DISABLED';
  bundle.bundleHash = canonicalHash(Object.fromEntries(Object.entries(bundle).filter(([key]) => key !== 'bundleHash')));
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  fs.writeFileSync(bundlePath, bytes, { mode: 0o600 });
  run.bundleSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /bound.*current policy|active|identity/i);
});

test('proposal generation rejects a policy artifact copied under the wrong content address', async () => {
  const fixture = await setup();
  const wrongPath = 'reports/authorization/canonical/l2-policy-ceiling/items/'
    + `${'a'.repeat(64)}/artifact.json`;
  const wrongAbsolutePath = path.join(fixture.repoRoot, wrongPath);
  fs.mkdirSync(path.dirname(wrongAbsolutePath), { recursive: true });
  fs.copyFileSync(path.join(fixture.repoRoot, fixture.policyArtifactFile.path), wrongAbsolutePath);
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: wrongPath,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /content address|artifact.*path|hash/i);
});

test('proposal generation rejects a hand-edited L1 bundle body hash', async () => {
  const fixture = await setup();
  const run = fixture.readiness.l1Runs[0];
  const bundlePath = path.join(fixture.repoRoot, run.bundlePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  bundle.bundleHash = HASH_C;
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  fs.writeFileSync(bundlePath, bytes, { mode: 0o600 });
  run.bundleSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.throws(() => buildL2PromotionProposal({
    repoRoot: fixture.repoRoot,
    readiness: fixture.readiness,
    policyArtifact: fixture.approved,
    policyArtifactPath: fixture.policyArtifactFile.path,
    policyArtifactFileSha256: fixture.policyArtifactFile.sha256,
    policyRegistration: fixture.policyRegistration,
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  }), /bundle.*hash|content/i);
});
