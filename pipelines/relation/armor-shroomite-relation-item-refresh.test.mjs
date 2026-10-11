import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS,
  buildArmorShroomiteRelationItemRefreshCandidate,
  buildArmorShroomiteRelationItemRefreshProposal,
  validateArmorShroomiteRelationItemRefreshCandidate,
} from './armor-shroomite-relation-item-refresh.mjs';
import { buildBaseEntityRelations } from './base-entity-processor.mjs';

const LANDING = {
  id: 18673,
  source_key: 'wiki.module.iteminfo.armor-shroomite.1023241',
  content_hash: '1a28598ed3efa98bc48e7abaac820d6004d351ebb15ce2a4ab159b14180a75d3',
};

const names = new Map([
  [1546, ['ShroomiteHeadgear', 'Shroomite Headgear']],
  [1547, ['ShroomiteMask', 'Shroomite Mask']],
  [1548, ['ShroomiteHelmet', 'Shroomite Helmet']],
  [1549, ['ShroomiteBreastplate', 'Shroomite Breastplate']],
  [1550, ['ShroomiteLeggings', 'Shroomite Leggings']],
]);

function maintItem(id, overrides = {}) {
  const [internal_name, english_name] = names.get(id);
  return {
    id,
    source_id: id,
    internal_name,
    english_name,
    name_zh: `shroomite-${id}`,
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: new Date('2026-08-22T03:26:22Z'),
    landing_source_id: LANDING.id,
    landing_source_key: LANDING.source_key,
    landing_content_hash: LANDING.content_hash,
    landing_fetched_at: new Date('2026-10-06T02:00:00Z'),
    landing_parsed_at: new Date('2026-10-06T02:00:00Z'),
    module_generated_at: '2026-08-22 11:17:40',
    terraria_version: '1.4.5.7',
    major_value: 375000,
    combat_value: null,
    defense_value: 11,
    use_time: null,
    stack_size: null,
    width: 18,
    height: 18,
    flags_json: null,
    raw_json: JSON.stringify({ id, internalName: internal_name, value: 375000 }),
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function relationItem(id, overrides = {}) {
  const [internal_name, english_name] = names.get(id);
  return {
    id: id + 10000,
    record_key: `record-key-${id}`,
    source_id: id,
    internal_name,
    english_name,
    name_zh: `shroomite-${id}`,
    module_generated_at: '2026-03-09 22:43:19 (+00:00)',
    terraria_version: '1.4.5.6',
    major_value: 375000,
    combat_value: 0,
    defense_value: 11,
    use_time: 0,
    stack_size: 1,
    width: 18,
    height: 18,
    rare_raw: 8,
    value_raw: 375000,
    sell_raw: 75000,
    sell_text_raw: '18 GC (set)',
    flags_json: null,
    source_maint_table: 'maint_items',
    source_maint_record_key: null,
    source_maint_id: id,
    landing_source_id: 6470,
    landing_source_key: 'wiki.module.iteminfo',
    landing_content_hash: '6'.repeat(64),
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: new Date('2026-03-09T22:52:58Z'),
    confidence: '1.0000',
    reason: 'maint_items_mirrored',
    raw_json: JSON.stringify({ id, internalName: internal_name }),
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function inputs(overrides = {}) {
  return {
    maintItems: ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(id => maintItem(id)),
    relationItems: ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS.map(id => relationItem(id)),
    maintItemNumericOverrides: [],
    maintItemPages: [],
    ...overrides,
  };
}

test('builds an exact read-only five-row candidate from the canonical maint after-set', () => {
  const candidate = buildArmorShroomiteRelationItemRefreshCandidate(inputs());
  const expected = buildBaseEntityRelations({ maintItems: inputs().maintItems }).relationItems;

  assert.equal(candidate.databaseWrites, false);
  assert.deepEqual(candidate.targetItemSourceIds, [1546, 1547, 1548, 1549, 1550]);
  assert.equal(candidate.changes.relationItems.updates.length, 5);
  assert.deepEqual(candidate.changes.relationItems.updates.map(change => change.before.id), [11546, 11547, 11548, 11549, 11550]);
  assert.deepEqual(candidate.changes.relationItems.updates.map(change => change.before.record_key), [
    'record-key-1546', 'record-key-1547', 'record-key-1548', 'record-key-1549', 'record-key-1550',
  ]);
  assert.deepEqual(candidate.changes.relationItems.updates.map(change => change.after.source_id), expected.map(row => row.sourceId));
  assert.equal(candidate.changes.relationItems.updates[0].after.landing_source_id, LANDING.id);
  assert.equal(candidate.changes.relationItems.updates[0].after.stack_size, null);
  assert.equal(candidate.changes.relationItems.updates[0].after.id, 11546);
  assert.equal(candidate.changes.relationItems.updates[0].after.record_key, 'record-key-1546');
  assert.doesNotThrow(() => validateArmorShroomiteRelationItemRefreshCandidate(candidate));
});

test('rejects missing or inactive relation-item baselines', () => {
  assert.throws(() => buildArmorShroomiteRelationItemRefreshCandidate(inputs({ relationItems: inputs().relationItems.slice(1) })), /exactly five|baseline|missing/i);
  assert.throws(() => buildArmorShroomiteRelationItemRefreshCandidate(inputs({
    relationItems: inputs().relationItems.map((row, index) => index === 0 ? { ...row, deleted: 1 } : row),
  })), /active|identity|baseline/i);
});

test('rejects source-owner and record-key drift rather than repairing ownership', () => {
  assert.throws(() => buildArmorShroomiteRelationItemRefreshCandidate(inputs({
    relationItems: inputs().relationItems.map((row, index) => index === 0 ? { ...row, source_maint_id: 9999 } : row),
  })), /owner|source maint|identity/i);
  assert.throws(() => buildArmorShroomiteRelationItemRefreshCandidate(inputs({
    relationItems: inputs().relationItems.map((row, index) => index === 0 ? { ...row, record_key: null } : row),
  })), /record.key|identity|baseline/i);
});

test('proposal binds the five-row before/after scope and is explicitly non-executable', () => {
  const candidate = buildArmorShroomiteRelationItemRefreshCandidate(inputs());
  const proposal = buildArmorShroomiteRelationItemRefreshProposal({ candidate, serverUuid: 'server-1' });
  assert.equal(proposal.executable, false);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.changes.relationItems.updates.length, 5);
  assert.throws(() => buildArmorShroomiteRelationItemRefreshProposal({
    candidate: { ...candidate, changes: { relationItems: { updates: candidate.changes.relationItems.updates.slice(1) } } },
    serverUuid: 'server-1',
  }), /hash|scope|candidate/i);
});
