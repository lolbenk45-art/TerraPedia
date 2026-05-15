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
          ],
          inflictingNpcs: [
            {
              npcId: 20,
              internalName: 'GoblinTinkerer',
              name: 'Goblin Tinkerer',
              buffTime: 300
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
      { source_id: 10, internal_name: 'ItemA', raw_json: JSON.stringify({ shoot: 1 }) },
      { source_id: 200, internal_name: 'BottledHoney', english_name: 'Bottled Honey', raw_json: '{}' }
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
  assert.equal(actual.npcBuffRelations.length, 1);
  assert.equal(actual.npcBuffRelations[0].npcInternalName, 'GoblinTinkerer');
  assert.equal(actual.npcBuffRelations[0].buffInternalName, 'Honey');
  assert.equal(actual.npcBuffRelations[0].relationType, 'inflicts');
  assert.equal(actual.npcBuffRelations[0].durationTicks, 300);
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
  assert.equal(actual.itemProjectileAudits.filter((row) => row.auditStatus === 'promoted_to_relation').length, 1);
  assert.equal(actual.itemProjectileAudits.filter((row) => row.auditStatus === 'crawl_candidate').length, 1);
  assert.equal(actual.summary.imageCoverageRows, 1);
});

test('buildSecondaryRelations only promotes resolved buff source item and inflicting npc identities', () => {
  const actual = buildSecondaryRelations({
    maintBuffRows: [
      {
        source_id: 39,
        internal_name: 'CursedInferno',
        raw_json: JSON.stringify({
          sourceItems: [
            { itemId: 47, internalName: 'CursedArrow', resolveStatus: 'resolved' },
            { name: 'Unknown item', resolveStatus: 'unresolved' },
            { itemId: 48, internalName: 'AmbiguousItem', resolveStatus: 'ambiguous' },
            { resolveStatus: 'resolved' }
          ],
          inflictingNpcs: [
            { npcId: 214, internalName: 'Clinger', name: 'Clinger', resolveStatus: 'resolved' },
            { name: 'Unknown NPC', resolveStatus: 'unresolved' },
            { npcId: 215, internalName: 'AmbiguousNpc', resolveStatus: 'ambiguous' },
            { resolveStatus: 'alias_resolved', name: 'No identity NPC' }
          ],
          sourceEvidence: {
            parseStatus: 'parsed',
            unresolvedFacts: [
              { group: 'inflictingNpcs', name: 'Unknown NPC', resolveStatus: 'unresolved' }
            ]
          }
        })
      }
    ],
    maintItemRows: [
      { source_id: 47, internal_name: 'CursedArrow', english_name: 'Cursed Arrow', raw_json: '{}' }
    ],
    maintNpcRows: [
      { source_id: 214, internal_name: 'Clinger', english_name: 'Clinger', raw_json: '{}' }
    ]
  });

  assert.deepEqual(
    actual.itemBuffRelations.map((relation) => relation.itemInternalName),
    ['CursedArrow']
  );
  assert.deepEqual(
    actual.npcBuffRelations.map((relation) => relation.npcInternalName),
    ['Clinger']
  );
});

test('buildSecondaryRelations requires buff facts to resolve against maint item and npc identities', () => {
  const actual = buildSecondaryRelations({
    maintBuffRows: [
      {
        source_id: 39,
        internal_name: 'CursedInferno',
        raw_json: JSON.stringify({
          sourceItems: [
            { internalName: 'CursedArrow', name: 'Cursed Arrow' },
            { internalName: 'ParserOnlyItemName', name: 'Parser Only Item' }
          ],
          inflictingNpcs: [
            { internalName: 'Clinger', name: 'Clinger' },
            { internalName: 'ParserOnlyNpcName', name: 'Parser Only NPC' }
          ]
        })
      }
    ],
    maintItemRows: [
      { source_id: 545, internal_name: 'CursedArrow', english_name: 'Cursed Arrow', raw_json: '{}' }
    ],
    maintNpcRows: [
      { source_id: 214, internal_name: 'Clinger', english_name: 'Clinger', raw_json: '{}' }
    ]
  });

  assert.deepEqual(
    actual.itemBuffRelations.map((relation) => [relation.itemInternalName, relation.itemSourceId]),
    [['CursedArrow', 545]]
  );
  assert.deepEqual(
    actual.npcBuffRelations.map((relation) => [relation.npcInternalName, relation.npcSourceId]),
    [['Clinger', 214]]
  );
});

test('buildSecondaryRelations resolves buff facts with safe maint identity fallbacks only', () => {
  const actual = buildSecondaryRelations({
    maintBuffRows: [
      {
        source_id: 38,
        internal_name: 'TheTongue',
        raw_json: JSON.stringify({
          inflictingNpcs: [
            { internalName: 'WallOfFlesh', name: 'Wall of Flesh', pageTitle: 'Wall of Flesh' },
            { name: 'Tesla Turret', pageTitle: 'Tesla Turret' },
            { internalName: 'Gigazapper', name: 'Gigazapper', pageTitle: 'Gigazapper' },
            { internalName: 'HoneySlime', name: 'Honey Slime', pageTitle: 'Honey Slime' }
          ]
        })
      },
      {
        source_id: 999,
        internal_name: 'DisplayOnlyAmbiguousBuff',
        raw_json: JSON.stringify({
          inflictingNpcs: [
            { name: 'Wall of Flesh', pageTitle: 'Wall of Flesh' }
          ]
        })
      }
    ],
    maintNpcRows: [
      { source_id: 113, internal_name: 'WallofFlesh', english_name: 'Wall of Flesh', raw_json: '{}' },
      { source_id: 114, internal_name: 'WallofFleshEye', english_name: 'Wall of Flesh', raw_json: '{}' },
      { source_id: 381, internal_name: 'MartianTurret', english_name: 'Tesla Turret', raw_json: '{}' },
      { source_id: 382, internal_name: 'GigaZapper', english_name: 'Gigazapper', raw_json: '{}' }
    ]
  });

  assert.deepEqual(
    actual.npcBuffRelations.map((relation) => [relation.buffInternalName, relation.npcInternalName, relation.npcSourceId]),
    [
      ['TheTongue', 'WallofFlesh', 113],
      ['TheTongue', 'MartianTurret', 381],
      ['TheTongue', 'GigaZapper', 382]
    ]
  );
  assert.deepEqual(
    actual.issues.map((issue) => [issue.buffInternalName, issue.sourceInternalName, issue.sourceName, issue.reason]),
    [
      ['TheTongue', 'HoneySlime', 'Honey Slime', 'buff_inflicting_npc_unresolved'],
      ['DisplayOnlyAmbiguousBuff', null, 'Wall of Flesh', 'buff_inflicting_npc_unresolved']
    ]
  );
});

test('buildSecondaryRelations exports unresolved buff source item facts for relation reports', () => {
  const actual = buildSecondaryRelations({
    maintBuffRows: [
      {
        source_id: 39,
        internal_name: 'CursedInferno',
        raw_json: JSON.stringify({
          sourceItems: [
            { internalName: 'ParserOnlyItem', name: 'Parser Only Item', pageTitle: 'Parser Only Item' }
          ]
        })
      }
    ],
    maintItemRows: []
  });

  assert.equal(actual.itemBuffRelations.length, 0);
  assert.equal(actual.issues.length, 1);
  assert.equal(actual.issues[0].factGroup, 'sourceItems');
  assert.equal(actual.issues[0].reviewStatus, 'unresolved');
  assert.equal(actual.issues[0].reason, 'buff_source_item_unresolved');
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

test('buildSecondaryRelations records crawl candidates when projectile fields are absent', () => {
  const actual = buildSecondaryRelations({
    maintItemRows: [
      {
        id: 1,
        source_id: 100,
        internal_name: 'TrainingBow',
        english_name: 'Training Bow',
        raw_json: JSON.stringify({ damage: 4 })
      }
    ],
    maintNpcRows: [
      {
        id: 2,
        source_id: 200,
        internal_name: 'TrainingTarget',
        english_name: 'Training Target',
        raw_json: JSON.stringify({ aiStyle: 5 })
      }
    ]
  });

  assert.equal(actual.itemProjectileRelations.length, 0);
  assert.equal(actual.npcProjectileRelations.length, 0);
  assert.equal(actual.itemProjectileAudits.length, 1);
  assert.equal(actual.npcProjectileAudits.length, 1);

  assert.equal(actual.itemProjectileAudits[0].itemInternalName, 'TrainingBow');
  assert.equal(actual.itemProjectileAudits[0].auditStatus, 'crawl_candidate');
  assert.equal(actual.itemProjectileAudits[0].reviewStatus, 'unresolved');
  assert.equal(actual.itemProjectileAudits[0].reason, 'item_projectile_field_missing');
  assert.deepEqual(JSON.parse(actual.itemProjectileAudits[0].availableFieldsJson), {
    candidateKind: 'crawl_candidate',
    entityType: 'item',
    availableFields: ['damage'],
    expectedFields: ['raw_json.shoot', 'raw_json.projectileId', 'raw_json.projectile_id']
  });

  assert.equal(actual.npcProjectileAudits[0].npcInternalName, 'TrainingTarget');
  assert.equal(actual.npcProjectileAudits[0].auditStatus, 'crawl_candidate');
  assert.equal(actual.npcProjectileAudits[0].reviewStatus, 'unresolved');
  assert.equal(actual.npcProjectileAudits[0].reason, 'npc_projectile_field_missing');
  assert.deepEqual(JSON.parse(actual.npcProjectileAudits[0].availableFieldsJson), {
    candidateKind: 'crawl_candidate',
    entityType: 'npc',
    availableFields: ['aiStyle'],
    expectedFields: [
      'raw_json.wikiCrawler.combat.projectileId',
      'raw_json.combat.projectileId',
      'raw_json.projectileId',
      'raw_json.projectile_id'
    ]
  });
  assert.equal(actual.summary.itemProjectileAuditRows, 1);
  assert.equal(actual.summary.npcProjectileAuditRows, 1);
  assert.equal(actual.summary.projectileAuditRows, 2);
});

test('buildSecondaryRelations audits npc projectile ids that need projectile backfill', () => {
  const actual = buildSecondaryRelations({
    maintNpcRows: [
      {
        source_id: 210,
        internal_name: 'RangedTrainingNpc',
        english_name: 'Ranged Training NPC',
        raw_json: JSON.stringify({
          wikiCrawler: {
            combat: {
              projectileId: 999
            }
          }
        })
      }
    ]
  });

  assert.equal(actual.npcProjectileRelations.length, 0);
  assert.equal(actual.npcProjectileAudits.length, 1);
  assert.equal(actual.npcProjectileAudits[0].projectileSourceId, 999);
  assert.equal(actual.npcProjectileAudits[0].auditStatus, 'projectile_missing');
  assert.equal(actual.npcProjectileAudits[0].reviewStatus, 'unresolved');
  assert.equal(actual.npcProjectileAudits[0].reason, 'projectile_not_found');
  assert.deepEqual(JSON.parse(actual.npcProjectileAudits[0].availableFieldsJson), {
    candidateKind: 'backfill_candidate',
    npcProjectile: 999,
    sourceField: 'raw_json.wikiCrawler.combat.projectileId',
    projectileFound: false
  });
});

test('buildSecondaryRelations promotes multiple npc projectile ids from crawler text fields', () => {
  const actual = buildSecondaryRelations({
    maintProjectileRows: [
      { source_id: 1, internal_name: 'WoodenArrowFriendly', english_name: 'Wooden Arrow', raw_json: '{}' },
      { source_id: 2, internal_name: 'FireArrow', english_name: 'Fire Arrow', raw_json: '{}' }
    ],
    maintNpcRows: [
      {
        source_id: 22,
        internal_name: 'Guide',
        english_name: 'Guide',
        raw_json: JSON.stringify({
          wikiCrawler: {
            combat: {
              projectileId: '1, 2'
            }
          }
        })
      }
    ]
  });

  assert.deepEqual(
    actual.npcProjectileRelations.map((relation) => relation.projectileSourceId),
    [1, 2]
  );
  assert.deepEqual(
    actual.npcProjectileRelations.map((relation) => relation.projectileInternalName),
    ['WoodenArrowFriendly', 'FireArrow']
  );
  assert.equal(actual.npcProjectileAudits.length, 2);
  assert.deepEqual(
    actual.npcProjectileAudits.map((audit) => audit.auditStatus),
    ['promoted_to_relation', 'promoted_to_relation']
  );
});
