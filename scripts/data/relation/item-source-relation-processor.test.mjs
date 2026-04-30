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
  assert.ok(actual.itemNpcRelationAudits.some((audit) => audit.auditStatus === 'unresolved'));
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
