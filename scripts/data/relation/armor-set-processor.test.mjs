import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArmorSetRelations as buildArmorSetRelationsBase } from './armor-set-processor.mjs';

const MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/items/',
  'http://127.0.0.1:9000/terrapedia-images/items/'
];

function buildArmorSetRelations(options = {}) {
  return buildArmorSetRelationsBase({
    ...options,
    managedImageUrlPrefixes: options.managedImageUrlPrefixes ?? MANAGED_IMAGE_URL_PREFIXES
  });
}

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

const hallowedItems = [
  item(558, 'HallowedHeadgear', 'Hallowed Headgear', { headSlot: 56 }),
  item(553, 'HallowedHelmet', 'Hallowed Helmet', { headSlot: 53 }),
  item(559, 'HallowedMask', 'Hallowed Mask', { headSlot: 57 }),
  item(4898, 'AncientHallowedHeadgear', 'Ancient Hallowed Headgear', { headSlot: 249 }),
  item(4897, 'AncientHallowedHelmet', 'Ancient Hallowed Helmet', { headSlot: 248 }),
  item(4896, 'AncientHallowedMask', 'Ancient Hallowed Mask', { headSlot: 247 }),
  item(551, 'HallowedPlateMail', 'Hallowed Plate Mail', { bodySlot: 24 }),
  item(4900, 'AncientHallowedPlateMail', 'Ancient Hallowed Plate Mail', { bodySlot: 250 }),
  item(552, 'HallowedGreaves', 'Hallowed Greaves', { legSlot: 23 }),
  item(4901, 'AncientHallowedGreaves', 'Ancient Hallowed Greaves', { legSlot: 250 })
];

function hallowedMaintSet() {
  return {
    id: 44,
    record_key: 'hallowed-maint-key',
    text_key: 'ArmorSetBonus.Hallowed',
    benefit_expression: 'ArmorSetBonuses.Benefits.Hallowed',
    primary_part: 'Head',
    set_count: 24,
    unique_item_count: 10,
    sets_json: JSON.stringify([
      [558, 551, 552], [558, 551, 4901], [558, 4900, 552], [558, 4900, 4901],
      [553, 551, 552], [553, 551, 4901], [553, 4900, 552], [553, 4900, 4901],
      [559, 551, 552], [559, 551, 4901], [559, 4900, 552], [559, 4900, 4901],
      [4898, 551, 552], [4898, 551, 4901], [4898, 4900, 552], [4898, 4900, 4901],
      [4897, 551, 552], [4897, 551, 4901], [4897, 4900, 552], [4897, 4900, 4901],
      [4896, 551, 552], [4896, 551, 4901], [4896, 4900, 552], [4896, 4900, 4901]
    ]),
    unique_item_ids_json: JSON.stringify([558, 551, 552, 4901, 4900, 553, 559, 4898, 4897, 4896]),
    raw_json: '{}',
    ...baseTrace
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

test('buildArmorSetRelations prefers wiki armor page sets over effect-key pseudo sets', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Cobalt armor',
        nameZh: '钴盔甲',
        section: 'hardmode',
        effectText: '套装奖励：按头盔提供魔法、远程或近战效果。',
        images: [
          {
            role: 'male',
            fileTitle: 'Cobalt armor.png',
            url: 'https://terraria.wiki.gg/images/Cobalt_armor.png',
            width: 26,
            height: 46,
            contentType: 'image/png'
          },
          {
            role: 'female',
            fileTitle: 'Cobalt armor female.png',
            url: 'https://terraria.wiki.gg/images/Cobalt_armor_female.png',
            width: 26,
            height: 46,
            contentType: 'image/png'
          }
        ],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
      }
    ],
    maintArmorSets: [
      {
        id: 31,
        record_key: 'cobalt-caster',
        text_key: 'ArmorSetBonus.CobaltCaster',
        benefit_expression: 'ArmorSetBonuses.Benefits.CobaltMagic',
        set_count: 1,
        unique_item_count: 3,
        sets_json: JSON.stringify([[0, 371, 374]]),
        unique_item_ids_json: JSON.stringify([0, 371, 374]),
        ...baseTrace
      },
      {
        id: 32,
        record_key: 'cobalt-melee',
        text_key: 'ArmorSetBonus.CobaltMelee',
        benefit_expression: 'ArmorSetBonuses.Benefits.CobaltMelee',
        set_count: 1,
        unique_item_count: 3,
        sets_json: JSON.stringify([[0, 372, 374]]),
        unique_item_ids_json: JSON.stringify([0, 372, 374]),
        ...baseTrace
      }
    ],
    maintItems: [
      item(371, 'CobaltHat', 'Cobalt Hat', { headSlot: 29 }),
      item(372, 'CobaltHelmet', 'Cobalt Helmet', { headSlot: 30 }),
      item(373, 'CobaltMask', 'Cobalt Mask', { headSlot: 31 }),
      item(374, 'CobaltBreastplate', 'Cobalt Breastplate', { bodySlot: 17 }),
      item(375, 'CobaltLeggings', 'Cobalt Leggings', { legSlot: 16 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].textKey, 'WikiArmorSet.Cobalt armor');
  assert.equal(actual.relationArmorSets[0].sourceRevisionTimestamp, '2026-04-28 00:00:00');
  assert.equal(actual.relationArmorSets[0].setCount, 3);
  assert.equal(actual.relationArmorSets[0].uniqueItemCount, 5);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [
    [371, 374, 375],
    [372, 374, 375],
    [373, 374, 375]
  ]);
  assert.equal(JSON.parse(actual.relationArmorSets[0].rawJson).nameZh, '钴盔甲');
  assert.equal(actual.relationArmorSetItems.length, 9);
  assert.equal(actual.relationArmorSetImages.length, 2);
  assert.deepEqual(actual.issues, []);
});

test('buildArmorSetRelations merges wiki page copy with mapped maint armor variants', () => {
  const miningSets = [
    [88, 410, 411],
    [88, 410, 5590],
    [88, 5589, 411],
    [88, 5589, 5590],
    [5588, 410, 411],
    [5588, 410, 5590],
    [5588, 5589, 411],
    [5588, 5589, 5590],
    [4008, 410, 411],
    [4008, 410, 5590],
    [4008, 5589, 411],
    [4008, 5589, 5590]
  ];
  const miningItemIds = [88, 410, 411, 5590, 5589, 5588, 4008];
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Mining armor',
        nameZh: '挖矿盔甲',
        section: 'pre-hardmode',
        effectText: '+20% 挖矿速度\n挖矿头盔和超亮头盔可以互换\n套装奖励：+10% 挖矿速度（总共 +30%）',
        images: [],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
      }
    ],
    armorSetDefinitionMap: {
      records: {
        236: {
          name: '挖矿盔甲',
          internalCode: '挖矿盔甲',
          definition: { textKey: 'ArmorSetBonus.Mining' }
        }
      }
    },
    maintArmorSets: [
      {
        id: 41,
        record_key: 'mining-maint-key',
        text_key: 'ArmorSetBonus.Mining',
        benefit_expression: 'ArmorSetBonuses.Benefits.Mining',
        set_count: 12,
        unique_item_count: 7,
        sets_json: JSON.stringify(miningSets),
        unique_item_ids_json: JSON.stringify(miningItemIds),
        raw_json: '{}',
        ...baseTrace
      }
    ],
    maintItems: [
      item(88, 'MiningHelmet', 'Mining Helmet', { headSlot: 11 }),
      item(4008, 'UltrabrightHelmet', 'Ultrabright Helmet', { headSlot: 11 }),
      item(5588, 'UpgradedMiningHead', 'Prospector Helmet', { headSlot: 285 }),
      item(410, 'MiningShirt', 'Mining Shirt', { bodySlot: 20 }),
      item(5589, 'UpgradedMiningBody', 'Prospector Shirt', { bodySlot: 252 }),
      item(411, 'MiningPants', 'Mining Pants', { legSlot: 19 }),
      item(5590, 'UpgradedMiningLegs', 'Prospector Pants', { legSlot: 240 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].textKey, 'WikiArmorSet.Mining armor');
  assert.equal(actual.relationArmorSets[0].setCount, 1);
  assert.equal(actual.relationArmorSets[0].uniqueItemCount, 7);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [[88, 4008, 5588, 410, 5589, 411, 5590]]);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].uniqueItemIdsJson), [88, 4008, 5588, 410, 5589, 411, 5590]);
  assert.equal(JSON.parse(actual.relationArmorSets[0].rawJson).effectText, '+20% 挖矿速度\n挖矿头盔和超亮头盔可以互换\n套装奖励：+10% 挖矿速度（总共 +30%）');
  assert.equal(actual.relationArmorSetItems.length, 7);
  assert.deepEqual(actual.relationArmorSetItems.map((row) => [row.setVariantIndex, row.partIndex, row.itemSourceId, row.itemInternalName]), [
    [0, 0, 88, 'MiningHelmet'],
    [0, 0, 4008, 'UltrabrightHelmet'],
    [0, 0, 5588, 'UpgradedMiningHead'],
    [0, 1, 410, 'MiningShirt'],
    [0, 1, 5589, 'UpgradedMiningBody'],
    [0, 2, 411, 'MiningPants'],
    [0, 2, 5590, 'UpgradedMiningLegs']
  ]);
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4008 && row.itemInternalName === 'UltrabrightHelmet'));
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 5588 && row.itemInternalName === 'UpgradedMiningHead'));
});

test('buildArmorSetRelations uses generated definition map for wiki alias armor pages', () => {
  const woodSets = [
    [727, 728, 729],
    [733, 734, 735]
  ];
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Rich Mahogany armor',
        nameZh: '红木盔甲',
        section: 'pre-hardmode',
        effectText: '套装奖励：+1 防御',
        images: [],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
      }
    ],
    armorSetDefinitionMap: {
      records: {
        238: {
          name: '红木盔甲',
          internalCode: '红木盔甲',
          definition: { textKey: 'ArmorSetBonus.Wood' }
        }
      }
    },
    maintArmorSets: [
      {
        id: 42,
        record_key: 'wood-maint-key',
        text_key: 'ArmorSetBonus.Wood',
        benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
        set_count: 2,
        unique_item_count: 6,
        sets_json: JSON.stringify(woodSets),
        unique_item_ids_json: JSON.stringify([727, 728, 729, 733, 734, 735]),
        raw_json: '{}',
        ...baseTrace
      }
    ],
    maintItems: [
      item(727, 'WoodHelmet', 'Wood Helmet', { headSlot: 52 }),
      item(728, 'WoodBreastplate', 'Wood Breastplate', { bodySlot: 32 }),
      item(729, 'WoodGreaves', 'Wood Greaves', { legSlot: 31 }),
      item(733, 'RichMahoganyHelmet', 'Rich Mahogany Helmet', { headSlot: 55 }),
      item(734, 'RichMahoganyBreastplate', 'Rich Mahogany Breastplate', { bodySlot: 34 }),
      item(735, 'RichMahoganyGreaves', 'Rich Mahogany Greaves', { legSlot: 33 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].textKey, 'WikiArmorSet.Rich Mahogany armor');
  assert.equal(actual.relationArmorSets[0].setCount, 2);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), woodSets);
  assert.equal(actual.relationArmorSetItems.length, 6);
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 727));
});

test('buildArmorSetRelations does not expand equivalent Hallowed ancient swaps into duplicate page builds', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Hallowed armor',
        nameZh: '神圣盔甲',
        section: 'hardmode',
        compositionKind: 'traditional_set',
        effectText: '+7% 伤害\n每个部件都可以和远古神圣盔甲的部件互换\n神圣头饰：+12% 魔法伤害\n神圣头盔：+15% 远程伤害\n神圣面具：+10% 近战伤害',
        interchangeableSetTitles: ['Ancient Hallowed armor'],
        images: [],
        sourceRevisionTimestamp: '2026-04-04T07:46:03Z'
      }
    ],
    armorSetDefinitionMap: {
      records: {
        286: {
          name: '神圣盔甲',
          internalCode: '神圣盔甲',
          definition: { textKey: 'ArmorSetBonus.Hallowed' }
        }
      }
    },
    maintArmorSets: [
      hallowedMaintSet()
    ],
    maintItems: hallowedItems
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].setCount, 3);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [
    [558, 4898, 551, 4900, 552, 4901],
    [553, 4897, 551, 4900, 552, 4901],
    [559, 4896, 551, 4900, 552, 4901]
  ]);
  assert.equal(actual.relationArmorSetItems.length, 18);
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 551));
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4900));
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 552));
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4901));
});

test('buildArmorSetRelations does not expand equivalent Ancient Hallowed swaps into duplicate page builds', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Ancient Hallowed armor',
        nameZh: '远古神圣盔甲',
        section: 'hardmode',
        compositionKind: 'traditional_set',
        effectText: '+7% 伤害\n每个部件都可以和神圣盔甲的部件互换\n远古神圣头饰：+12% 魔法伤害',
        interchangeableSetTitles: ['Hallowed armor'],
        images: []
      }
    ],
    armorSetDefinitionMap: {
      records: {
        287: {
          name: '远古神圣盔甲',
          internalCode: '远古神圣盔甲',
          definition: { textKey: 'ArmorSetBonus.Hallowed' }
        }
      }
    },
    maintArmorSets: [hallowedMaintSet()],
    maintItems: hallowedItems
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].setCount, 3);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [
    [558, 4898, 551, 4900, 552, 4901],
    [553, 4897, 551, 4900, 552, 4901],
    [559, 4896, 551, 4900, 552, 4901]
  ]);
  assert.equal(actual.relationArmorSetItems.length, 18);
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 551));
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4900));
});

test('buildArmorSetRelations does not expand fully equivalent two-set interchangeable families', () => {
  const cases = [
    {
      pageTitle: 'Snow armor',
      nameZh: '防雪盔甲',
      interchangeableSetTitles: ['Pink Snow armor'],
      effectText: '每个部件都可以和粉色防雪盔甲的部件互换\n套装奖励：免疫冰冻',
      items: [
        item(803, 'EskimoHood', 'Snow Hood', { headSlot: 74 }),
        item(978, 'PinkEskimoHood', 'Pink Snow Hood', { headSlot: 74 }),
        item(804, 'EskimoCoat', 'Snow Coat', { bodySlot: 44 }),
        item(979, 'PinkEskimoCoat', 'Pink Snow Coat', { bodySlot: 44 }),
        item(805, 'EskimoPants', 'Snow Pants', { legSlot: 43 }),
        item(980, 'PinkEskimoPants', 'Pink Snow Pants', { legSlot: 43 })
      ]
    },
    {
      pageTitle: 'Jungle armor',
      nameZh: '丛林盔甲',
      interchangeableSetTitles: ['Ancient Cobalt armor'],
      effectText: '每个部件都可以和远古钴盔甲的部件互换\n套装奖励：魔力消耗降低',
      items: [
        item(228, 'JungleHat', 'Jungle Hat', { headSlot: 41 }),
        item(960, 'AncientCobaltHelmet', 'Ancient Cobalt Helmet', { headSlot: 41 }),
        item(229, 'JungleShirt', 'Jungle Shirt', { bodySlot: 9 }),
        item(961, 'AncientCobaltBreastplate', 'Ancient Cobalt Breastplate', { bodySlot: 9 }),
        item(230, 'JunglePants', 'Jungle Pants', { legSlot: 8 }),
        item(962, 'AncientCobaltLeggings', 'Ancient Cobalt Leggings', { legSlot: 8 })
      ]
    },
    {
      pageTitle: 'Ancient Shadow armor',
      nameZh: '远古暗影盔甲',
      interchangeableSetTitles: ['Shadow armor'],
      effectText: '每个部件都可以和暗影盔甲的部件互换\n套装奖励：移动速度提高',
      items: [
        item(956, 'AncientShadowHelmet', 'Ancient Shadow Helmet', { headSlot: 39 }),
        item(100, 'ShadowHelmet', 'Shadow Helmet', { headSlot: 39 }),
        item(957, 'AncientShadowScalemail', 'Ancient Shadow Scalemail', { bodySlot: 7 }),
        item(101, 'ShadowScalemail', 'Shadow Scalemail', { bodySlot: 7 }),
        item(958, 'AncientShadowGreaves', 'Ancient Shadow Greaves', { legSlot: 6 }),
        item(102, 'ShadowGreaves', 'Shadow Greaves', { legSlot: 6 })
      ]
    }
  ];

  for (const fixture of cases) {
    const actual = buildArmorSetRelations({
      wikiArmorSets: [
        {
          pageTitle: fixture.pageTitle,
          nameZh: fixture.nameZh,
          section: 'pre-hardmode',
          compositionKind: 'traditional_set',
          interchangeableSetTitles: fixture.interchangeableSetTitles,
          effectText: fixture.effectText,
          images: []
        }
      ],
      maintItems: fixture.items
    });

    assert.equal(actual.relationArmorSets.length, 1, fixture.pageTitle);
    assert.equal(actual.relationArmorSets[0].setCount, 1, fixture.pageTitle);
    assert.equal(JSON.parse(actual.relationArmorSets[0].setsJson)[0].length, 6, fixture.pageTitle);
    assert.equal(actual.relationArmorSetItems.length, 6, fixture.pageTitle);
  }
});

test('buildArmorSetRelations collapses equivalent variants from a shared generated definition group', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Snow armor',
        nameZh: '防雪盔甲',
        section: 'pre-hardmode',
        compositionKind: 'traditional_set',
        effectText: '套装奖励：免疫冷冻和冰冻减益',
        images: []
      }
    ],
    armorSetDefinitionMap: {
      records: {
        261: {
          name: '防雪盔甲',
          internalCode: '防雪盔甲',
          definition: { textKey: 'ArmorSetBonus.Snow' }
        }
      }
    },
    maintArmorSets: [
      {
        id: 46,
        record_key: 'snow-maint-key',
        text_key: 'ArmorSetBonus.Snow',
        benefit_expression: 'ArmorSetBonuses.Benefits.Snow',
        set_count: 8,
        unique_item_count: 6,
        sets_json: JSON.stringify([
          [803, 804, 805], [803, 804, 980], [803, 979, 805], [803, 979, 980],
          [978, 804, 805], [978, 804, 980], [978, 979, 805], [978, 979, 980]
        ]),
        unique_item_ids_json: JSON.stringify([803, 804, 805, 978, 979, 980]),
        raw_json: '{}',
        ...baseTrace
      }
    ],
    maintItems: [
      item(803, 'EskimoHood', 'Snow Hood', { headSlot: 74 }),
      item(978, 'PinkEskimoHood', 'Pink Snow Hood', { headSlot: 74 }),
      item(804, 'EskimoCoat', 'Snow Coat', { bodySlot: 44 }),
      item(979, 'PinkEskimoCoat', 'Pink Snow Coat', { bodySlot: 44 }),
      item(805, 'EskimoPants', 'Snow Pants', { legSlot: 43 }),
      item(980, 'PinkEskimoPants', 'Pink Snow Pants', { legSlot: 43 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  assert.equal(actual.relationArmorSets[0].setCount, 1);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [[803, 978, 804, 979, 805, 980]]);
  assert.equal(actual.relationArmorSetItems.length, 6);
});

test('buildArmorSetRelations reuses managed maint armor image cache for wiki armor page rows', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Wood armor',
        nameEn: 'Wood armor',
        images: [
          {
            role: 'male',
            fileTitle: 'Wood armor.png',
            url: 'https://terraria.wiki.gg/images/Wood_armor.png?ef83ed',
            contentType: 'image/png'
          },
          {
            role: 'female',
            fileTitle: 'Wood armor female.png',
            url: 'https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10',
            contentType: 'image/png'
          }
        ],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
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
        page_title: 'Wood armor',
        image_role: 'male',
        source_file_title: 'Wood_armor.png',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor.png?ef83ed',
        cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood-armor.png',
        ...baseTrace
      },
      {
        text_key: 'ArmorSetBonus.Wood',
        page_title: 'Wood armor',
        image_role: 'female',
        source_file_title: 'Wood_armor_female.png',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10',
        cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood-armor-female.png',
        ...baseTrace
      }
    ]
  });

  assert.equal(actual.relationArmorSetImages.length, 2);
  assert.deepEqual(
    actual.relationArmorSetImages.map((row) => row.cachedUrl),
    [
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood-armor.png',
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood-armor-female.png'
    ]
  );
});

test('buildArmorSetRelations carries managed maint armor set image urls into relation rows', () => {
  const result = buildArmorSetRelations({
    wikiArmorSets: [{
      pageTitle: 'Wood armor',
      entityType: 'armor_set',
      compositionKind: 'traditional_set',
      images: [{
        role: 'male',
        fileTitle: 'Wood armor.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor.png'
      }]
    }],
    maintItems: [
      item(1, 'WoodHelmet', 'Wood Helmet', { headSlot: 1 }),
      item(2, 'WoodBreastplate', 'Wood Breastplate', { bodySlot: 1 }),
      item(3, 'WoodGreaves', 'Wood Greaves', { legSlot: 1 })
    ],
    maintArmorSetImages: [{
      pageTitle: 'Wood armor',
      imageRole: 'male',
      sourceFileTitle: 'Wood armor.png',
      originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
      cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png'
    }],
    managedImageUrlPrefixes: ['http://localhost:9000/terrapedia-images']
  });

  assert.equal(result.relationArmorSetImages.length, 1);
  assert.equal(result.relationArmorSetImages[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png');
});

test('buildArmorSetRelations rejects cached armor image rows when managed prefixes are empty', () => {
  const actual = buildArmorSetRelationsBase({
    wikiArmorSets: [
      {
        pageTitle: 'Wood armor',
        nameEn: 'Wood armor',
        images: [
          {
            role: 'male',
            fileTitle: 'Wood armor.png',
            url: 'https://terraria.wiki.gg/images/Wood_armor.png?ef83ed',
            contentType: 'image/png'
          }
        ]
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
        page_title: 'Wood armor',
        image_role: 'male',
        source_file_title: 'Wood_armor.png',
        original_url: 'https://terraria.wiki.gg/images/Wood_armor.png?ef83ed',
        cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood-armor.png',
        ...baseTrace
      }
    ],
    managedImageUrlPrefixes: []
  });

  assert.equal(actual.relationArmorSetImages.length, 1);
  assert.equal(actual.relationArmorSetImages[0].cachedUrl, null);
});

test('buildArmorSetRelations reuses existing relation armor image cache for wiki armor page rows', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Rich Mahogany armor',
        nameEn: 'Rich Mahogany armor',
        images: [
          {
            role: 'male',
            fileTitle: 'Rich Mahogany armor.png',
            url: 'https://terraria.wiki.gg/images/Rich_Mahogany_armor.png?c357dd',
            contentType: 'image/png'
          }
        ],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
      }
    ],
    maintItems: [
      item(733, 'RichMahoganyHelmet', 'Rich Mahogany Helmet', { headSlot: 52 }),
      item(734, 'RichMahoganyBreastplate', 'Rich Mahogany Breastplate', { bodySlot: 32 }),
      item(735, 'RichMahoganyGreaves', 'Rich Mahogany Greaves', { legSlot: 31 })
    ],
    existingRelationArmorSetImages: [
      {
        text_key: 'WikiArmorSet.Rich Mahogany armor',
        image_role: 'male',
        source_file_title: 'Rich Mahogany armor.png',
        original_url: 'https://terraria.wiki.gg/images/Rich_Mahogany_armor.png?c357dd',
        cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/rich-mahogany-armor.png',
        ...baseTrace
      }
    ]
  });

  assert.equal(actual.relationArmorSetImages.length, 1);
  assert.equal(
    actual.relationArmorSetImages[0].cachedUrl,
    'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/rich-mahogany-armor.png'
  );
});

test('buildArmorSetRelations does not mirror untrusted managed-like armor cached urls from maint rows', () => {
  const actual = buildArmorSetRelations({
    maintArmorSets: [
      {
        id: 1,
        record_key: 'wood-maint-key',
        text_key: 'ArmorSetBonus.Wood',
        benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
        set_count: 1,
        unique_item_count: 3,
        sets_json: JSON.stringify([[727, 728, 729]]),
        unique_item_ids_json: JSON.stringify([727, 728, 729]),
        raw_json: '{}',
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
        cached_url: 'https://evil.example.com/terrapedia-images/items/wiki/armor-sets/wood-armor.png',
        ...baseTrace
      }
    ]
  });

  assert.equal(actual.relationArmorSetImages.length, 1);
  assert.equal(actual.relationArmorSetImages[0].cachedUrl, null);
});

test('buildArmorSetRelations preserves single-piece composition metadata', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Magic Hat',
        nameEn: 'Magic Hat',
        nameZh: 'Magic Hat',
        entityType: 'armor_set',
        compositionKind: 'single_piece_set',
        section: 'wizard-set',
        effectText: '+60 mana',
        images: [
          {
            role: 'male',
            fileTitle: 'Magic Hat (equipped).png',
            url: 'https://terraria.wiki.gg/images/Magic_Hat_%28equipped%29.png',
            contentType: 'image/png'
          }
        ],
        sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
      }
    ],
    maintItems: [
      item(2275, 'MagicHat', 'Magic Hat', { headSlot: 80 })
    ]
  });

  assert.equal(actual.relationArmorSets.length, 1);
  const raw = JSON.parse(actual.relationArmorSets[0].rawJson);
  assert.equal(raw.entityType, 'armor_set');
  assert.equal(raw.compositionKind, 'single_piece_set');
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [[2275]]);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].uniqueItemIdsJson), [2275]);
  assert.equal(actual.relationArmorSetItems.length, 1);
  assert.equal(actual.relationArmorSetItems[0].setVariantIndex, 0);
  assert.equal(actual.relationArmorSetItems[0].partIndex, 0);
  assert.equal(actual.relationArmorSetItems[0].itemSourceId, 2275);
  assert.equal(actual.relationArmorSetItems[0].partRole, 'head');
  assert.deepEqual(actual.issues, []);
});
