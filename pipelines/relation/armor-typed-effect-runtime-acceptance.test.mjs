import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArmorTypedEffectPostCommitAcceptance } from './armor-typed-effect-runtime-acceptance.mjs';

const recordKey = 'a'.repeat(64);
const relationRow = {
  id: 1546,
  record_key: recordKey,
  owner_kind: 'item',
  owner_id: 1546,
  owner_key: 'ShroomiteHelmet',
  source_kind: 'armor_item_page',
  source_line: '远程武器伤害 +12%',
  source_line_index: 0,
  effect_index: 0,
  apply_scope: 'item_bonus',
  variant_label: 'Shroomite Helmet',
  item_internal_name: 'ShroomiteHelmet',
  slot_type: 'headSlot',
  stat_key: 'damage_bonus',
  stat_label_zh: '远程伤害',
  class_scope: 'ranged',
  operation: 'add',
  value_decimal: 12,
  value_max_decimal: null,
  unit: 'percent',
  condition_text: '远程武器',
  raw_text: '远程武器伤害 +12%',
  parse_status: 'parsed',
  confidence: 1,
  source_maint_record_key: 'b'.repeat(64),
  source_maint_id: 7001,
  landing_source_id: 12570,
  landing_source_key: 'wiki.item.effects.shroomite',
  landing_content_hash: 'c'.repeat(64),
  source_provider: 'terraria.wiki.gg',
  source_page: 'Shroomite Helmet',
  source_revision_timestamp: '2026-10-01T00:00:00.000Z',
  status: 1,
  deleted: 0,
};

function projectionRow() {
  return {
    id: 1546,
    relation_record_key: recordKey,
    owner_kind: 'item',
    owner_id: 1546,
    owner_key: 'ShroomiteHelmet',
    source_kind: 'armor_item_page',
    source_line: relationRow.source_line,
    source_line_index: 0,
    effect_index: 0,
    apply_scope: 'item_bonus',
    variant_label: 'Shroomite Helmet',
    item_internal_name: 'ShroomiteHelmet',
    slot_type: 'headSlot',
    stat_key: 'damage_bonus',
    stat_label_zh: '远程伤害',
    class_scope: 'ranged',
    operation: 'add',
    value_decimal: 12,
    value_max_decimal: null,
    unit: 'percent',
    condition_text: '远程武器',
    raw_text: relationRow.raw_text,
    parse_status: 'parsed',
    confidence: 1,
    status: 1,
    deleted: 0,
  };
}

function apiRow() {
  return {
    id: 1546,
    itemId: 1546,
    itemInternalName: 'ShroomiteHelmet',
    ownerKind: 'item',
    ownerKey: 'ShroomiteHelmet',
    sourceKind: 'armor_item_page',
    sourceLine: relationRow.source_line,
    effectIndex: 0,
    applyScope: 'item_bonus',
    slotType: 'headSlot',
    statKey: 'damage_bonus',
    statLabelZh: '远程伤害',
    classScope: 'ranged',
    operation: 'add',
    valueDecimal: 12,
    valueMaxDecimal: null,
    unit: 'percent',
    variantLabel: 'Shroomite Helmet',
    conditionText: '远程武器',
    rawText: relationRow.raw_text,
    parseStatus: 'parsed',
    sourceMaintRecordKey: relationRow.source_maint_record_key,
    sourceMaintId: relationRow.source_maint_id,
    landingSourceId: relationRow.landing_source_id,
    landingSourceKey: relationRow.landing_source_key,
    landingContentHash: relationRow.landing_content_hash,
    sourceProvider: relationRow.source_provider,
    sourcePage: relationRow.source_page,
    sourceRevisionTimestamp: relationRow.source_revision_timestamp,
  };
}

function connection({ projection = [projectionRow()] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('projection_equipment_effect_attributes')) return [projection];
      return [[relationRow]];
    },
  };
}

test('runtime acceptance verifies committed projection and public API readback', async () => {
  const db = connection();
  const result = await buildArmorTypedEffectPostCommitAcceptance({
    connection: db,
    proposal: { proposedRows: [relationRow] },
    relationRows: [relationRow],
    apiBase: 'http://127.0.0.1:18088/api',
    fetchImpl: async url => ({
      ok: true,
      status: 200,
      async json() { assert.equal(url, 'http://127.0.0.1:18088/api/public/items/1546/equipment-effects'); return { data: [apiRow()] }; },
    }),
  });

  assert.equal(result.status, 'verified');
  assert.equal(result.runtimeVerified, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(db.calls.some(call => call.sql.includes('projection_equipment_effect_attributes')));
});

test('runtime acceptance remains blocked when projection and public API readback are unavailable', async () => {
  const db = connection({ projection: [] });
  const result = await buildArmorTypedEffectPostCommitAcceptance({
    connection: db,
    proposal: { proposedRows: [relationRow] },
    relationRows: [relationRow],
    apiBase: 'http://127.0.0.1:18088/api',
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.runtimeVerified, false);
  assert.ok(result.blockers.some(blocker => blocker.code === 'projection-equipment-effect-missing'));
  assert.ok(result.blockers.some(blocker => blocker.code === 'public-api-readback-failed'));
});
