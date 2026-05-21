import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseArgs,
  readWikiArmorSets,
  rewriteArmorSetRelatedItemImages,
  runSync as runSyncBase
} from './sync-maint-to-relation.mjs';

const MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/items/',
  'http://127.0.0.1:9000/terrapedia-images/items/'
];

function runSync(options, dependencies = {}) {
  return runSyncBase(options, {
    managedImageUrlPrefixes: MANAGED_IMAGE_URL_PREFIXES,
    queryRelation: async () => [],
    ...dependencies
  });
}

function clearsTable(sql, tableName) {
  return (
    sql.includes(`TRUNCATE TABLE \`${tableName}\``) ||
    sql.includes(`DELETE FROM \`${tableName}\``)
  );
}

test('parseArgs parses relation sync defaults and scopes', () => {
  const actual = parseArgs([
    '--apply=true',
    '--maint-database=terria_v1_maint',
    '--relation-database=terria_v1_relation',
    '--scopes=category,recipe,npc,buff,biome,projectile'
  ]);

  assert.deepEqual(actual, {
    apply: true,
    createDatabase: false,
    maintDatabase: 'terria_v1_maint',
    localDatabase: 'terria_v1_local',
    allowLocalItemImageFallback: true,
    relationDatabase: 'terria_v1_relation',
    wikiArmorSetsInput: actual.wikiArmorSetsInput,
    scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
  });
  assert.match(actual.wikiArmorSetsInput, /data[\\/]+generated[\\/]+wiki-armor-sets\.latest\.json$/);
});

test('readWikiArmorSets falls back from missing latest file to newest timestamp snapshot', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-set-source-'));
  const latestPath = path.join(tempDir, 'wiki-armor-sets.latest.json');
  fs.writeFileSync(
    path.join(tempDir, 'wiki-armor-sets.2026-04-27T23-30-19.757Z.json'),
    JSON.stringify({ records: [{ pageTitle: 'Old Hat', compositionKind: 'single_piece_set' }] })
  );
  fs.writeFileSync(
    path.join(tempDir, 'wiki-armor-sets.2026-04-28T03-04-18.454Z.json'),
    JSON.stringify({ records: [{ pageTitle: 'Magic Hat', compositionKind: 'single_piece_set' }] })
  );

  const actual = readWikiArmorSets(latestPath);

  assert.equal(actual.length, 1);
  assert.equal(actual[0].pageTitle, 'Magic Hat');
  assert.equal(actual[0].compositionKind, 'single_piece_set');
});

test('rewriteArmorSetRelatedItemImages keeps armor set related item images managed-only', () => {
  const relatedItems = [
    {
      internalName: 'WoodHelmet',
      image: 'https://terraria.wiki.gg/images/Wood_Helmet.png'
    },
    {
      internalName: 'WoodBreastplate',
      image: null
    },
    {
      internalName: 'UnknownHat',
      image: 'https://terraria.wiki.gg/images/Unknown_Hat.png'
    },
    {
      internalName: 'FakeManagedHat',
      image: 'https://evil.example.com/terrapedia-images/items/fake-managed-hat.png'
    }
  ];
  const imageByInternalName = new Map([
    ['woodhelmet', 'http://localhost:9000/terrapedia-images/items/wood-helmet.png'],
    ['woodbreastplate', 'http://localhost:9000/terrapedia-images/items/wood-breastplate.png']
  ]);

  const actual = rewriteArmorSetRelatedItemImages(
    relatedItems,
    imageByInternalName,
    MANAGED_IMAGE_URL_PREFIXES
  );

  assert.equal(actual.changed, true);
  assert.equal(actual.items[0].image, 'http://localhost:9000/terrapedia-images/items/wood-helmet.png');
  assert.equal(actual.items[1].image, 'http://localhost:9000/terrapedia-images/items/wood-breastplate.png');
  assert.equal(actual.items[2].image, null);
  assert.equal(actual.items[3].image, null);
  assert.doesNotMatch(JSON.stringify(actual.items), /terraria\.wiki\.gg|static\.wikia/i);
  assert.doesNotMatch(JSON.stringify(actual.items), /evil\.example\.com/i);
});

test('rewriteArmorSetRelatedItemImages rejects managed-like existing images when prefixes are empty', () => {
  const actual = rewriteArmorSetRelatedItemImages(
    [
      {
        internalName: 'UnknownHat',
        image: 'http://localhost:9000/terrapedia-images/items/unknown-hat.png'
      }
    ],
    new Map(),
    []
  );

  assert.equal(actual.changed, true);
  assert.equal(actual.items[0].image, null);
});

test('runSync dry-run reads maint only and does not write relation rows', async () => {
  const reads = [];
  const relationReads = [];
  let writeCalled = false;

  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        reads.push(['maint', sql]);
        if (sql.includes('maint_item_categories')) {
          return [{
            id: 1,
            record_key: 'a'.repeat(64),
            top_level: 'Consumables',
            section_title: 'Potions',
            group_name: 'Health',
            item_internal_name: 'LesserHealingPotion',
            item_name: 'Lesser Healing'
          }];
        }
        if (sql.includes('maint_item_sources')) {
          return [];
        }
        if (sql.includes('maint_buffs')) {
          return [{
            id: 1,
            source_id: 1,
            internal_name: 'ObsidianSkin',
            english_name: 'Obsidian Skin',
            raw_json: JSON.stringify({
                image: 'Obsidian Skin.png',
                type: 'buff',
                sourceItems: [{ itemId: 1, internalName: 'LesserHealingPotion' }],
                immuneNpcs: [],
                localized: {
                  en: { tooltip: 'Immune to lava' }
                }
              })
          }];
        }
        if (sql.includes('maint_npc_images')) {
          return [{
            id: 3,
            record_key: 'c'.repeat(64),
            npc_internal_name: 'BigHornetStingy',
            npc_name: 'Hornet',
            role: 'icon',
            source_file_title: 'Stingy Hornet.gif',
            original_url: 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif',
            cached_url: 'http://localhost:9000/terrapedia-images/items/2026/04/08/cbdfb9061d714cb2abc837dcc9e298b2.gif',
            width: 48,
            height: 38,
            content_type: 'image/gif',
            is_primary: 1,
            sort_order: 0,
            raw_json: '{}',
            source_provider: 'terraria.wiki.gg',
            source_page: 'NPC_ID'
          }];
        }
        if (sql.includes('maint_items')) {
          return [{ source_id: 1, internal_name: 'LesserHealingPotion', english_name: 'Lesser Healing Potion', raw_json: JSON.stringify({ shoot: 1 }) }];
        }
        if (sql.includes('maint_projectiles')) {
          return [{
            id: 2,
            source_id: 1,
            internal_name: 'WoodenArrowFriendly',
            english_name: 'Wooden Arrow (friendly)',
            raw_json: JSON.stringify({ image: 'Wooden Arrow.png' })
          }];
        }
        if (sql.includes('maint_npcs')) {
          return [{
            source_id: -65,
            internal_name: 'BigHornetStingy',
            english_name: 'Hornet',
            raw_json: JSON.stringify({
              wikiCrawler: {
                combat: {
                  projectileId: 1
                }
              }
            })
          }];
        }
        if (sql.includes('maint_item_biomes')) return [];
        if (sql.includes('maint_item_images')) return [];
        return [];
      },
      queryRelation: async (sql) => {
        relationReads.push(['relation', sql]);
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-24.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-24.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-24.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-24.json'
      }),
      executeRelation: async () => {
        writeCalled = true;
      }
    }
  );

  assert.equal(result.apply, false);
  assert.ok(reads.some(([kind]) => kind === 'maint'));
  assert.ok(reads.every(([kind]) => kind === 'maint'));
  const itemSourceRead = reads.find(([, sql]) => /\bFROM\s+maint_item_sources\b/i.test(sql));
  assert.ok(itemSourceRead, 'expected maint_item_sources to be read from maint');
  assert.match(itemSourceRead[1], /\bWHERE\b/i);
  assert.match(itemSourceRead[1], /\bstatus\s*=\s*1\b/i);
  assert.match(itemSourceRead[1], /\bdeleted\s*=\s*0\b/i);
  assert.ok(relationReads.some(([, sql]) => sql.includes('relation_armor_set_images')));
  assert.equal(writeCalled, false);
  assert.equal(result.summary.domainSummary.base, 4);
  assert.equal(result.summary.domainSummary.image, 3);
  assert.equal(result.summary.bridgeBreakdown.itemTextOverrideRows, 0);
  assert.equal(result.summary.bridgeBreakdown.localItemImageFallbackEnabled, false);
  assert.equal(result.results.relationBuffs.length, 1);
  assert.deepEqual(JSON.parse(result.results.relationBuffs[0].sourceItemsJson), [
    { itemId: 1, internalName: 'LesserHealingPotion' }
  ]);
  assert.deepEqual(JSON.parse(result.results.relationBuffs[0].immuneNpcsJson), []);
  assert.equal(result.results.relationItemRarities.length, 16);
  assert.equal(result.results.itemRecipeGroupExpansions.length, 0);
  assert.equal(result.results.itemNpcShopRelations.length, 0);
  assert.equal(result.results.itemNpcLootRelations.length, 0);
  assert.equal(result.results.itemNpcRelationAudits.length, 0);
  assert.equal(result.results.relationProjectileImages.length, 1);
  assert.equal(result.results.relationBuffImages.length, 1);
  assert.equal(result.results.relationNpcImages.length, 1);
  assert.equal(result.results.itemProjectileRelations.length, 1);
  assert.equal(result.results.npcProjectileRelations.length, 1);
  assert.equal(result.results.itemProjectileAudits.length, 1);
  assert.deepEqual(JSON.parse(result.results.projectionProjectiles[0].sourceItemsJson).map((item) => item.internalName), ['LesserHealingPotion']);
  assert.deepEqual(JSON.parse(result.results.projectionProjectiles[0].sourceNpcsJson).map((npc) => npc.internalName), ['BigHornetStingy']);
});

test('runSync dry-run carries item npc relation audits into results and summary', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['npc']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_item_sources')) {
          return [
            {
              id: 21,
              record_key: '2'.repeat(64),
              item_internal_name: 'Shackle',
              item_name: 'Shackle',
              source_type: 'drop',
              source_ref_type: 'npc',
              source_ref_name: 'Unknown Zombie',
              raw_json: JSON.stringify({
                sourceRefName: 'Unknown Zombie',
                chanceText: '2%'
              }),
              landing_source_id: 51,
              landing_source_key: 'generated.item_relations_bundle:chunk:0001',
              landing_content_hash: 'f'.repeat(64),
              source_provider: 'wiki_gg',
              source_page: 'Shackle'
            }
          ];
        }
        if (sql.includes('maint_items')) {
          return [{
            source_id: 216,
            internal_name: 'Shackle',
            english_name: 'Shackle',
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_npcs')) return [];
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-29.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-29.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-29.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-29.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.itemSourceFacts.length, 1);
  assert.equal(result.results.itemNpcLootRelations.length, 0);
  assert.equal(result.results.itemNpcRelationAudits.length, 1);
  assert.equal(result.results.itemNpcRelationAudits[0].auditStatus, 'unresolved');
  assert.equal(result.summary.domainSummary.npc, 3);
});

test('runSync dry-run applies reviewed non-NPC source exclusions to item npc audits', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['npc']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_item_sources')) {
          return [
            {
              id: 22,
              record_key: 'c'.repeat(64),
              item_internal_name: 'WaffleIron',
              item_name: "Waffle's Iron",
              source_type: 'drop',
              source_ref_type: 'npc',
              source_ref_name: 'Mechdusa',
              raw_json: JSON.stringify({
                sourceRefName: 'Mechdusa',
                chanceText: '100%',
                quantityText: '1'
              }),
              landing_source_id: 51,
              landing_source_key: 'generated.item_relations_bundle:chunk:0001',
              landing_content_hash: 'f'.repeat(64),
              source_provider: 'wiki_gg',
              source_page: "Waffle's Iron"
            }
          ];
        }
        if (sql.includes('maint_items')) {
          return [{
            source_id: 5298,
            internal_name: 'WaffleIron',
            english_name: "Waffle's Iron",
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_npcs')) return [];
        return [];
      },
      loadReviewedNonNpcSourceExclusions: async () => [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        matchType: 'exact',
        sourceRefName: 'Mechdusa',
        reason: 'boss_lane_reference_source',
        evidenceSource: 'docs/audits/2026-05-11_npc-mechdusa-non-npc-source-review.md',
        reviewedBy: 'codex',
        reviewedAt: '2026-05-11',
      }],
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-05-11.json',
        auditMdPath: 'reports/relation/relation-audit-2026-05-11.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-05-11.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-05-11.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.itemNpcLootRelations.length, 0);
  assert.equal(result.results.itemNpcRelationAudits.length, 1);
  assert.equal(result.results.itemNpcRelationAudits[0].auditStatus, 'blocked');
  assert.equal(result.results.itemNpcRelationAudits[0].reasonCode, 'boss_lane_reference_source');
});

test('runSync dry-run applies reviewed source-only item exclusions to item npc audits', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['npc']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_item_sources')) {
          return [
            {
              id: 24,
              record_key: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
              item_internal_name: null,
              item_name: 'Suspicious Looking Egg',
              source_type: 'drop',
              source_ref_type: 'npc',
              source_ref_name: 'Corrupt Bunny',
              raw_json: JSON.stringify({
                itemName: 'Suspicious Looking Egg',
                sourceRefName: 'Corrupt Bunny',
                sourceRefInternalName: 'CorruptBunny',
                sourceRefResolution: 'exact_internal_name',
                chanceText: '100% @normal',
                quantityText: '',
                sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny'
              }),
              landing_source_id: 51,
              landing_source_key: 'generated.npc_item_relations_bundle:chunk:0001',
              landing_content_hash: 'f'.repeat(64),
              source_provider: 'wiki_gg',
              source_page: 'Corrupt Bunny'
            }
          ];
        }
        if (sql.includes('maint_items')) return [];
        if (sql.includes('maint_npcs')) {
          return [{
            source_id: 48,
            internal_name: 'CorruptBunny',
            name: 'Corrupt Bunny',
            flags_json: '{}'
          }];
        }
        return [];
      },
      loadReviewedSourceOnlyItemExclusions: async () => [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefInternalName: 'CorruptBunny',
        itemName: 'Suspicious Looking Egg',
        recordKey: 'npc-item:corrupt-bunny:loot:suspicious-looking-egg:2',
        chanceText: '100% @normal',
        quantityText: '',
        sourceUrl: 'https://terraria.wiki.gg/wiki/Corrupt_Bunny',
        reason: 'legacy_only_item_not_in_current_corpus',
        evidenceSource: 'docs/audits/2026-05-13_npc-source-only-item-review.md',
        reviewedBy: 'codex',
        reviewedAt: '2026-05-13',
      }],
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-05-13.json',
        auditMdPath: 'reports/relation/relation-audit-2026-05-13.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-05-13.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-05-13.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.itemNpcLootRelations.length, 0);
  assert.equal(result.results.itemNpcRelationAudits.length, 1);
  assert.equal(result.results.itemNpcRelationAudits[0].auditStatus, 'excluded');
  assert.equal(result.results.itemNpcRelationAudits[0].reasonCode, 'legacy_only_item_not_in_current_corpus');
  assert.equal(result.results.itemSourceFacts[0].reviewStatus, 'excluded');
});

test('runSync dry-run materializes contract-backed inherited npc loot relations', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['npc']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_item_sources')) {
          return [{
            id: 401,
            record_key: 'h'.repeat(64),
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
          }];
        }
        if (sql.includes('maint_items')) {
          return [{
            source_id: 379,
            internal_name: 'AncientCobaltHelmet',
            english_name: 'Ancient Cobalt Helmet',
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_npcs')) {
          return [
            { source_id: 42, internal_name: 'Hornet', english_name: 'Hornet', name: 'Hornet', raw_json: '{}' },
            { source_id: -15, internal_name: 'BigHornetStingy', english_name: 'Hornet', name: 'Hornet', raw_json: '{}' }
          ];
        }
        return [];
      },
      loadInheritanceRules: async () => [{
        targetNpcInternalName: 'BigHornetStingy',
        sourceNpcInternalName: 'Hornet',
        inheritanceKind: 'same_name_variant',
        evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
        reviewedBy: 'test',
        reviewedAt: '2026-05-11'
      }],
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-05-11.json',
        auditMdPath: 'reports/relation/relation-audit-2026-05-11.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-05-11.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-05-11.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.deepEqual(
    result.results.itemNpcLootRelations.map((row) => row.npcInternalName).sort(),
    ['BigHornetStingy', 'Hornet']
  );
  const inherited = result.results.itemNpcLootRelations.find((row) => row.npcInternalName === 'BigHornetStingy');
  assert.equal(inherited.reason, 'contract_backed_inherited_loot');
  assert.equal(JSON.parse(inherited.rawJson).inheritanceEvidenceSource, 'https://terraria.wiki.gg/wiki/Hornet');
});

test('runSync rejects malformed inheritance contract rows before relation execution', async () => {
  let executeRelationCalled = false;
  let writeReportsCalled = false;

  await assert.rejects(
    runSync(
      {
        apply: true,
        createDatabase: false,
        maintDatabase: 'terria_v1_maint',
        localDatabase: null,
        relationDatabase: 'terria_v1_relation',
        scopes: ['npc']
      },
      {
        config: {
          database: {
            host: '127.0.0.1',
            port: 13306,
            username: 'root',
            password: 'root'
          }
        },
        queryMaint: async (sql) => {
          if (sql.includes('maint_item_sources')) {
            return [{
              id: 401,
              record_key: 'h'.repeat(64),
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
            }];
          }
          if (sql.includes('maint_items')) {
            return [{
              source_id: 379,
              internal_name: 'AncientCobaltHelmet',
              english_name: 'Ancient Cobalt Helmet',
              raw_json: '{}'
            }];
          }
          if (sql.includes('maint_npcs')) {
            return [
              { source_id: 42, internal_name: 'Hornet', english_name: 'Hornet', name: 'Hornet', raw_json: '{}' },
              { source_id: -15, internal_name: 'BigHornetStingy', english_name: 'Hornet', name: 'Hornet', raw_json: '{}' }
            ];
          }
          return [];
        },
        loadInheritanceRules: async () => ([
          {
            targetNpcInternalName: 'BigHornetStingy',
            sourceNpcInternalName: 'Hornet',
            inheritanceKind: 'same_name_variant',
            evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
            reviewedBy: 'test',
            reviewedAt: '2026-05-11'
          },
          {
            targetNpcInternalName: 'Hornet',
            sourceNpcInternalName: 'Hornet',
            inheritanceKind: 'same_name_variant',
            evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
            reviewedBy: 'test',
            reviewedAt: '2026-05-11'
          },
          {
            targetNpcInternalName: 'BigHornetStingy',
            sourceNpcInternalName: 'Hornet',
            inheritanceKind: 'same_display_name',
            evidenceSource: '',
            reviewedBy: 'test',
            reviewedAt: 'not-an-iso-date'
          },
          {
            targetNpcInternalName: 'MissingSource',
            sourceNpcInternalName: '',
            inheritanceKind: '',
            evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
            reviewedBy: '',
            reviewedAt: ''
          }
        ]),
        writeReports: async () => {
          writeReportsCalled = true;
          return {
            auditJsonPath: 'reports/relation/relation-audit-2026-05-11.json',
            auditMdPath: 'reports/relation/relation-audit-2026-05-11.md',
            conflictsPath: 'reports/relation/relation-conflicts-2026-05-11.json',
            unresolvedPath: 'reports/relation/relation-unresolved-2026-05-11.json'
          };
        },
        executeRelation: async () => {
          executeRelationCalled = true;
          throw new Error('should not write relations when inheritance validation fails');
        }
      }
    ),
    /inheritance/i
  );

  assert.equal(executeRelationCalled, false);
  assert.equal(writeReportsCalled, false);
});

test('runSync dry-run surfaces projectile crawl candidates for maint items and npcs without projectile fields', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) {
          return [{
            id: 1,
            source_id: 100,
            internal_name: 'TrainingBow',
            english_name: 'Training Bow',
            raw_json: JSON.stringify({ damage: 4 })
          }];
        }
        if (sql.includes('maint_npcs')) {
          return [{
            id: 2,
            source_id: 200,
            internal_name: 'TrainingTarget',
            english_name: 'Training Target',
            raw_json: JSON.stringify({ aiStyle: 5 })
          }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-28.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-28.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-28.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-28.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.itemProjectileAudits.length, 1);
  assert.equal(result.results.itemProjectileAudits[0].auditStatus, 'crawl_candidate');
  assert.equal(result.results.npcProjectileAudits.length, 1);
  assert.equal(result.results.npcProjectileAudits[0].auditStatus, 'crawl_candidate');
  assert.equal(result.summary.domainSummary.projectile, 2);
});

test('runSync dry-run builds armor set relation and projection rows from maint sources', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['armor_set']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_armor_sets')) {
          return [{
            id: 1,
            record_key: 'armor-maint-key',
            text_key: 'ArmorSetBonus.Wood',
            benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
            primary_part: null,
            set_count: 1,
            unique_item_count: 3,
            sets_json: JSON.stringify([[727, 728, 729]]),
            unique_item_ids_json: JSON.stringify([727, 728, 729]),
            raw_json: '{}',
            source_provider: 'terraria.wiki.gg',
            source_page: 'Module:ArmorSetBonuses',
            landing_source_id: 10,
            landing_source_key: 'wiki.module.armorsetbonuses',
            landing_content_hash: 'a'.repeat(64)
          }];
        }
        if (sql.includes('maint_items')) {
          return [
            {
              source_id: 727,
              internal_name: 'WoodHelmet',
              english_name: 'Wood Helmet',
              raw_json: JSON.stringify({ headSlot: 52 })
            },
            {
              source_id: 728,
              internal_name: 'WoodBreastplate',
              english_name: 'Wood Breastplate',
              raw_json: JSON.stringify({ bodySlot: 32 })
            },
            {
              source_id: 729,
              internal_name: 'WoodGreaves',
              english_name: 'Wood Greaves',
              raw_json: JSON.stringify({ legSlot: 31 })
            }
          ];
        }
        if (sql.includes('maint_armor_set_images')) {
          return [{
            text_key: 'ArmorSetBonus.Wood',
            image_role: 'male',
            source_file_title: 'Wood armor.png',
            original_url: 'https://terraria.wiki.gg/images/Wood_armor.png',
            cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png',
            width: 64,
            height: 64,
            content_type: 'image/png',
            is_primary: 1,
            sort_order: 0,
            raw_json: '{}',
            source_provider: 'terraria.wiki.gg',
            source_page: 'zh/wiki/盔甲',
            landing_source_id: 12,
            landing_source_key: 'wiki.zh.armor',
            landing_content_hash: 'c'.repeat(64)
          }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-27.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-27.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-27.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-27.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.relationArmorSets.length, 1);
  assert.equal(result.results.relationArmorSetItems.length, 3);
  assert.equal(result.results.relationArmorSetImages.length, 1);
  assert.equal(result.results.projectionArmorSets.length, 1);
  assert.equal(result.summary.domainSummary.armorSet, 5);
  assert.equal(result.summary.maintArmorSetImages, 1);
  assert.equal(result.summary.relationArmorSetImages, 1);
  assert.equal(result.summary.projectionArmorSets, 1);
  assert.equal(result.summary.gateBreakdown.armorSetProjectionConsistencyIssues, 0);
  assert.equal(result.results.projectionArmorSets[0].textKey, 'ArmorSetBonus.Wood');
  assert.deepEqual(JSON.parse(result.results.projectionArmorSets[0].currentItemIdsJson), [727, 728, 729]);
});

test('runSync dry-run prefers wiki armor source fallback and projects single-piece rows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-set-sync-source-'));
  const latestPath = path.join(tempDir, 'wiki-armor-sets.latest.json');
  fs.writeFileSync(
    path.join(tempDir, 'wiki-armor-sets.2026-04-28T03-04-18.454Z.json'),
    JSON.stringify({
      records: [
        {
          pageTitle: 'Magic Hat',
          nameZh: '魔法帽',
          nameEn: 'Magic Hat',
          compositionKind: 'single_piece_set',
          effectText: '+60 最大魔力'
        }
      ]
    })
  );

  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      wikiArmorSetsInput: latestPath,
      scopes: ['armor_set']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_armor_sets')) {
          return [{
            id: 1,
            record_key: 'legacy-armor-maint-key',
            text_key: 'ArmorSetBonus.Wood',
            benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
            set_count: 1,
            unique_item_count: 3,
            sets_json: JSON.stringify([[727, 728, 729]]),
            unique_item_ids_json: JSON.stringify([727, 728, 729]),
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_items')) {
          return [{
            source_id: 2275,
            internal_name: 'MagicHat',
            english_name: 'Magic Hat',
            name_zh: '魔法帽',
            raw_json: JSON.stringify({ headSlot: 159 })
          }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-28.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-28.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-28.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-28.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.relationArmorSets.length, 1);
  assert.equal(result.results.relationArmorSets[0].textKey, 'WikiArmorSet.Magic Hat');
  assert.equal(result.results.projectionArmorSets[0].compositionKind, 'single_piece_set');
  assert.equal(result.results.projectionArmorSets[0].nameZh, '魔法帽');
  assert.deepEqual(JSON.parse(result.results.projectionArmorSets[0].currentItemIdsJson), [2275]);
});

test('runSync apply mode clears stale relation tables before writing current snapshot', async () => {
  const statements = [];

  await runSync(
    {
      apply: true,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_item_sources')) {
          return [{
            id: 11,
            record_key: '1'.repeat(64),
            item_internal_name: 'AmmoBox',
            item_name: 'Ammo Box',
            source_type: 'shop',
            source_ref_type: 'npc',
            source_ref_name: 'Arms Dealer for',
            raw_json: JSON.stringify({
              sourceRefName: 'Arms Dealer for',
              notes: 'The Ammo Box can be purchased from the Arms Dealer for 10 GC in Hardmode .'
            }),
            landing_source_id: 51,
            landing_source_key: 'generated.item_relations_bundle:chunk:0001',
            landing_content_hash: 'f'.repeat(64),
            source_provider: 'wiki_gg',
            source_page: 'Ammo Box'
          }];
        }
        if (sql.includes('maint_items')) {
          return [{
            id: 1,
            source_id: 1,
            internal_name: 'AmmoBox',
            english_name: 'Ammo Box',
            raw_json: JSON.stringify({ shoot: 1 })
          }];
        }
        if (sql.includes('maint_npcs')) {
          return [{
            id: 2,
            source_id: 17,
            internal_name: 'ArmsDealer',
            english_name: 'Arms Dealer',
            name: 'Arms Dealer',
            raw_json: JSON.stringify({ wikiCrawler: { combat: { projectileId: 1 } } })
          }];
        }
        if (sql.includes('maint_buffs')) return [];
        if (sql.includes('maint_projectiles')) {
          return [{
            id: 3,
            source_id: 1,
            internal_name: 'WoodenArrowFriendly',
            english_name: 'Wooden Arrow (friendly)',
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_npc_images')) return [];
        if (sql.includes('maint_item_images')) return [];
        if (sql.includes('maint_item_categories')) return [];
        if (sql.includes('maint_categories')) return [];
        if (sql.includes('maint_item_recipes')) return [];
        if (sql.includes('maint_item_page_recipes')) return [];
        if (sql.includes('maint_recipe_page_recipes')) return [];
        if (sql.includes('maint_item_biomes')) return [];
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-25.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-25.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-25.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-25.json'
      }),
      executeRelation: async (fn) => fn({
        query: async (sql, params = []) => {
          statements.push(sql);
          if (sql.includes('SELECT id, related_items_json')) {
            return [[{
              id: 88,
              related_items_json: JSON.stringify([
                {
                  internalName: 'AmmoBox',
                  image: 'https://terraria.wiki.gg/images/Ammo_Box.png'
                }
              ])
            }], []];
          }
          if (sql.includes('FROM `terria_v1_local`.`items`')) {
            return [[{
              internal_name: 'AmmoBox',
              image: 'http://localhost:9000/terrapedia-images/items/ammo-box.png'
            }], []];
          }
          return [[], []];
        },
        execute: async (sql) => {
          statements.push(sql);
          return [[], []];
        }
      })
    }
  );

  assert.ok(statements.some((sql) => clearsTable(sql, 'relation_items')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'relation_item_rarities')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'item_npc_shop_relations')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'item_npc_relation_audits')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'item_projectile_relations')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'npc_projectile_relations')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `item_projectile_relations`')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `npc_projectile_relations`')));
  assert.ok(statements.some((sql) => clearsTable(sql, 'npc_projectile_audits')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `npc_projectile_audits`')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `item_npc_relation_audits`')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE `relation_items` ri')));
  assert.ok(statements.some((sql) => sql.includes('SET ri.stack_size = mi.stack_size')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE `projection_items` pi')));
  assert.ok(statements.some((sql) => sql.includes('pi.stack_size = ri.stack_size')));
  assert.ok(statements.some((sql) => sql.includes('SET pi.image = picked.cached_url')));
  assert.ok(statements.some((sql) => sql.includes('ROW_NUMBER() OVER')));
  assert.ok(statements.some((sql) => sql.includes('ORDER BY COALESCE(mi.is_primary, 0) DESC, COALESCE(mi.sort_order, 2147483647) ASC, mi.id ASC')));
  assert.ok(statements.some((sql) => sql.includes('AND mi.cached_url IS NOT NULL')));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(mi.cached_url) LIKE BINARY 'http://localhost:9000/terrapedia-images/items/%'")));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(mi.cached_url) LIKE BINARY 'http://127.0.0.1:9000/terrapedia-images/items/%'")));
  assert.ok(statements.every((sql) => !sql.includes('SET pi.image = COALESCE(mi.cached_url, mi.original_url)')));
  assert.ok(statements.some((sql) => sql.includes('INNER JOIN `terria_v1_local`.`items` li')));
  assert.ok(statements.some((sql) => sql.includes('SET pi.image = li.image')));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(pi.image) NOT LIKE BINARY 'http://localhost:9000/terrapedia-images/items/%'")));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(pi.image) NOT LIKE BINARY 'http://127.0.0.1:9000/terrapedia-images/items/%'")));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(li.image) LIKE BINARY 'http://localhost:9000/terrapedia-images/items/%'")));
  assert.ok(statements.some((sql) => sql.includes("BINARY TRIM(li.image) LIKE BINARY 'http://127.0.0.1:9000/terrapedia-images/items/%'")));
  assert.ok(statements.every((sql) => !sql.includes("LIKE '%/terrapedia-images/%'")));
  assert.ok(statements.some((sql) => sql.includes('SELECT id, related_items_json')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_local`.`items`')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE `projection_armor_sets` SET related_items_json = ?')));
  assert.ok(statements.some((sql) => sql.includes('DROP TABLE IF EXISTS `terria_v1_relation`.`item_npc_shop_candidates`')));
  assert.ok(statements.some((sql) => sql.includes('DROP TABLE IF EXISTS `terria_v1_relation`.`item_npc_loot_candidates`')));
  assert.ok(statements.every((sql) => !sql.includes('item_npc_shop_candidates` (`record_key`')));
  assert.ok(statements.every((sql) => !sql.includes('item_npc_loot_candidates` (`record_key`')));
});

test('runSync projects maint numeric and text overrides into projection items during dry-run', async () => {
  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) {
          return [{
            source_id: 8,
            internal_name: 'Torch',
            english_name: 'Torch',
            raw_json: '{}'
          }];
        }
        if (sql.includes('maint_item_numeric_overrides')) {
          return [{
            item_internal_name: 'Torch',
            damage_value: 0,
            defense_value: 0,
            knockback_value: 0,
            use_time: 15,
            buy_value: 0,
            sell_value: 10
          }];
        }
        if (sql.includes('maint_item_text_overrides')) {
          return [{
            item_internal_name: 'Torch',
            tooltip_zh: '基础照明',
            description_zh: '基础光源'
          }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-26.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-26.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-26.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-26.json'
      }),
      executeRelation: async () => {
        throw new Error('should not write in dry-run');
      }
    }
  );

  assert.equal(result.results.projectionItems.length, 1);
  assert.equal(result.results.projectionItems[0].damage, 0);
  assert.equal(result.results.projectionItems[0].defense, 0);
  assert.equal(result.results.projectionItems[0].knockback, 0);
  assert.equal(result.results.projectionItems[0].useTime, 15);
  assert.equal(result.results.projectionItems[0].buy, 0);
  assert.equal(result.results.projectionItems[0].sell, 10);
  assert.equal(result.results.projectionItems[0].tooltipZh, '基础照明');
  assert.equal(result.results.projectionItems[0].descriptionZh, '基础光源');
  assert.equal(result.summary.bridgeBreakdown.itemTextOverrideRows, 1);
});

test('runSync marks apply runs succeeded only after snapshot rows and report rows are written', async () => {
  const events = [];

  await runSync(
    {
      apply: true,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) {
          return [{ source_id: 1, internal_name: 'Torch', english_name: 'Torch', raw_json: '{}' }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-29.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-29.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-29.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-29.json'
      }),
      executeRelation: async (fn) => fn({
        query: async (sql) => {
          if (clearsTable(sql, 'relation_items')) events.push('clear-relation-items');
          if (sql.includes('UPDATE `projection_items` pi')) events.push('reconcile-projection-items');
          return [[], []];
        },
        execute: async (sql, params = []) => {
          if (sql.includes('INSERT INTO `relation_runs`')) events.push(`run-${params[9]}`);
          if (sql.includes('INSERT INTO `projection_items`')) events.push('projection-items');
          if (sql.includes('INSERT INTO `relation_run_reports`')) events.push('report-row');
          return [[], []];
        }
      })
    }
  );

  assert.deepEqual(events.filter((event) => event.startsWith('run-')), ['run-running', 'run-succeeded']);
  assert.ok(events.indexOf('run-running') < events.indexOf('clear-relation-items'));
  assert.ok(events.indexOf('projection-items') < events.indexOf('report-row'));
  assert.ok(events.lastIndexOf('report-row') < events.indexOf('run-succeeded'));
});

test('runSync apply mode can disable local item image fallback explicitly', async () => {
  const statements = [];

  await runSync(
    {
      apply: true,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: 'terria_v1_local',
      allowLocalItemImageFallback: false,
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) {
          return [{ id: 1, source_id: 1, internal_name: 'AmmoBox', english_name: 'Ammo Box', raw_json: '{}' }];
        }
        if (sql.includes('maint_npcs')) {
          return [{ id: 2, source_id: 17, internal_name: 'ArmsDealer', english_name: 'Arms Dealer', raw_json: '{}' }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-26.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-26.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-26.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-26.json'
      }),
      executeRelation: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          if (sql.includes('information_schema.columns')) {
            return [[], []];
          }
          return [{ affectedRows: 0 }, []];
        },
        execute: async (sql) => {
          statements.push(sql);
          return [[], []];
        }
      })
    }
  );

  assert.ok(statements.some((sql) => sql.includes('SET pi.image = picked.cached_url')));
  assert.ok(statements.some((sql) => sql.includes('ROW_NUMBER() OVER')));
  assert.ok(statements.every((sql) => !sql.includes('SET pi.image = COALESCE(mi.cached_url, mi.original_url)')));
  assert.ok(statements.every((sql) => !sql.includes('INNER JOIN `terria_v1_local`.`items` li')));
});

test('runSync emits no managed image SQL predicates when managed prefixes are empty', async () => {
  const statements = [];

  await runSync(
    {
      apply: true,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
    },
    {
      managedImageUrlPrefixes: [],
      config: {
        database: {
          host: '127.0.0.1',
          port: 13306,
          username: 'root',
          password: 'root'
        }
      },
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) {
          return [{ id: 1, source_id: 1, internal_name: 'AmmoBox', english_name: 'Ammo Box', raw_json: '{}' }];
        }
        if (sql.includes('maint_item_images')) {
          return [{
            item_internal_name: 'AmmoBox',
            cached_url: 'http://localhost:9000/terrapedia-images/items/ammo-box.png'
          }];
        }
        if (sql.includes('maint_npcs')) {
          return [{ id: 2, source_id: 17, internal_name: 'ArmsDealer', english_name: 'Arms Dealer', raw_json: '{}' }];
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-04-30.json',
        auditMdPath: 'reports/relation/relation-audit-2026-04-30.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-04-30.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-04-30.json'
      }),
      executeRelation: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [[], []];
        },
        execute: async (sql) => {
          statements.push(sql);
          return [[], []];
        }
      })
    }
  );

  assert.ok(statements.some((sql) => sql.includes('AND FALSE')));
  assert.ok(statements.every((sql) => !sql.includes('localhost:9000/terrapedia-images/items/%')));
  assert.ok(statements.every((sql) => !sql.includes('127.0.0.1:9000/terrapedia-images/items/%')));
});
