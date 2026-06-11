import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceGapCoveragePlan,
  parseBuildItemSourceGapCoveragePlanArgs
} from './build-item-source-gap-coverage-plan.mjs';

function baselineRow(overrides = {}) {
  return {
    itemId: 1,
    internalName: 'IronPickaxe',
    name: 'Iron Pickaxe',
    activeSourceCount: 0,
    primaryBucket: 'unclassified_no_source_evidence',
    hasRawItemPageSource: false,
    hasMaintSource: false,
    hasRelationFact: false,
    hasRecipe: false,
    hasNpcLootOrShop: false,
    hasBiomeEvidence: false,
    exemptionStatus: null,
    evidence: [],
    ...overrides
  };
}

test('parseBuildItemSourceGapCoveragePlanArgs rejects mutation flags', () => {
  assert.throws(
    () => parseBuildItemSourceGapCoveragePlanArgs(['--apply=true']),
    /read-only coverage plan refuses mutation flag/
  );
});

test('buildItemSourceGapCoveragePlan assigns exactly one lane per item', () => {
  const plan = buildItemSourceGapCoveragePlan({
    generatedAt: '2026-06-11T00:00:00.000Z',
    baselineReport: {
      rows: [
        baselineRow({ itemId: 1, internalName: 'HasLocal', activeSourceCount: 1, primaryBucket: 'local_source_already_present' }),
        baselineRow({ itemId: 2, internalName: 'MaintGap', primaryBucket: 'publication_chain_gap' }),
        baselineRow({ itemId: 3, internalName: 'High', primaryBucket: 'unclassified_no_source_evidence' }),
        baselineRow({ itemId: 4, internalName: 'Family', primaryBucket: 'unclassified_no_source_evidence' }),
        baselineRow({ itemId: 5, internalName: 'Polluted', primaryBucket: 'unclassified_no_source_evidence' }),
        baselineRow({ itemId: 6, internalName: 'NpcGap', primaryBucket: 'npc_relation_chain_gap' }),
        baselineRow({ itemId: 7, internalName: 'Recipe', primaryBucket: 'recipe_chain_covered' }),
        baselineRow({ itemId: 8, internalName: 'Biome', primaryBucket: 'biome_evidence_only' }),
        baselineRow({ itemId: 9, internalName: 'Exempt', primaryBucket: 'explicit_no_source_exemption' }),
        baselineRow({ itemId: 10, internalName: 'Unknown', primaryBucket: 'unclassified_no_source_evidence' })
      ]
    },
    candidatePlan: {
      eligibleCandidates: [
        { itemInternalName: 'High', classification: 'high_confidence', plannedSources: [{ sourceRefType: 'npc' }] }
      ],
      blockedCandidates: [
        { itemInternalName: 'Family', classification: 'family_page_candidate', blockedReason: 'family_page_candidate' },
        { itemInternalName: 'Polluted', classification: 'polluted_candidate', blockedReason: 'polluted_candidate' }
      ]
    }
  });

  assert.deepEqual(plan.rows.map((row) => row.lane), [
    'local_source_already_present',
    'publication_chain_gap',
    'high_confidence_candidate_import',
    'family_policy_candidate',
    'polluted_page_candidate',
    'npc_ref_resolution_gap',
    'recipe_or_shimmer_chain_covered',
    'biome_evidence_projection',
    'explicit_no_source_exemption',
    'unclassified_requires_new_lane'
  ]);
  assert.equal(new Set(plan.rows.map((row) => row.itemId)).size, 10);
});

test('buildItemSourceGapCoveragePlan does not exempt items with evidence', () => {
  const plan = buildItemSourceGapCoveragePlan({
    baselineReport: {
      rows: [
        baselineRow({
          itemId: 11,
          internalName: 'RecipeExempt',
          primaryBucket: 'explicit_no_source_exemption',
          hasRecipe: true,
          exemptionStatus: 'ignored_due_to_existing_evidence'
        })
      ]
    },
    candidatePlan: {}
  });

  assert.equal(plan.rows[0].lane, 'recipe_or_shimmer_chain_covered');
  assert.equal(plan.summary.explicitNoSourceExemption, 0);
});
