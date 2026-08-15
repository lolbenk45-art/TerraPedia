import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFocusedCandidateAuditSummary,
  buildItemSourceRemainingTreatmentReport,
  parseBuildItemSourceRemainingTreatmentReportArgs,
  renderItemSourceRemainingTreatmentChineseSummary
} from './build-item-source-remaining-treatment-report.mjs';

test('parseBuildItemSourceRemainingTreatmentReportArgs rejects mutation flags', () => {
  for (const flag of [
    '--apply',
    '--apply=true',
    '--write-db',
    '--sync',
    '--import',
    '--materialize',
    '--backfill',
    '--crawler',
    '--fetch',
    '--flyway',
    '--delete',
    '--truncate',
    '--drop',
    '--alter',
    '--write'
  ]) {
    assert.throws(
      () => parseBuildItemSourceRemainingTreatmentReportArgs([flag]),
      /read-only remaining treatment report refuses mutation flag/
    );
  }
});

test('buildFocusedCandidateAuditSummary converts raw candidate lanes to import plan input shape', () => {
  const summary = buildFocusedCandidateAuditSummary({
    candidates: [
      {
        itemId: 50,
        itemInternalName: 'MagicMirror',
        name: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        reviewLane: 'direct_page_candidate',
        extractedSourceCount: 2,
        extractedSources: [{ sourceType: 'container' }, { sourceType: 'drop' }]
      },
      {
        itemId: 51,
        internalName: 'Torch',
        itemName: 'Torch',
        pageTitle: 'Torches',
        reviewLane: 'family_recipe_exact_result_candidate',
        extractedSourceCount: 1,
        extractedSources: [{ sourceType: 'craft' }]
      },
      {
        itemId: 52,
        itemInternalName: 'Painting',
        name: 'Painting',
        pageTitle: 'Paintings',
        reviewLane: 'family_or_shared_page_candidate',
        extractedSourceCount: 1,
        extractedSources: [{ sourceType: 'worldgen' }]
      }
    ]
  });

  assert.equal(summary.readOnly, true);
  assert.equal(summary.totalCandidates, 3);
  assert.deepEqual(summary.classificationCounts, {
    high_confidence: 2,
    family_page_candidate: 1
  });
  assert.deepEqual(
    summary.candidates.map((candidate) => [candidate.itemInternalName, candidate.itemName, candidate.classification, candidate.rawSourceCount]),
    [
      ['MagicMirror', 'Magic Mirror', 'high_confidence', 2],
      ['Torch', 'Torch', 'high_confidence', 1],
      ['Painting', 'Painting', 'family_page_candidate', 1]
    ]
  );
});

test('buildItemSourceRemainingTreatmentReport summarizes executable and blocked lanes', () => {
  const report = buildItemSourceRemainingTreatmentReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: {
      readOnly: true,
      summary: {
        totalRows: 3730,
        layerCountSum: 3730,
        layerCounts: {
          active_source_present: 0,
          terminal_exempt_or_identity_review: 19,
          missing_required_raw_evidence: 3,
          recipe_or_shimmer_covered: 2603,
          npc_relation_not_projected: 2,
          biome_projection_pending: 15,
          maint_or_relation_not_published: 0,
          candidate_import_not_applied: 0,
          raw_candidate_not_projected: 810,
          family_policy_pending: 278,
          item_only_no_source_evidence: 0
        }
      },
      rowsByEvidenceLayer: {
        npc_relation_not_projected: [
          { itemId: 1586, internalName: 'CenxsWings', name: "Cenx's Wings" },
          { itemId: 3217, internalName: 'CorruptPlanterBox', name: 'Deathweed Planter Box' }
        ],
        biome_projection_pending: [
          { itemId: 1828, internalName: 'BladedGlove', name: 'Bladed Glove' }
        ],
        missing_required_raw_evidence: [
          { itemId: 8416, internalName: 'ZH_RECIPE_PINK_JELLYFISH_BAIT', name: 'Pink Jellyfish Bait' }
        ]
      }
    },
    candidatePlan: {
      readOnly: true,
      summary: {
        totalCandidates: 810,
        eligibleCandidates: 101,
        blockedCandidates: 709,
        plannedSourceRows: 122,
        blockedSourceRows: 880,
        classificationCounts: { high_confidence: 178, family_page_candidate: 632 },
        blockedReasonCounts: { blocked_source_rows: 77, family_page_candidate: 632 },
        plannedSourceRefTypeCounts: { world: 28, item: 54, npc: 39, container: 1 }
      },
      eligibleCandidates: [
        {
          itemInternalName: 'FallenStar',
          itemName: 'Fallen Star',
          plannedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world' },
            { sourceType: 'worldgen', sourceRefType: 'world' }
          ]
        }
      ],
      blockedCandidates: [
        {
          itemInternalName: 'Star',
          itemName: 'Star',
          blockedReason: 'blocked_source_rows',
          blockedSources: [{ blockedReason: 'invalid_source_ref_type' }]
        },
        {
          itemInternalName: 'Painting',
          itemName: 'Painting',
          pageTitle: 'Paintings',
          blockedReason: 'family_page_candidate',
          blockedSources: [{ sourceType: 'worldgen', sourceRefType: 'world' }]
        }
      ]
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 101,
        plannedRows: 122,
        blockedRows: 0,
        validationErrors: 0,
        duplicates: 0,
        toInsert: 122,
        inserted: 0
      }
    },
    familyPolicyReview: {
      familyPolicyPendingItems: 278,
      familyPolicyCandidateBlockedItems: 632,
      topSourcePages: [{ sourcePage: 'Paintings', items: 97 }],
      topRowTypeCounts: [{ sourceType: 'worldgen', sourceRefType: 'world', rows: 221 }]
    },
    publicContractReview: {
      publicDetailSourceVisibility: 'partial',
      missingContractFields: ['evidenceKind', 'sourceFactKey']
    }
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.totalRemainingRows, 3730);
  assert.equal(report.summary.dedicatedStructureCoveredRows, 2603);
  assert.equal(report.summary.dryRunReadyCandidates, 101);
  assert.equal(report.summary.dryRunReadySourceRows, 122);
  assert.equal(report.summary.requiresUserApprovedApplyRows, 122);
  assert.equal(report.summary.notAppliedBecauseSafetyBoundaryRows, 122);
  assert.equal(report.summary.familyPolicyBlockedCandidates, 632);
  assert.equal(report.summary.familyPolicyPendingClosureRows, 278);
  assert.equal(report.summary.blockedSourceRowCandidates, 77);
  assert.equal(report.summary.blockedSourceRows, 1);
  assert.equal(report.summary.projectionRequiredRows, 17);
  assert.equal(report.summary.missingRawRequiredRows, 3);
  assert.equal(report.summary.itemOnlyNoSourceEvidenceRows, 0);
  assert.equal(report.summary.allRowsClassifiedByEvidenceLayer, true);
  assert.equal(report.summary.canClaimAllRowsAppliedToDb, false);
  assert.equal(report.actions[0].status, 'ready_but_requires_explicit_apply_approval');
  assert.equal(report.remainingWork[0].lane, 'candidate_apply_requires_user_approval');
  assert.deepEqual(report.examples.projectionRequired.map((row) => row.internalName), ['CenxsWings', 'CorruptPlanterBox', 'BladedGlove']);
});

test('renderItemSourceRemainingTreatmentChineseSummary states dry-run boundary and remaining counts', () => {
  const report = buildItemSourceRemainingTreatmentReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: {
      readOnly: true,
      summary: {
        totalRows: 1,
        layerCountSum: 1,
        layerCounts: {
          recipe_or_shimmer_covered: 0,
          raw_candidate_not_projected: 1,
          family_policy_pending: 0,
          npc_relation_not_projected: 0,
          biome_projection_pending: 0,
          missing_required_raw_evidence: 0,
          terminal_exempt_or_identity_review: 0,
          item_only_no_source_evidence: 0
        }
      },
      rowsByEvidenceLayer: {}
    },
    candidatePlan: {
      readOnly: true,
      summary: {
        totalCandidates: 1,
        eligibleCandidates: 1,
        blockedCandidates: 0,
        plannedSourceRows: 2,
        blockedSourceRows: 0,
        blockedReasonCounts: {},
        classificationCounts: { high_confidence: 1 },
        plannedSourceRefTypeCounts: { world: 2 }
      },
      eligibleCandidates: [],
      blockedCandidates: []
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 1,
        plannedRows: 2,
        blockedRows: 0,
        validationErrors: 0,
        duplicates: 0,
        toInsert: 2,
        inserted: 0
      }
    }
  });

  const markdown = renderItemSourceRemainingTreatmentChineseSummary(report);
  assert.match(markdown, /已 dry-run 可写库但需要用户明确批准 `--apply=true`/);
  assert.match(markdown, /不能说“全处理完并已入库”/);
  assert.match(markdown, /未写库/);
});

test('buildItemSourceRemainingTreatmentReport does not fall back to stale family blocked defaults', () => {
  const report = buildItemSourceRemainingTreatmentReport({
    generatedAt: '2026-06-13T00:00:00.000Z',
    evidenceReport: {
      readOnly: true,
      summary: {
        totalRows: 278,
        layerCountSum: 278,
        layerCounts: {
          raw_candidate_not_projected: 26,
          family_policy_pending: 278,
          npc_relation_not_projected: 0,
          biome_projection_pending: 0,
          recipe_or_shimmer_covered: 0,
          terminal_exempt_or_identity_review: 0,
          missing_required_raw_evidence: 0,
          item_only_no_source_evidence: 0
        }
      },
      rowsByEvidenceLayer: {}
    },
    candidatePlan: {
      readOnly: true,
      summary: {
        totalCandidates: 27,
        eligibleCandidates: 4,
        blockedCandidates: 0,
        plannedSourceRows: 7,
        blockedSourceRows: 0,
        blockedReasonCounts: {},
        explicitSourceExemptionCandidates: 23,
        explicitSourceExemptionRows: 30
      },
      eligibleCandidates: [],
      blockedCandidates: []
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 4,
        plannedRows: 7,
        validationErrors: 0,
        duplicates: 7,
        toInsert: 0,
        inserted: 0
      }
    }
  });

  assert.equal(report.summary.familyPolicyBlockedCandidates, 0);
  assert.equal(report.summary.familyPolicyPendingClosureRows, 278);
  assert.equal(report.summary.dryRunReadySourceRows, 0);
  assert.equal(report.summary.requiresUserApprovedApplyRows, 0);
  assert.equal(report.remainingWork[0].lane, 'family_policy_parser_required');

  const markdown = renderItemSourceRemainingTreatmentChineseSummary(report);
  assert.match(markdown, /当前无待 apply 的普通来源行/);
  assert.doesNotMatch(markdown, /需要用户明确批准 `--apply=true`：`0`/);
});
