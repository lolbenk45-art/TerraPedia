import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArmorSetRelations } from './armor-set-processor.mjs';

const baseTrace = {
  source_provider: 'terraria.wiki.gg',
  source_page: 'Module:ArmorSetBonuses',
  source_revision_timestamp: '2026-04-26T00:00:00.000Z',
  landing_source_id: 10,
  landing_source_key: 'wiki.module.armorsetbonuses',
  landing_content_hash: 'a'.repeat(64)
};

function item(sourceId, internalName, englishName, raw) {
  return {
    source_id: sourceId,
    internal_name: internalName,
    english_name: englishName,
    raw_json: JSON.stringify(raw),
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    landing_source_id: 11,
    landing_source_key: 'wiki.module.iteminfo',
    landing_content_hash: 'b'.repeat(64)
  };
}

test('buildArmorSetRelations expands armor set variants into slot-aware item rows', () => {
  const actual = buildArmorSetRelations({
    maintArmorSets: [
      {
        id: 1,
        record_key: 'wood-maint-key',
        text_key: 'ArmorSetBonus.Wood',
        benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
        primary_part: null,
        set_count: 1,
        unique_item_count: 3,
        sets_json: JSON.stringify([[727, 728, 729]]),
        unique_item_ids_json: JSON.stringify([727, 728, 729]),
        raw_json: JSON.stringify({
          textKey: 'ArmorSetBonus.Wood',
          sets: [[727, 728, 729]],
          uniqueItemIds: [727, 728, 729]
        }),
        ...baseTrace
      }
    ],
    maintItems: [
      item(727, 'WoodHelmet', 'Wood Helmet', { headSlot: 52 }),
      item(728, 'WoodBreastplate', 'Wood Breastplate', { bodySlot: 32 }),
      item(729, 'WoodGreaves', 'Wood Greaves', { legSlot: 31 })
    ],
    maintArmorSetImages: [
      {
        text_key: 'ArmorSetBonus.Wood',
        image_role: 'male',
        source_file_title: 'Wood armor.png',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor.png',
        width: 64,
        height: 64,
        content_type: 'image/png',
        is_primary: 1,
        sort_order: 0,
        raw_json: '{}',
        ...baseTrace
      },
      {
        text_key: 'ArmorSetBonus.Wood',
        image_role: 'female',
        source_file_title: 'Wood armor female.png',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        width: 64,
        height: 64,
        content_type: 'image/png',
        is_primary: 0,
        sort_order: 1,
        raw_json: '{}',
        ...baseTrace
      },
      {
        text_key: 'ArmorSetBonus.Wood',
        image_role: 'demo',
        source_file_title: 'Wood armor demo.gif',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor_demo.gif',
        width: 96,
        height: 64,
        content_type: 'image/gif',
        is_primary: 0,
        sort_order: 2,
        raw_json: '{}',
        ...baseTrace
      }
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].textKey, 'ArmorSetBonus.Wood');
  assert.equal(actual.relationArmorSets[0].setCount, 1);
  assert.equal(actual.relationArmorSetItems.length, 3);
  assert.deepEqual(
    actual.relationArmorSetItems.map((row) => [row.itemSourceId, row.partRole, row.slotType, row.equipmentSlotId]),
    [
      [727, 'head', 'headSlot', 52],
      [728, 'body', 'bodySlot', 32],
      [729, 'legs', 'legSlot', 31]
    ]
  );
  assert.equal(actual.relationArmorSetImages.length, 3);
  assert.deepEqual(actual.relationArmorSetImages.map((row) => row.imageRole), ['male', 'female', 'demo']);
  assert.deepEqual(actual.issues, []);
});

test('buildArmorSetRelations preserves set variant index and reports missing items', () => {
  const actual = buildArmorSetRelations({
    maintArmorSets: [
      {
        id: 2,
        record_key: 'variant-maint-key',
        text_key: 'ArmorSetBonus.Adamantite',
        benefit_expression: 'ArmorSetBonuses.Benefits.Adamantite',
        primary_part: 1,
        set_count: 2,
        unique_item_count: 4,
        sets_json: JSON.stringify([[400, 401, 402], [403, 401, 402]]),
        unique_item_ids_json: JSON.stringify([400, 401, 402, 403]),
        raw_json: '{}',
        ...baseTrace
      }
    ],
    maintItems: [
      item(400, 'AdamantiteHeadgear', 'Adamantite Headgear', { headSlot: 1 }),
      item(401, 'AdamantiteBreastplate', 'Adamantite Breastplate', { bodySlot: 1 }),
      item(402, 'AdamantiteLeggings', 'Adamantite Leggings', { legSlot: 1 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSetItems.length, 6);
  assert.deepEqual(
    actual.relationArmorSetItems.map((row) => row.setVariantIndex),
    [0, 0, 0, 1, 1, 1]
  );
  const missing = actual.relationArmorSetItems.find((row) => row.itemSourceId === 403);
  assert.equal(missing.itemInternalName, null);
  assert.equal(missing.reviewStatus, 'unresolved');
  assert.equal(actual.issues.length, 1);
  assert.equal(actual.issues[0].code, 'armor_set_item_missing');
  assert.equal(actual.issues[0].textKey, 'ArmorSetBonus.Adamantite');
  assert.equal(actual.issues[0].itemSourceId, 403);
});
