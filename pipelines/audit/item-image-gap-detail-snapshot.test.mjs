import assert from 'node:assert/strict';
import test from 'node:test';

import { buildItemImageGapDetailSnapshot } from './item-image-gap-detail-snapshot.mjs';

test('preserves table rows and field-level provenance for each classified identity', () => {
  const snapshot = buildItemImageGapDetailSnapshot({
    classification: {
      classification: {
        legacy_unowned_image_contract: {
          identities: [{ itemId: 75, internalName: 'FallenStar' }]
        }
      }
    },
    tables: {
      localItems: [{ id: 75, internal_name: 'FallenStar', source_page: 'Fallen Star' }],
      localItemImages: [{ id: 901, item_id: 75, source_file_title: 'Fallen Star.png', original_url: null, status: 1, deleted: 0 }],
      maintItems: [{ id: 33, internal_name: 'FallenStar', landing_source_page: 'Fallen Star' }],
      maintItemImages: [{ id: 44, item_internal_name: 'FallenStar', cached_url: 'https://cache.test/star.png' }],
      relationItems: [{ id: 55, internal_name: 'FallenStar', source_maint_id: 33 }],
      relationItemImages: [{ id: 66, item_internal_name: 'FallenStar', source_file_title: 'Fallen Star.png', original_url: null }],
      projectionItems: [{ id: 75, internal_name: 'FallenStar', image: null }]
    },
    generatedAt: '2026-08-20T05:00:00+08:00'
  });

  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.records[0].classification, 'legacy_unowned_image_contract');
  assert.deepEqual(snapshot.records[0].tables.local.items.rows[0], {
    id: 75,
    internal_name: 'FallenStar',
    source_page: 'Fallen Star'
  });
  assert.equal(snapshot.records[0].tables.local.images.activeRowCount, 1);
  assert.equal(snapshot.records[0].tables.maint.images.rows[0].original_url, undefined);
  assert.equal(snapshot.records[0].tables.relation.images.rows[0].source_file_title, 'Fallen Star.png');
  assert.equal(snapshot.records[0].tables.projection.items.rows[0].image, null);
  assert.equal(snapshot.summary.tableRowCounts.localItemImages, 1);
});

test('retains synthetic recipe identities even when maint and relation rows are absent', () => {
  const snapshot = buildItemImageGapDetailSnapshot({
    classification: {
      classification: {
        accepted_local_only_recipe: {
          identities: [{ itemId: 8415, internalName: 'ZH_RECIPE_SPINAL_TAP' }]
        }
      }
    },
    tables: {
      localItems: [{ id: 8415, internal_name: 'ZH_RECIPE_SPINAL_TAP' }],
      localItemImages: [],
      maintItems: [],
      maintItemImages: [],
      relationItems: [],
      relationItemImages: [],
      projectionItems: []
    }
  });

  const record = snapshot.records[0];
  assert.equal(record.classification, 'accepted_local_only_recipe');
  assert.equal(record.tables.local.items.rowCount, 1);
  assert.equal(record.tables.maint.items.rowCount, 0);
  assert.equal(record.tables.relation.items.rowCount, 0);
  assert.equal(record.tables.projection.items.rowCount, 0);
});
