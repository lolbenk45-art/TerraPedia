import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLocalSourceReconciliation,
  assertInsertTargetsAbsent,
  canonicalReconciliationRowHash,
  executeItemSourceLocalNpcAdmissionTransaction,
  insertRows,
} from './item-source-local-npc-admission-db.mjs';
import { sha256 } from './item-source-local-npc-admission.mjs';

function proposal({ before = 'sha256:before' } = {}) {
  const tableBeforeFingerprints = { 'terria_v1_local.item_acquisition_sources': before };
  return {
    operationId: 'canonical-item-source-local-npc-admission',
    scopeHash: 'sha256:scope',
    selectedIdentityHash: 'sha256:selected',
    tableBeforeFingerprints,
    writeSets: { 'terria_v1_local.item_acquisition_sources': [{ item_id: 3219 }] },
    localSourceReconciliation: [],
    lineageBindings: {},
    beforeFingerprint: sha256(tableBeforeFingerprints),
    afterFingerprint: 'sha256:after',
  };
}

function inputContract() {
  const tableBeforeFingerprints = { 'terria_v1_local.item_acquisition_sources': 'sha256:before' };
  return {
    proposalScopeHash: 'sha256:scope',
    selectedIdentityHash: 'sha256:selected',
    tableBeforeFingerprints,
    beforeFingerprint: sha256(tableBeforeFingerprints),
    afterFingerprint: 'sha256:after',
  };
}

function connectionLog() {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
  };
}

test('Item-source admission transaction rolls back before consuming its permit when a frozen before fingerprint drifts', async () => {
  const connection = connectionLog();
  let permits = 0;

  await assert.rejects(
    executeItemSourceLocalNpcAdmissionTransaction({
      connection,
      inputContract: inputContract(),
      proposal: proposal(),
      consumeDispatchPermit: async () => { permits += 1; },
      assertInputContract: () => {},
      assertProposal: () => {},
      readCurrentRows: async () => ({
        tableBeforeFingerprints: { 'terria_v1_local.item_acquisition_sources': 'sha256:drift' },
      }),
      applyWriteSets: async () => { throw new Error('must not write'); },
      assertReadback: () => {},
    }),
    /before fingerprint drift/i,
  );

  assert.equal(permits, 0);
  assert.deepEqual(connection.calls, ['begin', 'rollback']);
});

test('Item-source admission transaction consumes one permit, applies frozen writes, verifies readback, then commits', async () => {
  const connection = connectionLog();
  const calls = [];
  const before = {
    tableBeforeFingerprints: { 'terria_v1_local.item_acquisition_sources': 'sha256:before' },
  };
  const outcome = await executeItemSourceLocalNpcAdmissionTransaction({
    connection,
    inputContract: inputContract(),
    proposal: proposal(),
    consumeDispatchPermit: async () => { calls.push('permit'); },
    assertInputContract: () => {},
    assertProposal: () => {},
    readCurrentRows: async ({ phase }) => {
      calls.push(`read:${phase}`);
      return before;
    },
    applyWriteSets: async () => {
      calls.push('apply');
      return { insertedCounts: { 'terria_v1_local.item_acquisition_sources': 1 }, reconciledCount: 0 };
    },
    assertReadback: () => { calls.push('readback'); },
  });

  assert.deepEqual(connection.calls, ['begin', 'commit']);
  assert.deepEqual(calls, ['read:before', 'permit', 'apply', 'read:after', 'readback']);
  assert.deepEqual(outcome, {
    insertedCounts: { 'terria_v1_local.item_acquisition_sources': 1 },
    reconciledCount: 0,
  });
});

test('Item-source admission allows archived local source rows while rejecting active identity conflicts', () => {
  const proposal = {
    writeSets: {
      'terria_v1_local.item_acquisition_sources': [{
        item_id: 3219,
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_id: 20,
      }],
    },
    localSourceReconciliation: [],
  };

  assert.doesNotThrow(() => assertInsertTargetsAbsent({
    proposal,
    before: {
      rows: {
        'terria_v1_local.item_acquisition_sources': [{
          id: 194114,
          item_id: 3219,
          source_type: 'shop',
          source_ref_type: 'npc',
          source_ref_id: 20,
          status: 0,
          deleted: 1,
        }],
      },
    },
  }));

  assert.throws(() => assertInsertTargetsAbsent({
    proposal,
    before: {
      rows: {
        'terria_v1_local.item_acquisition_sources': [{
          id: 194115,
          item_id: 3219,
          source_type: 'shop',
          source_ref_type: 'npc',
          source_ref_id: 20,
          status: 1,
          deleted: 0,
        }],
      },
    },
  }), /local insert target already exists/i);
});

test('Item-source admission formats ISO reconciliation timestamps for MySQL DATETIME columns', async () => {
  let values;
  await applyLocalSourceReconciliation({
    connection: {
      async query(_sql, parameters) {
        values = parameters;
        return [{ affectedRows: 1 }];
      },
    },
    rows: [{
      rowId: 7,
      after: {
        id: 7,
        created_at: '2026-05-13T09:13:39.000Z',
        updated_at: '2026-06-10T23:41:24.000Z',
        source_revision_timestamp: '2026-08-11T14:50:04.000Z',
      },
    }],
  });

  assert.deepEqual(values, [
    '2026-05-13 17:13:39',
    '2026-06-11 07:41:24',
    '2026-08-11 22:50:04',
    7,
  ]);
});

test('Item-source admission formats ISO insert timestamps for MySQL DATETIME columns', async () => {
  let values;
  await insertRows({
    connection: {
      async query(_sql, parameters) {
        values = parameters;
      },
    },
    table: 'terria_v1_relation.item_source_facts',
    rows: [{
      record_key: 'fact-1',
      source_revision_timestamp: '2026-08-11T14:50:04.000Z',
      fetched_at: '2026-08-11T14:50:05.000Z',
      parsed_at: '2026-08-11T14:50:06.000Z',
    }],
  });

  assert.deepEqual(values, [
    'fact-1',
    '2026-08-11 22:50:04',
    '2026-08-11 22:50:05',
    '2026-08-11 22:50:06',
  ]);
});

test('Item-source admission hashes reconciliation rows independent of DATETIME representation', () => {
  const iso = {
    id: 7,
    created_at: '2026-05-13T09:13:39.000Z',
    source_revision_timestamp: '2026-08-11T14:50:04.000Z',
  };
  const mysql = {
    id: 7,
    created_at: '2026-05-13 17:13:39',
    source_revision_timestamp: '2026-08-11 22:50:04',
  };

  assert.equal(canonicalReconciliationRowHash(iso), canonicalReconciliationRowHash(mysql));
});

test('Item-source admission preserves mysql2 local DATETIME semantics for ISO and Date values', async () => {
  let values;
  await applyLocalSourceReconciliation({
    connection: {
      async query(_sql, parameters) {
        values = parameters;
        return [{ affectedRows: 1 }];
      },
    },
    rows: [{
      rowId: 7,
      after: {
        id: 7,
        created_at: '2026-05-13T09:13:39.000Z',
      },
    }],
  });

  assert.equal(values[0], '2026-05-13 17:13:39');
  assert.equal(
    canonicalReconciliationRowHash({ id: 7, created_at: new Date('2026-05-13T09:13:39.000Z') }),
    canonicalReconciliationRowHash({ id: 7, created_at: '2026-05-13 17:13:39' }),
  );
});
