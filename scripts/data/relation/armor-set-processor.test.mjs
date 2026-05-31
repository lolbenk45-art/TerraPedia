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
  assert.equal(actual.relationArmorSets[0].setCount, 12);
  assert.equal(actual.relationArmorSets[0].uniqueItemCount, 7);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), miningSets);
  assert.deepEqual(JSON.parse(actual.relationArmorSets[0].uniqueItemIdsJson), miningItemIds);
  assert.equal(JSON.parse(actual.relationArmorSets[0].rawJson).effectText, '+20% 挖矿速度\n挖矿头盔和超亮头盔可以互换\n套装奖励：+10% 挖矿速度（总共 +30%）');
  assert.equal(actual.relationArmorSetItems.length, 36);
  assert.deepEqual(actual.relationArmorSetItems.slice(0, 6).map((row) => [row.setVariantIndex, row.partIndex, row.itemSourceId, row.itemInternalName]), [
    [0, 0, 88, 'MiningHelmet'],
    [0, 1, 410, 'MiningShirt'],
    [0, 2, 411, 'MiningPants'],
    [1, 0, 88, 'MiningHelmet'],
    [1, 1, 410, 'MiningShirt'],
    [1, 2, 5590, 'UpgradedMiningLegs']
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
