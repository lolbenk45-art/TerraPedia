import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSecondaryRelations } from './secondary-relation-processor.mjs';

test('buildSecondaryRelations promotes matched item and npc projectile facts', () => {
  const actual = buildSecondaryRelations({
    itemBiomeRows: [
      {
        id: 1,
        record_key: 'b'.repeat(64),
        item_internal_name: 'Acorn',
        item_name: 'Acorn',
        biome_code: 'crimson',
        relation_type: 'found_in',
        raw_json: '{}'
      }
    ],
    maintBuffRows: [
      {
        source_id: 1,
        internal_name: 'Honey',
        raw_json: JSON.stringify({
          sourceItems: [
            {
              itemId: 200,
              internalName: 'BottledHoney',
              buffTime: 900
            }
          ]
        })
      }
    ],
    maintProjectileRows: [
      { source_id: 1, internal_name: 'ProjectileA', english_name: 'Projectile A', raw_json: '{}' },
      { source_id: 24, internal_name: 'SpikyBall', english_name: 'Spiky Ball', raw_json: '{}' }
    ],
    maintItemRows: [
      { source_id: 10, internal_name: 'ItemA', raw_json: JSON.stringify({ shoot: 1 }) }
    ],
    maintNpcRows: [
      {
        source_id: 20,
        internal_name: 'GoblinTinkerer',
        english_name: 'Goblin Tinkerer',
        raw_json: JSON.stringify({
          wikiCrawler: {
            combat: {
              projectileId: 24
            }
          }
        })
      }
    ],
    itemImageRows: [
      { item_internal_name: 'Acorn', is_primary: 1 }
    ]
  });

  assert.equal(actual.itemBiomeRelations.length, 1);
  assert.equal(actual.itemBiomeRelations[0].reason, 'maint_item_biome');
  assert.equal(actual.itemBuffRelations.length, 1);
  assert.equal(actual.itemBuffRelations[0].reviewStatus, 'resolved');
  assert.equal(actual.itemBuffRelations[0].relationType, 'buff_source_item');
  assert.equal(actual.itemProjectileRelations.length, 1);
  assert.equal(actual.itemProjectileRelations[0].itemInternalName, 'ItemA');
  assert.equal(actual.itemProjectileRelations[0].projectileInternalName, 'ProjectileA');
  assert.equal(actual.itemProjectileRelations[0].relationType, 'item_direct_shoot');
  assert.equal(actual.itemProjectileRelations[0].sourceField, 'raw_json.shoot');
  assert.equal(actual.itemProjectileRelations[0].reviewStatus, 'resolved');
  assert.equal(actual.npcProjectileRelations.length, 1);
  assert.equal(actual.npcProjectileRelations[0].npcInternalName, 'GoblinTinkerer');
  assert.equal(actual.npcProjectileRelations[0].projectileInternalName, 'SpikyBall');
  assert.equal(actual.npcProjectileRelations[0].relationType, 'npc_infobox_projectile');
  assert.equal(actual.npcProjectileRelations[0].sourceField, 'raw_json.wikiCrawler.combat.projectileId');
  assert.equal(actual.itemProjectileAudits.length, 1);
  assert.equal(actual.itemProjectileAudits[0].auditStatus, 'promoted_to_relation');
  assert.equal(actual.summary.imageCoverageRows, 1);
});

test('buildSecondaryRelations does not infer npc projectile facts from aiStyle', () => {
  const actual = buildSecondaryRelations({
    maintProjectileRows: [
      { source_id: 55, internal_name: 'Stinger', raw_json: '{}' }
    ],
    maintNpcRows: [
      {
        source_id: -65,
        internal_name: 'BigHornetStingy',
        raw_json: JSON.stringify({ aiStyle: 5 })
      }
    ]
  });

  assert.equal(actual.npcProjectileRelations.length, 0);
});
