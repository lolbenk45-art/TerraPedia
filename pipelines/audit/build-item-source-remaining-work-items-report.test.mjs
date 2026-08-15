import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceRemainingWorkItemsReport,
  parseBuildItemSourceRemainingWorkItemsReportArgs,
  renderItemSourceRemainingWorkItemsChineseSummary
} from './build-item-source-remaining-work-items-report.mjs';

test('parseBuildItemSourceRemainingWorkItemsReportArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--write-db', '--sync', '--import', '--materialize', '--backfill', '--crawler', '--fetch', '--flyway']) {
    assert.throws(
      () => parseBuildItemSourceRemainingWorkItemsReportArgs([flag]),
      /read-only remaining work items report refuses mutation flag/
    );
  }
});

test('buildItemSourceRemainingWorkItemsReport emits concrete rows and aggregations', () => {
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: {
      readOnly: true,
      rowsByEvidenceLayer: {
        family_policy_pending: [
          { itemId: 438, internalName: 'StarStatue', name: 'Star Statue', evidenceLayer: 'family_policy_pending' },
          { itemId: 1432, internalName: 'BloodMoonRising', name: 'Blood Moon Rising', evidenceLayer: 'family_policy_pending' }
        ],
        npc_relation_not_projected: [
          { itemId: 1586, internalName: 'CenxsWings', name: "Cenx's Wings", evidenceLayer: 'npc_relation_not_projected' }
        ],
        biome_projection_pending: [
          { itemId: 1827, internalName: 'BladedGlove', name: 'Bladed Glove', evidenceLayer: 'biome_projection_pending' }
        ],
        terminal_exempt_or_identity_review: [
          { itemId: 1475, internalName: 'Darkness', name: 'Darkness', terminalClosureStatus: 'non_item_effect' }
        ],
        missing_required_raw_evidence: [
          { itemId: 8416, internalName: 'ZH_RECIPE_PINK_JELLYFISH_BAIT', name: 'Pink Jellyfish (bait)', terminalClosureStatus: 'missing_bait_raw' }
        ]
      }
    },
    candidatePlan: {
      readOnly: true,
      eligibleCandidates: [
        {
          itemInternalName: 'FallenStar',
          itemName: 'Fallen Star',
          itemResolution: { id: 75 },
          plannedSources: [
            { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Fallen Star sky fall' }
          ]
        }
      ],
      blockedCandidates: [
        {
          itemInternalName: 'Star',
          itemName: 'Star',
          pageTitle: 'Star',
          blockedReason: 'blocked_source_rows',
          blockedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'Unknown', blockedReason: 'unknown_source_contract' }
          ]
        },
        {
          itemInternalName: 'Tombstone',
          itemName: 'Tombstone',
          pageTitle: 'Tombstones',
          blockedReason: 'family_page_candidate',
          blockedSources: [
            { sourceType: 'drop', sourceRefType: 'world', sourceRefName: 'player death', blockedReason: 'family_page_candidate' }
          ]
        }
      ],
      explicitSourceExemptionCandidates: [
        {
          itemInternalName: 'BoneBlock',
          itemName: 'Bone Block',
          pageTitle: 'Bone Block',
          exemptionReason: 'explicit_unobtainable_or_unimplemented_source',
          itemResolution: { id: 766 },
          exemptedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable as item', exemptionStatus: 'unobtainable_as_item' }
          ]
        }
      ]
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 1,
        plannedRows: 1,
        toInsert: 1,
        inserted: 0,
        validationErrors: 0,
        duplicates: 0
      }
    }
  });

  assert.equal(report.readOnly, true);
  assert.deepEqual(report.summary, {
    dryRunReadyCandidates: 1,
    dryRunReadySourceRows: 1,
    familyPolicyBlockedCandidates: 1,
    familyPolicyPendingClosureRows: 2,
    blockedSourceRowCandidates: 1,
    blockedSourceRows: 1,
    explicitSourceExemptionCandidates: 1,
    explicitSourceExemptionRows: 1,
    projectionRequiredRows: 2,
    terminalExemptOrIdentityReviewRows: 1,
    missingRawRequiredRows: 1,
    dbWritesPerformed: false
  });
  assert.deepEqual(report.aggregates.familyBlockedByPage, [{ key: 'Tombstones', count: 1 }]);
  assert.deepEqual(report.aggregates.familyPendingByPolicyFamily, [
    { key: 'Paintings', count: 1 },
    { key: 'Statues', count: 1 }
  ]);
  assert.deepEqual(report.aggregates.blockedSourceReasons, [{ key: 'unknown_source_contract', count: 1 }]);
  assert.equal(report.workItems.dryRunReadySourceRows[0].itemInternalName, 'FallenStar');
  assert.equal(report.workItems.familyPolicyBlockedCandidates[0].pageTitle, 'Tombstones');
  assert.equal(report.workItems.blockedSourceRowCandidates[0].blockedSourceReasons[0], 'unknown_source_contract');
  assert.equal(report.workItems.explicitSourceExemptionCandidates[0].itemInternalName, 'BoneBlock');
  assert.equal(report.workItems.projectionRequiredRows.length, 2);
  assert.deepEqual([...report.resolutionMatrix.summaryByLane].sort((a, b) => a.key.localeCompare(b.key)), [
    { key: 'dry_run_ready_requires_user_apply', count: 1 },
    { key: 'explicit_exemption_review', count: 2 },
    { key: 'family_policy_parser_required', count: 3 },
    { key: 'manual_source_contract_review', count: 1 },
    { key: 'missing_raw_evidence_required', count: 1 },
    { key: 'projection_contract_required', count: 2 }
  ]);
});

test('buildItemSourceRemainingWorkItemsReport includes explicit source exemption queue from candidate plan', () => {
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: { readOnly: true, rowsByEvidenceLayer: {} },
    candidatePlan: {
      readOnly: true,
      eligibleCandidates: [],
      blockedCandidates: [],
      explicitSourceExemptionCandidates: [
        {
          itemInternalName: 'SoundGun',
          itemName: 'The Imploder',
          pageTitle: 'The Imploder',
          exemptionReason: 'explicit_unobtainable_or_unimplemented_source',
          itemResolution: { id: 5668 },
          exemptedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented', exemptionStatus: 'unimplemented' },
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable', exemptionStatus: 'unobtainable' }
          ]
        }
      ]
    },
    dryRunReport: { apply: false, summary: { selectedCandidates: 0, toInsert: 0 } }
  });

  assert.equal(report.summary.explicitSourceExemptionCandidates, 1);
  assert.equal(report.summary.explicitSourceExemptionRows, 2);
  assert.equal(report.workItems.explicitSourceExemptionCandidates[0].itemInternalName, 'SoundGun');
  assert.deepEqual(report.resolutionMatrix.summaryByLane, [{ key: 'explicit_exemption_review', count: 1 }]);
});

test('buildItemSourceRemainingWorkItemsReport classifies blocked source rows by treatment lane', () => {
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: { readOnly: true, rowsByEvidenceLayer: {} },
    candidatePlan: {
      readOnly: true,
      eligibleCandidates: [],
      blockedCandidates: [
        {
          itemInternalName: 'DevDye',
          itemName: "Skiphs' Blood",
          pageTitle: "Skiphs' Blood",
          blockedReason: 'blocked_source_rows',
          blockedSources: [
            { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)', blockedReason: 'source_item_ref_unresolved' }
          ]
        },
        {
          itemInternalName: 'PhasicWarpEjector',
          itemName: 'Phasic Warp Ejector',
          pageTitle: 'Phasic Warp Ejector',
          blockedReason: 'blocked_source_rows',
          blockedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented', blockedReason: 'unknown_source_contract' }
          ]
        },
        {
          itemInternalName: 'GardenGnome',
          itemName: 'Garden Gnome',
          pageTitle: 'Garden Gnome',
          blockedReason: 'blocked_source_rows',
          blockedSources: [
            { sourceType: 'unknown', sourceRefType: 'npc', sourceRefName: 'Gnome sunlight transformation', blockedReason: 'unknown_source_contract' }
          ]
        }
      ]
    },
    dryRunReport: { apply: false, summary: { selectedCandidates: 0, toInsert: 0 } }
  });

  const lanes = report.resolutionMatrix.rows.map((row) => [row.itemInternalName, row.resolutionLane, row.nextAction]);
  assert.deepEqual(lanes, [
    ['DevDye', 'importable_normalization_candidate', '把 Hardmode Treasure Bag group 转成 text-only boss_group/treasure_bag 规则，测试后进入 dry-run。'],
    ['PhasicWarpEjector', 'explicit_exemption_review', '标记为 unimplemented/unobtainable 豁免，不写普通来源。'],
    ['GardenGnome', 'dedicated_projection_required', '需要 transformation/NPC 机制投影或专属来源类型，不能伪造成 drop/shop。']
  ]);
});

test('buildItemSourceRemainingWorkItemsReport does not keep duplicate-only dry-run rows in apply lane', () => {
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: { readOnly: true, rowsByEvidenceLayer: {} },
    candidatePlan: {
      readOnly: true,
      eligibleCandidates: [
        {
          itemInternalName: 'AlreadyAppliedHat',
          itemName: 'Already Applied Hat',
          itemResolution: { id: 5049 },
          plannedSources: [
            { sourceType: 'craft', sourceRefType: 'item', sourceRefName: 'Silk' },
            { sourceType: 'craft', sourceRefType: 'item', sourceRefName: 'Firefly' }
          ]
        }
      ],
      blockedCandidates: []
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 1,
        plannedRows: 2,
        duplicates: 2,
        toInsert: 0,
        inserted: 0
      }
    }
  });

  assert.equal(report.summary.dryRunReadyCandidates, 1);
  assert.equal(report.summary.dryRunReadySourceRows, 0);
  assert.equal(report.workItems.dryRunReadySourceRows.length, 0);
  assert.equal(
    report.resolutionMatrix.summaryByLane.some((row) => row.key === 'dry_run_ready_requires_user_apply'),
    false
  );
});

test('renderItemSourceRemainingWorkItemsChineseSummary includes concrete remaining categories', () => {
  const report = buildItemSourceRemainingWorkItemsReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    evidenceReport: { readOnly: true, rowsByEvidenceLayer: {} },
    candidatePlan: { readOnly: true, eligibleCandidates: [], blockedCandidates: [] },
    dryRunReport: { apply: false, summary: { selectedCandidates: 0, plannedRows: 0, toInsert: 0, inserted: 0, validationErrors: 0, duplicates: 0 } }
  });

  const markdown = renderItemSourceRemainingWorkItemsChineseSummary(report);
  assert.match(markdown, /剩余工作项明细/);
  assert.match(markdown, /DB 写入：未执行/);
  assert.match(markdown, /family parser\/policy 待建模 rows/);
  assert.match(markdown, /处置矩阵/);
});
