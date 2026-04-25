import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, runSync } from './sync-maint-to-relation.mjs';

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
    localDatabase: null,
    relationDatabase: 'terria_v1_relation',
    scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile']
  });
});

test('runSync dry-run reads maint only and does not write relation rows', async () => {
  const reads = [];
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
          port: 3306,
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
          return [{ source_id: 1, internal_name: 'LesserHealingPotion', raw_json: '{}' }];
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
        if (sql.includes('maint_npcs')) return [{ source_id: -65, internal_name: 'BigHornetStingy', raw_json: '{}' }];
        if (sql.includes('maint_item_biomes')) return [];
        if (sql.includes('maint_item_images')) return [];
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
  assert.equal(writeCalled, false);
  assert.equal(result.summary.domainSummary.base, 4);
  assert.equal(result.summary.domainSummary.image, 3);
  assert.equal(result.results.relationBuffs.length, 1);
  assert.equal(result.results.itemRecipeGroupExpansions.length, 0);
  assert.equal(result.results.itemNpcShopRelations.length, 0);
  assert.equal(result.results.itemNpcLootRelations.length, 0);
  assert.equal(result.results.relationProjectileImages.length, 1);
  assert.equal(result.results.relationBuffImages.length, 1);
  assert.equal(result.results.relationNpcImages.length, 1);
});

test('runSync apply mode clears stale relation tables before writing current snapshot', async () => {
  const statements = [];

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
          port: 3306,
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
          return [{ id: 1, source_id: 1, internal_name: 'AmmoBox', english_name: 'Ammo Box', raw_json: '{}' }];
        }
        if (sql.includes('maint_npcs')) {
          return [{ id: 2, source_id: 17, internal_name: 'ArmsDealer', english_name: 'Arms Dealer', name: 'Arms Dealer', raw_json: '{}' }];
        }
        if (sql.includes('maint_buffs')) return [];
        if (sql.includes('maint_projectiles')) return [];
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

  assert.ok(statements.some((sql) => sql.includes('DELETE FROM `relation_items`')));
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM `item_npc_shop_relations`')));
});
