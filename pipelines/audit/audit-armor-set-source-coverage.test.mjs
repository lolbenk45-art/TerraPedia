import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorSetCoverageReport,
  buildArmorSetStableKey
} from './audit-armor-set-source-coverage.mjs';

test('single_piece_set source pageTitle matches projection and API sourceKey', () => {
  const source = [{
    compositionKind: 'single_piece_set',
    pageTitle: 'Magic Hat',
    mappingStatus: 'accepted'
  }];
  const projection = [{
    compositionKind: 'single_piece_set',
    sourceKey: 'Magic Hat'
  }];
  const api = [{
    compositionKind: 'single_piece_set',
    sourceKey: 'Magic Hat'
  }];

  assert.equal(buildArmorSetStableKey(source[0]), 'single_piece_set|magic hat');
  assert.deepEqual(
    buildArmorSetCoverageReport({ sourceRows: source, projectionRows: projection, apiRows: api }),
    {
      sourceTotal: 1,
      projectionTotal: 1,
      apiTotal: 1,
      missingFromProjection: [],
      missingFromApi: [],
      unmappedItems: []
    }
  );
});

test('traditional_set source matches legacy projection rows inferred from item count', () => {
  const source = [{
    compositionKind: 'traditional_set',
    pageTitle: 'Wood armor'
  }];
  const projection = [{
    sourceKey: 'Wood armor',
    uniqueItemCount: 3
  }];

  assert.equal(buildArmorSetStableKey(projection[0]), 'traditional_set|wood armor');
  assert.deepEqual(
    buildArmorSetCoverageReport({ sourceRows: source, projectionRows: projection }),
    {
      sourceTotal: 1,
      projectionTotal: 1,
      apiTotal: 0,
      missingFromProjection: [],
      missingFromApi: [
        {
          key: 'traditional_set|wood armor',
          source: {
            key: 'traditional_set|wood armor',
            compositionKind: 'traditional_set',
            pageTitle: 'Wood armor',
            sourceKey: null
          }
        }
      ],
      unmappedItems: []
    }
  );
});
