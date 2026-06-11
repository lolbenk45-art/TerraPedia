import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceRemainingClosureReport,
  parseBuildItemSourceRemainingClosureReportArgs
} from './build-item-source-remaining-closure-report.mjs';

function baselineRow(overrides = {}) {
  return {
    itemId: 1,
    internalName: 'StoneBlock',
    name: 'Stone Block',
    activeSourceCount: 0,
    primaryBucket: 'unclassified_no_source_evidence',
    hasRecipe: false,
    hasBiomeEvidence: false,
    hasNpcLootOrShop: false,
    evidence: [],
    ...overrides
  };
}

const cleanQuality = {
  missingNpcBossRefRows: 0,
  unknownSourceRefRows: 0,
  wikiUrlSourcePageRows: 0,
  emptyRuntimeSourceNameRows: 0,
  emptyBiomeWikitextNameRowsPreserved: 30
};

test('parseBuildItemSourceRemainingClosureReportArgs rejects mutation flags', () => {
  for (const flag of ['apply', 'sync', 'import', 'crawler', 'fetch', 'flyway', 'delete']) {
    assert.throws(
      () => parseBuildItemSourceRemainingClosureReportArgs([`--${flag}=true`]),
      /read-only remaining closure report refuses mutation flag/
    );
  }
});

test('buildItemSourceRemainingClosureReport assigns every active-source-lacking row exactly one closure lane', () => {
  const report = buildItemSourceRemainingClosureReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    baselinePath: 'baseline.json',
    coveragePlanPath: 'coverage.json',
    sourceQualityPath: 'quality.json',
    baselineReport: {
      summary: { itemsWithoutActiveSources: 7 },
      rows: [
        baselineRow({ itemId: 1, internalName: 'HasLocal', activeSourceCount: 1, primaryBucket: 'local_source_already_present' }),
        baselineRow({ itemId: 2, internalName: 'RecipeOnly', primaryBucket: 'recipe_chain_covered', hasRecipe: true }),
        baselineRow({ itemId: 3, internalName: 'BiomeOnly', primaryBucket: 'biome_evidence_only', hasBiomeEvidence: true }),
        baselineRow({ itemId: 4, internalName: 'NpcGap', primaryBucket: 'npc_relation_chain_gap', hasNpcLootOrShop: true }),
        baselineRow({ itemId: 5, internalName: 'BannerOne', name: 'Blue Slime Banner' }),
        baselineRow({ itemId: 6, internalName: 'FirstFractal', name: 'First Fractal' }),
        baselineRow({ itemId: 7, internalName: 'FallenStar', name: 'Fallen Star' }),
        baselineRow({ itemId: 8, internalName: 'NeedsManual', name: 'Needs Manual' })
      ]
    },
    coveragePlan: {
      rows: [
        { itemId: 5, lane: 'family_policy_candidate', blockedReason: 'family_page_candidate' }
      ]
    },
    sourceRowQuality: cleanQuality
  });

  assert.deepEqual(report.rows.map((row) => row.closureLane), [
    'recipe_or_shimmer_chain_covered',
    'biome_evidence_projection',
    'npc_relation_chain_gap',
    'family_policy_candidate',
    'explicit_no_source_exemption_candidate',
    'needs_external_source_evidence',
    'manual_review_required'
  ]);
  assert.equal(report.summary.totalRows, 7);
  assert.equal(report.summary.denominator, 7);
  assert.equal(report.summary.uniqueItemIds, 7);
  assert.equal(report.summary.laneCountSum, 7);
  assert.equal(report.summary.unclassifiedOpen, 0);
  assert.equal(report.rowsByLane.needs_external_source_evidence[0].sourceEvidenceStatus, 'absent_local_evidence');
  assert.equal(report.rowsByLane.manual_review_required[0].failedRules.length > 0, true);
  assert.equal(report.summary.zeroCountLanes.local_source_already_present, 0);
});

test('buildItemSourceRemainingClosureReport reports stale npc ref gap rows when DB quality is zero', () => {
  const report = buildItemSourceRemainingClosureReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    baselinePath: 'baseline.json',
    coveragePlanPath: 'data/reports/item-source-gap-coverage-plan-2026-06-11-post-ref-closure-v2.json',
    sourceQualityPath: 'quality.json',
    baselineReport: { summary: { itemsWithoutActiveSources: 0 }, rows: [] },
    coveragePlan: {
      summary: { npcRefResolutionGap: 1 },
      rows: [
        {
          itemId: 3381,
          internalName: 'CenxsWings',
          name: "Cenx's Wings",
          lane: 'npc_ref_resolution_gap',
          blockedReason: 'npc_loot_or_shop_not_projected_to_item_sources',
          evidence: []
        }
      ]
    },
    sourceRowQuality: cleanQuality
  });

  assert.equal(report.summary.staleNpcRefGapWarning, true);
  assert.match(report.warnings[0], /npcRefResolutionGap=1/);
  assert.equal(report.staleNpcRefGapRows[0].internalName, 'CenxsWings');
  assert.equal(report.staleNpcRefGapRows[0].oldLane, 'npc_ref_resolution_gap');
  assert.equal(report.staleNpcRefGapRows[0].inputReportPath, 'data/reports/item-source-gap-coverage-plan-2026-06-11-post-ref-closure-v2.json');
  assert.equal(report.staleNpcRefGapRows[0].oldNpcRefResolutionGapCount, 1);
  assert.equal(report.staleNpcRefGapRows[0].currentMissingNpcBossRefRows, 0);
  assert.equal(report.staleNpcRefGapRows[0].closureReportGeneratedAt, '2026-06-11T00:00:00.000Z');
});

test('buildItemSourceRemainingClosureReport rejects duplicate baseline item ids', () => {
  assert.throws(
    () => buildItemSourceRemainingClosureReport({
      baselineReport: {
        summary: { itemsWithoutActiveSources: 2 },
        rows: [
          baselineRow({ itemId: 1 }),
          baselineRow({ itemId: 1, internalName: 'Duplicate' })
        ]
      },
      coveragePlan: { rows: [] },
      sourceRowQuality: cleanQuality
    }),
    /duplicate baseline itemId/
  );
});

test('buildItemSourceRemainingClosureReport rejects missing closure fields', () => {
  assert.throws(
    () => buildItemSourceRemainingClosureReport({
      baselineReport: {
        summary: { itemsWithoutActiveSources: 1 },
        rows: [baselineRow({ itemId: 9, internalName: '', name: '' })]
      },
      coveragePlan: { rows: [] },
      sourceRowQuality: cleanQuality
    }),
    /missing required item identity/
  );
});

test('buildItemSourceRemainingClosureReport keeps obtainable-looking developer and banner rows in external evidence lane', () => {
  const report = buildItemSourceRemainingClosureReport({
    baselineReport: {
      summary: { itemsWithoutActiveSources: 4 },
      rows: [
        baselineRow({ itemId: 20, internalName: 'RedsHelmet', name: "Red's Helmet", categoryCode: 'ARMOR_PART_HEAD', categoryName: '头盔' }),
        baselineRow({ itemId: 21, internalName: 'DD2JavelinThrowerBanner', name: 'Etherian Javelin Thrower Banner', categoryCode: 'FURNITURE', categoryName: '家具' }),
        baselineRow({ itemId: 22, internalName: 'GoblinBomberCap', name: 'GoblinBomberCap', categoryCode: 'UNCATEGORIZED', categoryName: '未分类' }),
        baselineRow({ itemId: 23, internalName: 'KoboldDynamiteBackpack', name: 'KoboldDynamiteBackpack', categoryCode: 'UNCATEGORIZED', categoryName: '未分类' })
      ]
    },
    coveragePlan: { rows: [] },
    sourceRowQuality: cleanQuality
  });

  assert.deepEqual(report.rows.map((row) => row.closureLane), [
    'needs_external_source_evidence',
    'needs_external_source_evidence',
    'needs_external_source_evidence',
    'needs_external_source_evidence'
  ]);
});
