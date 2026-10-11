import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  ARMOR_SOURCE_EFFECT_PUBLICATION_OWNERSHIP,
  buildArmorSourceEffectRows,
  buildArmorSourceEffectPublicationPlan,
  validateArmorSourceEffectPublicationPlan,
} from './armor-source-effect-publication.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

function row(overrides = {}) {
  return {
    record_key: hash('set'), owner_kind: 'armor_set', owner_record_key: hash('owner'), owner_id: 100,
    owner_key: 'ArmorSetBonus.Test', source_kind: 'benefit_zh', source_locale: 'zh',
    source_line_index: 0, source_line: '套装奖励：移动速度提高 10%', effect_index: 0,
    apply_scope: 'set_bonus', variant_label: null, item_internal_name: null, slot_type: null,
    stat_key: 'move_speed', stat_label_zh: '移动速度', class_scope: 'all', operation: 'add',
    value_decimal: 10, value_max_decimal: null, unit: 'percent', condition_text: null,
    raw_text: '移动速度提高 10%', parse_status: 'parsed', source_maint_table: null,
    source_maint_record_key: null, source_maint_id: null, landing_source_id: null,
    landing_source_key: null, landing_content_hash: null,
    source_provider: 'terraria.wiki.gg', source_page: '盔甲', source_revision_timestamp: '2026-10-01T00:00:00.000Z',
    confidence: 0.9, reason: 'parsed_from_armor_set_benefit_zh', review_status: 'accepted',
    raw_json: '{}', status: 1, deleted: 0, ...overrides,
  };
}

function fingerprint() {
  return { moduleRevisionId: 964993, pageRevisionIds: [251936] };
}

test('source rows quarantine missing owners and unresolved parser rows without retiring them', () => {
  const ownerKey = hash('owner');
  const unresolved = row({ record_key: hash('unresolved'), owner_record_key: ownerKey,
    parse_status: 'unparsed', review_status: 'needs_review' });
  const rows = buildArmorSourceEffectRows({
    relationArmorSets: [{ id: 100, record_key: ownerKey, text_key: 'ArmorSetBonus.Known',
      source_page: 'Known armor', source_revision_timestamp: '2026-10-01T00:00:00.000Z', status: 1, deleted: 0 }],
    currentRelationRows: [unresolved],
    enrichedModulePayload: { armorSets: [
      { textKey: 'ArmorSetBonus.Known', effectText: '+10% 移动速度', effectTextSource: { pageTitle: 'Known armor', revisionTimestamp: '2026-10-01T00:00:00.000Z' } },
      { textKey: 'ArmorSetBonus.Missing', effectText: '+10% 移动速度', effectTextSource: { pageTitle: 'Missing armor', revisionTimestamp: '2026-10-01T00:00:00.000Z' } },
    ] },
  });
  assert.equal(rows.some(candidate => candidate.owner_key === 'ArmorSetBonus.Missing'), false);
  assert.equal(rows.some(candidate => candidate.record_key === unresolved.record_key), true);
  assert.equal(rows.some(candidate => candidate.parse_status === 'unparsed' && candidate.record_key !== unresolved.record_key), false);
});

test('source rows skip unresolved armor cells while preserving the set publication lane', () => {
  const ownerKey = hash('owner-qualified');
  assert.doesNotThrow(() => buildArmorSourceEffectRows({
    relationArmorSets: [{ id: 100, record_key: ownerKey, text_key: 'ArmorSetBonus.Known',
      source_page: 'Known armor', source_revision_timestamp: '2026-10-01T00:00:00.000Z', status: 1, deleted: 0 }],
    relationArmorAttributeRows: [{ item_id: 1546, item_internal_name: 'ShroomiteHeadgear', item_name_zh: '蘑菇矿头盔',
      record_key: hash('qualified-attribute'), raw_cells_json: JSON.stringify({ rangedDamage: '>15%' }),
      review_status: 'accepted', status: 1, deleted: 0 }],
    currentRelationRows: [],
    enrichedModulePayload: { armorSets: [{ textKey: 'ArmorSetBonus.Known', effectText: '+10% 移动速度',
      effectTextSource: { pageTitle: 'Known armor', revisionTimestamp: '2026-10-01T00:00:00.000Z' } }] },
  }));
});

test('source publication owns set and armor-cell rows while preserving typed rows', () => {
  const typed = row({ record_key: hash('typed'), owner_kind: 'item', owner_record_key: hash('typed-owner'), owner_id: 7,
    owner_key: 'WoodHelmet', source_kind: 'armor_item_page', source_maint_table: 'maint_armor_attribute_rows',
    source_maint_record_key: hash('typed-maint'), source_maint_id: 201, landing_source_id: 301,
    landing_source_key: 'wiki.page.armor_attributes', landing_content_hash: `sha256:${hash('typed-landing')}`,
    item_internal_name: 'WoodHelmet', stat_key: 'meleeDamage', operation: 'add', condition_text: '近战武器' });
  const current = [row(), typed];
  const next = row({ record_key: hash('next'), source_line: '套装奖励：移动速度提高 12%', raw_text: '移动速度提高 12%', value_decimal: 12 });
  const plan = buildArmorSourceEffectPublicationPlan({
    proposedRows: [next], currentRelationRows: current,
    sourceEvidenceHash: `sha256:${hash('evidence')}`, sourceFingerprint: fingerprint(),
  });
  assert.deepEqual(plan.ownership, [...ARMOR_SOURCE_EFFECT_PUBLICATION_OWNERSHIP]);
  assert.equal(plan.changes.inserts.length, 1);
  assert.equal(plan.changes.retire.length, 1);
  assert.deepEqual(plan.preservedRecordKeys, [typed.record_key]);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.applyAllowed, false);
  assert.doesNotThrow(() => validateArmorSourceEffectPublicationPlan(plan));
});

test('source publication rejects typed item-page rows in its owned proposal', () => {
  assert.throws(() => buildArmorSourceEffectPublicationPlan({
    proposedRows: [row({ owner_kind: 'item', owner_key: 'WoodHelmet', source_kind: 'armor_item_page' })],
    currentRelationRows: [], sourceEvidenceHash: `sha256:${hash('evidence')}`, sourceFingerprint: fingerprint(),
  }), /owner|source_kind|armor_item_page/i);
});

test('source publication rejects source lineage drift', () => {
  const proposed = row({ owner_kind: 'item', owner_key: 'WoodHelmet', source_kind: 'armor_attribute_cell',
    item_internal_name: 'WoodHelmet', source_maint_id: null });
  assert.throws(() => buildArmorSourceEffectPublicationPlan({
    proposedRows: [proposed], currentRelationRows: [],
    sourceEvidenceHash: `sha256:${hash('evidence')}`, sourceFingerprint: fingerprint(),
  }), /lineage|source_maint_id|required/i);
});

test('source publication preserves owned rows outside the declared item scope', () => {
  const outside = row({ record_key: hash('outside'), owner_kind: 'item', owner_record_key: hash('outside-owner'),
    owner_id: 999, owner_key: 'OtherHelmet', source_kind: 'armor_attribute_cell', item_internal_name: 'OtherHelmet',
    source_maint_table: 'maint_armor_attribute_rows', source_maint_record_key: hash('outside-maint'), source_maint_id: 9,
    landing_source_id: 8, landing_source_key: 'wiki.page.armor_attributes', landing_content_hash: hash('outside-landing'),
    stat_key: 'meleeDamage', condition_text: null });
  const plan = buildArmorSourceEffectPublicationPlan({
    proposedRows: [row({ owner_kind: 'item', owner_record_key: hash('in-scope-owner'), owner_id: 7,
      owner_key: 'WoodHelmet', source_kind: 'armor_attribute_cell', item_internal_name: 'WoodHelmet',
      source_maint_table: 'maint_armor_attribute_rows', source_maint_record_key: hash('in-scope-maint'), source_maint_id: 10,
      landing_source_id: 8, landing_source_key: 'wiki.page.armor_attributes', landing_content_hash: hash('in-scope-landing'),
      stat_key: 'meleeDamage', condition_text: null })],
    currentRelationRows: [outside], sourceEvidenceHash: `sha256:${hash('evidence')}`, sourceFingerprint: fingerprint(),
  });
  assert.deepEqual(plan.preservedRecordKeys, [outside.record_key]);
  assert.equal(plan.changes.retire.length, 0);
});

test('source publication compares decimal representations by value', () => {
  const current = row({ confidence: '0.9000' });
  const proposed = row({ confidence: 0.9 });
  const plan = buildArmorSourceEffectPublicationPlan({
    proposedRows: [proposed],
    currentRelationRows: [current],
    sourceEvidenceHash: `sha256:${hash('evidence-decimal')}`,
    sourceFingerprint: fingerprint(),
  });
  assert.equal(plan.changes.inserts.length, 0);
  assert.equal(plan.changes.updates.length, 0);
  assert.equal(plan.changes.unchanged.length, 1);
});
