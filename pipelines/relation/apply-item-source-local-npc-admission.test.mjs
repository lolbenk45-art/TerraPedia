import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runItemSourceLocalNpcAdmissionApply,
} from './apply-item-source-local-npc-admission.mjs';
import {
  buildItemSourceLocalNpcAdmissionAttemptPaths,
} from './item-source-local-npc-admission-contract.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const DECISION_IDENTITY = 'owner-item-source-local-npc-admission-test-01';

test('Item-source admission apply requires explicit apply before opening a database connection', async () => {
  let connected = false;

  await assert.rejects(
    runItemSourceLocalNpcAdmissionApply({
      inputContract: inputContract(),
      proposal: proposal(),
      inputContractPath: paths().inputPath,
      outputPath: paths().resultPath,
      apply: false,
    }, {
      connect: async () => { connected = true; },
    }),
    /explicitly true/i,
  );

  assert.equal(connected, false);
});

test('Item-source admission apply executes its frozen transaction once and writes a completed terminal result', async () => {
  const events = [];
  const result = await runItemSourceLocalNpcAdmissionApply({
    inputContract: inputContract(),
    proposal: proposal(),
    inputContractPath: paths().inputPath,
    outputPath: paths().resultPath,
    apply: true,
    now: '2026-08-25T00:00:00.000Z',
  }, {
    loadAuthorizedContext: async () => ({
      operationId: 'canonical-item-source-local-npc-admission',
      decisionIdentity: DECISION_IDENTITY,
    }),
    assertAuthorizedDataBundle: async () => { events.push('bundle'); },
    connect: async () => ({ end: async () => { events.push('end'); } }),
    assertDatabaseFingerprint: async () => { events.push('fingerprint'); },
    consumeDispatchPermit: async () => { events.push('permit'); },
    executeTransaction: async ({ consumeDispatchPermit }) => {
      events.push('transaction');
      await consumeDispatchPermit();
      return {
        insertedCounts: {
          'terria_v1_local.source_dataset_landings': 1,
          'terria_v1_maint.maint_npc_crawler_facts': 1,
          'terria_v1_relation.item_source_facts': 1,
          'terria_v1_relation.item_source_details': 1,
          'terria_v1_relation.item_npc_shop_relations': 1,
          'terria_v1_relation.item_npc_loot_relations': 1,
          'terria_v1_local.item_acquisition_sources': 1,
        },
        reconciledCount: 9,
      };
    },
    writeResult: async ({ result: value }) => { events.push(`result:${value.status}`); },
  });

  assert.equal(result.operationId, 'canonical-item-source-local-npc-admission');
  assert.equal(result.status, 'completed');
  assert.equal(result.apply, true);
  assert.equal(result.changedRowCount, 16);
  assert.deepEqual(events, ['bundle', 'fingerprint', 'transaction', 'permit', 'result:completed', 'end']);
});

function paths() {
  return buildItemSourceLocalNpcAdmissionAttemptPaths(DECISION_IDENTITY);
}

function proposal() {
  const tableBeforeFingerprints = {
    'terria_v1_local.source_dataset_landings': HASH,
    'terria_v1_maint.maint_npc_crawler_facts': HASH,
    'terria_v1_relation.item_source_facts': HASH,
    'terria_v1_relation.item_source_details': HASH,
    'terria_v1_relation.item_npc_shop_relations': HASH,
    'terria_v1_relation.item_npc_loot_relations': HASH,
    'terria_v1_local.item_acquisition_sources': HASH,
  };
  return {
    schemaVersion: 'item-source-local-npc-admission-proposal-v1',
    operationId: 'canonical-item-source-local-npc-admission',
    readOnly: true,
    authorizationAllowed: true,
    databaseFingerprint: {
      host: '127.0.0.1', port: 13306, serverUuid: 'server-test',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    sourceFreeze: {
      partition: {
        path: 'reports/runtime/frozen-partition.json', sha256: HASH, scopeHash: HASH, candidateCount: 1,
      },
      snapshotPairs: [{
        entityId: 'dryad', normalizedPath: 'data/npc/dryad.json', normalizedSha256: HASH,
        auditPath: 'data/audit/dryad.json', auditSha256: HASH,
      }],
    },
    summary: { accepted: 1, blocked: 0, unclassified: 0, localSourceReconciliation: 9 },
    changedRowCount: 16,
    scopeHash: HASH,
    selectedIdentityHash: HASH,
    tableBeforeFingerprints,
    beforeFingerprint: HASH,
    afterFingerprint: HASH,
  };
}

function inputContract() {
  const input = {
    schemaVersion: 'item-source-local-npc-admission-input-v1',
    operationId: 'canonical-item-source-local-npc-admission',
    apply: true,
    attemptId: paths().attemptId,
    attemptRoot: paths().attemptRoot,
    proposalPath: paths().proposalPath,
    proposalSha256: HASH,
    proposalScopeHash: HASH,
    databaseFingerprint: proposal().databaseFingerprint,
    sourceFreeze: proposal().sourceFreeze,
    selectedIdentityHash: HASH,
    tableBeforeFingerprints: proposal().tableBeforeFingerprints,
    beforeFingerprint: HASH,
    afterFingerprint: HASH,
    expectedChangedRowCount: 16,
    expectedAcceptedCount: 1,
    expectedLocalSourceReconciliationCount: 9,
    proposalAuthorization: { decisionIdentity: DECISION_IDENTITY },
  };
  return input;
}
