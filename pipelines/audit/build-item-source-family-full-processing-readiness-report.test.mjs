import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceFamilyFullProcessingReadinessReport,
  parseBuildItemSourceFamilyFullProcessingReadinessArgs,
  renderItemSourceFamilyFullProcessingReadinessChineseSummary
} from './build-item-source-family-full-processing-readiness-report.mjs';

test('parseBuildItemSourceFamilyFullProcessingReadinessArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--write-db', '--sync', '--import', '--materialize', '--backfill', '--crawler', '--fetch', '--flyway']) {
    assert.throws(
      () => parseBuildItemSourceFamilyFullProcessingReadinessArgs([flag]),
      /read-only family full-processing readiness report refuses mutation flag/
    );
  }
});

test('buildItemSourceFamilyFullProcessingReadinessReport groups remaining families into executable phases', () => {
  const report = buildItemSourceFamilyFullProcessingReadinessReport({
    generatedAt: '2026-06-13T00:00:00.000Z',
    workItemsReport: {
      readOnly: true,
      workItems: {
        familyPolicyPendingClosureRows: [
          { itemId: 1, internalName: 'BloodMoonRising', name: 'Blood Moon Rising' },
          { itemId: 2, internalName: 'MusicBoxBoss1', name: 'Music Box (Boss 1)' },
          { itemId: 3, internalName: 'StarStatue', name: 'Star Statue' },
          { itemId: 4, internalName: 'DragonflyBlue', name: 'Blue Dragonfly' },
          { itemId: 5, internalName: 'VaseJungle', name: 'Jungle Vase' },
          { itemId: 6, internalName: 'DemonAltar', name: 'Demon Altar' },
          { itemId: 7, internalName: 'UnsafeLivingWoodWall', name: 'Unsafe Living Wood Wall' },
          { itemId: 8, internalName: 'ShimmerMonolith', name: 'Shimmer Monolith' }
        ]
      }
    }
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.totalFamilyPolicyPendingRows, 8);
  assert.equal(report.summary.totalFamilies, 8);
  assert.equal(report.summary.allRowsAssignedToFamilyPlan, true);
  assert.deepEqual(
    report.familyPlans.map((family) => [family.family, family.count, family.phase, family.readinessStatus]),
    [
      ['Dragonflies', 1, 1, 'parser_ready_after_capture_contract'],
      ['Vases', 1, 2, 'parser_ready_after_worldgen_contract'],
      ['Altars', 1, 2, 'parser_ready_after_mixed_worldgen_boss_contract'],
      ['Shimmer Tools', 1, 2, 'parser_ready_after_mechanism_contract'],
      ['Unsafe Walls', 1, 2, 'parser_ready_after_worldgen_contract'],
      ['Paintings', 1, 3, 'requires_item_matrix_parser'],
      ['Music Boxes', 1, 3, 'requires_item_matrix_parser'],
      ['Statues', 1, 3, 'requires_item_matrix_parser']
    ]
  );
  assert.ok(report.familyPlans.find((family) => family.family === 'Music Boxes').unmetConditions.includes('Split recording/shimmer/event/drop/shop evidence by individual music box.'));
  assert.ok(report.familyPlans.every((family) => family.forbiddenActions.includes('Do not run crawler/fetch/import/backfill/sync/pipeline from this preparation report.')));
});

test('renderItemSourceFamilyFullProcessingReadinessChineseSummary includes gates and remaining table', () => {
  const report = buildItemSourceFamilyFullProcessingReadinessReport({
    generatedAt: '2026-06-13T00:00:00.000Z',
    workItemsReport: {
      readOnly: true,
      workItems: {
        familyPolicyPendingClosureRows: [
          { itemId: 1, internalName: 'MusicBoxBoss1', name: 'Music Box (Boss 1)' }
        ]
      }
    }
  });

  const summary = renderItemSourceFamilyFullProcessingReadinessChineseSummary(report);
  assert.match(summary, /# 物品来源 family 全量处理准备报告/);
  assert.match(summary, /Music Boxes/);
  assert.match(summary, /blockedRows=0/);
  assert.match(summary, /不能整页放行/);
});
