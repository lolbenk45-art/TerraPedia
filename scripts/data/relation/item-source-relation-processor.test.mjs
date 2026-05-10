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
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.itemInternalName === 'DaedalusStormbow' && audit.auditStatus === 'blocked'));
  assert.equal(actual.sourceFacts.find((fact) => fact.itemInternalName === 'DaedalusStormbow').reason, 'collective_bucket_requires_reviewed_mapping');
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
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.itemInternalName === 'DaedalusStormbow' && audit.auditStatus === 'blocked'));
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
  assert.equal(actual.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(actual.itemNpcRelationAudits[0].reasonCode, 'ordinary_mimic_contract_mismatch');
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
