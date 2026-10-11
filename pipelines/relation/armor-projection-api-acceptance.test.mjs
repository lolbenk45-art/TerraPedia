import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArmorProjectionApiAcceptance } from './armor-projection-api-acceptance.mjs';

const key = (name) => name.padEnd(64, '0').slice(0, 64);
const hash = (name) => `sha256:${[...String(name)].reduce((sum, char) => sum + char.charCodeAt(0).toString(16), '').padEnd(64, '0').slice(0, 64)}`;

function fixture() {
  const relationRecordKey = key('relation');
  const effectRecordKey = key('effect');
  const set = {
    id: 10,
    relation_record_key: relationRecordKey,
    text_key: 'ArmorSetBonus.Test',
    entity_type: 'armor_set',
    composition_kind: 'traditional_set',
    name: 'Test armor',
    name_zh: '测试盔甲',
    name_en: 'Test armor',
    source_key: 'Test armor',
    benefit_expression: null,
    benefit_zh: '条件效果',
    benefit_en: 'Conditional effect',
    primary_part: 'head',
    set_count: 1,
    unique_item_count: 1,
    sets_json: '[ [ 101 ] ]',
    unique_item_ids_json: '[101]',
    current_item_ids_json: '[101]',
    related_items_json: '[{"sourceId":101,"internalName":"TestHelmet"}]',
    male_images: null,
    female_images: null,
    special_images: null,
    mapping_status: 'mapped',
    source_provider: 'terraria.wiki.gg',
    source_page: 'ArmorSetBonus.Test',
    source_revision_timestamp: '2026-10-01T00:00:00.000Z',
    status: 1,
    deleted: 0,
  };
  const attribute = {
    relation_record_key: key('attribute'),
    item_id: 101,
    item_internal_name: 'TestHelmet',
    item_name_zh: '测试头盔',
    item_page_title: 'Test Helmet',
    item_href: '/wiki/Test_Helmet',
    section_code: 'armor',
    slot_group: 'head',
    defense_value: 5,
    raw_cells_json: '{"meleeDamage":"5%"}',
    source_provider: 'terraria.wiki.gg',
    source_page: 'Test Helmet',
    source_revision_timestamp: '2026-10-01T00:00:00.000Z',
    status: 1,
    deleted: 0,
  };
  const effect = {
    relation_record_key: effectRecordKey,
    owner_kind: 'item',
    owner_id: 101,
    owner_key: 'TestHelmet',
    source_kind: 'armor_item_page',
    source_line: '远程武器伤害 +12%',
    source_line_index: 0,
    effect_index: 0,
    apply_scope: 'item_bonus',
    variant_label: '测试头盔',
    item_internal_name: 'TestHelmet',
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
    source_maint_record_key: key('maint'),
    source_maint_id: 20,
    landing_source_id: 30,
    landing_source_key: 'landing:test',
    landing_content_hash: hash('landing'),
    source_provider: 'terraria.wiki.gg',
    source_page: 'Test Helmet',
    source_revision_timestamp: '2026-10-01T00:00:00.000Z',
    status: 1,
    deleted: 0,
  };
  const candidate = {
    operationId: 'canonical-armor-canonical-projection',
    candidateSha256: hash('candidate'),
    acceptance: { status: 'dependencies-satisfied', blockers: [] },
    expectedRows: { projection_armor_sets: [set] },
    dependencyExpectations: {
      projection_item_armor_attributes: [attribute],
      projection_equipment_effect_attributes: [effect],
    },
  };
  return {
    candidate,
    projectionArmorSets: [{ ...set, created_at: '2026-10-02 00:00:00', updated_at: '2026-10-02 00:00:00' }],
    projectionItemArmorAttributes: [{ ...attribute, id: 44, created_at: '2026-10-02 00:00:00', updated_at: '2026-10-02 00:00:00' }],
    projectionEquipmentEffectAttributes: [{ ...effect, id: 45, created_at: '2026-10-02 00:00:00', updated_at: '2026-10-02 00:00:00' }],
    apiItemArmorAttributes: [{
      id: 44, itemId: 101, itemInternalName: 'TestHelmet', itemNameZh: '测试头盔', itemPageTitle: 'Test Helmet',
      itemHref: '/wiki/Test_Helmet', sectionCode: 'armor', slotGroup: 'head', defenseValue: 5,
      rawCellsJson: '{"meleeDamage":"5%"}', sourceProvider: 'terraria.wiki.gg', sourcePage: 'Test Helmet',
      sourceRevisionTimestamp: '2026-10-01T00:00:00.000Z',
    }],
    apiItemEquipmentEffects: [{
      id: 45, itemId: 101, itemInternalName: 'TestHelmet', ownerKind: 'item', ownerKey: 'TestHelmet',
      sourceKind: 'armor_item_page', sourceLine: '远程武器伤害 +12%', effectIndex: 0, applyScope: 'item_bonus',
      variantLabel: '测试头盔', slotType: 'headSlot', statKey: 'damage_bonus', statLabelZh: '远程伤害',
      classScope: 'ranged', operation: 'add', valueDecimal: 12, valueMaxDecimal: null, unit: 'percent',
      conditionText: '远程武器', rawText: '远程武器伤害 +12%', parseStatus: 'parsed',
      sourceMaintRecordKey: key('maint'), sourceMaintId: 20, landingSourceId: 30, landingSourceKey: 'landing:test',
      landingContentHash: hash('landing'), sourceProvider: 'terraria.wiki.gg', sourcePage: 'Test Helmet',
      sourceRevisionTimestamp: '2026-10-01T00:00:00.000Z',
    }],
  };
}

test('post-commit contract verifies projection rows and public item readbacks by semantics and lineage', () => {
  const result = buildArmorProjectionApiAcceptance(fixture());
  assert.equal(result.status, 'verified');
  assert.equal(result.runtimeVerified, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.projection, {
    armorSets: { expectedCount: 1, observedCount: 1 },
    armorAttributes: { expectedCount: 1, observedCount: 1 },
    equipmentEffects: { expectedCount: 1, observedCount: 1 },
  });
  assert.deepEqual(result.api, {
    armorAttributes: { expectedCount: 1, observedCount: 1 },
    equipmentEffects: { expectedCount: 1, observedCount: 1 },
  });
  assert.match(result.expectedSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.observedSha256, /^sha256:[a-f0-9]{64}$/);
});

test('post-commit contract catches API condition/value/lineage loss', () => {
  const input = fixture();
  input.apiItemEquipmentEffects[0].conditionText = null;
  input.apiItemEquipmentEffects[0].valueDecimal = 1;
  input.apiItemEquipmentEffects[0].sourceMaintRecordKey = key('wrong');
  const result = buildArmorProjectionApiAcceptance(input);
  assert.equal(result.status, 'blocked');
  assert.equal(result.runtimeVerified, false);
  assert.ok(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-field-drift' && row.field === 'conditionText'));
  assert.ok(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-field-drift' && row.field === 'valueDecimal'));
  assert.ok(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-field-drift' && row.field === 'sourceMaintRecordKey'));
});

test('post-commit contract catches missing or foreign projection rows', () => {
  const input = fixture();
  input.projectionEquipmentEffectAttributes = [];
  input.apiItemEquipmentEffects.push({ ...input.apiItemEquipmentEffects[0], effectIndex: 2 });
  const result = buildArmorProjectionApiAcceptance(input);
  assert.ok(result.blockers.some(row => row.code === 'projection-equipment-effect-missing'));
  assert.ok(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-foreign'));
});

test('post-commit contract normalizes local DB timestamps and omitted nullable API fields', () => {
  const input = fixture();
  input.apiItemEquipmentEffects[0].sourceRevisionTimestamp = '2026-10-01 08:00:00';
  input.apiItemEquipmentEffects[0].conditionText = undefined;
  input.candidate.dependencyExpectations.projection_equipment_effect_attributes[0].condition_text = null;
  input.projectionEquipmentEffectAttributes[0].condition_text = null;
  const result = buildArmorProjectionApiAcceptance(input);
  assert.equal(result.status, 'verified');
  assert.equal(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-field-drift' && row.field === 'conditionText'), false);
  assert.equal(result.blockers.some(row => row.code === 'api-item-equipment-effect-api-field-drift' && row.field === 'sourceRevisionTimestamp'), false);
});

test('candidate blockers remain binding and cannot be cleared by matching readback', () => {
  const input = fixture();
  input.candidate.acceptance.blockers = [{ code: 'complete-armor-coverage' }];
  const result = buildArmorProjectionApiAcceptance(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some(row => row.code === 'candidate-blocked'));
});
