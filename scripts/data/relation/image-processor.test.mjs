import test from 'node:test';
import assert from 'node:assert/strict';

import { buildImageRelations } from './image-processor.mjs';

test('buildImageRelations mirrors maint item image rows into relation item images', () => {
  const actual = buildImageRelations({
    maintItemImages: [
      {
        id: 1,
        record_key: 'a'.repeat(64),
        item_internal_name: 'Abeemination',
        item_name: 'Abeemination',
        role: 'icon',
        source_file_title: 'Abeemination.png',
        original_url: 'https://terraria.wiki.gg/images/Abeemination.png',
        cached_url: 'https://terraria.wiki.gg/images/Abeemination.png',
        width: 32,
        height: 34,
        content_type: 'image/png',
        is_primary: 1,
        sort_order: 0,
        raw_json: '{}',
        landing_source_id: 6180,
        landing_source_key: 'generated.item_relations_bundle:chunk:0001',
        landing_content_hash: 'b'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Abeemination',
        source_revision_timestamp: '2025-10-12T17:14:54Z'
      }
    ]
  });

  assert.equal(actual.relationItemImages.length, 1);
  assert.equal(actual.relationItemImages[0].itemInternalName, 'Abeemination');
  assert.equal(actual.relationItemImages[0].role, 'icon');
  assert.equal(actual.relationItemImages[0].isPrimary, true);
  assert.equal(actual.relationItemImages[0].sourceMaintTable, 'maint_item_images');
});

test('buildImageRelations derives projectile image rows from maint raw_json image titles and keeps source urls', () => {
  const actual = buildImageRelations({
    maintProjectiles: [
      {
        id: 2,
        source_id: 1,
        internal_name: 'WoodenArrowFriendly',
        english_name: 'Wooden Arrow (friendly)',
        raw_json: JSON.stringify({
          image: 'Wooden Arrow.png'
        }),
        source_provider: 'terraria.wiki.gg',
        source_page: 'Module:Projectileinfo/data'
      }
    ],
    localProjectiles: [
      {
        internal_name: 'WoodenArrowFriendly',
        image_url: 'http://localhost:9000/terrapedia-images/projectiles/2026/05/07/wooden-arrow.png'
      }
    ]
  });

  assert.equal(actual.relationProjectileImages.length, 1);
  assert.equal(actual.relationProjectileImages[0].projectileInternalName, 'WoodenArrowFriendly');
  assert.equal(actual.relationProjectileImages[0].sourceFileTitle, 'Wooden Arrow.png');
  assert.equal(
    actual.relationProjectileImages[0].cachedUrl,
    'http://localhost:9000/terrapedia-images/projectiles/2026/05/07/wooden-arrow.png'
  );
  assert.equal(
    actual.relationProjectileImages[0].originalUrl,
    'https://terraria.wiki.gg/images/Wooden%20Arrow.png'
  );
  assert.equal(actual.relationProjectileImages[0].contentType, 'image/png');
  assert.equal(actual.relationProjectileImages[0].sourceMaintTable, 'maint_projectiles');
});

test('buildImageRelations derives buff image rows and prefers managed cached urls', () => {
  const actual = buildImageRelations({
    maintBuffs: [
      {
        id: 1,
        source_id: 1,
        internal_name: 'ObsidianSkin',
        english_name: 'Obsidian Skin',
        image_cached_url: 'http://localhost:9000/terrapedia-images/buffs/2026/05/07/obsidian-skin.png',
        raw_json: JSON.stringify({
          image: 'http://localhost:9000/terrapedia-images/buffs/2026/05/07/obsidian-skin.png'
        }),
        source_provider: 'terraria.wiki.gg',
        source_page: 'Template:GetBuffInfo'
      }
    ],
    localBuffs: [
      {
        internal_name: 'ObsidianSkin',
        image: 'http://localhost:9000/terrapedia-images/items/2026/04/08/9c526fabad7e4f8994a6340f15a86936.png',
        image_cached_url: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/e8/e81a74cb058d02494e2da8dd8a833c4b0b57c5dc-obsidianskin.png'
      }
    ]
  });

  assert.equal(actual.relationBuffImages.length, 1);
  assert.equal(actual.relationBuffImages[0].buffInternalName, 'ObsidianSkin');
  assert.equal(
    actual.relationBuffImages[0].sourceFileTitle,
    'http://localhost:9000/terrapedia-images/buffs/2026/05/07/obsidian-skin.png'
  );
  assert.equal(
    actual.relationBuffImages[0].cachedUrl,
    'http://localhost:9000/terrapedia-images/items/wiki/buffs/e8/e81a74cb058d02494e2da8dd8a833c4b0b57c5dc-obsidianskin.png'
  );
  assert.equal(actual.relationBuffImages[0].contentType, 'image/png');
  assert.equal(actual.relationBuffImages[0].sourceMaintTable, 'maint_buffs');
});

test('buildImageRelations mirrors maint npc image rows into relation npc images', () => {
  const actual = buildImageRelations({
    maintNpcImages: [
      {
        id: 1,
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
      }
    ]
  });

  assert.equal(actual.relationNpcImages.length, 1);
  assert.equal(actual.relationNpcImages[0].npcInternalName, 'BigHornetStingy');
  assert.equal(actual.relationNpcImages[0].sourceFileTitle, 'Stingy Hornet.gif');
  assert.equal(actual.relationNpcImages[0].contentType, 'image/gif');
  assert.equal(actual.relationNpcImages[0].sourceMaintTable, 'maint_npc_images');
});
