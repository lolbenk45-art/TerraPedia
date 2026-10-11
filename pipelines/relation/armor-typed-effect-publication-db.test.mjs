import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';
import { buildArmorAttributeDispatch } from './sync-maint-to-relation.mjs';
import { buildArmorTypedEffectPublicationPlan } from './armor-typed-effect-publication.mjs';
import { executeArmorTypedEffectPublicationTransaction as executeArmorTypedEffectPublicationTransactionCore } from './armor-typed-effect-publication-db.mjs';

const hash = (char) => char.repeat(64);
const fingerprint = { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 };

function fakeConnection(initialRows, { failOnExecute = false, commitError = null } = {}) {
  const state = structuredClone(initialRows);
  const calls = [];
  let nextId = 9000;
  return {
    state, calls, committed: false, rolledBack: false,
    async query(sql) {
      calls.push(['query', sql]);
      if (sql.startsWith('SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes')) return [structuredClone(state)];
      return [[]];
    },
    async execute(sql, params) {
      calls.push(['execute', sql, params]);
      if (failOnExecute) throw new Error('typed effect DML failed');
      if (sql.startsWith('INSERT')) {
        const columns = [...sql.matchAll(/`([^`]+)`/g)].map(match => match[1]).slice(1);
        state.push(Object.fromEntries(columns.map((column, index) => [column, params[index]]).concat([['id', nextId++]])));
      } else if (sql.startsWith('UPDATE') && sql.includes('WHERE `record_key`')) {
        const recordKey = params.at(-1);
        const row = state.find(candidate => candidate.record_key === recordKey);
        if (row) {
          const columns = [...sql.matchAll(/`([^`]+)` = \?/g)].map(match => match[1]);
          columns.forEach((column, index) => { row[column] = params[index]; });
        }
      }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { calls.push(['begin']); },
    async commit() { calls.push(['commit']); if (commitError) throw commitError; this.committed = true; },
    async rollback() { calls.push(['rollback']); this.rolledBack = true; },
  };
}

function proposal() {
  const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
  return buildArmorTypedEffectPublicationPlan({ typedEffects, currentRelationRows: [{ id: 1, record_key: hash('a'), owner_kind: 'item', owner_id: 256, source_kind: 'armor_attribute_cell', status: 1, deleted: 0 }], sourceFingerprint: fingerprint });
}

function executeArmorTypedEffectPublicationTransaction(options) {
  return executeArmorTypedEffectPublicationTransactionCore({
    ...options,
    postCommitAcceptance: options.postCommitAcceptance ?? (async () => ({
      schemaVersion: 'armor-projection-api-acceptance/v1',
      status: 'verified',
      runtimeVerified: true,
      databaseWrites: false,
      apiReadOnly: true,
      postCommit: true,
      blockers: [],
    })),
    rederiveTypedEffects: options.rederiveTypedEffects ?? (async () => ({
      typedEffects: options.proposal.proposedRows,
      sourceFingerprint: options.proposal.sourceFingerprint,
    })),
  });
}

test('typed effect executor rechecks the locked plan, reads back typed rows, then commits', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows);
  const evidence = []; let permitCount = 0; let fenceCount = 0;
  const postCommit = [];
  const result = await executeArmorTypedEffectPublicationTransaction({
    connection, proposal: plan,
    assertRuntimeFence: async () => { fenceCount += 1; },
    consumePermit: async () => { permitCount += 1; },
    persistPrepared: async value => evidence.push(value),
    persistOutcome: async value => evidence.push(value),
    postCommitAcceptance: async value => {
      postCommit.push(value);
      return {
        schemaVersion: 'armor-projection-api-acceptance/v1', status: 'verified', runtimeVerified: true,
        databaseWrites: false, apiReadOnly: true, postCommit: true, blockers: [],
      };
    },
  });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 3);
  assert.equal(permitCount, 1);
  assert.equal(fenceCount >= 2, true);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.deepEqual(evidence.map(row => row.status), ['PREPARED', 'COMMITTED']);
  assert.equal(postCommit.length, 1);
  assert.equal(postCommit[0].status, 'COMMITTED');
  assert.equal(result.postCommitAcceptance.status, 'verified');
  assert.equal(connection.state.filter(row => row.source_kind === 'armor_item_page' && row.status === 1 && row.deleted === 0).length, 3);
});

test('typed effect executor keeps a committed outcome unresolved when post-commit acceptance fails', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows);
  const outcomes = [];
  await assert.rejects(executeArmorTypedEffectPublicationTransaction({
    connection, proposal: plan, assertRuntimeFence: async () => {}, consumePermit: async () => {},
    persistPrepared: async () => {}, persistOutcome: async value => outcomes.push(value),
    postCommitAcceptance: async () => { throw new Error('projection/API acceptance failed'); },
  }), error => {
    assert.match(error.message, /projection\/API acceptance failed/);
    assert.equal(error.transactionCommitted, true);
    assert.equal(error.requiresReadbackReconciliation, true);
    return true;
  });
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(outcomes.at(-1).status, 'COMMITTED_READBACK_REQUIRED');
  assert.equal(outcomes.at(-1).postCommitAcceptance, undefined);
});

test('typed effect executor refuses to start without a post-commit acceptance adapter', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows);
  await assert.rejects(executeArmorTypedEffectPublicationTransactionCore({
    connection, proposal: plan, assertRuntimeFence: async () => {}, consumePermit: async () => {},
    persistPrepared: async () => {}, persistOutcome: async () => {},
    rederiveTypedEffects: async () => ({ typedEffects: plan.proposedRows, sourceFingerprint: plan.sourceFingerprint }),
  }), /post-commit projection\/API acceptance adapter/i);
  assert.equal(connection.calls.some(([kind]) => kind === 'begin'), false);
  assert.equal(connection.calls.some(([kind]) => kind === 'execute'), false);
});

test('typed effect executor rolls back and does not consume a permit on locked proposal drift', async () => {
  const plan = proposal(); const connection = fakeConnection([{ ...plan.currentRelationRows[0], owner_id: 999 }]);
  let permitCount = 0; let outcomes = 0;
  await assert.rejects(executeArmorTypedEffectPublicationTransaction({
    connection, proposal: plan, assertRuntimeFence: async () => {},
    consumePermit: async () => { permitCount += 1; },
    persistPrepared: async () => {}, persistOutcome: async () => { outcomes += 1; },
  }), /drift/i);
  assert.equal(permitCount, 0);
  assert.equal(outcomes, 0);
  assert.equal(connection.committed, false);
  assert.equal(connection.rolledBack, true);
});

test('typed effect executor rederives current maint source facts under lock before permit consumption', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows);
  const changedSources = structuredClone(plan.proposedRows);
  changedSources[0].condition_text = 'foreign condition';
  let permitCount = 0; let preparedCount = 0;

  await assert.rejects(executeArmorTypedEffectPublicationTransaction({
    connection,
    proposal: plan,
    rederiveTypedEffects: async () => ({ typedEffects: changedSources, sourceFingerprint: fingerprint }),
    assertRuntimeFence: async () => {},
    consumePermit: async () => { permitCount += 1; },
    persistPrepared: async () => { preparedCount += 1; },
    persistOutcome: async () => {},
  }), /locked proposal drift/i);

  assert.equal(permitCount, 0);
  assert.equal(preparedCount, 0);
  assert.equal(connection.rolledBack, true);
});

test('typed effect executor exact replay keeps generic rows and performs no DML', async () => {
  const firstPlan = proposal(); const connection = fakeConnection(firstPlan.currentRelationRows);
  const adapters = {
    assertRuntimeFence: async () => {}, consumePermit: async () => {},
    persistPrepared: async () => {}, persistOutcome: async () => {},
  };
  await executeArmorTypedEffectPublicationTransaction({ connection, proposal: firstPlan, ...adapters });
  const replay = buildArmorTypedEffectPublicationPlan({
    typedEffects: firstPlan.proposedRows,
    currentRelationRows: connection.state,
    sourceFingerprint: fingerprint,
  });
  const before = connection.calls.length;
  const result = await executeArmorTypedEffectPublicationTransaction({ connection, proposal: replay, ...adapters });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 0);
  assert.equal(connection.calls.slice(before).filter(([kind]) => kind === 'execute').length, 0);
  assert.equal(connection.state.filter(row => row.source_kind === 'armor_attribute_cell').length, 1);
});

test('typed effect executor rolls back after DML failure and records terminal evidence', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows, { failOnExecute: true });
  const outcomes = [];
  await assert.rejects(executeArmorTypedEffectPublicationTransaction({
    connection, proposal: plan, assertRuntimeFence: async () => {}, consumePermit: async () => {},
    persistPrepared: async () => {}, persistOutcome: async value => outcomes.push(value),
  }), error => {
    assert.match(error.message, /DML failed/);
    assert.equal(error.transactionCommitted, false);
    assert.equal(error.requiresReadbackReconciliation, false);
    assert.equal(error.dispatchPermitConsumed, true);
    return true;
  });
  assert.equal(connection.committed, false);
  assert.equal(connection.rolledBack, true);
  assert.equal(outcomes.at(-1).status, 'ROLLBACK_CONFIRMED');
});

test('typed effect executor preserves COMMIT_UNKNOWN without blind rollback', async () => {
  const plan = proposal(); const connection = fakeConnection(plan.currentRelationRows, { commitError: new Error('commit uncertain') });
  const outcomes = [];
  await assert.rejects(executeArmorTypedEffectPublicationTransaction({
    connection, proposal: plan, assertRuntimeFence: async () => {}, consumePermit: async () => {},
    persistPrepared: async () => {}, persistOutcome: async value => outcomes.push(value),
  }), error => {
    assert.match(error.message, /commit uncertain/);
    assert.equal(error.transactionCommitted, null);
    assert.equal(error.requiresReadbackReconciliation, true);
    assert.equal(error.dispatchPermitConsumed, true);
    return true;
  });
  assert.equal(connection.rolledBack, false);
  assert.equal(outcomes.at(-1).status, 'COMMIT_UNKNOWN');
});
