import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildNpcDomainLootChainReport,
  classifySourceRows,
  computeRowIdentityHash,
  runNpcDomainLootChainAudit,
} from './npc-domain-loot-chain-audit.mjs';

function expectedZeroRule(overrides = {}) {
  return {
    npcInternalName: 'ZeroNpc',
    npcType: 'town',
    reason: 'town_npc_no_loot',
    evidenceSource: 'contract',
    reviewedBy: 'test',
    reviewedAt: '2026-05-10',
    ...overrides,
  };
}

function inheritanceRule(overrides = {}) {
  return {
    targetNpcInternalName: 'BodyNpc',
    sourceNpcInternalName: 'HeadNpc',
    inheritanceKind: 'segment_family',
    evidenceSource: 'contract',
    reviewedBy: 'test',
    reviewedAt: '2026-05-10',
    ...overrides,
  };
}

test('classifies every active NPC exactly once', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'DirectNpc', name: 'Direct NPC', isTownNpc: false },
      { internalName: 'ZeroNpc', name: 'Zero NPC', isTownNpc: false },
      { internalName: 'GapNpc', name: 'Gap NPC', isTownNpc: false },
    ],
    localLootRows: [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
    relationLootRows: [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
    projectionLootRows: [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
    apiLootRows: [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
    expectedZeroRules: [expectedZeroRule()],
    sourceGaps: [{ npcInternalName: 'GapNpc', reason: 'source_page_missing' }],
  });

  assert.equal(report.summary.activeNpcs, 3);
  assert.equal(report.summary.classifiedNpcs, 3);
  assert.equal(report.summary.unknown, 0);
  assert.deepEqual(
    report.npcStatuses.map((row) => row.npcStatus),
    ['trusted_direct_loot', 'expected_zero_loot', 'blocked_source_gap']
  );
});

test('contract backed statuses short-circuit only source-gap and fallback-only gaps', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'TownNpc', name: 'Town NPC', npcType: 'town', isTownNpc: true },
      { internalName: 'HarmlessCritter', name: 'Harmless Critter', npcType: 'critter' },
      { internalName: 'UnprovenCritter', name: 'Unproven Critter', npcType: 'critter' },
      { internalName: 'BodyNpc', name: 'Body NPC', npcType: 'segment' },
      { internalName: 'FallbackNpc', name: 'Fallback NPC', npcType: 'segment' },
      { internalName: 'PollutedZero', name: 'Polluted Zero', npcType: 'town' },
      { internalName: 'ProjectionProblem', name: 'Projection Problem', npcType: 'segment' },
    ],
    expectedZeroRules: [
      expectedZeroRule({ npcInternalName: 'TownNpc', npcType: 'town' }),
      expectedZeroRule({ npcInternalName: 'HarmlessCritter', npcType: 'critter', reason: 'critter_no_loot' }),
      expectedZeroRule({ npcInternalName: 'PollutedZero', npcType: 'town' }),
    ],
    inheritanceRules: [
      inheritanceRule({
        targetNpcInternalName: 'BodyNpc',
        sourceNpcInternalName: 'HeadNpc',
      }),
      inheritanceRule({
        targetNpcInternalName: 'ProjectionProblem',
        sourceNpcInternalName: 'HeadNpc',
      }),
    ],
    localLootRows: [
      { npcInternalName: 'HeadNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'BodyNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'ProjectionProblem', itemInternalName: 'ItemA' },
      { npcInternalName: 'PollutedZero', itemInternalName: 'BadItem' },
    ],
    relationLootRows: [
      { npcInternalName: 'HeadNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'BodyNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'ProjectionProblem', itemInternalName: 'ItemA' },
      { npcInternalName: 'PollutedZero', itemInternalName: 'BadItem' },
    ],
    projectionLootRows: [
      { npcInternalName: 'HeadNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'BodyNpc', itemInternalName: 'ItemA' },
    ],
    apiLootRows: [
      { npcInternalName: 'HeadNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'BodyNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'ProjectionProblem', itemInternalName: 'ItemA' },
      { npcInternalName: 'PollutedZero', itemInternalName: 'BadItem' },
    ],
    runtimeFallbackRows: [
      { npcInternalName: 'BodyNpc', sourceNpcInternalName: 'HeadNpc' },
      { npcInternalName: 'FallbackNpc', sourceNpcInternalName: 'HeadNpc' },
      { npcInternalName: 'ProjectionProblem', sourceNpcInternalName: 'HeadNpc' },
    ],
    pollutionRows: [{ npcInternalName: 'PollutedZero', reason: 'expected_zero_has_loot' }],
    sourceGaps: [
      { npcInternalName: 'TownNpc', reason: 'source_page_missing' },
      { npcInternalName: 'HarmlessCritter', reason: 'source_page_missing' },
      { npcInternalName: 'UnprovenCritter', reason: 'source_page_missing' },
    ],
  });
  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row]));

  assert.equal(byName.TownNpc.npcStatus, 'expected_zero_loot');
  assert.equal(byName.HarmlessCritter.npcStatus, 'expected_zero_loot');
  assert.equal(byName.UnprovenCritter.npcStatus, 'blocked_source_gap');
  assert.equal(byName.BodyNpc.npcStatus, 'trusted_inherited_loot');
  assert.equal(byName.FallbackNpc.npcStatus, 'runtime_fallback_only');
  assert.equal(byName.PollutedZero.npcStatus, 'duplicate_or_polluted');
  assert.equal(byName.ProjectionProblem.npcStatus, 'projection_gap');
});

test('inheritance contract alone does not create trusted inherited loot without chain evidence', () => {
  const report = buildNpcDomainLootChainReport({
    options: { requireApiEvidence: false },
    npcs: [{ internalName: 'BodyNpc', name: 'Body NPC', npcType: 'segment' }],
    inheritanceRules: [inheritanceRule()],
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'projection_gap');
  assert.equal(report.auditStatus, 'blocked');
});

test('inheritance contract requires trusted source NPC chain evidence', () => {
  const report = buildNpcDomainLootChainReport({
    options: { requireApiEvidence: false },
    npcs: [{ internalName: 'BodyNpc', name: 'Body NPC', npcType: 'segment' }],
    inheritanceRules: [inheritanceRule()],
    relationLootRows: [{ npcInternalName: 'BodyNpc', itemInternalName: 'Scale' }],
    projectionLootRows: [{ npcInternalName: 'BodyNpc', itemInternalName: 'Scale' }],
    localLootRows: [{ npcInternalName: 'BodyNpc', itemInternalName: 'Scale' }],
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'relation_gap');
  assert.equal(status.statusReason, 'inheritance_source_lacks_trusted_structured_rows');
});

test('runNpcDomainLootChainAudit default path includes source gaps, runtime fallbacks, and API rows', async () => {
  const calls = [];
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-10-default-path-test' },
    {
      connection: {},
      loadActiveNpcs: async () => [{ internalName: 'FallbackNpc', name: 'Fallback NPC', isTownNpc: false }],
      loadSourceRows: async () => [],
      loadRelationLootRows: async () => [],
      loadProjectionLootRows: async () => [],
      loadLocalLootRows: async () => [],
      loadContracts: async () => ({ expectedZeroRules: [], inheritanceRules: [], contractFiles: [] }),
      loadSourceGaps: async () => [{ npcInternalName: 'FallbackNpc', reason: 'source_page_missing' }],
      loadRuntimeFallbackRows: async () => {
        calls.push('runtime');
        return [{ npcInternalName: 'FallbackNpc', sourceNpcInternalName: 'SourceNpc' }];
      },
      loadApiLootRows: async () => {
        calls.push('api');
        return [{ npcInternalName: 'FallbackNpc', itemInternalName: 'FallbackDrop' }];
      },
      loadPollutionRows: async () => [],
    }
  );

  assert.deepEqual(calls, ['runtime', 'api']);
  assert.equal(result.report.npcStatuses[0].npcStatus, 'runtime_fallback_only');
});

test('runNpcDomainLootChainAudit default empty API loader does not fabricate api gaps', async () => {
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-11-empty-api-loader-test' },
    {
      connection: {},
      loadActiveNpcs: async () => [{ internalName: 'DirectNpc', name: 'Direct NPC', isTownNpc: false }],
      loadSourceRows: async () => [],
      loadRelationLootRows: async () => [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
      loadProjectionLootRows: async () => [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
      loadLocalLootRows: async () => [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
      loadContracts: async () => ({ expectedZeroRules: [], inheritanceRules: [], contractFiles: [] }),
      loadSourceGaps: async () => [],
      loadRuntimeFallbackRows: async () => [],
      loadApiLootRows: async () => [],
      loadPollutionRows: async () => [],
    }
  );

  assert.equal(result.report.npcStatuses[0].npcStatus, 'trusted_direct_loot');
  assert.equal(result.report.summary.apiGap, 0);
});

test('runNpcDomainLootChainAudit default source-gap loader consumes source coverage report', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-domain-audit-'));
  const reportPath = path.join(tempDir, 'source-coverage.json');
  await fs.writeFile(reportPath, JSON.stringify({
    npcs: [
      { npcInternalName: 'MissingNpc', sourceCoverageStatus: 'source_page_missing', sourcePage: 'Missing NPC' }
    ]
  }));

  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-10-source-gap-test' },
    {
      connection: {},
      loadActiveNpcs: async () => [{ internalName: 'MissingNpc', name: 'Missing NPC', isTownNpc: false }],
      loadSourceRows: async () => [],
      loadRelationLootRows: async () => [],
      loadProjectionLootRows: async () => [],
      loadLocalLootRows: async () => [],
      loadContracts: async () => ({ expectedZeroRules: [], inheritanceRules: [], contractFiles: [] }),
      loadSourceGaps: async () => JSON.parse(await fs.readFile(reportPath, 'utf8')).npcs.map((row) => ({ npcInternalName: row.npcInternalName, reason: row.sourceCoverageStatus })),
      loadRuntimeFallbackRows: async () => [],
      loadApiLootRows: async () => [],
      loadPollutionRows: async () => [],
    }
  );

  assert.equal(result.report.npcStatuses[0].npcStatus, 'blocked_source_gap');
});

test('classifies hostile NPC chain gaps without hiding zero rows', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'RelationMissing', npcType: 'hostile' },
      { internalName: 'LocalMissing', npcType: 'hostile' },
      { internalName: 'ZeroWithoutContract', npcType: 'hostile' },
    ],
    sourceRows: [
      {
        itemInternalName: 'ItemA',
        sourceRefName: 'Relation Missing',
        sourceRefInternalName: 'RelationMissing',
        sourceRefResolution: 'exact_internal_name',
      },
      {
        itemInternalName: 'ItemB',
        sourceRefName: 'Local Missing',
        sourceRefInternalName: 'LocalMissing',
        sourceRefResolution: 'exact_internal_name',
      },
    ],
    relationLootRows: [{ npcInternalName: 'LocalMissing', itemInternalName: 'ItemB' }],
    projectionLootRows: [{ npcInternalName: 'LocalMissing', itemInternalName: 'ItemB' }],
  });
  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row.npcStatus]));

  assert.equal(byName.RelationMissing, 'relation_gap');
  assert.equal(byName.LocalMissing, 'local_gap');
  assert.equal(byName.ZeroWithoutContract, 'unclassified_zero');
});

test('classifies local-only loot rows as polluted instead of unknown', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'LegacyBoss', npcType: 'boss' }],
    localLootRows: [{ npcInternalName: 'LegacyBoss', itemInternalName: 'LegacyDrop' }],
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'duplicate_or_polluted');
  assert.equal(status.statusReason, 'local_rows_without_relation_or_projection_provenance');
});

test('invalid contract rows do not authorize expected zero or inheritance classifications', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'InvalidZero', npcType: 'town' },
      { internalName: 'InvalidInheritance', npcType: 'segment' },
    ],
    expectedZeroRules: [
      { npcInternalName: 'InvalidZero', reason: 'town_or_non_loot_entity', evidenceSource: 'contract' },
    ],
    inheritanceRules: [
      { targetNpcInternalName: 'InvalidInheritance', sourceNpcInternalName: 'HeadNpc', inheritanceKind: 'same_display_name' },
    ],
    sourceGaps: [
      { npcInternalName: 'InvalidZero', reason: 'source_page_missing' },
      { npcInternalName: 'InvalidInheritance', reason: 'source_page_missing' },
    ],
  });
  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row.npcStatus]));

  assert.equal(byName.InvalidZero, 'blocked_source_gap');
  assert.equal(byName.InvalidInheritance, 'blocked_source_gap');
  assert.equal(report.releaseBlockers.some((row) => row.type === 'contract_row' && row.contract === 'expected_zero'), true);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'contract_row' && row.contract === 'inheritance'), true);
});

test('missing source coverage evidence is a release blocker', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'ZeroNpc', npcType: 'hostile' }],
    sourceCoverageRows: [{
      evidenceBlocker: true,
      sourceCoverageStatus: 'source_coverage_report_missing',
      reason: 'source_coverage_report_missing',
      reportPath: 'reports/audit/npc-source-coverage-inventory-missing.json',
    }],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.evidenceHealth, 'source_coverage_unavailable');
  assert.equal(report.releaseBlockers.some((row) => row.type === 'evidence'), true);
});

test('classifies source rows and stable duplicate identities', () => {
  const rows = classifySourceRows([
    { itemInternalName: 'Gel', sourceRefName: 'Slimes', sourceRefInternalName: null },
    {
      itemInternalName: 'Bacon',
      sourceRefName: 'Pigron',
      sourceRefInternalName: 'PigronCorruption',
      sourceRefResolution: 'positive_id_fallback',
      candidateNpcInternalNames: ['PigronCorruption', 'PigronCrimson'],
    },
    { itemInternalName: 'GoldCoin', sourceRefName: 'Gold Chest' },
    {
      itemInternalName: 'Lens',
      sourceRefName: 'Demon Eye',
      sourceRefInternalName: 'DemonEye',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '33%',
    },
    {
      itemInternalName: 'Lens',
      sourceRefName: 'Demon Eye',
      sourceRefInternalName: 'DemonEye',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '33%',
    },
    { itemInternalName: null, sourceRefName: 'Zombie', sourceRefInternalName: 'Zombie' },
  ]);

  assert.deepEqual(rows.map((row) => row.sourceRowStatus), [
    'blocked_generic_bucket',
    'blocked_ambiguous_variant',
    'blocked_non_npc_source',
    'duplicate_source_identity',
    'duplicate_source_identity',
    'blocked_missing_item_or_npc_identity',
  ]);
  assert.equal(rows[3].rowIdentityHash, rows[4].rowIdentityHash);
  assert.equal(
    computeRowIdentityHash({ npcInternalName: 'DemonEye', itemInternalName: 'Lens', chanceText: '33%' }),
    computeRowIdentityHash({ itemInternalName: 'Lens', npcInternalName: 'DemonEye', chanceText: '33%' })
  );
});

test('reviewed non-NPC source exclusions are reported separately and never materialized', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'ChestLikeNpc', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'GoldCoin',
      sourceRefName: 'Gold Chest',
      sourceRefType: 'npc',
      sourceType: 'drop',
      sourceRefInternalName: 'ChestLikeNpc',
      sourceRefResolution: 'exact_internal_name',
    }],
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'exact',
      sourceRefName: 'Gold Chest',
      reason: 'chest_container',
      evidenceSource: 'wiki:Gold Chest',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-10',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.summary.reviewedNonNpcExclusion, 1);
  assert.equal(report.summary.blockedNonNpcSource, 0);
  assert.equal(report.summary.blockedNonNpcSourcePromoted, 0);
  assert.equal(report.blockedRows.length, 0);
  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_non_npc_source_exclusion');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'source_row' && row.sourceRefName === 'Gold Chest'), false);
});

test('invalid reviewed non-NPC source exclusion rows block contract health', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'ZeroNpc', npcType: 'enemy' }],
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'regex',
      sourceRefName: 'Crate',
      reason: 'crate_container',
      evidenceSource: 'wiki:Crates',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-10',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.contractHealth.invalidReviewedNonNpcSourceExclusions.length, 1);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'contract_row' && row.contract === 'reviewed_non_npc_source_exclusion'), true);
});

test('report exposes required output shape and release blockers', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'UnknownNpc' }],
    sourceRows: [{ itemInternalName: 'Coin', sourceRefName: 'Gold Chest' }],
    sourceCoverageRows: [{
      npcInternalName: 'UnknownNpc',
      sourceCoverageStatus: 'source_page_present_with_loot',
      maintSourceCount: 1,
      maintSourceRows: [{
        recordKey: 'maint-unknown-coin',
        itemInternalName: 'Coin',
        sourceRefName: 'UnknownNpc',
        sourceRefInternalName: 'UnknownNpc'
      }]
    }],
    options: { dateTag: '2026-05-10-test' },
  });

  for (const key of [
    'auditName',
    'generatedAt',
    'auditStatus',
    'evidenceHealth',
    'summary',
    'npcStatuses',
    'sourceRows',
    'chainGaps',
    'duplicates',
    'blockedRows',
    'releaseBlockers',
    'options',
  ]) {
    assert.ok(Object.hasOwn(report, key), key);
  }
  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.blockedNonNpcSource, 1);
  assert.equal(report.releaseBlockers.length > 0, true);
  assert.equal(Object.hasOwn(report.npcStatuses[0], 'rowIdentityHash'), true);
  assert.equal(report.npcStatuses[0].maintSourceCount, 1);
  assert.deepEqual(report.npcStatuses[0].maintSourceRows, [{
    recordKey: 'maint-unknown-coin',
    itemInternalName: 'Coin',
    sourceRefName: 'UnknownNpc',
    sourceRefInternalName: 'UnknownNpc'
  }]);
});

test('runNpcDomainLootChainAudit returns blocked report when DB is unavailable and does not write by default', async () => {
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-10-test' },
    {
      mysqlFactory: {
        async createConnection() {
          throw new Error('connection refused');
        },
      },
      config: { database: { host: '127.0.0.1', port: 3306, username: 'root', password: 'secret' } },
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'db_unavailable');
  assert.equal(result.reportPath, null);
  assert.equal(result.report.error.message, 'connection refused');
});
