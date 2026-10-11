import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArmorRelationItemNormalizationCandidate, buildArmorRelationItemNormalizationProposal } from './armor-relation-item-normalization.mjs';
import { executeArmorRelationItemNormalizationTransaction } from './armor-relation-item-normalization-transaction.mjs';

const ids = [729, 1282];
const names = new Map([[729, ['WoodGreaves', 'Wood Greaves']], [1282, ['AmethystRobe', 'Amethyst Robe']]]);
const maintItems = ids.map(id => ({ id, source_id: id, internal_name: names.get(id)[0], english_name: names.get(id)[1], source_provider: 'terraria.wiki.gg', source_page: 'Module:Iteminfo/data', source_revision_timestamp: '2026-03-09T22:52:58.000Z', raw_json: JSON.stringify({ id, internalName: names.get(id)[0] }), defense_value: null, status: 1, deleted: 0 }));
const relationItems = ids.map(id => ({ id: id + 10000, source_id: id, record_key: `record-${id}`, internal_name: names.get(id)[0], english_name: names.get(id)[1], source_maint_table: 'maint_items', source_maint_id: id, defense_value: 0, other_value: `preserve-${id}`, status: 1, deleted: 0 }));
const proposal = buildArmorRelationItemNormalizationProposal({ candidate: buildArmorRelationItemNormalizationCandidate({ maintItems, relationItems }), serverUuid: 'server-1' });

function connectionFixture() {
  let rows = structuredClone(relationItems);
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      calls.push({ kind: 'query', sql, params });
      if (sql.startsWith('SELECT *')) return [structuredClone(rows)];
      return [[]];
    },
    async execute(sql, params) {
      calls.push({ kind: 'execute', sql, params });
      const [id, sourceId, recordKey] = params;
      const row = rows.find(item => item.id === id && item.source_id === sourceId && item.record_key === recordKey);
      if (!row) return [{ affectedRows: 0 }];
      row.defense_value = null;
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { calls.push({ kind: 'begin' }); },
    async commit() { calls.push({ kind: 'commit' }); },
    async rollback() { calls.push({ kind: 'rollback' }); },
  };
  return { connection, calls, rows: () => structuredClone(rows) };
}

test('updates only the two owned defense cells after baseline lock and one-use permit', async () => {
  const f = connectionFixture();
  const outcomes = [];
  let fenceCalls = 0;
  let permitCalls = 0;
  const result = await executeArmorRelationItemNormalizationTransaction({
    connection: f.connection,
    proposal,
    assertRuntimeFence: async () => { fenceCalls += 1; },
    consumePermit: async () => { permitCalls += 1; },
    persistPrepared: async evidence => outcomes.push(evidence.status),
    persistOutcome: async evidence => outcomes.push(evidence.status),
  });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 2);
  assert.equal(permitCalls, 1);
  assert.equal(fenceCalls, 3);
  assert.deepEqual(outcomes, ['PREPARED', 'COMMITTED']);
  assert.deepEqual(f.calls.filter(call => call.kind === 'execute').map(call => call.sql.match(/SET (.*?) WHERE/)?.[1]), ['defense_value = NULL, updated_at = CURRENT_TIMESTAMP', 'defense_value = NULL, updated_at = CURRENT_TIMESTAMP']);
  assert.deepEqual(f.rows().map(row => [row.source_id, row.defense_value, row.other_value]), [[729, null, 'preserve-729'], [1282, null, 'preserve-1282']]);
  assert.equal(f.calls.at(-1).kind, 'commit');
});

test('permit rejection rolls back before any relation-item DML', async () => {
  const f = connectionFixture();
  const outcomes = [];
  await assert.rejects(() => executeArmorRelationItemNormalizationTransaction({
    connection: f.connection,
    proposal,
    assertRuntimeFence: async () => {},
    consumePermit: async () => { throw new Error('permit rejected'); },
    persistPrepared: async evidence => outcomes.push(evidence.status),
    persistOutcome: async evidence => outcomes.push(evidence.status),
  }), /permit rejected/);
  assert.equal(f.calls.filter(call => call.kind === 'execute').length, 0);
  assert.equal(f.calls.at(-1).kind, 'rollback');
  assert.deepEqual(outcomes, ['PREPARED', 'ROLLBACK_CONFIRMED']);
});
