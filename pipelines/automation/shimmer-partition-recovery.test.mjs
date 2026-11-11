import assert from 'node:assert/strict';
import test from 'node:test';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';
import { restoreShimmerScopeSnapshot, verifyShimmerExecutionFences } from './shimmer-partition-recovery.mjs';

const scope = SHIMMER_PARTITION_SCOPES.find((entry) => entry.table === 'shimmer_item_transforms');
const row = (id, extra = {}) => ({ id, source_provider: 'wiki_zh', source_page: '微光', deleted: 0, value: 'before', ...extra });
function database(rows) {
  const records = new Map(rows.map((entry) => [entry.id, { ...entry }]));
  const writes = [];
  return { records, writes, async query(sql, params = []) {
    if (sql.startsWith('SELECT')) {
      if (sql.includes('WHERE `id` = ?')) return [[records.get(params[0])].filter(Boolean)];
      assert.match(sql, /WHERE source_provider = \? AND source_page = \? AND deleted = 0/);
      return [[...records.values()].filter((entry) => entry.source_provider === params[0]
        && entry.source_page === params[1] && entry.deleted === 0).sort((a, b) => a.id - b.id)];
    }
    writes.push([sql, params]);
    if (sql.startsWith('DELETE')) return [{ affectedRows: records.delete(params[0]) ? 1 : 0 }];
    if (sql.startsWith('UPDATE')) {
      const id = params.at(-1);
      const columns = [...sql.matchAll(/`(\w+)` = \?/g)].slice(0, -1).map((match) => match[1]);
      for (const [index, column] of columns.entries()) records.get(id)[column] = params[index];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT')) {
      assert.doesNotMatch(sql, /DUPLICATE|IGNORE/);
      const columns = [...sql.slice(sql.indexOf('('), sql.indexOf(')')).matchAll(/`(\w+)`/g)].map((match) => match[1]);
      const inserted = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      records.set(inserted.id, inserted);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected SQL: ${sql}`);
  } };
}

test('Shimmer recovery restores changed and soft-disabled rows, removes only new owned rows', async () => {
  const unrelated = row(90, { source_page: 'other', value: 'keep' });
  const historical = row(91, { deleted: 1, value: 'history' });
  const db = database([row(1, { value: 'after' }), row(2, { deleted: 1 }), row(3), unrelated, historical]);
  await restoreShimmerScopeSnapshot(db, scope, [row(1), row(2), row(4)]);
  assert.deepEqual([...db.records.values()].sort((a, b) => a.id - b.id), [row(1), row(2), row(4), unrelated, historical]);
});

test('Shimmer recovery rejects foreign ID collisions and foreign baseline rows before writing', async () => {
  const db = database([row(1, { source_page: 'other' }), row(3)]);
  await assert.rejects(restoreShimmerScopeSnapshot(db, scope, [row(1)]), /collision/i);
  assert.equal(db.writes.length, 0);
  await assert.rejects(restoreShimmerScopeSnapshot(db, scope, [row(1, { source_page: 'other' })]), /baseline|partition/i);
  assert.equal(db.writes.length, 0);
});

test('Shimmer recovery rejects duplicate IDs, unknown scopes and failed affected-row checks', async () => {
  const db = database([]);
  await assert.rejects(restoreShimmerScopeSnapshot(db, scope, [row(1), row(1)]), /duplicate/i);
  await assert.rejects(restoreShimmerScopeSnapshot(db, { ...scope, logicalPredicateHash: 'wrong' }, []), /scope/i);
  await assert.rejects(restoreShimmerScopeSnapshot({ query: async (sql) => sql.startsWith('SELECT')
    ? [[]] : [{ affectedRows: 0 }] }, scope, [row(1)]), /persist|affected/i);
});

function fenceBundle() {
  return { domainId: 'shimmer', runId: 'final-run', bundleHash: `sha256:${'a'.repeat(64)}`,
    baseline: { environmentId: 'local', generations: SHIMMER_PARTITION_SCOPES.map((entry) => ({ ...entry, generation: 2 })) },
    importPlan: { shimmerPartition: { fences: SHIMMER_PARTITION_SCOPES.map((entry) => ({ ...entry,
      generation: 2, latestRunId: 'final-run', fenceToken: `token-${entry.table}` })) } } };
}
function fenceConnection(bundle, overrides = {}) {
  return { query: async (sql, params) => {
    assert.match(sql, /FOR UPDATE$/);
    assert.doesNotMatch(sql, /AND field_group =/); // inspect the full physical-table range
    const entry = SHIMMER_PARTITION_SCOPES.find((entry) => entry.table === params[2]);
    return [[{ fieldGroup: entry.fieldGroup, logicalPredicateHash: entry.logicalPredicateHash,
      latestRunId: bundle.runId, beforeGeneration: 2, fenceToken: `token-${entry.table}`,
      active: 1, committedGeneration: null, commitMarker: null, ...overrides }]];
  } };
}

test('Shimmer execution checks exact tokens, final run, generation and competing table scopes', async () => {
  const bundle = fenceBundle();
  await verifyShimmerExecutionFences(fenceConnection(bundle), bundle);
  for (const overrides of [{ fenceToken: 'stolen' }, { latestRunId: 'preview-run' }, { beforeGeneration: 3 },
    { fieldGroup: 'all_columns' }, { active: 0 }, { commitMarker: 'consumed' }]) {
    await assert.rejects(verifyShimmerExecutionFences(fenceConnection(bundle, overrides), bundle), /fence/i);
  }
});

test('Shimmer compensation fence verification binds the committed generation and marker even after expiry', async () => {
  const bundle = fenceBundle();
  const committed = { committedGeneration: 3, commitMarker: bundle.bundleHash.slice(7), active: 0 };
  await verifyShimmerExecutionFences(fenceConnection(bundle, committed), bundle, { committed: true });
  await assert.rejects(verifyShimmerExecutionFences(fenceConnection(bundle,
    { ...committed, commitMarker: 'different' }), bundle, { committed: true }), /fence/i);
});

test('automatic Shimmer execution rechecks the persisted Owner approval instead of trusting bundle labels', async () => {
  const bundle = fenceBundle();
  bundle.executionMode = 'ACTIVATION_GATED_AUTO';
  bundle.policy = { policyVersion: 3, policyHash: `sha256:${'b'.repeat(64)}`, policySetHash: `sha256:${'c'.repeat(64)}` };
  await assert.rejects(verifyShimmerExecutionFences(fenceConnection(bundle), bundle), /approval/);
  bundle.importPlan.shimmerPolicyApproval = { actor: 'admin', ...bundle.policy };
  for (const approvedBy of ['admin', 'other-owner', null]) {
    const base = fenceConnection(bundle);
    const connection = { query: async (sql, params) => sql.startsWith('SELECT pv.approved_by')
      ? [[{ approvedBy, username: 'admin', ownerStatus: 'ACTIVE' }]] : base.query(sql, params) };
    if (approvedBy === 'admin') await verifyShimmerExecutionFences(connection, bundle);
    else await assert.rejects(verifyShimmerExecutionFences(connection, bundle), /approval/);
  }
});
