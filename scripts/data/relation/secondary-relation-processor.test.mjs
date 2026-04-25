import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSecondaryRelations } from './secondary-relation-processor.mjs';

test('buildSecondaryRelations emits biome relations and projectile audits without final projectile facts', () => {
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
      { source_id: 1, internal_name: 'ProjectileA', raw_json: '{}' }
    ],
    maintItemRows: [
      { source_id: 10, internal_name: 'ItemA', raw_json: JSON.stringify({ shoot: 1 }) }
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
  assert.equal(actual.itemProjectileAudits.length, 1);
  assert.equal(actual.itemProjectileAudits[0].auditStatus, 'not_promoted_first_stage');
  assert.equal(actual.summary.imageCoverageRows, 1);
});
