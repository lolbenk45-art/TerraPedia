import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItemFieldCoverageAudit } from './item-field-coverage-audit.mjs';

test('buildItemFieldCoverageAudit reports raw-vs-normalized coverage gaps per item field', () => {
  const audit = buildItemFieldCoverageAudit({
    maintItems: [
      {
        internal_name: 'Torch',
        raw_json: JSON.stringify({ damage: 0, defense: 0, knockBack: 0, useTime: 0, maxStack: 9999, value: 0, rare: 1 }),
        combat_value: null,
        defense_value: null,
        use_time: null,
        stack_size: null,
        major_value: null,
      },
      {
        internal_name: 'IronPickaxe',
        raw_json: JSON.stringify({ damage: 5, defense: 0, knockBack: 2.5, useTime: 20, maxStack: 1, value: 2000, rare: 1 }),
        combat_value: 5,
        defense_value: 0,
        use_time: 20,
        stack_size: 1,
        major_value: 2000,
      },
    ],
    maintItemPages: [
      { item_internal_name: 'Torch', sell_value: null },
      { item_internal_name: 'IronPickaxe', sell_value: 1000 },
    ],
    maintItemImages: [
      { item_internal_name: 'IronPickaxe' },
    ],
    maintItemTextOverrides: [
      { item_internal_name: 'Torch', tooltip_zh: '火把', description_zh: '基础光源' },
    ],
  });

  assert.equal(audit.summary.itemCount, 2);
  assert.equal(audit.fields.damage.rawPresent, 2);
  assert.equal(audit.fields.damage.normalizedPresent, 1);
  assert.equal(audit.fields.stackSize.rawPresent, 2);
  assert.equal(audit.fields.stackSize.normalizedPresent, 1);
  assert.equal(audit.fields.sell.normalizedPresent, 1);
  assert.equal(audit.fields.image.normalizedPresent, 1);
  assert.equal(audit.fields.tooltipZh.normalizedPresent, 1);
  assert.equal(audit.fields.descriptionZh.normalizedPresent, 1);
  assert.deepEqual(audit.fields.damage.sampleRawOnlyItems, ['Torch']);
  assert.deepEqual(audit.fields.stackSize.sampleRawOnlyItems, ['Torch']);
});
