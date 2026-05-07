import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImageSourceLineageReport,
  buildImageSourceLineageQueries,
  parseArgs,
  resolveImageSourceLineageReportPath,
} from './image-source-lineage-report.mjs';

const GENERATED_AT = '2026-05-06T08:00:00.000Z';

test('buildImageSourceLineageReport classifies contract readiness and gaps across seven entity types', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    entities: {
      items: {
        coreRows: [{ internalName: 'Torch', image: 'https://terraria.wiki.gg/images/Torch.png' }],
        maintImageRows: [{
          itemInternalName: 'Torch',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
          contentType: 'image/png',
        }],
        relationImageRows: [{
          itemInternalName: 'Torch',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
          contentType: 'image/png',
        }],
        projectionRows: [{ internalName: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' }],
      },
      buffs: {
        coreRows: [{ internalName: 'WellFed', image: 'https://terraria.wiki.gg/images/Well_Fed.png' }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [{ internalName: 'WellFed', image: 'https://terraria.wiki.gg/images/Well_Fed.png' }],
      },
      npcs: {
        coreRows: [{ internalName: 'Guide', imageUrl: 'https://terraria.wiki.gg/images/Guide.png' }],
        maintImageRows: [{
          npcInternalName: 'Guide',
          originalUrl: 'https://terraria.wiki.gg/images/Guide.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/guide.png',
          contentType: 'image/png',
        }],
        relationImageRows: [],
        projectionRows: [{ internalName: 'Guide', imageUrl: 'https://terraria.wiki.gg/images/Guide.png' }],
      },
      bosses: {
        coreRows: [{ code: 'KING_SLIME', nameEn: 'King Slime', imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png' }],
        maintImageRows: [{
          bossTitleEn: 'King Slime',
          imageUrl: 'https://terraria.wiki.gg/images/King_Slime.png',
          sourcePage: 'Bosses',
          sourceRevisionTimestamp: '2026-05-06T00:00:00Z',
        }],
        relationImageRows: [{
          bossTitleEn: 'King Slime',
          imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
          sourcePage: 'Bosses',
          sourceMaintTable: 'maint_bosses',
          sourceMaintId: 1,
        }],
        projectionRows: [{
          code: 'KING_SLIME',
          imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
        }],
      },
      projectiles: {
        coreRows: [{ internalName: 'WoodenArrowFriendly', rawJson: JSON.stringify({ imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png' }) }],
        maintImageRows: [{
          projectileInternalName: 'WoodenArrowFriendly',
          rawJson: JSON.stringify({ image: 'Wooden Arrow.png' }),
          sourceProvider: 'terraria.wiki.gg',
          sourcePage: 'Module:Projectileinfo/data',
        }],
        relationImageRows: [{
          projectileInternalName: 'WoodenArrowFriendly',
          originalUrl: 'https://terraria.wiki.gg/images/Wooden%20Arrow.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png',
        }],
        projectionRows: [{ internalName: 'WoodenArrowFriendly', imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png' }],
      },
      armor_sets: {
        coreRows: [{
          sourceKey: 'Mythril Armor',
          maleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/8d/8d7e688c8af125976c3feb2cb4562f3df80fdc89-mythril-armor-png.png',
          femaleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/d4/d40782141fa2042ffeb3611ab428743655522e71-mythril-armor-female-png.png',
        }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [{
          sourceKey: 'Mythril Armor',
          maleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/8d/8d7e688c8af125976c3feb2cb4562f3df80fdc89-mythril-armor-png.png',
          femaleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/d4/d40782141fa2042ffeb3611ab428743655522e71-mythril-armor-female-png.png',
          specialImages: null,
        }],
      },
      biomes: {
        coreRows: [{ biomeCode: 'forest', rawJson: JSON.stringify({ iconUrl: 'https://terraria.wiki.gg/images/Forest.png' }) }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [],
      },
    },
  });

  assert.equal(report.generatedAt, GENERATED_AT);
  assert.equal(report.summary.totalEntityTypes, 7);
  assert.equal(report.summary.readyEntityTypes, 4);
  assert.equal(report.summary.notReadyEntityTypes, 3);

  assert.equal(report.entities.items.contractReady, true);
  assert.deepEqual(report.entities.items.gapReasons, []);

  assert.equal(report.entities.bosses.contractReady, true);
  assert.deepEqual(report.entities.bosses.gapReasons, []);

  assert.equal(report.entities.buffs.contractReady, false);
  assert.ok(report.entities.buffs.gapReasons.includes('missing_maint_image_rows'));
  assert.ok(report.entities.buffs.gapReasons.includes('missing_relation_image_rows'));
  assert.ok(report.entities.buffs.gapReasons.includes('projection_image_not_managed'));

  assert.equal(report.entities.npcs.contractReady, false);
  assert.ok(report.entities.npcs.gapReasons.includes('projection_image_not_managed'));
  assert.ok(report.entities.npcs.gapReasons.includes('missing_relation_image_rows'));

  assert.equal(report.entities.projectiles.contractReady, true);
  assert.deepEqual(report.entities.projectiles.gapReasons, []);

  assert.equal(report.entities.armor_sets.contractReady, true);
  assert.deepEqual(report.entities.armor_sets.gapReasons, []);

  assert.equal(report.entities.biomes.contractReady, false);
  assert.ok(report.entities.biomes.gapReasons.includes('missing_projection_image_field'));
  assert.ok(report.entities.biomes.gapReasons.includes('missing_relation_image_table'));
});

test('buildImageSourceLineageQueries stay read-only and cover the expected lineage tables', () => {
  const queries = buildImageSourceLineageQueries({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
  });

  assert.match(queries.items.core, /^\s*SELECT/i);
  assert.match(queries.items.maintImages, /maint_item_images/i);
  assert.match(queries.items.projection, /FROM `terria_v1_relation`\.`projection_items`/);
  assert.match(queries.bosses.core, /FROM `terria_v1_local`\.`boss_groups`/i);
  assert.match(queries.bosses.maintImages, /maint_bosses/i);
  assert.match(queries.bosses.relationImages, /relation_bosses/i);
  assert.match(queries.bosses.projection, /FROM `terria_v1_relation`\.`projection_bosses`/i);
  assert.doesNotMatch(queries.buffs.core, /image_path/i);
  assert.match(queries.buffs.relationImages, /relation_buff_images/i);
  assert.match(queries.npcs.maintImages, /maint_npc_images/i);
  assert.match(queries.projectiles.maintImages, /FROM `terria_v1_maint`\.`maint_projectiles`/i);
  assert.match(queries.projectiles.relationImages, /relation_projectile_images/i);
  assert.match(queries.projectiles.projection, /FROM `terria_v1_relation`\.`projection_projectiles`/i);
  assert.match(queries.buffs.projection, /FROM `terria_v1_relation`\.`projection_buffs`/i);
  assert.match(queries.armor_sets.core, /FROM `terria_v1_relation`\.`projection_armor_sets`/i);
  assert.match(queries.armor_sets.projection, /FROM `terria_v1_relation`\.`projection_armor_sets`/i);
  assert.match(queries.biomes.core, /FROM `terria_v1_local`\.`biomes`/);
  assert.doesNotMatch(queries.biomes.core, /raw_json/i);

  for (const entityQueries of Object.values(queries)) {
    for (const sql of Object.values(entityQueries)) {
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
    }
  }
});

test('parseArgs keeps audit input and report output explicit', () => {
  assert.deepEqual(parseArgs([
    '--source=db',
    '--maint-database=terria_v1_maint',
    '--relation-database=terria_v1_relation',
    '--local-database=terria_v1_local',
    '--output=reports/audit/image-source-lineage.json',
  ]), {
    source: 'db',
    output: 'reports/audit/image-source-lineage.json',
    repoRoot: null,
    generatedAt: null,
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
  });
});

test('resolveImageSourceLineageReportPath defaults to the audit reports folder', () => {
  const reportPath = resolveImageSourceLineageReportPath({ generatedAt: GENERATED_AT });
  assert.match(reportPath.replaceAll('\\', '/'), /reports\/audit\/image-source-lineage-2026-05-06\.json$/);
});
