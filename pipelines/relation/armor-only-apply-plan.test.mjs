import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRelationApplyPlan } from './sync-maint-to-relation.mjs';

test('Armor-only relation apply clears and writes only Armor-owned tables', () => {
  const plan = buildRelationApplyPlan(['armor']);
  assert.equal(plan.armorOnly, true);
  assert.deepEqual(plan.clearTables, [
    'relation_armor_set_images',
    'relation_equipment_effect_attributes',
    'relation_armor_attribute_rows',
    'relation_armor_set_items',
    'relation_armor_sets',
    'projection_armor_sets',
    'projection_item_armor_attributes',
    'projection_equipment_effect_attributes',
  ]);
  assert.deepEqual(plan.writeEntries, [
    ['relation_armor_sets', 'relationArmorSets'],
    ['relation_armor_set_items', 'relationArmorSetItems'],
    ['relation_armor_attribute_rows', 'relationArmorAttributeRows'],
    ['relation_equipment_effect_attributes', 'relationEquipmentEffectAttributes'],
    ['relation_armor_set_images', 'relationArmorSetImages'],
    ['projection_armor_sets', 'projectionArmorSets'],
    ['projection_item_armor_attributes', 'projectionItemArmorAttributes'],
    ['projection_equipment_effect_attributes', 'projectionEquipmentEffectAttributes'],
  ]);
  assert.equal(plan.runPostApplyProjectionReconciliation, false);
});
