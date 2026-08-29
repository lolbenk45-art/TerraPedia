import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBossSourceChain } from './audit-boss-source-chain.mjs';

test('uses relation-bound maint records when historical duplicate titles exist', () => {
  const result = evaluateBossSourceChain({
    sourcePillars: [
      { titleEn: 'Solar Pillar', titleZh: '日耀柱', sourceUrlZh: 'https://wiki/Solar' },
      { titleEn: 'Nebula Pillar', titleZh: '星云柱', sourceUrlZh: 'https://wiki/Nebula' },
      { titleEn: 'Stardust Pillar', titleZh: '星尘柱', sourceUrlZh: 'https://wiki/Stardust' },
      { titleEn: 'Vortex Pillar', titleZh: '星旋柱', sourceUrlZh: 'https://wiki/Vortex' },
    ],
    landingRows: [
      { id: 10, sourceKey: 'wiki.page.boss:Solar Pillar', contentHash: 'old', payloadTitleZh: null },
      { id: 20, sourceKey: 'wiki.page.boss:Solar Pillar', contentHash: 'new', payloadTitleZh: '日耀柱' },
      { id: 11, sourceKey: 'wiki.page.boss:Nebula Pillar', contentHash: 'old-n', payloadTitleZh: null },
      { id: 21, sourceKey: 'wiki.page.boss:Nebula Pillar', contentHash: 'new-n', payloadTitleZh: '星云柱' },
      { id: 22, sourceKey: 'wiki.page.boss:Stardust Pillar', contentHash: 'new-d', payloadTitleZh: '星尘柱' },
      { id: 23, sourceKey: 'wiki.page.boss:Vortex Pillar', contentHash: 'new-v', payloadTitleZh: '星旋柱' },
    ],
    maintRows: [
      { id: 1, recordKey: 'old-s', titleEn: 'Solar Pillar', titleZh: null, landingSourceId: 10, landingContentHash: 'old' },
      { id: 2, recordKey: 'new-s', titleEn: 'Solar Pillar', titleZh: '日耀柱', landingSourceId: 20, landingContentHash: 'new' },
      { id: 3, recordKey: 'old-n', titleEn: 'Nebula Pillar', titleZh: null, landingSourceId: 11, landingContentHash: 'old-n' },
      { id: 4, recordKey: 'new-n', titleEn: 'Nebula Pillar', titleZh: '星云柱', landingSourceId: 21, landingContentHash: 'new-n' },
      { id: 5, recordKey: 'new-d', titleEn: 'Stardust Pillar', titleZh: '星尘柱', landingSourceId: 22, landingContentHash: 'new-d' },
      { id: 6, recordKey: 'new-v', titleEn: 'Vortex Pillar', titleZh: '星旋柱', landingSourceId: 23, landingContentHash: 'new-v' },
    ],
    relationRows: [
      { titleEn: 'Solar Pillar', titleZh: '日耀柱', sourceMaintRecordKey: 'new-s', landingSourceId: 20, landingContentHash: 'new' },
      { titleEn: 'Nebula Pillar', titleZh: '星云柱', sourceMaintRecordKey: 'new-n', landingSourceId: 21, landingContentHash: 'new-n' },
      { titleEn: 'Stardust Pillar', titleZh: '星尘柱', sourceMaintRecordKey: 'new-d', landingSourceId: 22, landingContentHash: 'new-d' },
      { titleEn: 'Vortex Pillar', titleZh: '星旋柱', sourceMaintRecordKey: 'new-v', landingSourceId: 23, landingContentHash: 'new-v' },
    ],
    projectionRows: [
      { titleEn: 'Solar Pillar', titleZh: '日耀柱' },
      { titleEn: 'Nebula Pillar', titleZh: '星云柱' },
      { titleEn: 'Stardust Pillar', titleZh: '星尘柱' },
      { titleEn: 'Vortex Pillar', titleZh: '星旋柱' },
    ],
  });

  assert.equal(result.assertions.maintPillars, true);
  assert.equal(result.assertions.relationPillars, true);
  assert.equal(result.assertions.allPillarZhMatch, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.boundMaint.map((row) => row.id), [4, 2, 5, 6]);
});
