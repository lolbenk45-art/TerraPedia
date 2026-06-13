import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSourceExistingEvidenceLayersReport,
  parseAuditItemSourceExistingEvidenceLayersArgs,
  resolveEvidenceLayer,
  renderItemSourceExistingEvidenceLayersChineseSummary
} from './audit-item-source-existing-evidence-layers.mjs';

function closureRow(overrides = {}) {
  return {
    itemId: 1,
    internalName: 'StoneBlock',
    name: 'Stone Block',
    closureLane: 'needs_external_source_evidence',
    sourceEvidenceStatus: 'absent_local_evidence',
    ...overrides
  };
}

function dbRow(overrides = {}) {
  return {
    itemExists: true,
    activeSourceCount: 0,
    inactiveOrDeletedSourceCount: 0,
    recipeCount: 0,
    npcLootOrShopCount: 0,
    biomeEvidenceCount: 0,
    maintSourceCount: 0,
    relationFactCount: 0,
    ...overrides
  };
}

function buildFixtureReport() {
  return buildItemSourceExistingEvidenceLayersReport({
    generatedAt: '2026-06-12T00:00:00.000Z',
    closureReport: {
      rows: [
        closureRow({ itemId: 1, internalName: 'ActiveAgain', name: 'Active Again' }),
        closureRow({ itemId: 2, internalName: 'OnlyItem', name: 'Only Item' }),
        closureRow({ itemId: 3, internalName: 'RawOnly', name: 'Raw Only' }),
        closureRow({ itemId: 4, internalName: 'CandidatePlanned', name: 'Candidate Planned' }),
        closureRow({ itemId: 5, internalName: 'RecipeOnly', name: 'Recipe Only', closureLane: 'recipe_or_shimmer_chain_covered' }),
        closureRow({ itemId: 6, internalName: 'NpcOnly', name: 'NPC Only', closureLane: 'npc_relation_chain_gap' }),
        closureRow({ itemId: 7, internalName: 'BiomeOnly', name: 'Biome Only', closureLane: 'biome_evidence_projection' }),
        closureRow({ itemId: 8, internalName: 'MaintOnly', name: 'Maint Only' }),
        closureRow({ itemId: 9, internalName: 'FamilyOnly', name: 'Family Only', closureLane: 'family_policy_candidate' }),
        closureRow({ itemId: 10, internalName: 'TerminalOnly', name: 'Terminal Only', closureLane: 'explicit_no_source_exemption_candidate' }),
        closureRow({ itemId: 11, internalName: 'MissingRaw', name: 'Missing Raw', closureLane: 'missing_required_raw_evidence' })
      ]
    },
    coveragePlan: {
      rows: [
        { itemId: 9, lane: 'family_policy_candidate', blockedReason: 'family_page_candidate', plannedSourceRows: 2 }
      ]
    },
    rawCandidateReport: {
      candidates: [
        { itemId: 3, itemInternalName: 'RawOnly', extractedSources: [{ sourceType: 'worldgen' }] },
        { itemId: 4, itemInternalName: 'CandidatePlanned', extractedSources: [{ sourceType: 'container' }] },
        { itemId: 10, itemInternalName: 'TerminalOnly', extractedSources: [{ sourceType: 'drop' }] }
      ]
    },
    candidatePlan: {
      eligibleCandidates: [
        { itemInternalName: 'CandidatePlanned', plannedSources: [{ sourceType: 'container' }, { sourceType: 'worldgen' }] }
      ],
      blockedCandidates: [
        { itemInternalName: 'FamilyOnly', blockedReason: 'family_page_candidate', blockedSources: [{ sourceType: 'worldgen' }] }
      ]
    },
    terminalPlan: {
      rows: [
        { itemId: 10, internalName: 'TerminalOnly', terminalClosureStatus: 'non_item_effect', resolutionLane: 'explicit_no_source_exemption_candidate' },
        { itemId: 11, internalName: 'MissingRaw', terminalClosureStatus: 'missing_bait_raw', resolutionLane: 'missing_required_raw_evidence' }
      ]
    },
    dbEvidence: new Map([
      [1, dbRow({ activeSourceCount: 1 })],
      [2, dbRow()],
      [3, dbRow()],
      [4, dbRow()],
      [5, dbRow({ recipeCount: 3 })],
      [6, dbRow({ npcLootOrShopCount: 2 })],
      [7, dbRow({ biomeEvidenceCount: 1 })],
      [8, dbRow({ maintSourceCount: 1, relationFactCount: 1 })],
      [9, dbRow()],
      [10, dbRow()],
      [11, dbRow()]
    ])
  });
}

test('parseAuditItemSourceExistingEvidenceLayersArgs rejects mutation flags', () => {
  for (const flag of ['apply', 'write-db', 'sync', 'import', 'backfill', 'crawler', 'fetch', 'pipeline', 'materialize', 'flyway', 'refresh', 'delete', 'truncate', 'drop', 'alter']) {
    assert.throws(
      () => parseAuditItemSourceExistingEvidenceLayersArgs([`--${flag}=true`]),
      /read-only existing evidence audit refuses mutation flag/
    );
  }
  assert.throws(
    () => parseAuditItemSourceExistingEvidenceLayersArgs(['--Apply=true']),
    /read-only existing evidence audit refuses mutation flag/
  );
  assert.equal(parseAuditItemSourceExistingEvidenceLayersArgs(['--apply=false']).outputPath, null);
});

test('parseAuditItemSourceExistingEvidenceLayersArgs rejects unsafe database identifiers', () => {
  assert.throws(
    () => parseAuditItemSourceExistingEvidenceLayersArgs(['--local-database=terria_v1_local;DROP']),
    /unsafe database identifier/
  );
});

test('buildItemSourceExistingEvidenceLayersReport assigns one evidence layer with precedence', () => {
  const report = buildFixtureReport();

  assert.deepEqual(
    report.rows.map((row) => [row.itemId, row.evidenceLayer, row.projectionGap]),
    [
      [1, 'active_source_present', 'closure_report_stale_or_source_reintroduced'],
      [2, 'item_only_no_source_evidence', 'no_checked_source_evidence_found'],
      [3, 'raw_candidate_not_projected', 'candidate_import_missing_or_not_applied'],
      [4, 'candidate_import_not_applied', 'planned_candidate_rows_not_inserted_or_published'],
      [5, 'recipe_or_shimmer_covered', 'dedicated_recipe_or_shimmer_projection_required'],
      [6, 'npc_relation_not_projected', 'npc_loot_or_shop_relation_not_projected'],
      [7, 'biome_projection_pending', 'biome_relation_projection_required'],
      [8, 'maint_or_relation_not_published', 'maint_or_relation_fact_not_published_to_local'],
      [9, 'family_policy_pending', 'family_shared_page_policy_required'],
      [10, 'terminal_exempt_or_identity_review', 'terminal_or_identity_review_not_importable'],
      [11, 'missing_required_raw_evidence', 'required_raw_evidence_missing']
    ]
  );
  assert.equal(report.summary.totalRows, 11);
  assert.equal(report.summary.layerCounts.active_source_present, 1);
  assert.equal(report.summary.activeSourcePresentButStillInClosure, 1);
  assert.equal(report.summary.layerCountSum, 11);
  assert.equal(Object.values(report.summary.layerCounts).reduce((sum, count) => sum + count, 0), 11);
  assert.equal(report.summary.itemOnlyNoSourceEvidence, report.summary.layerCounts.item_only_no_source_evidence);
  assert.equal(report.summary.rawCandidateNotProjected, report.summary.layerCounts.raw_candidate_not_projected);
  assert.equal(report.summary.candidateImportNotApplied, report.summary.layerCounts.candidate_import_not_applied);
  assert.equal(report.summary.recipeOrShimmerCovered, report.summary.layerCounts.recipe_or_shimmer_covered);
  assert.equal(report.summary.npcRelationNotProjected, report.summary.layerCounts.npc_relation_not_projected);
  assert.equal(report.summary.biomeProjectionPending, report.summary.layerCounts.biome_projection_pending);
  assert.equal(report.summary.maintOrRelationNotPublished, report.summary.layerCounts.maint_or_relation_not_published);
  assert.equal(report.summary.familyPolicyPending, report.summary.layerCounts.family_policy_pending);
  assert.equal(report.summary.terminalExemptOrIdentityReview, report.summary.layerCounts.terminal_exempt_or_identity_review);
  assert.equal(report.summary.missingRequiredRawEvidence, report.summary.layerCounts.missing_required_raw_evidence);
});

test('terminal rows do not become raw candidate rows even when raw candidates exist', () => {
  const report = buildFixtureReport();
  const terminal = report.rows.find((row) => row.itemId === 10);

  assert.equal(terminal.rawCandidateSourceCount, 1);
  assert.equal(terminal.evidenceLayer, 'terminal_exempt_or_identity_review');
  assert.equal(terminal.terminalClosureStatus, 'non_item_effect');
});

test('resolveEvidenceLayer keeps missing raw above terminal-like raw candidates', () => {
  assert.equal(resolveEvidenceLayer({
    closureLane: 'missing_required_raw_evidence',
    terminalResolutionLane: 'missing_required_raw_evidence',
    terminalClosureStatus: 'missing_bait_raw',
    activeSourceCount: 0,
    rawCandidateSourceCount: 3,
    candidateImportPlannedSourceRows: 2
  }), 'missing_required_raw_evidence');
});

test('resolveEvidenceLayer precedence keeps stronger evidence layers first', () => {
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 1,
    terminalResolutionLane: 'explicit_no_source_exemption_candidate',
    rawCandidateSourceCount: 1,
    candidateImportPlannedSourceRows: 1,
    recipeCount: 1
  }), 'active_source_present');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    terminalResolutionLane: 'explicit_no_source_exemption_candidate',
    rawCandidateSourceCount: 1,
    candidateImportPlannedSourceRows: 1
  }), 'terminal_exempt_or_identity_review');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    recipeCount: 1,
    npcLootOrShopCount: 1,
    biomeEvidenceCount: 1,
    maintSourceCount: 1,
    candidateImportPlannedSourceRows: 1
  }), 'recipe_or_shimmer_covered');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    npcLootOrShopCount: 1,
    biomeEvidenceCount: 1,
    maintSourceCount: 1,
    candidateImportPlannedSourceRows: 1
  }), 'npc_relation_not_projected');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    maintSourceCount: 1,
    relationFactCount: 1,
    candidateImportPlannedSourceRows: 1,
    rawCandidateSourceCount: 1
  }), 'maint_or_relation_not_published');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    candidateImportPlannedSourceRows: 1,
    rawCandidateSourceCount: 1,
    closureLane: 'family_policy_candidate'
  }), 'candidate_import_not_applied');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    rawCandidateSourceCount: 1,
    closureLane: 'family_policy_candidate'
  }), 'raw_candidate_not_projected');
  assert.equal(resolveEvidenceLayer({
    activeSourceCount: 0,
    closureLane: 'family_policy_candidate'
  }), 'family_policy_pending');
});

test('renderItemSourceExistingEvidenceLayersChineseSummary explains DB item existence vs active source', () => {
  const summary = renderItemSourceExistingEvidenceLayersChineseSummary(buildFixtureReport());

  assert.match(summary, /items 表有物品/);
  assert.match(summary, /active item_acquisition_sources/);
  assert.match(summary, /库里有/);
  assert.match(summary, /下一轮建议/);
});
