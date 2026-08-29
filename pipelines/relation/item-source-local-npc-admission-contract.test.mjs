import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
  assertItemSourceLocalNpcAdmissionInputContract,
  buildItemSourceLocalNpcAdmissionAttemptPaths,
  buildItemSourceLocalNpcAdmissionInputContract,
} from './item-source-local-npc-admission-contract.mjs';

const DECISION_IDENTITY = 'owner-exact-item-source-local-npc-admission-e9800147';
const PROPOSAL_PATH = 'reports/authorization/canonical/canonical-item-source-local-npc-admission/proposal-source.json';
const HASH = `sha256:${'a'.repeat(64)}`;

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function proposal() {
  return {
    schemaVersion: 'item-source-local-npc-admission-proposal-v1',
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    readOnly: true,
    authorizationAllowed: true,
    databaseFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-1',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    sourceFreeze: {
      partition: {
        path: 'reports/frozen-partition.json',
        sha256: HASH,
        scopeHash: HASH,
        candidateCount: 1,
      },
      snapshotPairs: [{
        entityId: 'dryad',
        normalizedPath: 'data/npc/dryad.json',
        normalizedSha256: HASH,
        auditPath: 'data/audit/dryad.json',
        auditSha256: HASH,
      }],
    },
    selectedIdentityHash: HASH,
    tableBeforeFingerprints: { 'terria_v1_local.item_acquisition_sources': HASH },
    beforeFingerprint: HASH,
    afterFingerprint: HASH,
    scopeHash: HASH,
    changedRowCount: 112,
    summary: { accepted: 28, blocked: 0, unclassified: 0, localSourceReconciliation: 9 },
  };
}

test('Item-source admission derives a private attempt root from the exact owner decision identity', () => {
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(DECISION_IDENTITY);
  const attemptId = createHash('sha256').update(DECISION_IDENTITY).digest('hex');

  assert.equal(paths.attemptId, attemptId);
  assert.equal(
    paths.attemptRoot,
    `reports/authorization/canonical/canonical-item-source-local-npc-admission/${attemptId}`,
  );
  assert.equal(paths.proposalPath, `${paths.attemptRoot}/proposal.json`);
  assert.equal(paths.inputPath, `${paths.attemptRoot}/input.json`);
  assert.equal(paths.packetPath, `${paths.attemptRoot}/packet.json`);
  assert.equal(paths.permitPath, `${paths.attemptRoot}/permit.json`);
  assert.equal(paths.resultPath, `${paths.attemptRoot}/result.json`);
});

test('Item-source admission input freezes the exact proposal, source freeze, fingerprints, and owner identity', () => {
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal())}\n`);
  const input = buildItemSourceLocalNpcAdmissionInputContract({
    proposal: proposal(),
    proposalPath: PROPOSAL_PATH,
    proposalSha256: sha256Bytes(proposalBytes),
    decisionIdentity: DECISION_IDENTITY,
  });

  assert.equal(input.operationId, ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID);
  assert.equal(input.apply, true);
  assert.equal(input.proposalPath, PROPOSAL_PATH);
  assert.equal(input.proposalSha256, sha256Bytes(proposalBytes));
  assert.equal(input.expectedChangedRowCount, 112);
  assert.equal(input.proposalAuthorization.decisionIdentity, DECISION_IDENTITY);
  assert.equal(input.attemptRoot, buildItemSourceLocalNpcAdmissionAttemptPaths(DECISION_IDENTITY).attemptRoot);
  assert.deepEqual(assertItemSourceLocalNpcAdmissionInputContract(input), input);
});

test('Item-source admission input rejects a proposal that still has a blocker', () => {
  assert.throws(() => buildItemSourceLocalNpcAdmissionInputContract({
    proposal: { ...proposal(), summary: { accepted: 28, blocked: 1, unclassified: 0 } },
    proposalPath: PROPOSAL_PATH,
    proposalSha256: HASH,
    decisionIdentity: DECISION_IDENTITY,
  }), /blocked|unclassified/i);
});
