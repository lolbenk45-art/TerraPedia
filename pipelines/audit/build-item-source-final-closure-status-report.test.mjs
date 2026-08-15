import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemSourceFinalClosureStatusReport,
  parseBuildItemSourceFinalClosureStatusReportArgs,
  renderItemSourceFinalClosureStatusChineseSummary,
  runBuildItemSourceFinalClosureStatusReport
} from './build-item-source-final-closure-status-report.mjs';

test('parseBuildItemSourceFinalClosureStatusReportArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--write-db', '--sync', '--import', '--materialize', '--backfill', '--crawler', '--fetch', '--flyway']) {
    assert.throws(
      () => parseBuildItemSourceFinalClosureStatusReportArgs([flag]),
      /read-only final closure status report refuses mutation flag/
    );
  }
  assert.equal(parseBuildItemSourceFinalClosureStatusReportArgs(['--apply=false']).verifyLocalDb, false);
});

test('buildItemSourceFinalClosureStatusReport summarizes dry-run, projection, blocked, terminal, and missing raw lanes', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    workItemsReport: {
      summary: {
        dryRunReadyCandidates: 199,
        dryRunReadySourceRows: 260,
        familyPolicyBlockedCandidates: 603,
        familyPolicyPendingClosureRows: 278,
        blockedSourceRowCandidates: 2,
        blockedSourceRows: 3,
        explicitSourceExemptionCandidates: 1,
        explicitSourceExemptionRows: 1
      },
      workItems: {
        projectionRequiredRows: [
          { itemId: 1586, internalName: 'CenxsWings', name: "Cenx's Wings" },
          { itemId: 1827, internalName: 'BladedGlove', name: 'Bladed Glove' }
        ],
        blockedSourceRowCandidates: [
          {
            itemId: 2881,
            itemInternalName: 'PhasicWarpEjector',
            itemName: 'Phasic Warp Ejector',
            blockedSources: [{ sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented' }]
          },
          {
            itemId: 4609,
            itemInternalName: 'TorchGodsFavor',
            itemName: "Torch God's Favor",
            blockedSources: [{ sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'The Torch God event' }]
          }
        ],
        explicitSourceExemptionCandidates: [
          {
            itemId: 5668,
            itemInternalName: 'SoundGun',
            itemName: 'The Imploder',
            exemptionReason: 'explicit_unobtainable_or_unimplemented_source',
            exemptionStatuses: ['unimplemented', 'unobtainable']
          }
        ],
        terminalExemptOrIdentityReviewRows: [
          { itemId: 545, internalName: 'BossBagBetsy', name: "Betsy's Treasure Bag" },
          { itemId: 4722, internalName: 'FirstFractal', name: 'First Fractal' }
        ],
        missingRawRequiredRows: [
          { itemId: 8416, internalName: 'ZH_RECIPE_PINK_JELLYFISH_BAIT', name: 'Pink Jellyfish (bait)' }
        ]
      },
      resolutionMatrix: {
        rows: [
          {
            itemInternalName: 'PhasicWarpEjector',
            resolutionLane: 'explicit_exemption_review',
            nextAction: '标记为 unimplemented/unobtainable 豁免，不写普通来源。'
          },
          {
            itemInternalName: 'TorchGodsFavor',
            resolutionLane: 'dedicated_projection_required',
            nextAction: '需要 Torch God event 专属投影。'
          }
        ]
      }
    },
    candidatePlan: {
      summary: {
        eligibleCandidates: 199,
        plannedSourceRows: 260
      }
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 199,
        toInsert: 260,
        inserted: 0,
        validationErrors: 0,
        duplicates: 0
      }
    },
    projectionEvidenceRows: [
      { itemId: 1586, npcLoot: 0, npcShop: 1, biomeResource: 0, itemBiome: 0 },
      { itemId: 1827, npcLoot: 0, npcShop: 0, biomeResource: 0, itemBiome: 1 }
    ]
  });

  assert.equal(report.readOnly, true);
  assert.deepEqual(report.summary, {
    dbWritesPerformed: false,
    crawlerOrFetchPerformed: false,
    dryRunReadyCandidates: 199,
    dryRunReadySourceRows: 260,
    dryRunValidationErrors: 0,
    dryRunDuplicates: 0,
    familyPolicyRowsAwaitingParser: 881,
    blockedSourceRowsRemaining: 3,
    blockedSourceCandidatesRemaining: 2,
    explicitSourceExemptionRows: 1,
    explicitSourceExemptionCandidates: 1,
    projectionRows: 2,
    projectionRowsClosedByPublicContract: 2,
    terminalExemptionRows: 2,
    missingRawRows: 1,
    blockedSourceSummaryByStatus: {
      dedicated_projection_required: 1,
      explicit_exemption_review: 2
    },
    allProjectionRowsHaveEvidence: true,
    canClaimAllOrdinarySourcesAppliedToDb: false,
    canClaimNoRemainingWork: false
  });
  assert.equal(report.closures.dryRunReady.closureStatus, 'waiting_for_user_approved_apply');
  assert.equal(report.closures.familyPolicy.rows, 881);
  assert.equal(report.closures.blockedSourceRows[0].closureStatus, 'explicit_exemption_review');
  assert.equal(report.closures.blockedSourceRows[1].closureStatus, 'dedicated_projection_required');
  assert.equal(report.closures.explicitSourceExemptions[0].closureStatus, 'explicit_exemption_review');
  assert.equal(report.closures.projections[0].closureStatus, 'projected_by_public_sources_contract');
  assert.equal(report.closures.projections[0].evidenceCounts.npcShop, 1);
  assert.equal(report.closures.terminalExemptions[0].terminalClosureStatus, 'internal_boss_bag_identity');
  assert.equal(report.closures.terminalExemptions[1].terminalClosureStatus, 'unreleased_internal_item');
  assert.equal(report.closures.missingRaw[0].closureStatus, 'missing_raw_evidence_required');
});

test('buildItemSourceFinalClosureStatusReport does not trust incomplete apply reports as applied', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    workItemsReport: { summary: {}, workItems: {} },
    dryRunReport: {
      apply: true,
      summary: {
        selectedCandidates: 1,
        toInsert: 1,
        inserted: 1,
        validationErrors: 0,
        duplicates: 0
      }
    }
  });

  assert.equal(report.summary.dbWritesPerformed, false);
  assert.equal(report.summary.canClaimAllOrdinarySourcesAppliedToDb, false);
  assert.equal(report.closures.dryRunReady.closureStatus, 'apply_report_unverified');
});

test('buildItemSourceFinalClosureStatusReport marks complete apply evidence as applied', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    workItemsReport: { summary: {}, workItems: {} },
    dryRunReport: {
      apply: true,
      backupPath: '/tmp/before.json',
      rollbackSql: 'UPDATE item_acquisition_sources SET status = 0 WHERE id IN (1);',
      summary: {
        selectedCandidates: 1,
        toInsert: 1,
        inserted: 1,
        validationErrors: 0,
        duplicates: 0
      }
    }
  });

  assert.equal(report.summary.dbWritesPerformed, true);
  assert.equal(report.summary.canClaimAllOrdinarySourcesAppliedToDb, true);
  assert.equal(report.closures.dryRunReady.closureStatus, 'applied_to_local_db');
});

test('buildItemSourceFinalClosureStatusReport accepts complete apply evidence with duplicate skips', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    workItemsReport: { summary: {}, workItems: {} },
    dryRunReport: {
      apply: true,
      backupPath: '/tmp/before.json',
      rollbackSql: 'UPDATE item_acquisition_sources SET status = 0 WHERE id IN (199493,199494);',
      summary: {
        selectedCandidates: 269,
        plannedRows: 276,
        toInsert: 270,
        inserted: 270,
        validationErrors: 0,
        duplicates: 6
      }
    }
  });

  assert.equal(report.summary.dbWritesPerformed, true);
  assert.equal(report.summary.canClaimAllOrdinarySourcesAppliedToDb, true);
  assert.equal(report.closures.dryRunReady.closureStatus, 'applied_to_local_db');
  const markdown = renderItemSourceFinalClosureStatusChineseSummary(report);
  assert.match(markdown, /普通来源 apply 证据：270 rows \/ 269 candidates 已写入本地库/);
  assert.match(markdown, /该数字是历史 apply 证据，不代表仍待写入/);
  assert.doesNotMatch(markdown, /dry-run 实际可插入普通来源：270 rows/);
});

test('buildItemSourceFinalClosureStatusReport marks projection rows missing local DB evidence', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    workItemsReport: {
      summary: {},
      workItems: {
        projectionRequiredRows: [
          { itemId: 9999, internalName: 'UnknownProjection', name: 'Unknown Projection' }
        ]
      }
    },
    dryRunReport: { apply: false, summary: {} },
    projectionEvidenceRows: [{ itemId: 9999, npcLoot: 0, npcShop: 0, biomeResource: 0, itemBiome: 0 }]
  });

  assert.equal(report.summary.projectionRowsClosedByPublicContract, 0);
  assert.equal(report.summary.allProjectionRowsHaveEvidence, false);
  assert.equal(report.closures.projections[0].closureStatus, 'projection_evidence_missing');
});

test('renderItemSourceFinalClosureStatusChineseSummary includes full audit tables', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    workItemsReport: {
      summary: { blockedSourceRowCandidates: 1, blockedSourceRows: 1 },
      workItems: {
        projectionRequiredRows: [{ itemId: 1586, internalName: 'CenxsWings', name: "Cenx's Wings" }],
        blockedSourceRowCandidates: [{ itemId: 2881, itemInternalName: 'PhasicWarpEjector', itemName: 'Phasic Warp Ejector' }],
        missingRawRequiredRows: [{ itemId: 8416, internalName: 'ZH_RECIPE_PINK_JELLYFISH_BAIT', name: 'Pink Jellyfish (bait)' }]
      },
      resolutionMatrix: {
        rows: [
          {
            itemInternalName: 'PhasicWarpEjector',
            resolutionLane: 'explicit_exemption_review',
            nextAction: '标记为 unimplemented/unobtainable 豁免，不写普通来源。'
          }
        ]
      }
    },
    dryRunReport: { apply: false, summary: { selectedCandidates: 1, toInsert: 1 } },
    projectionEvidenceRows: [{ itemId: 1586, npcShop: 1 }]
  });

  const markdown = renderItemSourceFinalClosureStatusChineseSummary(report);
  assert.match(markdown, /物品来源闭环状态报告/);
  assert.match(markdown, /未写库，等待用户批准 apply/);
  assert.match(markdown, /1 个显式豁免、0 个仍需专属机制投影/);
  assert.match(markdown, /Projection 全量/);
  assert.match(markdown, /Blocked Source 剩余全量/);
  assert.match(markdown, /Terminal \/ 身份豁免全量/);
  assert.match(markdown, /Missing Raw 全量/);
  assert.match(markdown, /CenxsWings/);
  assert.match(markdown, /PhasicWarpEjector/);
  assert.match(markdown, /ZH_RECIPE_PINK_JELLYFISH_BAIT/);
});

test('renderItemSourceFinalClosureStatusChineseSummary states no apply is pending when toInsert is zero', () => {
  const report = buildItemSourceFinalClosureStatusReport({
    generatedAt: '2026-06-13T00:00:00.000Z',
    workItemsReport: {
      summary: {
        dryRunReadyCandidates: 4,
        dryRunReadySourceRows: 0,
        familyPolicyBlockedCandidates: 0,
        familyPolicyPendingClosureRows: 278,
        blockedSourceRowCandidates: 0,
        blockedSourceRows: 0,
        explicitSourceExemptionCandidates: 23,
        explicitSourceExemptionRows: 30
      },
      workItems: {}
    },
    dryRunReport: {
      apply: false,
      summary: {
        selectedCandidates: 4,
        toInsert: 0,
        inserted: 0,
        validationErrors: 0,
        duplicates: 7
      }
    }
  });

  const markdown = renderItemSourceFinalClosureStatusChineseSummary(report);
  assert.match(markdown, /dry-run 实际可插入普通来源：0 rows \/ 4 candidates；当前无待 apply 的普通来源行/);
  assert.doesNotMatch(markdown, /等待用户批准 apply/);
  assert.match(markdown, /family parser\/policy 待处理：278 rows/);
});

test('runBuildItemSourceFinalClosureStatusReport refuses non-local DB projection verification', async () => {
  await assert.rejects(
    () => runBuildItemSourceFinalClosureStatusReport(
      { verifyLocalDb: true, database: 'prod_like' },
      {
        now: new Date('2026-06-12T00:00:00.000Z'),
        workItemsReport: {
          summary: {},
          workItems: {
            projectionRequiredRows: [{ itemId: 1827, internalName: 'BladedGlove', name: 'Bladed Glove' }]
          }
        },
        candidatePlan: { summary: {} },
        dryRunReport: { apply: false, summary: {} }
      }
    ),
    /refuses non-local projection verification database/
  );
});

test('runBuildItemSourceFinalClosureStatusReport writes JSON and Chinese summary from injected fixtures', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-final-status-'));
  const outputPath = path.join(tempDir, 'report.json');
  const summaryOutputPath = path.join(tempDir, 'summary.md');

  const report = await runBuildItemSourceFinalClosureStatusReport(
    { outputPath, summaryOutputPath, verifyLocalDb: false },
    {
      now: new Date('2026-06-12T00:00:00.000Z'),
      workItemsReport: {
        summary: {},
        workItems: {
          projectionRequiredRows: [{ itemId: 1827, internalName: 'BladedGlove', name: 'Bladed Glove' }]
        }
      },
      candidatePlan: { summary: {} },
      dryRunReport: { apply: false, summary: { selectedCandidates: 0, toInsert: 0 } },
      projectionEvidenceRows: [{ itemId: 1827, itemBiome: 1 }]
    }
  );

  assert.equal(report.summary.projectionRowsClosedByPublicContract, 1);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).summary.projectionRowsClosedByPublicContract, 1);
  assert.match(fs.readFileSync(summaryOutputPath, 'utf8'), /BladedGlove/);
});
