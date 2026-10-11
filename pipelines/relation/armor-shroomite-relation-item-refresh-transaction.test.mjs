import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS,
  buildArmorShroomiteRelationItemRefreshCandidate,
  buildArmorShroomiteRelationItemRefreshProposal,
} from './armor-shroomite-relation-item-refresh.mjs';
import {
  executeArmorShroomiteRelationItemRefreshTransaction,
  readArmorShroomiteRelationItemRefreshSnapshot,
} from './armor-shroomite-relation-item-refresh-transaction.mjs';

const names = new Map([
  [1546, ['ShroomiteHeadgear', 'Shroomite Headgear']],
  [1547, ['ShroomiteMask', 'Shroomite Mask']],
  [1548, ['ShroomiteHelmet', 'Shroomite Helmet']],
  [1549, ['ShroomiteBreastplate', 'Shroomite Breastplate']],
  [1550, ['ShroomiteLeggings', 'Shroomite Leggings']],
]);
const landing = 'wiki.module.iteminfo.armor-shroomite.1023241';

function maintItem(id) {
  const [internal_name, english_name] = names.get(id);
  return {
    id, source_id: id, internal_name, english_name, name_zh: `item-${id}`,
    source_provider: 'terraria.wiki.gg', source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: new Date('2026-08-22T03:26:22Z'),
    landing_source_id: 18673, landing_source_key: landing, landing_content_hash: 'a'.repeat(64),
    module_generated_at: '2026-08-22 11:17:40', terraria_version: '1.4.5.7',
    major_value: 375000, combat_value: null, defense_value: 11, use_time: null, stack_size: null,
    width: 18, height: 18, raw_json: JSON.stringify({ id, internalName: internal_name }), status: 1, deleted: 0,
  };
}

function relationItem(id) {
  const [internal_name, english_name] = names.get(id);
  return {
    id: id + 10000, record_key: `record-key-${id}`, source_id: id, internal_name, english_name,
    name_zh: `item-${id}`, module_generated_at: '2026-03-09 22:43:19 (+00:00)', terraria_version: '1.4.5.6',
    major_value: 375000, combat_value: 0, defense_value: 11, use_time: 0, stack_size: 1, width: 18, height: 18,
    rare_raw: 8, value_raw: 375000, sell_raw: 75000, sell_text_raw: '18 GC (set)', flags_json: null,
    source_maint_table: 'maint_items', source_maint_record_key: null, source_maint_id: id,
    landing_source_id: 6470, landing_source_key: 'wiki.module.iteminfo', landing_content_hash: 'b'.repeat(64),
    source_provider: 'terraria.wiki.gg', source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: new Date('2026-03-09T22:52:58Z'), confidence: '1.0000',
    reason: 'maint_items_mirrored', raw_json: JSON.stringify({ id, internalName: internal_name }), status: 1, deleted: 0,
  };
}

function proposal() {
  const candidate = buildArmorShroomiteRelationItemRefreshCandidate({
    maintItems: ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(maintItem),
    relationItems: ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(relationItem),
  });
  return buildArmorShroomiteRelationItemRefreshProposal({ candidate, serverUuid: 'server-1' });
}

class FakeConnection {
  constructor(rows) {
    this.rows = structuredClone(rows);
    this.events = [];
    this.executions = [];
  }

  async query(sql) {
    this.events.push(sql);
    if (/SELECT \*/i.test(sql) && /relation_items/i.test(sql)) {
      const rows = structuredClone(this.rows);
      for (const row of rows) {
        if (typeof row.source_revision_timestamp === 'string') {
          row.source_revision_timestamp = new Date(`${row.source_revision_timestamp.replace(' ', 'T')}+08:00`);
        }
      }
      return [rows, []];
    }
    return [[], []];
  }

  async execute(sql, params) {
    this.events.push(sql);
    this.executions.push({ sql, params: structuredClone(params) });
    const setMatch = sql.match(/SET (.+), updated_at/i);
    if (!setMatch) return [{ affectedRows: 0 }, []];
    const columns = [...setMatch[1].matchAll(/`([^`]+)` = \?/g)].map(match => match[1]);
    const id = Number(params[columns.length]);
    const row = this.rows.find(value => Number(value.id) === id);
    if (!row) return [{ affectedRows: 0 }, []];
    columns.forEach((column, index) => { row[column] = params[index]; });
    return [{ affectedRows: 1 }, []];
  }

  async beginTransaction() { this.events.push('BEGIN'); }
  async commit() { this.events.push('COMMIT'); }
  async rollback() { this.events.push('ROLLBACK'); }
}

test('commits exactly five relation-item updates after locked baseline and readback', async () => {
  const value = proposal();
  const connection = new FakeConnection(value.candidate.changes.relationItems.updates.map(change => change.before));
  const events = [];
  const result = await executeArmorShroomiteRelationItemRefreshTransaction({
    connection,
    proposal: value,
    assertRuntimeFence: async () => { events.push('fence'); },
    consumePermit: async () => { events.push('permit'); },
    persistPrepared: async () => { events.push('prepared'); },
    persistOutcome: async evidence => { events.push(`outcome:${evidence.status}`); },
  });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 5);
  assert.deepEqual(connection.rows.map(row => row.id), [11546, 11547, 11548, 11549, 11550]);
  assert.equal(events.indexOf('prepared') < events.indexOf('permit'), true);
  assert.equal(events.at(-1), 'outcome:COMMITTED');
  assert.equal(connection.events.filter(event => /UPDATE .*relation_items/i.test(event)).length, 5);
  assert.equal(connection.executions[0].params[10], '2026-08-22 11:26:22');
  assert.equal(connection.events.some(event => /projection|maint_items|relation_armor/i.test(event)), false);
});

test('fails closed on locked baseline drift before consuming the permit', async () => {
  const value = proposal();
  const rows = structuredClone(value.candidate.changes.relationItems.updates.map(change => change.before));
  rows[0].record_key = 'drifted';
  const connection = new FakeConnection(rows);
  let permits = 0;
  await assert.rejects(() => executeArmorShroomiteRelationItemRefreshTransaction({
    connection,
    proposal: value,
    assertRuntimeFence: async () => {},
    consumePermit: async () => { permits += 1; },
    persistPrepared: async () => {},
    persistOutcome: async () => {},
  }), /baseline|drift|record.key/i);
  assert.equal(permits, 0);
  assert.equal(connection.events.at(-1), 'ROLLBACK');
});

test('snapshot locks only the five target relation rows', async () => {
  const value = proposal();
  const connection = new FakeConnection(value.candidate.changes.relationItems.updates.map(change => change.before));
  await readArmorShroomiteRelationItemRefreshSnapshot({ connection, proposal: value, forUpdate: true });
  assert.match(connection.events[0], /relation_items/);
  assert.match(connection.events[0], /source_id IN \(\?, \?, \?, \?, \?\)/);
  assert.match(connection.events[0], /FOR UPDATE/);
});
