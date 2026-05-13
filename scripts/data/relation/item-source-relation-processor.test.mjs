import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItemSourceRelations } from './item-source-relation-processor.mjs';

test('buildItemSourceRelations splits resolved shop and unresolved drops', () => {
  const acornRows = [
    {
      id: 1,
      record_key: '1'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_name: 'Dryad',
      biome_code: 'crimson',
      sort_order: 0,
      raw_json: JSON.stringify({ sourceRefName: 'Dryad', sourceProvider: 'wiki_gg' }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn'
    },
    {
      id: 2,
      record_key: '2'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'drop',
      source_ref_type: 'npc',
      source_ref_name: 'Ash tree',
      biome_code: 'crimson',
      sort_order: 1,
      raw_json: JSON.stringify({
        sourceRefName: 'Ash tree',
        quantityMin: 1,
        quantityMax: 2,
        chanceValue: 0.141429,
        chanceText: '14.1429%',
        sourceRefResolution: 'no_match'
      }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn'
    },
    {
      id: 3,
      record_key: '3'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_name: 'Dryad for',
      biome_code: 'crimson',
      sort_order: 2,
      raw_json: JSON.stringify({ sourceRefName: 'Dryad for', notes: 'purchased from the Dryad for 10 CC each' }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn'
    }
  ];

  const actual = buildItemSourceRelations({
    itemSourceRows: acornRows,
    npcIndex: new Map([['Dryad', { source_id: 20, internal_name: 'Dryad', name: 'Dryad' }]])
  });

  assert.equal(actual.sourceFacts.length, 3);
  assert.equal(actual.sourceDetails.length, 3);
  assert.equal(actual.npcShopRelations.length, 1);
  assert.equal(actual.npcLootRelations.length, 0);
  assert.ok(actual.issues.some((issue) => issue.reason === 'npc_source_unresolved'));
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.auditStatus === 'blocked' && audit.reasonCode === 'source_ref_is_not_npc'));
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.auditStatus === 'polluted'));
  assert.equal(actual.npcShopCandidates, undefined);
  assert.equal(actual.npcLootCandidates, undefined);
  const pollutedIssue = actual.issues.find((issue) => issue.reason === 'source_ref_text_polluted');
  assert.ok(pollutedIssue);
  assert.equal(pollutedIssue.reviewStatus, 'candidate_low_confidence');
  assert.equal(pollutedIssue.confidence, 0.4);
  assert.equal(actual.npcShopRelations[0].npcInternalName, 'Dryad');
  assert.equal(actual.npcShopRelations[0].itemName, 'Acorn');
  assert.equal(JSON.parse(actual.npcShopRelations[0].rawJson).sourceRefName, 'Dryad');
  assert.equal(actual.npcShopRelations[0].reason, 'npc_shop_relation_resolved');
  assert.equal(actual.npcShopRelations[0].conditionParseStatus, 'unparsed');
  assert.equal(actual.npcShopRelations[0].conditionBiomeCode, null);
  assert.match(actual.npcShopRelations[0].conditionSourceText, /purchased from the Dryad/i);

  const ashTreeDetail = actual.sourceDetails.find((row) => row.sourceRefName === 'Ash tree');
  assert.ok(ashTreeDetail);
  assert.equal(ashTreeDetail.quantityMin, 1);
  assert.equal(ashTreeDetail.quantityMax, 2);
  assert.equal(ashTreeDetail.chanceText, '14.1429%');
  assert.equal(ashTreeDetail.sourceRefResolution, 'no_match');
});

test('buildItemSourceRelations respects upstream resolved internal-name metadata and normalizes detail output', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 4,
        record_key: '4'.repeat(64),
        item_internal_name: 'Acorn',
        item_name: 'Acorn',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Dryad Alias',
        biome_code: 'crimson',
        sort_order: 3,
        raw_json: JSON.stringify({
          sourceRefName: 'Dryad Alias',
          sourceRefInternalName: 'Dryad',
          sourceRefResolution: 'resolved',
          quantityMin: 1,
          quantityMax: 1,
          chanceText: '5%',
          conditions: '5% ( Night )'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Acorn'
      }
    ],
    npcIndex: new Map([['Dryad', { source_id: 20, internal_name: 'Dryad', name: 'Dryad' }]])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemName, 'Acorn');
  assert.equal(JSON.parse(actual.npcLootRelations[0].rawJson).sourceRefInternalName, 'Dryad');
  assert.equal(actual.issues.filter((issue) => issue.reason === 'npc_source_unresolved').length, 0);

  const detail = actual.sourceDetails[0];
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Dryad');
  assert.equal(actual.npcLootRelations[0].reason, 'npc_loot_relation_resolved');
  assert.equal(actual.npcLootRelations[0].conditionParseStatus, 'parsed');
  assert.equal(actual.npcLootRelations[0].conditionTimeCode, 'night');
  assert.equal(detail.sourceRefInternalName, 'Dryad');
  assert.equal(detail.sourceRefResolution, 'resolved');
});

test('buildItemSourceRelations keeps reviewed non-NPC exclusions out of loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 14,
        record_key: 'e'.repeat(64),
        item_internal_name: 'GoldCoin',
        item_name: 'Gold Coin',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Gold Chest',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Gold Chest',
          sourceRefInternalName: 'GoldChestNpcLikeName',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '100%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Gold Coin'
      }
    ],
    npcIndex: new Map([['Gold Chest', { source_id: 999, internal_name: 'GoldChestNpcLikeName', name: 'Gold Chest' }]]),
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'exact',
      sourceRefName: 'Gold Chest',
      reason: 'chest_container'
    }]
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.sourceDetails[0].sourceRefInternalName, 'GoldChestNpcLikeName');
  assert.equal(actual.sourceDetails[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'chest_container');
});

test('buildItemSourceRelations keeps reviewed source-only item exclusions terminal', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 24,
        record_key: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
        item_internal_name: null,
        item_name: 'Suspicious Looking Egg',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Corrupt Bunny',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemName: 'Suspicious Looking Egg',
          sourceRefName: 'Corrupt Bunny',
          sourceRefInternalName: 'CorruptBunny',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '',
          chanceText: '100% @normal',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Corrupt Bunny'
      }
    ],
    npcIndex: new Map([
      ['Corrupt Bunny', { source_id: 48, internal_name: 'CorruptBunny', name: 'Corrupt Bunny' }]
    ]),
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'CorruptBunny',
      itemName: 'Suspicious Looking Egg',
      recordKey: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
      chanceText: '100% @normal',
      quantityText: '',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny',
      reason: 'legacy_only_item_not_in_current_corpus',
      evidenceSource: 'docs/audits/2026-05-13_npc-source-only-item-review.md'
    }]
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'excluded');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'legacy_only_item_not_in_current_corpus');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'excluded');
  assert.equal(actual.sourceFacts[0].reason, 'legacy_only_item_not_in_current_corpus');
});

test('buildItemSourceRelations requires exact source URL for source-only item exclusions', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 26,
        record_key: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
        item_internal_name: null,
        item_name: 'Suspicious Looking Egg',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Corrupt Bunny',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemName: 'Suspicious Looking Egg',
          sourceRefName: 'Corrupt Bunny',
          sourceRefInternalName: 'CorruptBunny',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '',
          chanceText: '100% @normal',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny'
        })
      }
    ],
    npcIndex: new Map([
      ['Corrupt Bunny', { source_id: 48, internal_name: 'CorruptBunny', name: 'Corrupt Bunny' }]
    ]),
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'CorruptBunny',
      itemName: 'Suspicious Looking Egg',
      recordKey: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
      chanceText: '100% @normal',
      quantityText: '',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny#History',
      reason: 'legacy_only_item_not_in_current_corpus'
    }]
  });

  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'unresolved');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'item_unresolved');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'unresolved');
});

test('buildItemSourceRelations does not apply source-only exclusions after item identity resolves', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 25,
        record_key: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
        item_internal_name: null,
        item_name: 'Suspicious Looking Egg',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Corrupt Bunny',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemName: 'Suspicious Looking Egg',
          sourceRefName: 'Corrupt Bunny',
          sourceRefInternalName: 'CorruptBunny',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '',
          chanceText: '100% @normal',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny'
        })
      }
    ],
    npcIndex: new Map([
      ['Corrupt Bunny', { source_id: 48, internal_name: 'CorruptBunny', name: 'Corrupt Bunny' }]
    ]),
    itemIndex: new Map([
      ['Suspicious Looking Egg', { source_id: 9001, internal_name: 'SuspiciousLookingEgg', english_name: 'Suspicious Looking Egg' }],
      ['suspicious looking egg', { source_id: 9001, internal_name: 'SuspiciousLookingEgg', english_name: 'Suspicious Looking Egg' }]
    ]),
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'CorruptBunny',
      itemName: 'Suspicious Looking Egg',
      recordKey: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
      chanceText: '100% @normal',
      quantityText: '',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny',
      reason: 'legacy_only_item_not_in_current_corpus'
    }]
  });

  assert.equal(actual.itemNpcRelationAudits.some((audit) => audit.auditStatus === 'excluded'), false);
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'SuspiciousLookingEgg');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'resolved');
});

test('buildItemSourceRelations materializes reviewed page-level shared loot to explicit NPC target', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 16,
        record_key: 'g'.repeat(64),
        item_internal_name: 'ScarecrowHat',
        item_name: 'Scarecrow Hat',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Scarecrow',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Scarecrow',
          sourceRefInternalName: 'Scarecrow7',
          sourceRefResolution: 'reviewed_page_level_shared_loot',
          reviewedSharedLootEvidenceSource: 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md',
          quantityText: '1',
          chanceText: '0.37%-3.33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Scarecrow'
      }
    ],
    npcIndex: new Map([
      ['Scarecrow', [
        { source_id: 305, internal_name: 'Scarecrow1', name: 'Scarecrow' },
        { source_id: 311, internal_name: 'Scarecrow7', name: 'Scarecrow' }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Scarecrow7');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'ScarecrowHat');
  assert.equal(actual.sourceDetails[0].sourceRefInternalName, 'Scarecrow7');
  assert.equal(actual.sourceDetails[0].sourceRefResolution, 'reviewed_page_level_shared_loot');
  assert.equal(JSON.parse(actual.npcLootRelations[0].rawJson).reviewedSharedLootEvidenceSource, 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md');
});

test('buildItemSourceRelations keeps boss rewards out of ordinary NPC loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 15,
        record_key: 'f'.repeat(64),
        item_internal_name: 'Binoculars',
        item_name: 'Binoculars',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Eye of Cthulhu',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Eye of Cthulhu',
          sourceRefInternalName: 'EyeofCthulhu',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '2.5% @normal'
        }),
        landing_source_id: 51,
        landing_source_key: 'manual.npc_mimic_exact_row',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Binoculars'
      }
    ],
    npcIndex: new Map([
      ['Eye of Cthulhu', {
        source_id: 4,
        internal_name: 'EyeofCthulhu',
        name: 'Eye of Cthulhu',
        flags_json: JSON.stringify({ boss: true })
      }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'boss_reward_domain_separated');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'blocked');
});

test('buildItemSourceRelations keeps bonusdrop item labels source-only', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 405,
        record_key: 'b'.repeat(64),
        item_internal_name: 'Bomb',
        item_name: 'bonusdrop:Bomb',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Baby Slime',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemName: 'bonusdrop:Bomb',
          sourceRefName: 'Baby Slime',
          sourceRefInternalName: 'BabySlime',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '2-6',
          chanceText: '1/320',
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Baby Slime',
      },
    ],
    npcIndex: new Map([
      ['Baby Slime', { source_id: -5, internal_name: 'BabySlime', name: 'Baby Slime' }],
    ]),
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'mode_or_bonus_bucket');
});

test('buildItemSourceRelations keeps reviewed ordinary slime item-page bonus mirrors source-only', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 406,
        record_key: 'c'.repeat(64),
        item_internal_name: 'Bomb',
        item_name: 'Bomb',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Baby Slime',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'Bomb',
          itemName: 'Bomb',
          sourceRefName: 'Baby Slime',
          sourceRefInternalName: 'BabySlime',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '2-6',
          chanceText: '0.31%',
          sourcePage: 'Bomb',
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Bomb',
      },
    ],
    npcIndex: new Map([
      ['Baby Slime', { source_id: -5, internal_name: 'BabySlime', name: 'Baby Slime' }],
    ]),
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'reviewed_slime_bonus_drop_source_only');
});

test('buildItemSourceRelations promotes exact internal-name npc metadata to formal loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 40,
        record_key: '4'.repeat(64),
        item_internal_name: 'Lens',
        item_name: 'Lens',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Demon Eye',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Demon Eye',
          sourceRefInternalName: 'DemonEye',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Lens'
      }
    ],
    npcIndex: new Map([
      ['Demon Eye', [
        { source_id: 2, internal_name: 'DemonEye', name: 'Demon Eye' },
        { source_id: 190, internal_name: 'DemonEye2', name: 'Demon Eye' }
      ]]
    ])
  });

  assert.equal(actual.sourceFacts[0].reviewStatus, 'resolved');
  assert.equal(actual.sourceDetails[0].sourceRefInternalName, 'DemonEye');
  assert.equal(actual.sourceDetails[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'DemonEye');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'Lens');
  assert.equal(actual.npcLootRelations[0].chanceText, '33%');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations resolves exact internal-name NPC refs across display-name collisions', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 42,
        record_key: '6'.repeat(64),
        item_internal_name: 'MoonCharm',
        item_name: 'Moon Charm',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Vampire',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Vampire',
          sourceRefInternalName: 'Vampire',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '1.67%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Moon Charm'
      },
      {
        id: 43,
        record_key: '7'.repeat(64),
        item_internal_name: 'DepthMeter',
        item_name: 'Depth Meter',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Vampire',
        sort_order: 1,
        raw_json: JSON.stringify({
          sourceRefName: 'Vampire',
          sourceRefInternalName: 'VampireBat',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '1%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Depth Meter'
      }
    ],
    npcIndex: new Map([
      ['Vampire', { source_id: 158, internal_name: 'VampireBat', name: 'Vampire', english_name: 'Vampire' }],
      ['VampireBat', { source_id: 158, internal_name: 'VampireBat', name: 'Vampire', english_name: 'Vampire' }],
      ['VampireInternal', { source_id: 159, internal_name: 'Vampire', name: 'Vampire', english_name: 'Vampire' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 2);
  assert.deepEqual(
    actual.npcLootRelations.map((row) => [row.itemInternalName, row.npcSourceId, row.npcInternalName]).sort(),
    [
      ['DepthMeter', 158, 'VampireBat'],
      ['MoonCharm', 159, 'Vampire']
    ]
  );
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations materializes contract-backed inherited loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 401,
        record_key: 'h'.repeat(64),
        item_internal_name: 'AncientCobaltHelmet',
        item_name: 'Ancient Cobalt Helmet',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Hornet',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Hornet',
          sourceRefInternalName: 'Hornet',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '0.33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Hornet'
      }
    ],
    npcIndex: new Map([
      ['Hornet', [
        { source_id: 42, internal_name: 'Hornet', name: 'Hornet' },
        { source_id: -15, internal_name: 'BigHornetStingy', name: 'Hornet' }
      ]]
    ]),
    inheritanceRules: [{
      targetNpcInternalName: 'BigHornetStingy',
      sourceNpcInternalName: 'Hornet',
      inheritanceKind: 'same_name_variant',
      evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
      reviewedBy: 'test',
      reviewedAt: '2026-05-11'
    }]
  });

  assert.equal(actual.npcLootRelations.length, 2);
  const direct = actual.npcLootRelations.find((row) => row.npcInternalName === 'Hornet');
  const inherited = actual.npcLootRelations.find((row) => row.npcInternalName === 'BigHornetStingy');
  assert.ok(direct);
  assert.ok(inherited);
  assert.equal(inherited.itemInternalName, 'AncientCobaltHelmet');
  assert.equal(inherited.npcSourceId, -15);
  assert.equal(inherited.sourceFactKey, direct.sourceFactKey);
  assert.equal(inherited.reason, 'contract_backed_inherited_loot');
  assert.equal(JSON.parse(inherited.rawJson).inheritedFromNpcInternalName, 'Hornet');
});

test('buildItemSourceRelations suppresses inherited loot when target has direct stable evidence', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 421,
        record_key: 'r'.repeat(64),
        item_internal_name: 'AncientCobaltHelmet',
        item_name: 'Ancient Cobalt Helmet',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Hornet',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Hornet',
          sourceRefInternalName: 'Hornet',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '0.33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Hornet'
      },
      {
        id: 422,
        record_key: 's'.repeat(64),
        item_internal_name: 'AncientCobaltHelmet',
        item_name: 'Ancient Cobalt Helmet',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Hornet',
        sort_order: 1,
        raw_json: JSON.stringify({
          sourceRefName: 'Hornet',
          sourceRefInternalName: 'BigHornetStingy',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '0.33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Hornet'
      }
    ],
    npcIndex: new Map([
      ['Hornet', [
        { source_id: 42, internal_name: 'Hornet', name: 'Hornet' },
        { source_id: -15, internal_name: 'BigHornetStingy', name: 'Hornet' }
      ]]
    ]),
    inheritanceRules: [{
      targetNpcInternalName: 'BigHornetStingy',
      sourceNpcInternalName: 'Hornet',
      inheritanceKind: 'same_name_variant',
      evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
      reviewedBy: 'test',
      reviewedAt: '2026-05-11'
    }]
  });

  const targetRows = actual.npcLootRelations.filter((row) => row.npcInternalName === 'BigHornetStingy');
  assert.equal(targetRows.length, 1);
  assert.equal(targetRows[0].reason, 'npc_loot_relation_resolved');
  assert.equal(targetRows[0].sourceFactKey, actual.npcLootRelations.find((row) => row.npcInternalName === 'BigHornetStingy')?.sourceFactKey);
  assert.equal(actual.npcLootRelations.some((row) => row.reason === 'contract_backed_inherited_loot' && row.npcInternalName === 'BigHornetStingy'), false);
});

test('buildItemSourceRelations builds inherited loot from deduped direct rows', () => {
  const duplicateRow = {
    item_internal_name: 'AncientCobaltHelmet',
    item_name: 'Ancient Cobalt Helmet',
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_name: 'Hornet',
    raw_json: JSON.stringify({
      sourceRefName: 'Hornet',
      sourceRefInternalName: 'Hornet',
      sourceRefResolution: 'exact_internal_name',
      quantityText: '1',
      chanceText: '0.33%'
    }),
    landing_source_id: 51,
    landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
    landing_content_hash: 'f'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Hornet'
  };
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      { ...duplicateRow, id: 431, record_key: 'u'.repeat(64), sort_order: 0 },
      { ...duplicateRow, id: 432, record_key: 'v'.repeat(64), sort_order: 1 }
    ],
    npcIndex: new Map([
      ['Hornet', [
        { source_id: 42, internal_name: 'Hornet', name: 'Hornet' },
        { source_id: -15, internal_name: 'BigHornetStingy', name: 'Hornet' }
      ]]
    ]),
    inheritanceRules: [{
      targetNpcInternalName: 'BigHornetStingy',
      sourceNpcInternalName: 'Hornet',
      inheritanceKind: 'same_name_variant',
      evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
      reviewedBy: 'test',
      reviewedAt: '2026-05-11'
    }]
  });

  assert.equal(actual.npcLootRelations.filter((row) => row.npcInternalName === 'Hornet').length, 1);
  assert.equal(actual.npcLootRelations.filter((row) => row.npcInternalName === 'BigHornetStingy').length, 1);
});

test('buildItemSourceRelations does not fan out inherited loot to uncontracted same-name variants', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 403,
        record_key: 'j'.repeat(64),
        item_internal_name: 'AncientCobaltHelmet',
        item_name: 'Ancient Cobalt Helmet',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Hornet',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Hornet',
          sourceRefInternalName: 'Hornet',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '0.33%'
        })
      }
    ],
    npcIndex: new Map([
      ['Hornet', [
        { source_id: 42, internal_name: 'Hornet', name: 'Hornet' },
        { source_id: -15, internal_name: 'BigHornetStingy', name: 'Hornet' },
        { source_id: -16, internal_name: 'LittleHornetStingy', name: 'Hornet' }
      ]]
    ]),
    inheritanceRules: [{
      targetNpcInternalName: 'BigHornetStingy',
      sourceNpcInternalName: 'Hornet',
      inheritanceKind: 'same_name_variant',
      evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
      reviewedBy: 'test',
      reviewedAt: '2026-05-11'
    }]
  });

  assert.deepEqual(
    actual.npcLootRelations.map((row) => row.npcInternalName).sort(),
    ['BigHornetStingy', 'Hornet']
  );
});

test('buildItemSourceRelations ignores invalid inheritance rules when materializing loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 402,
        record_key: 'i'.repeat(64),
        item_internal_name: 'Lens',
        item_name: 'Lens',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Demon Eye',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Demon Eye',
          sourceRefInternalName: 'DemonEye',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '33%'
        })
      }
    ],
    npcIndex: new Map([
      ['Demon Eye', [
        { source_id: 2, internal_name: 'DemonEye', name: 'Demon Eye' },
        { source_id: 190, internal_name: 'CataractEye', name: 'Demon Eye' }
      ]]
    ]),
    inheritanceRules: [{
      targetNpcInternalName: 'CataractEye',
      sourceNpcInternalName: 'DemonEye',
      inheritanceKind: 'same_display_name',
      evidenceSource: 'https://terraria.wiki.gg/wiki/Demon_Eye',
      reviewedBy: 'test',
      reviewedAt: '2026-05-11'
    }]
  });

  assert.deepEqual(
    actual.npcLootRelations.map((row) => row.npcInternalName),
    ['DemonEye']
  );
});

test('buildItemSourceRelations promotes representative-safe positive ID fallback npc metadata to formal loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 42,
        record_key: '6'.repeat(64),
        item_internal_name: 'BloodHamaxe',
        item_name: 'Blood Hamaxe',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Blood Eel',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Blood Eel',
          sourceRefInternalName: 'BloodEelHead',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '12.5%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Blood Hamaxe'
      }
    ],
    npcIndex: new Map([
      ['Blood Eel', [
        { source_id: 618, internal_name: 'BloodEelHead', name: 'Blood Eel' },
        { source_id: 619, internal_name: 'BloodEelBody', name: 'Blood Eel' },
        { source_id: 620, internal_name: 'BloodEelTail', name: 'Blood Eel' }
      ]]
    ])
  });

  assert.equal(actual.sourceFacts[0].reviewStatus, 'resolved');
  assert.equal(actual.sourceDetails[0].sourceRefInternalName, 'BloodEelHead');
  assert.equal(actual.sourceDetails[0].sourceRefResolution, 'positive_id_fallback');
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'BloodEelHead');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'BloodHamaxe');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations keeps unsafe positive ID fallback variants ambiguous', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 43,
        record_key: '7'.repeat(64),
        item_internal_name: 'Bacon',
        item_name: 'Bacon',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Pigron',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Pigron',
          sourceRefInternalName: 'PigronCrimson',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Bacon'
      }
    ],
    npcIndex: new Map([
      ['Pigron', [
        { source_id: 500, internal_name: 'PigronCorruption', name: 'Pigron' },
        { source_id: 501, internal_name: 'PigronCrimson', name: 'Pigron' },
        { source_id: 502, internal_name: 'PigronHallow', name: 'Pigron' }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'ambiguous');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'npc_source_ambiguous');
  const evidence = JSON.parse(actual.itemNpcRelationAudits[0].evidenceJson);
  assert.equal(evidence.raw.sourceRefInternalName, 'PigronCrimson');
  assert.equal(evidence.raw.sourceRefResolution, 'positive_id_fallback');
  assert.deepEqual(evidence.candidateNpcInternalNames, ['PigronCorruption', 'PigronCrimson', 'PigronHallow']);
});

test('buildItemSourceRelations promotes reviewed positive ID fallback target without generic fan-out', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 431,
        record_key: 'p'.repeat(64),
        item_internal_name: 'Bacon',
        item_name: 'Bacon',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Pigron',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Pigron',
          sourceRefInternalName: 'PigronCorruption',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Bacon'
      }
    ],
    npcIndex: new Map([
      ['Pigron', [
        { source_id: 500, internal_name: 'PigronCorruption', name: 'Pigron' },
        { source_id: 501, internal_name: 'PigronCrimson', name: 'Pigron' },
        { source_id: 502, internal_name: 'PigronHallow', name: 'Pigron' }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'PigronCorruption');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'Bacon');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations promotes reviewed tiered DD2 positive ID fallback targets', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 433,
        record_key: 'd'.repeat(64),
        item_internal_name: 'ApprenticeScarf',
        item_name: "Apprentice's Scarf",
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Dark Mage',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Dark Mage',
          sourceRefInternalName: 'DD2DarkMageT1',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '25% 50%'
        }),
        landing_source_id: 51,
        landing_source_key: 'manual.npc_mimic_exact_row',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: "Apprentice's Scarf"
      },
      {
        id: 434,
        record_key: 'e'.repeat(64),
        item_internal_name: 'BookStaff',
        item_name: 'Tome of Infinite Wisdom',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Ogre',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Ogre',
          sourceRefInternalName: 'DD2OgreT2',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '5%'
        }),
        landing_source_id: 51,
        landing_source_key: 'manual.npc_mimic_exact_row',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Tome of Infinite Wisdom'
      }
    ],
    npcIndex: new Map([
      ['Dark Mage', [
        { source_id: 564, internal_name: 'DD2DarkMageT1', name: 'Dark Mage', flags_json: JSON.stringify({ boss: true }) },
        { source_id: 565, internal_name: 'DD2DarkMageT3', name: 'Dark Mage', flags_json: JSON.stringify({ boss: true }) }
      ]],
      ['Ogre', [
        { source_id: 576, internal_name: 'DD2OgreT2', name: 'Ogre', flags_json: JSON.stringify({ boss: true }) },
        { source_id: 577, internal_name: 'DD2OgreT3', name: 'Ogre', flags_json: JSON.stringify({ boss: true }) }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 2);
  assert.deepEqual(
    actual.npcLootRelations.map((row) => row.npcInternalName).sort(),
    ['DD2DarkMageT1', 'DD2OgreT2']
  );
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations keeps unreviewed positive ID fallback targets ambiguous', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 432,
        record_key: 'q'.repeat(64),
        item_internal_name: 'Bacon',
        item_name: 'Bacon',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Pigron',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Pigron',
          sourceRefInternalName: 'PigronCrimson',
          sourceRefResolution: 'positive_id_fallback',
          quantityText: '1',
          chanceText: '33%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Bacon'
      }
    ],
    npcIndex: new Map([
      ['Pigron', [
        { source_id: 500, internal_name: 'PigronCorruption', name: 'Pigron' },
        { source_id: 501, internal_name: 'PigronCrimson', name: 'Pigron' },
        { source_id: 502, internal_name: 'PigronHallow', name: 'Pigron' }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'npc_source_ambiguous');
});

test('buildItemSourceRelations materializes only reviewed ordinary Mimic contract rows from Mimics bucket', () => {
  const baseRow = {
    record_key: 'm'.repeat(64),
    item_name: 'Dual Hook',
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_name: 'Mimics',
    sort_order: 0,
    landing_source_id: 51,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'f'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Dual Hook'
  };
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        ...baseRow,
        id: 44,
        item_internal_name: 'DualHook',
        raw_json: JSON.stringify({
          itemInternalName: 'DualHook',
          sourceRefName: 'Mimics',
          quantityText: '1',
          chanceText: '16.67%'
        })
      },
      {
        ...baseRow,
        id: 45,
        record_key: 'n'.repeat(64),
        item_internal_name: 'DaedalusStormbow',
        item_name: 'Daedalus Stormbow',
        source_page: 'Daedalus Stormbow',
        raw_json: JSON.stringify({
          itemInternalName: 'DaedalusStormbow',
          sourceRefName: 'Mimics',
          quantityText: '1',
          chanceText: '25%'
        })
      }
    ],
    npcIndex: new Map([['Mimic', { source_id: 85, internal_name: 'Mimic', name: 'Mimic' }]])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Mimic');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'DualHook');
  assert.equal(JSON.parse(actual.npcLootRelations[0].rawJson).sourceRefResolution, 'reviewed_mimic_contract');
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.itemInternalName === 'DaedalusStormbow' && audit.auditStatus === 'excluded'));
  assert.equal(actual.sourceFacts.find((fact) => fact.itemInternalName === 'DaedalusStormbow').reason, 'item_bundle_collective_bucket_not_npc_domain_source');
});

test('buildItemSourceRelations excludes item bundle collective buckets from NPC loot materialization', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 245,
        record_key: 'j'.repeat(64),
        item_internal_name: 'JellyfishNecklace',
        item_name: 'Jellyfish Necklace',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Jellyfish',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'JellyfishNecklace',
          sourceRefName: 'Jellyfish',
          sourceRefResolution: 'no_match',
          quantityText: '1',
          chanceText: '1%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Jellyfish Necklace'
      },
      {
        id: 246,
        record_key: 'k'.repeat(64),
        item_internal_name: 'DualHook',
        item_name: 'Dual Hook',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Mimics',
        sort_order: 1,
        raw_json: JSON.stringify({
          itemInternalName: 'DualHook',
          sourceRefName: 'Mimics',
          quantityText: '1',
          chanceText: '16.67%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Dual Hook'
      }
    ],
    npcIndex: new Map([
      ['Mimic', { source_id: 85, internal_name: 'Mimic', name: 'Mimic' }],
      ['Jellyfish', [
        { source_id: 63, internal_name: 'BlueJellyfish', name: 'Blue Jellyfish' },
        { source_id: 64, internal_name: 'PinkJellyfish', name: 'Pink Jellyfish' },
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Mimic');
  assert.equal(actual.sourceFacts.find((fact) => fact.itemInternalName === 'JellyfishNecklace').reason, 'item_bundle_collective_bucket_not_npc_domain_source');
  assert.ok(actual.itemNpcRelationAudits.some((audit) =>
    audit.itemInternalName === 'JellyfishNecklace'
    && audit.auditStatus === 'excluded'
    && audit.reasonCode === 'item_bundle_collective_bucket_not_npc_domain_source'
  ));
});

test('buildItemSourceRelations materializes exact NPC-scoped Mimic variant rows without generic fan-out', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 144,
        record_key: 'c'.repeat(64),
        item_internal_name: 'LifeDrain',
        item_name: 'Life Drain',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Crimson Mimic',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'LifeDrain',
          sourceRefName: 'Crimson Mimic',
          sourceRefInternalName: 'BigMimicCrimson',
          sourceRefResolution: 'exact_internal_name',
          sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' },
          quantityText: '1',
          chanceText: '20%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mimics'
      },
      {
        id: 145,
        record_key: 'd'.repeat(64),
        item_internal_name: 'DaedalusStormbow',
        item_name: 'Daedalus Stormbow',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Mimics',
        sort_order: 1,
        raw_json: JSON.stringify({
          itemInternalName: 'DaedalusStormbow',
          sourceRefName: 'Mimics',
          quantityText: '1',
          chanceText: '25%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Daedalus Stormbow'
      }
    ],
    npcIndex: new Map([
      ['Crimson Mimic', [
        { source_id: 473, internal_name: 'BigMimicCrimson', name: 'Crimson Mimic' }
      ]],
      ['Mimic', { source_id: 85, internal_name: 'Mimic', name: 'Mimic' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'BigMimicCrimson');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'LifeDrain');
  assert.equal(actual.npcLootRelations[0].chanceText, '20%');
  const detail = actual.sourceDetails.find((row) => row.sourceRefName === 'Crimson Mimic');
  assert.equal(detail.sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(detail.sourceRefResolution, 'exact_internal_name');
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.itemInternalName === 'DaedalusStormbow' && audit.auditStatus === 'excluded'));
});

test('buildItemSourceRelations preserves generated npc loot conditionText', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 1,
        record_key: 'npc-item:present-mimic:loot:present',
        item_name: 'Present',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Present Mimic',
        raw_json: JSON.stringify({
          itemName: 'Present',
          conditionText: 'During Christmas only',
          sourceRefName: 'Present Mimic',
          sourceRefInternalName: 'PresentMimic',
          sourceRefResolution: 'exact_internal_name'
        })
      }
    ],
    itemIndex: new Map([
      ['Present', { source_id: 1869, internal_name: 'Present', name: 'Present' }],
      ['present', { source_id: 1869, internal_name: 'Present', name: 'Present' }]
    ]),
    npcIndex: new Map([
      ['Present Mimic', { source_id: 341, internal_name: 'PresentMimic', name: 'Present Mimic' }],
      ['present mimic', { source_id: 341, internal_name: 'PresentMimic', name: 'Present Mimic' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'PresentMimic');
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'Present');
  assert.equal(actual.npcLootRelations[0].conditions, 'During Christmas only');
  assert.equal(actual.npcLootRelations[0].conditionSourceText, 'During Christmas only');
});

test('buildItemSourceRelations preserves duplicate forward NPC loot evidence without duplicating stable loot relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 2531,
        record_key: 'npc-item:reaper:loot:death-sickle:0',
        item_internal_name: 'DeathSickle',
        item_name: 'Death Sickle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Reaper',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'DeathSickle',
          sourceRefName: 'Reaper',
          sourceRefInternalName: 'Reaper',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '2.5%',
          sourceRowIndex: 0
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Reaper'
      },
      {
        id: 2532,
        record_key: 'npc-item:reaper:loot:death-sickle:1',
        item_internal_name: 'DeathSickle',
        item_name: 'Death Sickle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Reaper',
        sort_order: 1,
        raw_json: JSON.stringify({
          itemInternalName: 'DeathSickle',
          sourceRefName: 'Reaper',
          sourceRefInternalName: 'Reaper',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '2.5%',
          sourceRowIndex: 1
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Reaper'
      }
    ],
    npcIndex: new Map([
      ['Reaper', { source_id: 253, internal_name: 'Reaper', name: 'Reaper' }],
      ['reaper', { source_id: 253, internal_name: 'Reaper', name: 'Reaper' }]
    ])
  });

  assert.equal(actual.sourceFacts.length, 2);
  assert.equal(actual.sourceDetails.length, 2);
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].sourceMaintRecordKey, 'npc-item:reaper:loot:death-sickle:1');
});

test('buildItemSourceRelations keeps distinct NPC loot chance and condition rows', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 2531,
        record_key: 'npc-item:ice-mimic:loot:extractinator:normal',
        item_internal_name: 'Extractinator',
        item_name: 'Extractinator',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Ice Mimic',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'Extractinator',
          sourceRefName: 'Ice Mimic',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '5%',
          sourceRowIndex: 0
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mimics'
      },
      {
        id: 2532,
        record_key: 'npc-item:ice-mimic:loot:extractinator:expert',
        item_internal_name: 'Extractinator',
        item_name: 'Extractinator',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Ice Mimic',
        sort_order: 1,
        raw_json: JSON.stringify({
          itemInternalName: 'Extractinator',
          sourceRefName: 'Ice Mimic',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '10%',
          conditions: 'Expert Mode',
          sourceRowIndex: 1
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mimics'
      }
    ],
    npcIndex: new Map([
      ['Ice Mimic', { source_id: 629, internal_name: 'IceMimic', name: 'Ice Mimic' }],
      ['ice mimic', { source_id: 629, internal_name: 'IceMimic', name: 'Ice Mimic' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 2);
  assert.deepEqual(
    actual.npcLootRelations.map((row) => [row.itemInternalName, row.chanceText, row.conditions]),
    [
      ['Extractinator', '5%', null],
      ['Extractinator', '10%', 'Expert Mode']
    ]
  );
});

test('buildItemSourceRelations dedupes NPC loot rows whose only difference is source-only biome metadata', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 2531,
        record_key: 'npc-item:ice-mimic:loot:blizzard-in-a-bottle',
        item_internal_name: 'BlizzardinaBottle',
        item_name: 'Blizzard in a Bottle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Ice Mimic',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'BlizzardinaBottle',
          sourceRefName: 'Ice Mimic',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '15.83%',
          sourceRowIndex: 24
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mimics'
      },
      {
        id: 2532,
        record_key: 'item-page:blizzard-in-a-bottle:ice-mimic',
        item_internal_name: 'BlizzardinaBottle',
        item_name: 'Blizzard in a Bottle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Ice Mimic',
        biome_code: 'snow',
        sort_order: 1,
        raw_json: JSON.stringify({
          itemInternalName: 'BlizzardinaBottle',
          sourceRefName: 'Ice Mimic',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '15.83%',
          biomeCode: 'snow'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Blizzard in a Bottle'
      }
    ],
    npcIndex: new Map([
      ['Ice Mimic', { source_id: 629, internal_name: 'IceMimic', name: 'Ice Mimic' }],
      ['ice mimic', { source_id: 629, internal_name: 'IceMimic', name: 'Ice Mimic' }]
    ])
  });

  assert.equal(actual.sourceFacts.length, 2);
  assert.equal(actual.sourceDetails.length, 2);
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].conditionSourceText, null);
  assert.equal(actual.npcLootRelations[0].conditionBiomeCode, 'snow');
});

test('buildItemSourceRelations does not materialize reviewed Mimics row when Mimic target is absent', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 47,
        record_key: 'p'.repeat(64),
        item_internal_name: 'DualHook',
        item_name: 'Dual Hook',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Mimics',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'DualHook',
          sourceRefName: 'Mimics',
          quantityText: '1',
          chanceText: '16.67%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Dual Hook'
      }
    ],
    npcIndex: new Map()
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.sourceFacts[0].reviewStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'reviewed_mimic_target_missing');
});

test('buildItemSourceRelations blocks wrong exact ordinary Mimic rows', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 46,
        record_key: 'o'.repeat(64),
        item_internal_name: 'Mace',
        item_name: 'Mace',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Mimic',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'Mace',
          sourceRefName: 'Mimic',
          sourceRefInternalName: 'Mimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '16.67%'
        }),
        landing_source_id: 51,
        landing_source_key: 'manual.npc_mimic_exact_row',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mace'
      }
    ],
    npcIndex: new Map([['Mimic', { source_id: 85, internal_name: 'Mimic', name: 'Mimic' }]])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'ordinary_mimic_contract_mismatch');
});

test('buildItemSourceRelations excludes reviewed rejected item-page ordinary Mimic rows', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 41,
        record_key: '5'.repeat(64),
        item_internal_name: 'Mace',
        item_name: 'Mace',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Mimic',
        sort_order: 0,
        raw_json: JSON.stringify({
          itemInternalName: 'Mace',
          sourceRefName: 'Mimic',
          sourceRefInternalName: 'Mimic',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '16.67%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Mace'
      }
    ],
    npcIndex: new Map([['Mimic', { source_id: 85, internal_name: 'Mimic', name: 'Mimic' }]])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'excluded');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'ordinary_mimic_contract_mismatch');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'excluded');
});

test('buildItemSourceRelations ignores duplicate index entries for the same exact npc row', () => {
  const zombie = { source_id: 3, internal_name: 'Zombie', name: 'Zombie' };
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 41,
        record_key: '5'.repeat(64),
        item_internal_name: 'Shackle',
        item_name: 'Shackle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Zombie',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Zombie',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name',
          quantityText: '1',
          chanceText: '2%'
        }),
        landing_source_id: 51,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'f'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Shackle'
      }
    ],
    npcIndex: new Map([
      ['Zombie', [
        zombie,
        zombie,
        { source_id: -26, internal_name: 'SmallZombie', name: 'Zombie' }
      ]]
    ])
  });

  assert.equal(actual.sourceFacts[0].reviewStatus, 'resolved');
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Zombie');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations resolves polluted shop source names by cleaned npc display name', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 5,
        record_key: '5'.repeat(64),
        item_internal_name: 'BloodbathDye',
        item_name: 'Bloodbath Dye',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Dye Trader during a Blood Moon for',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Dye Trader during a Blood Moon for',
          notes: 'Bloodbath Dye is purchased from the Dye Trader during a Blood Moon for 7 GC 50 SC .'
        }),
        landing_source_id: 52,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'a'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Bloodbath Dye'
      }
    ],
    npcIndex: new Map([['Dye Trader', { source_id: 207, internal_name: 'DyeTrader', name: 'Dye Trader' }]])
  });

  assert.equal(actual.npcShopRelations.length, 1);
  assert.equal(actual.npcShopRelations[0].npcInternalName, 'DyeTrader');
  assert.equal(actual.npcShopRelations[0].conditionParseStatus, 'parsed');
  assert.equal(JSON.parse(actual.npcShopRelations[0].conditionEventsJson)[0], 'blood_moon');
});

test('buildItemSourceRelations keeps loot biome as source_fields_only when chance text has no condition signal', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 6,
        record_key: '6'.repeat(64),
        item_internal_name: 'AntlionMandible',
        item_name: 'Antlion Mandible',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Antlion',
        biome_code: 'desert',
        sort_order: 0,
        raw_json: JSON.stringify({
          sourceRefName: 'Antlion',
          chanceText: '33.3%'
        }),
        landing_source_id: 53,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'b'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Antlion Mandible'
      }
    ],
    npcIndex: new Map([['Antlion', { source_id: 48, internal_name: 'Antlion', name: 'Antlion' }]])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].conditionSourceText, null);
  assert.equal(actual.npcLootRelations[0].conditionBiomeCode, 'desert');
  assert.equal(actual.npcLootRelations[0].conditionParseStatus, 'source_fields_only');
});

test('buildItemSourceRelations audits ambiguous npc refs instead of promoting formal relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 7,
        record_key: '7'.repeat(64),
        item_internal_name: 'Shackle',
        item_name: 'Shackle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Zombie',
        sort_order: 0,
        raw_json: JSON.stringify({ sourceRefName: 'Zombie', chanceText: '2%' }),
        landing_source_id: 54,
        landing_source_key: 'generated.item_relations_bundle:chunk:0002',
        landing_content_hash: 'c'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Shackle'
      }
    ],
    npcIndex: new Map([
      ['Zombie', [
        { source_id: 3, internal_name: 'Zombie', name: 'Zombie' },
        { source_id: -26, internal_name: 'SmallZombie', name: 'Zombie' }
      ]]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'ambiguous');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'npc_source_ambiguous');
  assert.equal(actual.itemNpcRelationAudits[0].relationKind, 'loot');
  assert.equal(actual.itemNpcRelationAudits[0].itemName, 'Shackle');
  assert.equal(Object.hasOwn(actual.itemNpcRelationAudits[0], 'createdAt'), false);
  assert.equal(Object.hasOwn(actual.itemNpcRelationAudits[0], 'updatedAt'), false);
  assert.deepEqual(
    JSON.parse(actual.itemNpcRelationAudits[0].evidenceJson).candidateNpcInternalNames,
    ['Zombie', 'SmallZombie']
  );
});

test('buildItemSourceRelations resolves missing item internal names from unique item index matches', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 80,
        record_key: '8'.repeat(64),
        item_internal_name: null,
        item_name: 'Healing Potion',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Merchant',
        raw_json: JSON.stringify({
          sourceRefName: 'Merchant',
          itemName: 'Healing Potion',
          conditionText: 'In [[Hardmode]].'
        }),
        source_page: 'https://terraria.wiki.gg/wiki/Merchant'
      }
    ],
    npcIndex: new Map([
      ['Merchant', { source_id: 17, internal_name: 'Merchant', name: 'Merchant' }]
    ]),
    itemIndex: new Map([
      ['healing potion', { source_id: 188, internal_name: 'HealingPotion', english_name: 'Healing Potion' }]
    ])
  });

  assert.equal(actual.npcShopRelations.length, 1);
  assert.equal(actual.npcShopRelations[0].itemInternalName, 'HealingPotion');
  assert.equal(actual.npcShopRelations[0].itemName, 'Healing Potion');
  assert.equal(actual.npcShopRelations[0].npcInternalName, 'Merchant');
  assert.equal(actual.sourceFacts[0].itemInternalName, 'HealingPotion');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'resolved');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});

test('buildItemSourceRelations keeps ambiguous item index matches unresolved', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 81,
        record_key: '9'.repeat(64),
        item_internal_name: null,
        item_name: 'Shared Name',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Merchant',
        raw_json: JSON.stringify({ sourceRefName: 'Merchant', itemName: 'Shared Name' })
      }
    ],
    npcIndex: new Map([
      ['Merchant', { source_id: 17, internal_name: 'Merchant', name: 'Merchant' }]
    ]),
    itemIndex: new Map([
      ['shared name', [
        { source_id: 1, internal_name: 'SharedNameA', english_name: 'Shared Name' },
        { source_id: 2, internal_name: 'SharedNameB', english_name: 'Shared Name' }
      ]]
    ])
  });

  assert.equal(actual.npcShopRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'item_ambiguous');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'unresolved');
  assert.equal(actual.sourceFacts[0].reason, 'item_ambiguous');
});

test('buildItemSourceRelations does not strip item qualifier parentheticals for shop item lookup', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 84,
        record_key: 'npc-item:painter:shop:graveyard-item:43',
        item_internal_name: null,
        item_name: 'Graveyard (item)',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Painter',
        raw_json: JSON.stringify({
          itemName: 'Graveyard (item)',
          sourceRefName: 'Painter',
          sourceRefInternalName: 'Painter',
          sourceRefResolution: 'exact_internal_name'
        })
      }
    ],
    npcIndex: new Map([
      ['Painter', { source_id: 227, internal_name: 'Painter', name: 'Painter' }]
    ]),
    itemIndex: new Map([
      ['Graveyard', { source_id: 9002, internal_name: 'Graveyard', english_name: 'Graveyard' }],
      ['graveyard', { source_id: 9002, internal_name: 'Graveyard', english_name: 'Graveyard' }]
    ])
  });

  assert.equal(actual.npcShopRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'item_unresolved');
  assert.equal(actual.sourceFacts[0].itemInternalName, null);
});

test('buildItemSourceRelations resolves loot item names after stripping trailing NPC and quantity parentheticals', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 82,
        record_key: 'npc-item:jungle-slime:loot:gel-jungle-slime-1-2:0',
        item_internal_name: null,
        item_name: 'Gel (Jungle Slime) (1-2)',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Jungle Slime',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemName: 'Gel (Jungle Slime) (1-2)',
          chanceText: '100%',
          sourceRefName: 'Jungle Slime',
          sourceRefInternalName: 'JungleSlime',
          sourceRefResolution: 'exact_internal_name'
        })
      }
    ],
    npcIndex: new Map([
      ['Jungle Slime', { source_id: -10, internal_name: 'JungleSlime', name: 'Jungle Slime' }]
    ]),
    itemIndex: new Map([
      ['Gel', { source_id: 23, internal_name: 'Gel', english_name: 'Gel' }],
      ['gel', { source_id: 23, internal_name: 'Gel', english_name: 'Gel' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'Gel');
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'JungleSlime');
  assert.equal(actual.itemNpcRelationAudits.some((audit) => audit.reasonCode === 'item_unresolved'), false);
});

test('buildItemSourceRelations does not strip semantic parentheticals for NPC drop item lookup', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 85,
        record_key: 'npc-item:test-npc:loot:ancient-relic-event:0',
        item_internal_name: null,
        item_name: 'Ancient Relic (event)',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Test NPC',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemName: 'Ancient Relic (event)',
          chanceText: '1%',
          sourceRefName: 'Test NPC',
          sourceRefInternalName: 'TestNpc',
          sourceRefResolution: 'exact_internal_name'
        })
      }
    ],
    npcIndex: new Map([
      ['Test NPC', { source_id: -11, internal_name: 'TestNpc', name: 'Test NPC' }]
    ]),
    itemIndex: new Map([
      ['Ancient Relic', { source_id: 9003, internal_name: 'AncientRelic', english_name: 'Ancient Relic' }],
      ['ancient relic', { source_id: 9003, internal_name: 'AncientRelic', english_name: 'Ancient Relic' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'item_unresolved');
  assert.equal(actual.sourceFacts[0].itemInternalName, null);
});

test('buildItemSourceRelations resolves loot item names after stripping wiki note templates', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 83,
        record_key: 'npc-item:moth:loot:butterfly-dust-note:0',
        item_internal_name: null,
        item_name: 'Butterfly Dust{{note|block=y|paren=y|{{eicons|1.4.0.1|small=y}} Only after one mechanical boss has been defeated}}',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Moth',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemName: 'Butterfly Dust{{note|block=y|paren=y|{{eicons|1.4.0.1|small=y}} Only after one mechanical boss has been defeated}}',
          chanceText: '50%',
          sourceRefName: 'Moth',
          sourceRefInternalName: 'Moth',
          sourceRefResolution: 'exact_internal_name'
        })
      }
    ],
    npcIndex: new Map([
      ['Moth', { source_id: 205, internal_name: 'Moth', name: 'Moth' }]
    ]),
    itemIndex: new Map([
      ['Butterfly Dust', { source_id: 1611, internal_name: 'ButterflyDust', english_name: 'Butterfly Dust' }],
      ['butterfly dust', { source_id: 1611, internal_name: 'ButterflyDust', english_name: 'Butterfly Dust' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'ButterflyDust');
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Moth');
  assert.equal(actual.itemNpcRelationAudits.some((audit) => audit.reasonCode === 'item_unresolved'), false);
});

test('buildItemSourceRelations prefers generated npc shop pages over item-page shop claims for the same npc', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 82,
        record_key: 'npc-item:merchant:shop:nail',
        item_internal_name: null,
        item_name: 'Nail',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Merchant',
        raw_json: JSON.stringify({
          relationType: 'shop',
          sourceSection: 'shop',
          sourceRefName: 'Merchant',
          itemName: 'Nail'
        }),
        source_page: 'https://terraria.wiki.gg/wiki/Merchant'
      },
      {
        id: 83,
        record_key: 'a'.repeat(64),
        item_internal_name: 'NailGun',
        item_name: 'Nail Gun',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Merchant',
        raw_json: JSON.stringify({
          itemInternalName: 'NailGun',
          itemName: 'Nail Gun',
          sourceRefName: 'Merchant'
        }),
        source_page: 'Nail Gun'
      }
    ],
    npcIndex: new Map([
      ['Merchant', { source_id: 17, internal_name: 'Merchant', name: 'Merchant' }]
    ]),
    itemIndex: new Map([
      ['nail', { source_id: 3108, internal_name: 'Nail', english_name: 'Nail' }],
      ['nail gun', { source_id: 3107, internal_name: 'NailGun', english_name: 'Nail Gun' }]
    ])
  });

  assert.deepEqual(
    actual.npcShopRelations.map((row) => row.itemInternalName),
    ['Nail']
  );
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].itemInternalName, 'NailGun');
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'superseded');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'npc_shop_source_superseded_by_npc_page');
});

test('buildItemSourceRelations prefers generated npc loot pages over item-page drop claims for the same npc item', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 82,
        record_key: 'npc-item:reaper:loot:death-sickle:1',
        item_internal_name: null,
        item_name: 'Death Sickle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Reaper',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemName: 'Death Sickle',
          quantityText: '1',
          chanceText: '{{modes|2.5%|4.94%}}',
          sourceRefName: 'Reaper',
          sourceRefInternalName: 'Reaper',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.npc_item_relations_bundle',
        source_page: 'https://terraria.wiki.gg/wiki/Reaper'
      },
      {
        id: 83,
        record_key: 'a'.repeat(64),
        item_internal_name: 'DeathSickle',
        item_name: 'Death Sickle',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Reaper',
        raw_json: JSON.stringify({
          itemInternalName: 'DeathSickle',
          itemName: 'Death Sickle',
          quantityText: '1',
          chanceText: '2.5% (Desktop, Console and Mobile versions) 0.4% (Old-gen console and 3DS versions) 4.94%',
          sourceRefName: 'Reaper',
          sourceRefInternalName: 'Reaper',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Death Sickle'
      }
    ],
    npcIndex: new Map([
      ['Reaper', { source_id: 253, internal_name: 'Reaper', name: 'Reaper' }]
    ]),
    itemIndex: new Map([
      ['Death Sickle', { source_id: 1327, internal_name: 'DeathSickle', english_name: 'Death Sickle' }],
      ['death sickle', { source_id: 1327, internal_name: 'DeathSickle', english_name: 'Death Sickle' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'DeathSickle');
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Reaper');
  assert.equal(actual.npcLootRelations[0].chanceText, '{{modes|2.5%|4.94%}}');
  assert.equal(actual.npcLootRelations[0].sourceMaintRecordKey, 'npc-item:reaper:loot:death-sickle:1');
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].itemInternalName, 'DeathSickle');
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'superseded');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'npc_loot_source_superseded_by_npc_page');
});

test('buildItemSourceRelations dedupes mode-template-equivalent loot chances without dropping source facts', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 84,
        record_key: 'npc-item:jungle-slime:loot:slime-staff:0',
        item_internal_name: 'SlimeStaff',
        item_name: 'Slime Staff',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Jungle Slime',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemInternalName: 'SlimeStaff',
          itemName: 'Slime Staff',
          quantityText: '1',
          chanceText: '{{modes|0.01%|0.014%}}',
          sourceRefName: 'Jungle Slime',
          sourceRefInternalName: 'JungleSlime',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.npc_item_relations_bundle',
        source_page: 'https://terraria.wiki.gg/wiki/Jungle_Slime'
      },
      {
        id: 85,
        record_key: 'c'.repeat(64),
        item_internal_name: 'SlimeStaff',
        item_name: 'Slime Staff',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Jungle Slime',
        biome_code: 'jungle',
        raw_json: JSON.stringify({
          itemInternalName: 'SlimeStaff',
          itemName: 'Slime Staff',
          quantityText: '1',
          chanceText: '0.01% 0.014%',
          conditionText: 'Normal mode row',
          notes: 'Normal mode row',
          sourceRefName: 'Jungle Slime',
          sourceRefInternalName: 'JungleSlime',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Slime Staff'
      }
    ],
    npcIndex: new Map([
      ['Jungle Slime', { source_id: -10, internal_name: 'JungleSlime', name: 'Jungle Slime' }]
    ]),
    itemIndex: new Map([
      ['Slime Staff', { source_id: 1309, internal_name: 'SlimeStaff', english_name: 'Slime Staff' }],
      ['slime staff', { source_id: 1309, internal_name: 'SlimeStaff', english_name: 'Slime Staff' }]
    ])
  });

  assert.equal(actual.sourceFacts.length, 2);
  assert.equal(actual.sourceDetails.length, 2);
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'SlimeStaff');
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'JungleSlime');
  assert.ok(['{{modes|0.01%|0.014%}}', '0.01% 0.014%'].includes(actual.npcLootRelations[0].chanceText));
});

test('buildItemSourceRelations dedupes NPC loot chance subsets when only default normal-mode text differs', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 86,
        record_key: 'd'.repeat(64),
        item_internal_name: 'SlimeStaff',
        item_name: 'Slime Staff',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'SlimeStaff',
          itemName: 'Slime Staff',
          quantityText: '1',
          chanceText: '0.014%',
          sourceRefName: 'Zombie',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Slime Staff'
      },
      {
        id: 87,
        record_key: 'e'.repeat(64),
        item_internal_name: 'SlimeStaff',
        item_name: 'Slime Staff',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'SlimeStaff',
          itemName: 'Slime Staff',
          quantityText: '1',
          chanceText: '0.01% 0.014%',
          conditionText: 'Normal mode row',
          sourceRefName: 'Zombie',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Slime Staff'
      }
    ],
    npcIndex: new Map([
      ['Zombie', { source_id: 3, internal_name: 'Zombie', name: 'Zombie' }]
    ]),
    itemIndex: new Map([
      ['Slime Staff', { source_id: 1309, internal_name: 'SlimeStaff', english_name: 'Slime Staff' }],
      ['slime staff', { source_id: 1309, internal_name: 'SlimeStaff', english_name: 'Slime Staff' }]
    ])
  });

  assert.equal(actual.sourceFacts.length, 2);
  assert.equal(actual.sourceDetails.length, 2);
  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].itemInternalName, 'SlimeStaff');
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'Zombie');
  assert.equal(actual.npcLootRelations[0].chanceText, '0.01% 0.014%');
  assert.equal(actual.npcLootRelations[0].conditions, null);
});

test('buildItemSourceRelations preserves subset chance loot rows without default-row evidence', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 88,
        record_key: 'f'.repeat(64),
        item_internal_name: 'TestDrop',
        item_name: 'Test Drop',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Test Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'TestDrop',
          itemName: 'Test Drop',
          quantityText: '1',
          chanceText: '5%',
          sourceRefName: 'Test Zombie',
          sourceRefInternalName: 'TestZombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Test Drop'
      },
      {
        id: 89,
        record_key: '0'.repeat(64),
        item_internal_name: 'TestDrop',
        item_name: 'Test Drop',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Test Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'TestDrop',
          itemName: 'Test Drop',
          quantityText: '1',
          chanceText: '5% 10%',
          sourceRefName: 'Test Zombie',
          sourceRefInternalName: 'TestZombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Test Drop'
      }
    ],
    npcIndex: new Map([
      ['Test Zombie', { source_id: 88, internal_name: 'TestZombie', name: 'Test Zombie' }]
    ])
  });

  assert.deepEqual(
    actual.npcLootRelations.map((row) => row.chanceText),
    ['5%', '5% 10%']
  );
});

test('buildItemSourceRelations preserves subset chance loot rows when only the subset has default-row evidence', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 90,
        record_key: '1'.repeat(64),
        item_internal_name: 'TestDrop',
        item_name: 'Test Drop',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Test Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'TestDrop',
          itemName: 'Test Drop',
          quantityText: '1',
          chanceText: '5%',
          conditionText: 'Normal mode row',
          sourceRefName: 'Test Zombie',
          sourceRefInternalName: 'TestZombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Test Drop'
      },
      {
        id: 91,
        record_key: '2'.repeat(64),
        item_internal_name: 'TestDrop',
        item_name: 'Test Drop',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Test Zombie',
        raw_json: JSON.stringify({
          itemInternalName: 'TestDrop',
          itemName: 'Test Drop',
          quantityText: '1',
          chanceText: '5% 10%',
          sourceRefName: 'Test Zombie',
          sourceRefInternalName: 'TestZombie',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Test Drop'
      }
    ],
    npcIndex: new Map([
      ['Test Zombie', { source_id: 88, internal_name: 'TestZombie', name: 'Test Zombie' }]
    ])
  });

  assert.deepEqual(
    actual.npcLootRelations.map((row) => row.chanceText),
    ['5%', '5% 10%']
  );
});

test('buildItemSourceRelations does not supersede item-page loot with generated rows for a different target npc', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 84,
        record_key: 'npc-item:slimer2:loot:gel:0',
        item_internal_name: null,
        item_name: 'Gel',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Slimer',
        raw_json: JSON.stringify({
          relationType: 'loot',
          sourceSection: 'drops',
          itemName: 'Gel',
          quantityText: '2-4',
          chanceText: '100%',
          sourceRefName: 'Slimer',
          sourceRefInternalName: 'Slimer2',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.npc_item_relations_bundle',
        source_page: 'https://terraria.wiki.gg/wiki/Slimer'
      },
      {
        id: 85,
        record_key: 'b'.repeat(64),
        item_internal_name: 'Gel',
        item_name: 'Gel',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Slimer',
        raw_json: JSON.stringify({
          itemInternalName: 'Gel',
          itemName: 'Gel',
          quantityText: '2-4',
          chanceText: '100%',
          sourceRefName: 'Slimer',
          sourceRefInternalName: 'Slimer',
          sourceRefResolution: 'exact_internal_name'
        }),
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        source_page: 'Gel'
      }
    ],
    npcIndex: new Map([
      ['Slimer', [
        { source_id: 121, internal_name: 'Slimer', name: 'Slimer' },
        { source_id: 122, internal_name: 'Slimer2', name: 'Slimer' }
      ]]
    ]),
    itemIndex: new Map([
      ['Gel', { source_id: 23, internal_name: 'Gel', english_name: 'Gel' }],
      ['gel', { source_id: 23, internal_name: 'Gel', english_name: 'Gel' }]
    ])
  });

  assert.deepEqual(
    actual.npcLootRelations.map((row) => [row.npcInternalName, row.itemInternalName]).sort(),
    [
      ['Slimer', 'Gel'],
      ['Slimer2', 'Gel'],
    ]
  );
  assert.equal(actual.itemNpcRelationAudits.some((row) =>
    row.auditStatus === 'superseded'
    && row.itemInternalName === 'Gel'
  ), false);
});

test('buildItemSourceRelations audits resolved npc refs with unresolved items instead of promoting formal relations', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 8,
        record_key: '8'.repeat(64),
        item_internal_name: null,
        item_name: 'Any Pylon',
        source_type: 'shop',
        source_ref_type: 'npc',
        source_ref_name: 'Merchant',
        raw_json: JSON.stringify({ sourceRefName: 'Merchant', priceText: '{{iteminfo' })
      }
    ],
    npcIndex: new Map([
      ['Merchant', { source_id: 17, internal_name: 'Merchant', name: 'Merchant' }]
    ])
  });

  assert.equal(actual.npcShopRelations.length, 0);
  assert.equal(actual.itemNpcRelationAudits.length, 1);
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'unresolved');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'item_unresolved');
  assert.equal(actual.sourceFacts[0].reviewStatus, 'unresolved');
});

test('buildItemSourceRelations resolves NPC disambiguation suffixes without broad fuzzy matching', () => {
  const actual = buildItemSourceRelations({
    itemSourceRows: [
      {
        id: 84,
        record_key: 'b'.repeat(64),
        item_internal_name: 'Nazar',
        item_name: 'Nazar',
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_name: 'Enchanted Sword (NPC)',
        raw_json: JSON.stringify({
          itemInternalName: 'Nazar',
          itemName: 'Nazar',
          sourceRefName: 'Enchanted Sword (NPC)',
          chanceText: '1% 1.99%',
          quantityText: '1',
          notes: 'Normal mode row'
        }),
        source_page: 'Nazar'
      }
    ],
    npcIndex: new Map([
      ['Enchanted Sword', { source_id: 84, internal_name: 'EnchantedSword', name: 'Enchanted Sword' }]
    ])
  });

  assert.equal(actual.npcLootRelations.length, 1);
  assert.equal(actual.npcLootRelations[0].npcInternalName, 'EnchantedSword');
  assert.equal(actual.sourceDetails[0].sourceRefInternalName, 'EnchantedSword');
  assert.equal(actual.sourceDetails[0].sourceRefResolution, 'resolved');
  assert.equal(actual.itemNpcRelationAudits.length, 0);
});
