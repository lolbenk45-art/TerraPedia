import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBiomeImageMutationValues } from './apply-biome-image-contract.mjs';

test('Biome image contract keeps original Wiki evidence separate from managed cache', () => {
  const values = buildBiomeImageMutationValues({
    id: 1,
    code: 'forest',
    nameEn: 'Forest',
    nameZh: '森林',
    iconUrl: 'https://terraria.wiki.gg/images/forest.png',
    originalUrl: 'https://terraria.wiki.gg/images/forest.png',
    cachedUrl: '/terrapedia-images/items/2026/08/21/forest.png',
    sourcePage: 'Forest',
    recordKey: 'record-key',
  });

  assert.deepEqual(values, {
    originalUrl: 'https://terraria.wiki.gg/images/forest.png',
    cachedUrl: '/terrapedia-images/items/2026/08/21/forest.png',
    contentType: 'image/png',
  });
});
