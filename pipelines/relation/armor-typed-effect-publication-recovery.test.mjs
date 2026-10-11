import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';
import { buildArmorAttributeDispatch } from './sync-maint-to-relation.mjs';
import { buildArmorTypedEffectPublicationPlan } from './armor-typed-effect-publication.mjs';

const hash = char => char.repeat(64);
const sourceFingerprint = { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 };

function proposal() {
  const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
  return buildArmorTypedEffectPublicationPlan({
    typedEffects,
    currentRelationRows: [{
      id: 1,
      record_key: hash('a'),
      owner_kind: 'item',
      owner_id: 256,
      source_kind: 'armor_attribute_cell',
      source_line: 'generic row',
      status: 1,
      deleted: 0,
    }],
    sourceFingerprint,
  });
}

function afterRows(plan) {
  const rows = structuredClone(plan.currentRelationRows);
  for (const change of plan.changes.updates) {
    const index = rows.findIndex(row => row.record_key === change.before.record_key);
    rows[index] = { ...rows[index], ...change.after };
  }
  for (const row of plan.changes.inserts) rows.push({ ...row, id: 9000 + rows.length });
  for (const row of plan.changes.retire) {
    const current = rows.find(candidate => candidate.record_key === row.record_key);
    current.status = 0;
    current.deleted = 1;
  }
  return rows;
}

async function classify(input) {
  const module = await import('./armor-typed-effect-publication-db.mjs');
  assert.equal(typeof module.classifyArmorTypedEffectPublicationReadback, 'function');
  return module.classifyArmorTypedEffectPublicationReadback(input);
}

async function reconcile(input) {
  const module = await import('./armor-typed-effect-publication-db.mjs');
  assert.equal(typeof module.reconcileArmorTypedEffectPublicationReadback, 'function');
  return module.reconcileArmorTypedEffectPublicationReadback(input);
}

function readOnlyConnection(serverUuid, rows) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(['query', sql]);
      if (sql === 'SELECT @@server_uuid AS serverUuid') return [[{ serverUuid }]];
      if (sql.startsWith('SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes')) {
        return [structuredClone(rows)];
      }
      return [[]];
    },
    async rollback() { calls.push(['rollback']); },
    async execute() { throw new Error('reconciliation must not execute DML'); },
    async beginTransaction() { throw new Error('reconciliation must use START TRANSACTION READ ONLY'); },
    async commit() { throw new Error('reconciliation must not commit'); },
  };
}

test('typed-effect recovery recognizes an exact pre-commit snapshot without replay authority', async () => {
  const plan = proposal();
  const result = await classify({ proposal: plan, currentRelationRows: plan.currentRelationRows });

  assert.equal(result.status, 'ROLLBACK_CONFIRMED');
  assert.equal(result.applyAllowed, false);
  assert.equal(result.permitReplayAllowed, false);
});

test('typed-effect recovery recognizes the exact materialized state and requires downstream readback', async () => {
  const plan = proposal();
  const result = await classify({ proposal: plan, currentRelationRows: afterRows(plan) });

  assert.equal(result.status, 'COMMITTED_READBACK_REQUIRED');
  assert.equal(result.applyAllowed, false);
  assert.equal(result.projectionAndApiReadbackRequired, true);
});

test('typed-effect recovery leaves mixed relation state unresolved', async () => {
  const plan = proposal();
  const rows = afterRows(plan);
  rows.pop();
  const result = await classify({ proposal: plan, currentRelationRows: rows });

  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.applyAllowed, false);
  assert.equal(result.permitReplayAllowed, false);
});

test('typed-effect recovery rejects a proposal whose authorization identity drifted', async () => {
  const plan = proposal();
  const tampered = structuredClone(plan);
  tampered.proposedRows[0].condition_text = 'changed condition';

  await assert.rejects(
    classify({ proposal: tampered, currentRelationRows: plan.currentRelationRows }),
    /drift|proposal/i,
  );
});

test('typed-effect reconciliation uses a server-bound read-only transaction and never consumes a permit', async () => {
  const plan = proposal();
  const connection = readOnlyConnection('local-server-01', afterRows(plan));
  const result = await reconcile({ connection, proposal: plan, expectedServerUuid: 'local-server-01' });

  assert.equal(result.status, 'COMMITTED_READBACK_REQUIRED');
  assert.deepEqual(connection.calls.map(([kind, sql]) => kind === 'query' ? sql : kind), [
    'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
    'START TRANSACTION READ ONLY',
    'SELECT @@server_uuid AS serverUuid',
    'SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes',
    'rollback',
  ]);
  assert.equal(result.permitReplayAllowed, false);
});

test('typed-effect reconciliation rejects a different database server before reading relation rows', async () => {
  const plan = proposal();
  const connection = readOnlyConnection('foreign-server', plan.currentRelationRows);

  await assert.rejects(
    reconcile({ connection, proposal: plan, expectedServerUuid: 'local-server-01' }),
    /server UUID/i,
  );
  assert.equal(connection.calls.some(([, sql]) => String(sql).startsWith('SELECT * FROM')), false);
  assert.equal(connection.calls.at(-1)[0], 'rollback');
});
