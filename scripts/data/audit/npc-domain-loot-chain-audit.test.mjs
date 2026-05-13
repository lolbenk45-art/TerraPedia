import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildNpcDomainLootChainReport,
  buildItemLookupIndex,
  classifySourceRows,
  computeRowIdentityHash,
  parseMarkdownTableRows,
  resolveSourceRowItemInternalName,
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

function noDirectItemLootRule(overrides = {}) {
  return {
    npcInternalName: 'NoDirectNpc',
    npcType: 'enemy',
    reason: 'positive_source_page_exact_infobox_no_direct_item_loot',
    evidenceSource: 'contract',
    reviewedBy: 'test',
    reviewedAt: '2026-05-12',
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

test('trusted direct status reason names API parity only when API rows are present', () => {
  const lootRow = { npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' };
  const localOnlyReport = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'DirectNpc', name: 'Direct NPC', isTownNpc: false }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
  });

  assert.equal(localOnlyReport.npcStatuses[0].npcStatus, 'trusted_direct_loot');
  assert.equal(localOnlyReport.npcStatuses[0].statusReason, 'relation_projection_local_rows_match');

  const apiReport = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'DirectNpc', name: 'Direct NPC', isTownNpc: false }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    apiLootRows: [lootRow],
  });

  assert.equal(apiReport.npcStatuses[0].npcStatus, 'trusted_direct_loot');
  assert.equal(apiReport.npcStatuses[0].statusReason, 'relation_projection_local_api_rows_match');
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

test('contract backed inherited loot is trusted when materialized rows pass parity despite source gap report', () => {
  const report = buildNpcDomainLootChainReport({
    options: { requireApiEvidence: false },
    npcs: [
      { internalName: 'Hornet', name: 'Hornet', npcType: 'enemy' },
      { internalName: 'BigHornetStingy', name: 'Hornet', npcType: 'enemy' },
    ],
    inheritanceRules: [
      inheritanceRule({
        targetNpcInternalName: 'BigHornetStingy',
        sourceNpcInternalName: 'Hornet',
        inheritanceKind: 'same_name_variant',
        evidenceSource: 'https://terraria.wiki.gg/wiki/Hornet',
        reviewedAt: '2026-05-11',
      }),
    ],
    relationLootRows: [
      { npcInternalName: 'Hornet', itemInternalName: 'AncientCobaltHelmet' },
      { npcInternalName: 'BigHornetStingy', itemInternalName: 'AncientCobaltHelmet' },
    ],
    projectionLootRows: [
      { npcInternalName: 'Hornet', itemInternalName: 'AncientCobaltHelmet' },
      { npcInternalName: 'BigHornetStingy', itemInternalName: 'AncientCobaltHelmet' },
    ],
    localLootRows: [
      { npcInternalName: 'Hornet', itemInternalName: 'AncientCobaltHelmet' },
      { npcInternalName: 'BigHornetStingy', itemInternalName: 'AncientCobaltHelmet' },
    ],
    sourceGaps: [
      { npcInternalName: 'BigHornetStingy', reason: 'group_page_present_variant_not_extracted' },
    ],
  });

  const inherited = report.npcStatuses.find((row) => row.npcInternalName === 'BigHornetStingy');
  assert.equal(inherited.npcStatus, 'trusted_inherited_loot');
  assert.equal(inherited.contractRef, 'inheritance:BigHornetStingy->Hornet');
  assert.equal(report.summary.blockedSourceGap, 0);
});

test('positive row identity count mismatch blocks trusted inherited loot', () => {
  const report = buildNpcDomainLootChainReport({
    options: { requireApiEvidence: false },
    npcs: [
      { internalName: 'SourceNpc', name: 'Source NPC', npcType: 'enemy' },
      { internalName: 'MismatchNpc', name: 'Mismatch NPC', npcType: 'segment' },
    ],
    inheritanceRules: [inheritanceRule({ targetNpcInternalName: 'MismatchNpc', sourceNpcInternalName: 'SourceNpc' })],
    relationLootRows: [
      { npcInternalName: 'SourceNpc', itemInternalName: 'SourceItem' },
      { npcInternalName: 'MismatchNpc', itemInternalName: 'ItemA' },
      { npcInternalName: 'MismatchNpc', itemInternalName: 'ItemB' },
    ],
    projectionLootRows: [
      { npcInternalName: 'SourceNpc', itemInternalName: 'SourceItem' },
      { npcInternalName: 'MismatchNpc', itemInternalName: 'ItemA' },
    ],
    localLootRows: [
      { npcInternalName: 'SourceNpc', itemInternalName: 'SourceItem' },
      { npcInternalName: 'MismatchNpc', itemInternalName: 'ItemA' },
    ],
    apiLootRows: [
      { npcInternalName: 'SourceNpc', itemInternalName: 'SourceItem' },
      { npcInternalName: 'MismatchNpc', itemInternalName: 'ItemA' },
    ],
  });

  const status = report.npcStatuses.find((row) => row.npcInternalName === 'MismatchNpc');
  assert.equal(status.npcStatus, 'count_parity_only');
  assert.equal(status.statusReason, 'counts_match_but_row_identity_differs');
});

test('runNpcDomainLootChainAudit default path includes source gaps, runtime fallbacks, and API rows', async () => {
  const calls = [];
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-10-default-path-test' },
    {
      connection: {},
      loadActiveNpcs: async () => [{ internalName: 'FallbackNpc', name: 'Fallback NPC', isTownNpc: false }],
      loadItemRows: async () => [],
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
      loadItemRows: async () => [],
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
      loadItemRows: async () => [],
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

test('unextracted source coverage blocks downstream direct-loot parity without a closure contract', () => {
  const lootRow = {
    npcInternalName: 'Reaper',
    itemInternalName: 'DeathSickle',
    itemName: 'Death Sickle',
    chanceText: '2.5%',
    quantityText: '1'
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Reaper', name: 'Reaper', npcType: 'enemy' }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    sourceCoverageRows: [{
      npcInternalName: 'Reaper',
      sourceCoverageStatus: 'source_page_present_unextracted',
      reason: 'source_page_present_unextracted',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'blocked_source_gap');
  assert.equal(status.statusReason, 'source_page_present_unextracted');
  assert.equal(report.summary.blockedSourceGap, 1);
  assert.equal(report.releaseBlockers.some((row) =>
    row.type === 'npc_status'
    && row.npcInternalName === 'Reaper'
    && row.status === 'blocked_source_gap'
  ), true);
});

test('unextracted source coverage blocks expected-zero and domain-separated contracts until crawled', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'ExpectedZeroNpc', name: 'Expected Zero NPC', npcType: 'enemy' },
      { internalName: 'DomainSeparatedNpc', name: 'Domain Separated NPC', npcType: 'boss' },
    ],
    expectedZeroRules: [
      expectedZeroRule({
        npcInternalName: 'ExpectedZeroNpc',
        npcType: 'enemy',
        reason: 'enemy_no_direct_item_loot',
      }),
    ],
    domainSeparatedRules: [{
      npcInternalName: 'DomainSeparatedNpc',
      npcType: 'boss',
      reason: 'boss_reward_domain_separated',
      evidenceSource: 'contract',
      reviewedBy: 'test',
      reviewedAt: '2026-05-10',
    }],
    sourceCoverageRows: [
      {
        npcInternalName: 'ExpectedZeroNpc',
        sourceCoverageStatus: 'source_page_present_unextracted',
        reason: 'source_page_present_unextracted',
      },
      {
        npcInternalName: 'DomainSeparatedNpc',
        sourceCoverageStatus: 'source_page_present_unextracted',
        reason: 'source_page_present_unextracted',
      },
    ],
    options: { requireApiEvidence: false },
  });

  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row]));
  assert.equal(byName.ExpectedZeroNpc.npcStatus, 'blocked_source_gap');
  assert.equal(byName.DomainSeparatedNpc.npcStatus, 'blocked_source_gap');
  assert.equal(report.summary.blockedSourceGap, 2);
  assert.equal(report.auditStatus, 'blocked');
});

test('runNpcDomainLootChainAudit default path forwards no-direct item loot contracts', async () => {
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-12-no-direct-contract-forward-test' },
    {
      connection: {},
      loadActiveNpcs: async () => [{ internalName: 'SkeletonTopHat', name: 'Skeleton', isTownNpc: false }],
      loadItemRows: async () => [],
      loadSourceRows: async () => [],
      loadRelationLootRows: async () => [],
      loadProjectionLootRows: async () => [],
      loadLocalLootRows: async () => [],
      loadContracts: async () => ({
        expectedZeroRules: [],
        domainSeparatedRules: [],
        inheritanceRules: [],
        noDirectItemLootRules: [noDirectItemLootRule({ npcInternalName: 'SkeletonTopHat' })],
        reviewedNonNpcSourceExclusions: [],
        contractFiles: []
      }),
      loadSourceGaps: async () => [{
        npcInternalName: 'SkeletonTopHat',
        sourceCoverageStatus: 'source_page_present_no_direct_item_loot'
      }],
      loadRuntimeFallbackRows: async () => [],
      loadApiLootRows: async () => [],
      loadPollutionRows: async () => [],
    }
  );

  assert.equal(result.report.npcStatuses[0].npcStatus, 'reviewed_no_direct_item_loot');
  assert.equal(result.report.summary.reviewedNoDirectItemLoot, 1);
  assert.equal(result.report.contractHealth.noDirectItemLootRules, 1);
});

test('runNpcDomainLootChainAudit reads only active maint item source rows', async () => {
  const queries = [];
  const result = await runNpcDomainLootChainAudit(
    {
      writeReport: false,
      requireApiEvidence: false,
      maintDatabase: 'terria_v1_maint',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local',
    },
    {
      mysqlFactory: {
        createConnection: async () => ({
          query: async (sql) => {
            queries.push(sql);
            if (sql.includes('FROM `terria_v1_local`.`npcs`')) {
              return [[{ internalName: 'SandShark', name: 'Sand Shark', npcType: 'enemy', isTownNpc: 0 }]];
            }
            if (sql.includes('FROM `terria_v1_maint`.`maint_item_sources`')) {
              return [[{
                itemInternalName: 'SharkFin',
                itemName: 'Shark Fin',
                sourceRefName: 'Sand Shark',
                sourceRefType: 'npc',
                sourceType: 'drop',
                rawJson: JSON.stringify({
                  sourceRefInternalName: 'SandShark',
                  sourceRefResolution: 'exact_internal_name',
                  chanceText: '12.5%',
                }),
                recordKey: 'npc-item:sand-shark:loot:shark-fin:1',
              }]];
            }
            return [[]];
          },
          end: async () => {},
        }),
      },
      loadSourceGaps: async () => [],
      loadContracts: async () => ({
        expectedZeroRules: [],
        inheritanceRules: [],
        reviewedNonNpcSourceExclusions: [],
        invalidReviewedNonNpcSourceExclusions: [],
        contractFiles: [],
      }),
      loadApiLootRows: async () => [],
    }
  );

  assert.equal(result.report.sourceRows.length, 1);
  const sourceSql = queries.find((sql) => sql.includes('FROM `terria_v1_maint`.`maint_item_sources`'));
  assert.ok(sourceSql, 'expected maint_item_sources query');
  assert.match(sourceSql, /\bstatus\s*=\s*1\b/i);
  assert.match(sourceSql, /\bdeleted\s*=\s*0\b/i);
});

test('runNpcDomainLootChainAudit preserves projection conditionText for row identity parity', async () => {
  const lootRow = {
    npcInternalName: 'PresentMimic',
    itemInternalName: 'Present',
    quantityText: null,
    chanceText: '{{modes|wrap=no|{{eicons|Expert Mode}} 100%}}',
    conditions: 'During Christmas only',
  };
  const result = await runNpcDomainLootChainAudit(
    { writeReport: false, dateTag: '2026-05-11-projection-condition-text-test' },
    {
      connection: {
        query: async () => [[{
          npcInternalName: 'PresentMimic',
          lootItemsJson: JSON.stringify([{
            itemInternalName: 'Present',
            quantityText: null,
            chanceText: '{{modes|wrap=no|{{eicons|Expert Mode}} 100%}}',
            conditionText: 'During Christmas only',
          }]),
        }]],
      },
      loadActiveNpcs: async () => [{ internalName: 'PresentMimic', name: 'Present Mimic', npcType: 'enemy' }],
      loadItemRows: async () => [],
      loadSourceRows: async () => [],
      loadRelationLootRows: async () => [lootRow],
      loadLocalLootRows: async () => [lootRow],
      loadContracts: async () => ({ expectedZeroRules: [], inheritanceRules: [], reviewedNonNpcSourceExclusions: [], contractFiles: [] }),
      loadSourceGaps: async () => [],
      loadRuntimeFallbackRows: async () => [],
      loadApiLootRows: async () => [],
      loadPollutionRows: async () => [],
    }
  );

  const status = result.report.npcStatuses[0];
  assert.equal(status.npcStatus, 'trusted_direct_loot');
  assert.equal(result.report.summary.countParityOnly, 0);
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

test('materializable source row identities must all reach relation rows', () => {
  const deathSickleRow = {
    npcInternalName: 'Reaper',
    itemInternalName: 'DeathSickle',
    itemName: 'Death Sickle',
    chanceText: '2.5%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Reaper', name: 'Reaper', npcType: 'enemy' }],
    sourceRows: [
      {
        itemInternalName: 'DeathSickle',
        itemName: 'Death Sickle',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '2.5%',
        quantityText: '1',
      },
      {
        itemInternalName: 'Requiem',
        itemName: 'Requiem',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '1.67%',
        quantityText: '1',
      },
    ],
    relationLootRows: [deathSickleRow],
    projectionLootRows: [deathSickleRow],
    localLootRows: [deathSickleRow],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'relation_gap');
  assert.equal(status.statusReason, 'materializable_source_identity_missing_relation_row');
  assert.equal(report.summary.relationGap, 1);
  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.releaseBlockers.some((row) =>
    row.type === 'npc_status'
    && row.npcInternalName === 'Reaper'
    && row.status === 'relation_gap'
  ), true);
});

test('source to relation materialization compares item presence not duplicate provenance text', () => {
  const relationRows = [
    {
      npcInternalName: 'Reaper',
      itemInternalName: 'DeathSickle',
      itemName: 'Death Sickle',
      chanceText: '{{modes|2.5%|4.94%}}',
      quantityText: '1',
    },
    {
      npcInternalName: 'Reaper',
      itemInternalName: 'Requiem',
      itemName: 'Requiem',
      chanceText: '1.67%',
      quantityText: '1',
    },
  ];
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Reaper', name: 'Reaper', npcType: 'enemy' }],
    sourceRows: [
      {
        itemInternalName: 'DeathSickle',
        itemName: 'Death Sickle',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '{{modes|2.5%|4.94%}}',
        quantityText: '1',
        landingSourceKey: 'generated.npc_item_relations_bundle',
      },
      {
        itemInternalName: 'DeathSickle',
        itemName: 'Death Sickle',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '2.5% 4.94%',
        quantityText: '1',
        conditions: 'Normal mode row',
        landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
      },
      {
        itemInternalName: 'Requiem',
        itemName: 'Requiem',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '1.67%',
        quantityText: '1',
        landingSourceKey: 'generated.npc_item_relations_bundle',
      },
    ],
    relationLootRows: relationRows,
    projectionLootRows: relationRows,
    localLootRows: relationRows,
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'trusted_direct_loot');
  assert.equal(report.summary.relationGap, 0);
  assert.equal(report.auditStatus, 'pass');
});

test('materializable source row multiplicity must reach relation rows for the same item', () => {
  const deathSickleRow = {
    npcInternalName: 'Reaper',
    itemInternalName: 'DeathSickle',
    itemName: 'Death Sickle',
    chanceText: '2.5%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Reaper', name: 'Reaper', npcType: 'enemy' }],
    sourceRows: [
      {
        itemInternalName: 'DeathSickle',
        itemName: 'Death Sickle',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '2.5%',
        quantityText: '1',
        conditions: 'Normal mode row',
      },
      {
        itemInternalName: 'DeathSickle',
        itemName: 'Death Sickle',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Reaper',
        sourceRefInternalName: 'Reaper',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '4.94%',
        quantityText: '1',
        conditions: 'Expert mode row',
      },
    ],
    relationLootRows: [deathSickleRow],
    projectionLootRows: [deathSickleRow],
    localLootRows: [deathSickleRow],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'relation_gap');
  assert.equal(status.statusReason, 'materializable_source_row_multiplicity_missing_relation_row');
  assert.equal(report.summary.relationGap, 1);
  assert.equal(report.auditStatus, 'blocked');
});

test('generated NPC bundle mode split rows do not require duplicate relation rows', () => {
  const boneRow = {
    npcInternalName: 'AngryBones',
    itemInternalName: 'Bone',
    itemName: 'Bone',
    chanceText: '97.09% 100%',
    quantityText: '1-3 2-6',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'AngryBones', name: 'Angry Bones', npcType: 'enemy' }],
    sourceRows: [
      {
        recordKey: 'npc-item:angry-bones:loot:bone:15',
        itemInternalName: 'Bone',
        itemName: 'Bone',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        chanceText: '{{modes|97.09%|100%}}',
        quantityText: '{{modes|1-3|2-6}}',
      },
      {
        recordKey: 'npc-item:angry-bones:loot:bone:5',
        itemInternalName: 'Bone',
        itemName: 'Bone',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        chanceText: '97.09% @normal',
        quantityText: '1-3',
      },
      {
        recordKey: 'npc-item:angry-bones:loot:bone:9',
        itemInternalName: 'Bone',
        itemName: 'Bone',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        chanceText: '{{modes|expertonly=y|100%}} #expert',
        quantityText: '{{modes|expertonly=y|2-6}}',
      },
    ],
    relationLootRows: [boneRow],
    projectionLootRows: [boneRow],
    localLootRows: [boneRow],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'trusted_direct_loot');
  assert.equal(report.summary.relationGap, 0);
  assert.equal(report.auditStatus, 'pass');
});

test('materialized relation identities must be backed by accepted source rows when source exists', () => {
  const gelRow = {
    npcInternalName: 'BabySlime',
    itemInternalName: 'Gel',
    itemName: 'Gel',
    chanceText: '100%',
    quantityText: '1-2',
  };
  const bonusRow = {
    npcInternalName: 'BabySlime',
    itemInternalName: 'Bomb',
    itemName: 'Bomb',
    chanceText: '0.31%',
    quantityText: '2-6',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'BabySlime', name: 'Baby Slime', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'Gel',
      itemName: 'Gel',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Baby Slime',
      sourceRefInternalName: 'BabySlime',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '100%',
      quantityText: '1-2',
    }],
    relationLootRows: [gelRow, bonusRow],
    projectionLootRows: [gelRow, bonusRow],
    localLootRows: [gelRow, bonusRow],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'duplicate_or_polluted');
  assert.equal(status.statusReason, 'materialized_relation_identity_without_source_row');
  assert.equal(report.auditStatus, 'blocked');
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

test('ignores boss-owned local compatibility rows when classifying NPC drop chain status', () => {
  const npcDrop = { npcInternalName: 'BossNpc', itemInternalName: 'NpcDrop', dropSourceKind: 'npc_drop' };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'BossNpc', npcType: 'boss' }],
    relationLootRows: [npcDrop],
    projectionLootRows: [npcDrop],
    localLootRows: [
      npcDrop,
      { npcInternalName: 'BossNpc', itemInternalName: 'BossTrophy', dropSourceKind: 'direct_boss' },
      { npcInternalName: 'BossNpc', itemInternalName: 'ExpertBagItem', dropSourceKind: 'treasure_bag' },
    ],
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'trusted_direct_loot');
  assert.equal(report.summary.duplicateOrPolluted, 0);
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

test('expected-zero contract accepts reviewed placeholder and internal test helper rows', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'None', name: null, npcType: 'unknown' },
      { internalName: 'DD2AttackerTest', name: '???', npcType: 'enemy' },
    ],
    expectedZeroRules: [
      expectedZeroRule({
        npcInternalName: 'None',
        npcType: 'unknown',
        reason: 'placeholder_or_internal_test_helper_no_loot',
        evidenceSource: 'docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md',
        reviewedAt: '2026-05-12',
      }),
      expectedZeroRule({
        npcInternalName: 'DD2AttackerTest',
        npcType: 'enemy',
        reason: 'placeholder_or_internal_test_helper_no_loot',
        evidenceSource: 'docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md',
        reviewedAt: '2026-05-12',
      }),
    ],
    sourceGaps: [
      { npcInternalName: 'None', reason: 'source_page_missing' },
      { npcInternalName: 'DD2AttackerTest', reason: 'source_page_missing' },
    ],
  });
  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row]));

  assert.equal(byName.None.npcStatus, 'expected_zero_loot');
  assert.equal(byName.None.statusReason, 'placeholder_or_internal_test_helper_no_loot');
  assert.equal(byName.DD2AttackerTest.npcStatus, 'expected_zero_loot');
  assert.equal(byName.DD2AttackerTest.statusReason, 'placeholder_or_internal_test_helper_no_loot');
  assert.equal(report.summary.blockedSourceGap, 0);
  assert.equal(report.summary.expectedZeroLoot, 2);
});

test('resolveSourceRowItemInternalName uses unique item-name lookup fallback', () => {
  const itemIndex = buildItemLookupIndex([
    { internal_name: 'HealingPotion', name: 'Healing Potion', english_name: 'Healing Potion' },
    { internal_name: 'IceBow', name: 'Ice Bow', english_name: 'Ice Bow' },
    { internal_name: 'Bomb', name: 'Bomb', english_name: 'Bomb' },
    { internal_name: 'ButterflyDust', name: 'Butterfly Dust', english_name: 'Butterfly Dust' },
    { internal_name: 'Gel', name: 'Gel', english_name: 'Gel' },
    { internal_name: 'TatteredBeeWing', name: 'Tattered Bee Wing', english_name: 'Tattered Bee Wing' },
  ]);

  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'Healing Potion',
    }, itemIndex),
    'HealingPotion'
  );
  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'custom:Ice Bow',
    }, itemIndex),
    'IceBow'
  );
  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'bonusdrop:Bomb',
    }, itemIndex),
    'Bomb'
  );
  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'Butterfly Dust{{note|Used by wiki to annotate drop context}}',
    }, itemIndex),
    'ButterflyDust'
  );
  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'Gel (Green Slime) (1-2)',
    }, itemIndex),
    'Gel'
  );
  assert.equal(
    resolveSourceRowItemInternalName({
      itemInternalName: null,
      itemName: 'Tattered Bee Wing{{note|block=y|paren=y|{{eicons|1.4.0.1|small=y}} Only after one mechanical boss has been defeated{{eicons|1.4.0.1|invert=y|small=y}} At any time}}',
    }, itemIndex),
    'TatteredBeeWing'
  );
});

test('classifySourceRows resolves NPC bundle item identity from item name fallback', () => {
  const itemIndex = buildItemLookupIndex([
    { internal_name: 'Requiem', name: 'Requiem', english_name: 'Requiem' },
  ]);
  const rows = classifySourceRows([{
    relationType: 'loot',
    sourceSection: 'drops',
    item_internal_name: null,
    item_name: 'Requiem',
    sourceRefName: 'Zombie',
    sourceRefInternalName: 'Zombie',
    sourceRefType: 'npc',
    sourceType: 'drop',
  }], { itemIndex });

  assert.equal(rows[0].itemInternalName, 'Requiem');
  assert.notEqual(rows[0].sourceRowStatus, 'blocked_missing_item_or_npc_identity');
  assert.equal(rows[0].sourceRowStatus, 'accepted_materializable');
});

test('buildNpcDomainLootChainReport resolves bonusdrop item identity without materializing it', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'BabySlime', name: 'Baby Slime', npcType: 'enemy' }],
    itemRows: [{ internal_name: 'Bomb', name: 'Bomb', english_name: 'Bomb' }],
    sourceRows: [{
      itemInternalName: null,
      itemName: 'bonusdrop:Bomb',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Baby Slime',
      sourceRefInternalName: 'BabySlime',
      sourceRefResolution: 'exact_internal_name',
      landingSourceKey: 'generated.npc_item_relations_bundle',
      recordKey: 'npc-item:baby-slime:loot:bonusdrop-bomb',
      chanceText: '1%',
      quantityText: '1',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].itemInternalName, 'Bomb');
  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_non_npc_source_exclusion');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.summary.blockedMissingItemOrNpcIdentity, 0);
  assert.equal(report.summary.reviewedNonNpcExclusion, 1);
});

test('domain audit resolves controlled NPC disambiguation suffixes in source rows', () => {
  const lootRow = {
    npcInternalName: 'EnchantedSword',
    itemInternalName: 'Nazar',
    chanceText: '1% 1.99%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'EnchantedSword', name: 'Enchanted Sword', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'Nazar',
      itemName: 'Nazar',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Enchanted Sword (NPC)',
      sourceRefResolution: 'no_match',
      chanceText: '1% 1.99%',
      quantityText: '1',
    }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'accepted_materializable');
  assert.equal(report.sourceRows[0].targetNpcInternalName, 'EnchantedSword');
  assert.equal(report.summary.blockedMissingItemOrNpcIdentity, 0);
  assert.equal(report.summary.releaseBlockingCount, 0);
});

test('parseMarkdownTableRows preserves expected-zero npcType fields', () => {
  const rows = parseMarkdownTableRows(`
| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| TownNpc | town | town_npc_no_loot | wiki:Town NPC | codex | 2026-05-11 |
`);

  assert.deepEqual(rows, [{
    npcInternalName: 'TownNpc',
    npcType: 'town',
    reason: 'town_npc_no_loot',
    evidenceSource: 'wiki:Town NPC',
    reviewedBy: 'codex',
    reviewedAt: '2026-05-11',
  }]);
});

test('expected-zero contract no longer contains boss reward domain-separated rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const rows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');

  assert.equal(
    rows.some((row) => row.reason === 'boss_reward_domain_separated'),
    false,
    'boss reward domain rows must use npc-domain-separated-not-npc-drop-contract.md'
  );
});

test('risky source-gap candidates stay uncontracted until direct evidence is reviewed', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const inheritanceByTarget = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));

  const r39ReviewedOldOnesArmyExpectedZero = [
    'DD2GoblinT1',
    'DD2GoblinT2',
    'DD2GoblinT3',
    'DD2GoblinBomberT1',
    'DD2GoblinBomberT2',
    'DD2GoblinBomberT3',
    'DD2JavelinstT1',
    'DD2JavelinstT2',
    'DD2JavelinstT3',
    'DD2WyvernT1',
    'DD2WyvernT2',
    'DD2WyvernT3',
    'DD2DrakinT2',
    'DD2DrakinT3',
    'DD2KoboldWalkerT2',
    'DD2KoboldWalkerT3',
    'DD2KoboldFlyerT2',
    'DD2KoboldFlyerT3',
    'DD2WitherBeastT2',
    'DD2SkeletonT1',
    'DD2SkeletonT3',
  ];
  const r39EvidenceSource = 'docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md';
  const r44ReviewedNoLootEvidenceSource = 'docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md';
  for (const npcInternalName of r39ReviewedOldOnesArmyExpectedZero) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'enemy_no_direct_item_loot',
        evidenceSource: r39EvidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must be expected-zero only after reviewed R39 Old One's Army evidence`
    );
  }

  for (const npcInternalName of [
    'DD2WitherBeastT3',
    'DD2AttackerTest',
    'DD2EnergyCrystal',
    'DD2EterniaCrystal',
    'DD2LanePortal',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(npcInternalName)?.evidenceSource === r39EvidenceSource,
      false,
      `${npcInternalName} must remain outside the R39 Old One's Army expected-zero batch`
    );
  }

  for (const targetNpcInternalName of ['LeechBody', 'LeechTail']) {
    assert.equal(
      inheritanceByTarget.has(targetNpcInternalName),
      false,
      `${targetNpcInternalName} must not inherit LeechHead loot without reviewed segment evidence`
    );
  }

  for (const heldNpcInternalName of [
    'DuneSplicerHead',
    'DuneSplicerBody',
    'DuneSplicerTail',
    'SolarCrawltipedeHead',
    'SolarCrawltipedeBody',
    'SolarCrawltipedeTail',
    'StardustWormHead',
    'StardustWormBody',
    'StardustWormTail',
  ]) {
    const expectedZeroRow = expectedZeroByNpc.get(heldNpcInternalName);
    assert.equal(
      expectedZeroRow === undefined || expectedZeroRow.evidenceSource === r44ReviewedNoLootEvidenceSource,
      true,
      `${heldNpcInternalName} must stay outside earlier risky batches unless reviewed R44 no-loot evidence closes it`
    );
    assert.equal(
      inheritanceByTarget.has(heldNpcInternalName),
      false,
      `${heldNpcInternalName} must not inherit loot without reviewed segment loot evidence`
    );
  }
});

test('R35 exact type-size Zombie and Skeleton variants are the only new reviewed broad-family inheritance rows', async () => {
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const inheritanceByTarget = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r35-exact-type-size-inheritance-review.md';

  for (const [targetNpcInternalName, sourceNpcInternalName] of [
    ['BigZombie', 'Zombie'],
    ['SmallZombie', 'Zombie'],
    ['BigSkeleton', 'Skeleton'],
    ['SmallSkeleton', 'Skeleton'],
  ]) {
    assert.deepEqual(
      inheritanceByTarget.get(targetNpcInternalName),
      {
        targetNpcInternalName,
        sourceNpcInternalName,
        inheritanceKind: 'same_name_variant',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      }
    );
  }

  for (const heldNpcInternalName of [
    'BigFemaleZombie',
    'SmallFemaleZombie',
    'BigPantlessSkeleton',
    'SmallPantlessSkeleton',
    'BigMisassembledSkeleton',
    'SmallMisassembledSkeleton',
    'BigHeadacheSkeleton',
    'SmallHeadacheSkeleton',
    'Scarecrow1',
    'Scarecrow10',
    'ZombieElfBeard',
    'ZombieElfGirl',
  ]) {
    assert.equal(
      inheritanceByTarget.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} must remain outside R35 exact type-size inheritance`
    );
  }
});

test('R45 Raincoat Zombie size variants are the only new reviewed Zombie inheritance rows', async () => {
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const inheritanceByTarget = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r45-raincoat-zombie-size-inheritance-review.md';

  for (const targetNpcInternalName of ['BigRainZombie', 'SmallRainZombie']) {
    assert.deepEqual(
      inheritanceByTarget.get(targetNpcInternalName),
      {
        targetNpcInternalName,
        sourceNpcInternalName: 'ZombieRaincoat',
        inheritanceKind: 'same_name_variant',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${targetNpcInternalName} must inherit only from the reviewed Raincoat Zombie representative`
    );
  }

  for (const heldNpcInternalName of [
    'BigBaldZombie',
    'SmallBaldZombie',
    'BigFemaleZombie',
    'SmallFemaleZombie',
    'BigSwampZombie',
    'SmallSwampZombie',
    'BigTwiggyZombie',
    'SmallTwiggyZombie',
    'ArmedZombie',
    'ArmedZombieSwamp',
    'ArmedZombieTwiggy',
    'ArmedZombieCenx',
  ]) {
    assert.equal(
      inheritanceByTarget.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} must remain outside the R45 Raincoat Zombie inheritance batch`
    );
  }
});

test('R51 Zombie and Skeleton shared-loot closure is limited to reviewed representatives and their size variants', async () => {
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const inheritanceByTarget = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md';

  for (const [targetNpcInternalName, sourceNpcInternalName] of [
    ['BigBaldZombie', 'BaldZombie'],
    ['SmallBaldZombie', 'BaldZombie'],
    ['BigFemaleZombie', 'FemaleZombie'],
    ['SmallFemaleZombie', 'FemaleZombie'],
    ['BigSwampZombie', 'SwampZombie'],
    ['SmallSwampZombie', 'SwampZombie'],
    ['BigTwiggyZombie', 'TwiggyZombie'],
    ['SmallTwiggyZombie', 'TwiggyZombie'],
    ['BigHeadacheSkeleton', 'HeadacheSkeleton'],
    ['SmallHeadacheSkeleton', 'HeadacheSkeleton'],
    ['BigMisassembledSkeleton', 'MisassembledSkeleton'],
    ['SmallMisassembledSkeleton', 'MisassembledSkeleton'],
    ['BigPantlessSkeleton', 'PantlessSkeleton'],
    ['SmallPantlessSkeleton', 'PantlessSkeleton'],
  ]) {
    assert.deepEqual(
      inheritanceByTarget.get(targetNpcInternalName),
      {
        targetNpcInternalName,
        sourceNpcInternalName,
        inheritanceKind: 'same_name_variant',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      }
    );
  }

  for (const heldNpcInternalName of [
    'ArmedZombie',
    'ArmedZombieSwamp',
    'ArmedZombieTwiggy',
    'ArmedZombieCenx',
    'ZombieDoctor',
    'ZombieSuperman',
    'ZombiePixie',
    'ZombieXmas',
    'ZombieSweater',
    'SkeletonTopHat',
    'SkeletonAstonaut',
    'SkeletonAlien',
    'BoneThrowingSkeleton',
    'BoneThrowingSkeleton2',
    'BoneThrowingSkeleton3',
    'BoneThrowingSkeleton4',
    'FungoFish',
  ]) {
    assert.equal(
      inheritanceByTarget.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} must remain outside R51 Zombie/Skeleton size inheritance`
    );
  }
});

test('R52 positive-page no-direct item loot contract closes only exact reviewed rows', async () => {
  const noDirectItemLootText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-no-direct-item-loot-contract.md'),
    'utf8'
  );
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const domainSeparatedText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md'),
    'utf8'
  );
  const noDirectItemLootRows = parseMarkdownTableRows(noDirectItemLootText, 'no_direct_item_loot');
  const noDirectByNpc = new Map(noDirectItemLootRows.map((row) => [row.npcInternalName, row]));
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const inheritanceByNpc = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));
  const domainSeparatedRows = parseMarkdownTableRows(domainSeparatedText, 'domain_separated');
  const domainSeparatedByNpc = new Map(domainSeparatedRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md';

  for (const npcInternalName of [
    'FungoFish',
    'SkeletonTopHat',
    'SkeletonAstonaut',
    'SkeletonAlien',
    'BoneThrowingSkeleton2',
    'BoneThrowingSkeleton3',
    'BoneThrowingSkeleton4',
  ]) {
    assert.deepEqual(
      noDirectByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'positive_source_page_exact_infobox_no_direct_item_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must close only through the R52 no-direct item loot contract`
    );
    assert.equal(expectedZeroByNpc.has(npcInternalName), false, `${npcInternalName} must not become expected-zero`);
    assert.equal(inheritanceByNpc.has(npcInternalName), false, `${npcInternalName} must not become inherited loot`);
    assert.equal(domainSeparatedByNpc.has(npcInternalName), false, `${npcInternalName} must not become domain-separated`);
  }

  for (const heldNpcInternalName of [
    'BoneThrowingSkeleton',
    'ZombieDoctor',
    'ZombieSuperman',
    'ZombiePixie',
    'ZombieXmas',
    'ZombieSweater',
    'ArmedZombie',
    'ArmedZombieSwamp',
    'ArmedZombieTwiggy',
    'ArmedZombieCenx',
  ]) {
    assert.equal(
      noDirectByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} must remain outside the R52 no-direct item loot batch`
    );
    assert.equal(expectedZeroByNpc.has(heldNpcInternalName), false, `${heldNpcInternalName} must not become expected-zero`);
  }
});

test('R55 positive-page no-direct item loot contract closes remaining Zombie and Bone Throwing exact rows', async () => {
  const noDirectItemLootText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-no-direct-item-loot-contract.md'),
    'utf8'
  );
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const inheritanceText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md'),
    'utf8'
  );
  const domainSeparatedText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md'),
    'utf8'
  );
  const noDirectItemLootRows = parseMarkdownTableRows(noDirectItemLootText, 'no_direct_item_loot');
  const noDirectByNpc = new Map(noDirectItemLootRows.map((row) => [row.npcInternalName, row]));
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const inheritanceRows = parseMarkdownTableRows(inheritanceText, 'inheritance');
  const inheritanceByNpc = new Map(inheritanceRows.map((row) => [row.targetNpcInternalName, row]));
  const domainSeparatedRows = parseMarkdownTableRows(domainSeparatedText, 'domain_separated');
  const domainSeparatedByNpc = new Map(domainSeparatedRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md';

  for (const npcInternalName of [
    'ArmedZombie',
    'ArmedZombieCenx',
    'ArmedZombieSwamp',
    'ArmedZombieTwiggy',
    'ZombieDoctor',
    'ZombiePixie',
    'ZombieSuperman',
    'ZombieSweater',
    'ZombieXmas',
    'BoneThrowingSkeleton',
  ]) {
    assert.deepEqual(
      noDirectByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'positive_source_page_exact_infobox_no_direct_item_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must close only through the R55 no-direct item loot contract`
    );
    assert.equal(expectedZeroByNpc.has(npcInternalName), false, `${npcInternalName} must not become expected-zero`);
    assert.equal(inheritanceByNpc.has(npcInternalName), false, `${npcInternalName} must not become inherited loot`);
    assert.equal(domainSeparatedByNpc.has(npcInternalName), false, `${npcInternalName} must not become domain-separated`);
  }
});

test('R33 boss component contract separates boss-domain rows and keeps helper rows expected-zero', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const domainSeparatedText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const domainSeparatedRows = parseMarkdownTableRows(domainSeparatedText, 'domain_separated');
  const domainSeparatedByNpc = new Map(domainSeparatedRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md';

  for (const [npcInternalName, npcType] of [
    ['SkeletronHead', 'boss'],
    ['TheDestroyer', 'boss'],
    ['WallofFlesh', 'boss'],
    ['CultistBoss', 'boss'],
    ['MartianSaucer', 'boss'],
  ]) {
    assert.deepEqual(
      domainSeparatedByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType,
        reason: 'boss_reward_domain_separated',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      }
    );
    assert.equal(expectedZeroByNpc.has(npcInternalName), false, `${npcInternalName} must not remain expected-zero`);
  }

  assert.deepEqual(
    expectedZeroByNpc.get('SkeletronHand'),
    {
      npcInternalName: 'SkeletronHand',
      npcType: 'enemy',
      reason: 'event_helper_no_loot',
      evidenceSource,
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }
  );

  for (const heldNpcInternalName of [
    'TheDestroyerBody',
    'TheDestroyerTail',
    'WallofFleshEye',
    'TheHungry',
    'TheHungryII',
    'EaterofWorldsBody',
    'EaterofWorldsTail',
    'GolemFistLeft',
    'GolemFistRight',
    'PumpkingBlade',
    'CultistBossClone',
    'MartianSaucerCore',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R33 boss component contract batch`
    );
  }
});

test('R49 component domain-separated contract closes only exact component rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const domainSeparatedText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const domainSeparatedRows = parseMarkdownTableRows(domainSeparatedText, 'domain_separated');
  const domainSeparatedByNpc = new Map(domainSeparatedRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md';

  for (const [npcInternalName, npcType, reason] of [
    ['WallofFleshEye', 'boss_component', 'boss_component_health_pickup_domain_separated'],
    ['TheHungry', 'boss_component', 'boss_component_health_pickup_domain_separated'],
    ['LeechBody', 'boss_component', 'boss_component_health_pickup_domain_separated'],
    ['LeechTail', 'boss_component', 'boss_component_health_pickup_domain_separated'],
    ['TheDestroyerBody', 'boss_segment', 'boss_segment_reward_domain_separated'],
    ['TheDestroyerTail', 'boss_segment', 'boss_segment_reward_domain_separated'],
    ['PumpkingBlade', 'boss_component', 'boss_component_health_pickup_domain_separated'],
  ]) {
    assert.deepEqual(
      domainSeparatedByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType,
        reason,
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must close as reviewed domain-separated, not ordinary npc_drop`
    );
    assert.equal(expectedZeroByNpc.has(npcInternalName), false, `${npcInternalName} must not become expected-zero`);
  }

  for (const heldNpcInternalName of [
    'CultistBossClone',
    'MartianSaucerCore',
    'FungoFish',
    'BeeSmall',
    'JungleCreeperWall',
    'NutcrackerSpinning',
    'Sharkron2',
  ]) {
    assert.equal(
      domainSeparatedByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R49 component domain-separated batch`
    );
  }
});

test('R50 boss helper domain-separated contract closes only exact helper rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const domainSeparatedText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const domainSeparatedRows = parseMarkdownTableRows(domainSeparatedText, 'domain_separated');
  const domainSeparatedByNpc = new Map(domainSeparatedRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r50-boss-helper-domain-separated-review.md';

  for (const npcInternalName of ['CultistBossClone', 'MartianSaucerCore']) {
    assert.deepEqual(
      domainSeparatedByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'boss_helper',
        reason: 'boss_clone_or_helper_domain_separated',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must close as reviewed boss helper domain-separated`
    );
    assert.equal(expectedZeroByNpc.has(npcInternalName), false, `${npcInternalName} must not become expected-zero`);
  }

  for (const heldNpcInternalName of [
    'FungoFish',
    'FemaleZombie',
    'HeadacheSkeleton',
    'BoneThrowingSkeleton',
  ]) {
    assert.equal(
      domainSeparatedByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R50 boss helper domain-separated batch`
    );
  }
});

test('R40 exact no-loot enemy contract closes only reviewed exact wikiCrawler rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md';

  for (const npcInternalName of [
    'Bee',
    'JungleCreeper',
    'ZombieMushroom',
    'ZombieMushroomHat',
    'Nutcracker',
  ]) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'enemy_no_direct_item_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      }
    );
  }

  for (const heldNpcInternalName of [
    'BeeSmall',
    'JungleCreeperWall',
    'NutcrackerSpinning',
    'Sharkron2',
    'Sharkron',
    'StardustJellyfishBig',
    'StardustJellyfishSmall',
    'Scarecrow1',
    'Scarecrow6',
    'GolemFistLeft',
    'GolemFistRight',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R40 exact no-loot enemy batch`
    );
  }
});

test('R41 placeholder/internal contract closes only reviewed sentinel rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md';

  for (const [npcInternalName, npcType] of [
    ['None', 'unknown'],
    ['None2', 'unknown'],
    ['None3', 'unknown'],
    ['DD2AttackerTest', 'enemy'],
  ]) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType,
        reason: 'placeholder_or_internal_test_helper_no_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      }
    );
  }

  for (const heldNpcInternalName of [
    'DD2WitherBeastT3',
    'FungoFish',
    'BeeSmall',
    'JungleCreeperWall',
    'NutcrackerSpinning',
    'ZombieElfBeard',
    'ZombieElfGirl',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R41 placeholder/internal batch`
    );
  }
});

test('R44 reviewed no-loot source pages close only explicit segment/helper expected-zero rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md';

  for (const npcInternalName of [
    'CultistDragonHead',
    'CultistDragonBody1',
    'CultistDragonBody2',
    'CultistDragonBody3',
    'CultistDragonBody4',
    'CultistDragonTail',
    'SolarCrawltipedeHead',
    'SolarCrawltipedeBody',
    'SolarCrawltipedeTail',
    'DuneSplicerHead',
    'DuneSplicerBody',
    'DuneSplicerTail',
    'StardustWormHead',
    'StardustWormBody',
    'StardustWormTail',
  ]) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'enemy_no_direct_item_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must be expected-zero only after reviewed R44 no-loot source-page evidence`
    );
  }

  for (const npcInternalName of [
    'StardustJellyfishBig',
    'StardustJellyfishSmall',
    'Sharkron',
  ]) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'event_helper_no_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must be expected-zero only after reviewed R44 helper no-loot evidence`
    );
  }

  for (const heldNpcInternalName of [
    'Sharkron2',
    'GolemFistLeft',
    'GolemFistRight',
    'EaterofWorldsBody',
    'EaterofWorldsTail',
    'TheHungryII',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R44 expected-zero batch`
    );
  }
});

test('R48 source infobox exact evidence closes only OwlMimic expected-zero', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r48-owl-source-infobox-exact-review.md';

  assert.deepEqual(
    expectedZeroByNpc.get('OwlMimic'),
    {
      npcInternalName: 'OwlMimic',
      npcType: 'enemy',
      reason: 'critter_no_loot',
      evidenceSource,
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    },
    'OwlMimic must be expected-zero only after exact R48 source infobox evidence'
  );

  for (const heldNpcInternalName of [
    'NutcrackerSpinning',
    'DD2WitherBeastT3',
    'BeeSmall',
    'JungleCreeperWall',
    'Sharkron2',
    'FungoFish',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R48 source infobox exact batch`
    );
  }
});

test('R49 exact source no-loot contract closes only page-zero sourceInfobox rows', async () => {
  const expectedZeroText = await fs.readFile(
    path.join(process.cwd(), 'docs', 'contracts', 'npc-domain-expected-zero-contract.md'),
    'utf8'
  );
  const expectedZeroRows = parseMarkdownTableRows(expectedZeroText, 'expected_zero');
  const expectedZeroByNpc = new Map(expectedZeroRows.map((row) => [row.npcInternalName, row]));
  const evidenceSource = 'docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md';

  for (const npcInternalName of [
    'BeeSmall',
    'JungleCreeperWall',
    'NutcrackerSpinning',
    'Sharkron2',
    'DD2WitherBeastT3',
  ]) {
    assert.deepEqual(
      expectedZeroByNpc.get(npcInternalName),
      {
        npcInternalName,
        npcType: 'enemy',
        reason: 'enemy_no_direct_item_loot',
        evidenceSource,
        reviewedBy: 'codex',
        reviewedAt: '2026-05-12',
      },
      `${npcInternalName} must be expected-zero only after exact R49 source infobox evidence`
    );
  }

  for (const heldNpcInternalName of [
    'FungoFish',
    'BigBaldZombie',
    'BaldZombie',
    'BigHeadacheSkeleton',
    'HeadacheSkeleton',
    'WallofFleshEye',
    'TheHungry',
    'LeechBody',
    'LeechTail',
    'TheDestroyerBody',
    'TheDestroyerTail',
    'PumpkingBlade',
    'CultistBossClone',
    'MartianSaucerCore',
    'BoneThrowingSkeleton',
  ]) {
    assert.equal(
      expectedZeroByNpc.get(heldNpcInternalName)?.evidenceSource === evidenceSource,
      false,
      `${heldNpcInternalName} is outside the R49 exact source no-loot batch`
    );
  }
});

test('boss reward domain separated rows close as domain-separated, not expected-zero', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'KingSlime', name: 'King Slime', npcType: 'boss' }],
    localLootRows: [
      { npcInternalName: 'KingSlime', itemInternalName: 'SlimeGun', dropSourceKind: 'direct_boss' },
      { npcInternalName: 'KingSlime', itemInternalName: 'RoyalGel', dropSourceKind: 'treasure_bag' },
    ],
    domainSeparatedRules: [{
      npcInternalName: 'KingSlime',
      npcType: 'boss',
      reason: 'boss_reward_domain_separated',
      evidenceSource: 'docs/audits/2026-05-11_npc-boss-reward-domain-expected-zero-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    sourceGaps: [{
      npcInternalName: 'KingSlime',
      reason: 'no_source_required_domain_separated',
      sourceCoverageStatus: 'no_source_required_domain_separated',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'domain_separated_not_npc_drop');
  assert.equal(status.statusReason, 'boss_reward_domain_separated');
  assert.equal(status.contractRef, 'domain_separated:KingSlime');
  assert.equal(report.summary.domainSeparatedNotNpcDrop, 1);
  assert.equal(report.summary.expectedZeroLoot, 0);
  assert.equal(report.summary.unclassifiedZero, 0);
});

test('boss reward domain separated maint source rows are not materializable NPC relation gaps', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'EyeofCthulhu', name: 'Eye of Cthulhu', npcType: 'boss' }],
    sourceRows: [{
      itemInternalName: 'DemoniteOre',
      itemName: 'Demonite Ore',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Eye of Cthulhu',
      sourceRefInternalName: 'EyeofCthulhu',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '100%',
      quantityText: '30-90',
    }],
    domainSeparatedRules: [{
      npcInternalName: 'EyeofCthulhu',
      npcType: 'boss',
      reason: 'boss_reward_domain_separated',
      evidenceSource: 'docs/audits/2026-05-11_npc-boss-reward-domain-expected-zero-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    sourceCoverageRows: [{
      npcInternalName: 'EyeofCthulhu',
      sourceCoverageStatus: 'no_source_required_domain_separated',
      reason: 'no_source_required_domain_separated',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'domain_separated_not_npc_drop');
  assert.equal(status.statusReason, 'boss_reward_domain_separated');
  assert.equal(status.relationLootCount, 0);
  assert.equal(report.summary.relationGap, 0);
  assert.equal(report.sourceRows[0].sourceRowStatus, 'domain_separated_not_npc_drop');
  assert.equal(report.sourceRows[0].materializable, false);
});

test('reviewed domain-separated rows are terminal without expected-zero or npc_drop materialization', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'EaterofWorldsBody', name: 'Eater of Worlds', npcType: 'boss_segment' }],
    sourceRows: [{
      itemInternalName: 'DemoniteOre',
      itemName: 'Demonite Ore',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Eater of Worlds',
      sourceRefInternalName: 'EaterofWorldsBody',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '50%',
      quantityText: '2-5',
    }],
    domainSeparatedRules: [{
      npcInternalName: 'EaterofWorldsBody',
      npcType: 'boss_segment',
      reason: 'boss_segment_reward_domain_separated',
      evidenceSource: 'docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }],
    sourceCoverageRows: [{
      npcInternalName: 'EaterofWorldsBody',
      sourceCoverageStatus: 'no_source_required_domain_separated',
      reason: 'no_source_required_domain_separated',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'domain_separated_not_npc_drop');
  assert.equal(status.statusReason, 'boss_segment_reward_domain_separated');
  assert.equal(status.contractRef, 'domain_separated:EaterofWorldsBody');
  assert.equal(report.summary.domainSeparatedNotNpcDrop, 1);
  assert.equal(report.summary.expectedZeroLoot, 0);
  assert.equal(report.summary.blockedSourceGap, 0);
  assert.equal(report.summary.relationGap, 0);
  assert.equal(report.sourceRows[0].sourceRowStatus, 'domain_separated_not_npc_drop');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.releaseBlockers.length, 0);
});

test('reviewed domain-separated rows block ordinary npc_drop pollution', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'EaterofWorldsBody', name: 'Eater of Worlds', npcType: 'boss_segment' }],
    domainSeparatedRules: [{
      npcInternalName: 'EaterofWorldsBody',
      npcType: 'boss_segment',
      reason: 'boss_segment_reward_domain_separated',
      evidenceSource: 'docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }],
    relationLootRows: [{ npcInternalName: 'EaterofWorldsBody', itemInternalName: 'DemoniteOre' }],
    projectionLootRows: [{ npcInternalName: 'EaterofWorldsBody', itemInternalName: 'DemoniteOre' }],
    localLootRows: [{ npcInternalName: 'EaterofWorldsBody', itemInternalName: 'DemoniteOre', dropSourceKind: 'npc_drop' }],
    sourceCoverageRows: [{
      npcInternalName: 'EaterofWorldsBody',
      sourceCoverageStatus: 'no_source_required_domain_separated',
      reason: 'no_source_required_domain_separated',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'duplicate_or_polluted');
  assert.equal(status.statusReason, 'domain_separated_has_ordinary_npc_drop_rows');
  assert.equal(report.summary.domainSeparatedNotNpcDrop, 0);
  assert.equal(report.summary.duplicateOrPolluted, 1);
  assert.equal(report.releaseBlockers.some((row) => row.npcInternalName === 'EaterofWorldsBody'), true);
});

test('reviewed enemies with no direct item loot can close expected-zero status', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'MartianDrone', name: 'Martian Drone', npcType: 'enemy' },
      { internalName: 'UnreviewedEnemy', name: 'Unreviewed Enemy', npcType: 'enemy' },
    ],
    expectedZeroRules: [{
      npcInternalName: 'MartianDrone',
      npcType: 'enemy',
      reason: 'enemy_no_direct_item_loot',
      evidenceSource: 'docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }],
    sourceGaps: [
      {
        npcInternalName: 'MartianDrone',
        reason: 'source_page_present_no_loot',
        sourceCoverageStatus: 'source_page_present_no_loot',
      },
      {
        npcInternalName: 'UnreviewedEnemy',
        reason: 'source_page_present_unextracted',
        sourceCoverageStatus: 'source_page_present_unextracted',
      },
    ],
    options: { requireApiEvidence: false },
  });

  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row]));
  assert.equal(byName.MartianDrone.npcStatus, 'expected_zero_loot');
  assert.equal(byName.MartianDrone.statusReason, 'enemy_no_direct_item_loot');
  assert.equal(byName.UnreviewedEnemy.npcStatus, 'blocked_source_gap');
  assert.equal(report.summary.expectedZeroLoot, 1);
  assert.equal(report.summary.blockedSourceGap, 1);
  assert.equal(
    report.releaseBlockers.some((row) =>
      row.type === 'npc_status'
      && row.npcInternalName === 'UnreviewedEnemy'
      && row.status === 'blocked_source_gap'
    ),
    true
  );
});

test('reviewed positive-page exact infobox no-direct item loot is terminal but not expected-zero', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'SkeletonTopHat', name: 'Skeleton', npcType: 'enemy' },
      { internalName: 'BoneThrowingSkeleton', name: 'Skeleton', npcType: 'enemy' },
    ],
    noDirectItemLootRules: [
      noDirectItemLootRule({ npcInternalName: 'SkeletonTopHat' }),
    ],
    sourceCoverageRows: [
      {
        npcInternalName: 'SkeletonTopHat',
        sourceCoverageStatus: 'source_page_present_no_direct_item_loot',
      },
      {
        npcInternalName: 'BoneThrowingSkeleton',
        sourceCoverageStatus: 'group_page_present_variant_not_extracted',
      },
    ],
    options: { requireApiEvidence: false },
  });

  const byName = Object.fromEntries(report.npcStatuses.map((row) => [row.npcInternalName, row]));
  assert.equal(byName.SkeletonTopHat.npcStatus, 'reviewed_no_direct_item_loot');
  assert.equal(byName.SkeletonTopHat.statusReason, 'positive_source_page_exact_infobox_no_direct_item_loot');
  assert.equal(byName.SkeletonTopHat.contractRef, 'no_direct_item_loot:SkeletonTopHat');
  assert.equal(byName.BoneThrowingSkeleton.npcStatus, 'blocked_source_gap');
  assert.equal(report.summary.reviewedNoDirectItemLoot, 1);
  assert.equal(report.summary.expectedZeroLoot, 0);
  assert.equal(report.summary.blockedSourceGap, 1);
});

test('positive-page no-direct item loot contract requires matching source coverage state', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'SkeletonAlien', name: 'Skeleton', npcType: 'enemy' }],
    noDirectItemLootRules: [
      noDirectItemLootRule({ npcInternalName: 'SkeletonAlien' }),
    ],
    sourceCoverageRows: [{
      npcInternalName: 'SkeletonAlien',
      sourceCoverageStatus: 'group_page_present_variant_not_extracted',
    }],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'blocked_source_gap');
  assert.equal(status.statusReason, 'group_page_present_variant_not_extracted');
  assert.equal(report.summary.reviewedNoDirectItemLoot, 0);
});

test('reviewed positive-page no-direct item loot contract blocks ordinary npc_drop pollution', () => {
  const lootRow = { npcInternalName: 'FungoFish', itemInternalName: 'Glowstick' };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'FungoFish', name: 'Fungo Fish', npcType: 'enemy' }],
    noDirectItemLootRules: [
      noDirectItemLootRule({ npcInternalName: 'FungoFish' }),
    ],
    sourceCoverageRows: [{
      npcInternalName: 'FungoFish',
      sourceCoverageStatus: 'source_page_present_no_direct_item_loot',
    }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    options: { requireApiEvidence: false },
  });

  const status = report.npcStatuses[0];
  assert.equal(status.npcStatus, 'duplicate_or_polluted');
  assert.equal(status.statusReason, 'no_direct_item_loot_has_ordinary_npc_drop_rows');
  assert.equal(report.summary.reviewedNoDirectItemLoot, 0);
  assert.equal(report.summary.duplicateOrPolluted, 1);
  assert.equal(report.releaseBlockers.some((row) => row.npcInternalName === 'FungoFish'), true);
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

test('computeRowIdentityHash uses item and source name fallbacks and normalizes normal mode rows', () => {
  assert.notEqual(
    computeRowIdentityHash({
      npcInternalName: 'Mimics',
      itemName: 'Chain Guillotines',
      sourceRefName: 'Corrupt Mimic',
      chanceText: '20%',
      quantityText: '1',
    }),
    computeRowIdentityHash({
      npcInternalName: 'Mimics',
      itemName: 'Clinger Staff',
      sourceRefName: 'Corrupt Mimic',
      chanceText: '20%',
      quantityText: '1',
    })
  );

  assert.equal(
    computeRowIdentityHash({
      npcInternalName: 'PresentMimic',
      itemInternalName: 'Present',
      sourceRefInternalName: 'PresentMimic',
      chanceText: '100%',
      quantityText: '1',
      conditions: 'Normal mode row',
    }),
    computeRowIdentityHash({
      npcInternalName: 'PresentMimic',
      itemInternalName: 'Present',
      sourceRefInternalName: 'PresentMimic',
      chanceText: '100%',
      quantityText: '1',
      conditions: '',
    })
  );
});

test('reviewed Mimics contract rows materialize with Mimic identity even when the source ref is generic', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Mimic', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'CrossNecklace',
      itemName: 'Cross Necklace',
      sourceRefName: 'Mimics',
      sourceRefType: 'npc',
      sourceType: 'drop',
      sourceRefResolution: 'reviewed_mimic_contract',
      chanceText: '1%',
      quantityText: '1',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'accepted_materializable');
  assert.equal(report.sourceRows[0].targetNpcInternalName, 'Mimic');
  assert.equal(report.blockedRows.length, 0);
});

test('reviewed rejected item-page ordinary Mimic rows are non-blocking audit exclusions', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Mimic', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'Mace',
      itemName: 'Mace',
      sourceRefName: 'Mimic',
      sourceRefType: 'npc',
      sourceType: 'drop',
      sourceRefInternalName: 'Mimic',
      sourceRefResolution: 'exact_internal_name',
      landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
      chanceText: '16.67%',
      quantityText: '1',
    }],
    expectedZeroRules: [{
      npcInternalName: 'Mimic',
      npcType: 'enemy',
      reason: 'enemy_no_direct_item_loot',
      evidenceSource: 'test-only fallback for source-row status isolation',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_mimic_contract_rejected');
  assert.equal(report.sourceRows[0].statusReason, 'ordinary_mimic_contract_mismatch');
  assert.equal(report.summary.blockedAmbiguousVariant, 0);
  assert.equal(report.blockedRows.length, 0);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'source_row'), false);
});

test('item bundle collective buckets stay audit-only and do not block NPC domain closure', () => {
  const rows = classifySourceRows([{
    itemInternalName: 'DaedalusStormbow',
    itemName: 'Daedalus Stormbow',
    sourceRefName: 'Mimics',
    sourceRefType: 'npc',
    sourceType: 'drop',
    sourceRefResolution: 'no_match',
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
    recordKey: 'd'.repeat(64),
  }]);

  assert.equal(rows[0].sourceRowStatus, 'item_bundle_collective_bucket_excluded');
  assert.equal(rows[0].statusReason, 'item_bundle_collective_bucket_not_npc_domain_source');
  assert.equal(rows[0].materializable, false);

  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Mimic', npcType: 'enemy' }],
    sourceRows: rows,
    options: { requireApiEvidence: false },
  });

  assert.equal(report.summary.blockedGenericBucket, 0);
  assert.equal(report.summary.releaseBlockingCount, 1);
  assert.equal(report.releaseBlockers[0].reason, 'zero_loot_without_contract');
  assert.equal(report.blockedRows.length, 0);
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

test('reviewed source-only item exclusions are reported separately and never materialized', () => {
  const lootRow = {
    npcInternalName: 'PirateDeckhand',
    itemInternalName: 'PirateMap',
    chanceText: '1%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'PirateDeckhand', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: null,
      itemName: 'Golden furniture',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Pirate Deckhand',
      sourceRefInternalName: 'PirateDeckhand',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '0.33% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
    }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'PirateDeckhand',
      itemName: 'Golden furniture',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
      chanceText: '0.33% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      reason: 'item_group_requires_expansion',
      evidenceSource: 'docs/audits/2026-05-13_npc-source-only-item-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-13',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_source_only_item_exclusion');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.summary.reviewedSourceOnlyItemExclusion, 1);
  assert.equal(report.summary.blockedMissingItemOrNpcIdentity, 0);
  assert.equal(report.summary.releaseBlockingCount, 0);
});

test('reviewed source-only item exclusions do not hide rows once an item identity resolves', () => {
  const lootRow = {
    npcInternalName: 'PirateDeckhand',
    itemInternalName: 'GoldenChair',
    chanceText: '0.33% each',
    quantityText: '1 piece',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'PirateDeckhand', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: 'GoldenChair',
      itemName: 'Golden furniture',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Pirate Deckhand',
      sourceRefInternalName: 'PirateDeckhand',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '0.33% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
    }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'PirateDeckhand',
      itemName: 'Golden furniture',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
      chanceText: '0.33% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      reason: 'item_group_requires_expansion',
      evidenceSource: 'docs/audits/2026-05-13_npc-source-only-item-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-13',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'accepted_materializable');
  assert.equal(report.sourceRows[0].materializable, true);
  assert.equal(report.summary.reviewedSourceOnlyItemExclusion, 0);
  assert.equal(report.summary.releaseBlockingCount, 0);
});

test('reviewed source-only item exclusions require exact reviewed row evidence', () => {
  const lootRow = {
    npcInternalName: 'PirateDeckhand',
    itemInternalName: 'PirateMap',
    chanceText: '1%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'PirateDeckhand', npcType: 'enemy' }],
    sourceRows: [{
      itemInternalName: null,
      itemName: 'Golden furniture',
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Pirate Deckhand',
      sourceRefInternalName: 'PirateDeckhand',
      sourceRefResolution: 'exact_internal_name',
      chanceText: '0.34% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
    }],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    reviewedSourceOnlyItemExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefInternalName: 'PirateDeckhand',
      itemName: 'Golden furniture',
      recordKey: 'npc-item:pirate-deckhand:loot:golden-furniture:11',
      chanceText: '0.33% each',
      quantityText: '1 piece',
      sourceUrl: 'https://terraria.wiki.gg/wiki/Pirate_Deckhand',
      reason: 'item_group_requires_expansion',
      evidenceSource: 'docs/audits/2026-05-13_npc-source-only-item-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-13',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'blocked_missing_item_or_npc_identity');
  assert.equal(report.summary.reviewedSourceOnlyItemExclusion, 0);
  assert.equal(report.summary.blockedMissingItemOrNpcIdentity, 1);
  assert.equal(report.summary.releaseBlockingCount, 1);
});

test('duplicated reviewed non-NPC source exclusions are non-blocking', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'ZeroNpc', npcType: 'enemy' }],
    sourceRows: [
      {
        itemInternalName: 'Acorn',
        sourceRefName: 'Ash tree',
        sourceRefType: 'npc',
        sourceType: 'drop',
        chanceText: '14.1429%',
        quantityText: '1-2',
      },
      {
        itemInternalName: 'Acorn',
        sourceRefName: 'Ash tree',
        sourceRefType: 'npc',
        sourceType: 'drop',
        chanceText: '14.1429%',
        quantityText: '1-2',
      },
    ],
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'exact',
      sourceRefName: 'Ash tree',
      reason: 'tree_source',
      evidenceSource: 'wiki:Trees',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    expectedZeroRules: [{
      npcInternalName: 'ZeroNpc',
      npcType: 'enemy',
      reason: 'event_helper_no_loot',
      evidenceSource: 'fixture',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    options: { requireApiEvidence: false },
  });

  assert.deepEqual(
    report.sourceRows.map((row) => row.sourceRowStatus),
    ['reviewed_non_npc_source_exclusion', 'reviewed_non_npc_source_exclusion']
  );
  assert.equal(report.sourceRows.every((row) => row.materializable === false), true);
  assert.equal(report.summary.reviewedNonNpcExclusion, 2);
  assert.equal(report.summary.releaseBlockingCount, 0);
  assert.equal(report.blockedRows.length, 0);
  assert.equal(report.releaseBlockers.some((row) => row.sourceRowStatus === 'duplicate_source_identity'), false);
});

test('duplicate NPC bundle and item-page loot provenance collapses to one source identity', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'IceMimic', npcType: 'enemy' }],
    sourceRows: [
      {
        recordKey: 'item-page:flurry-boots:ice-mimic',
        itemInternalName: 'FlurryBoots',
        itemName: 'Flurry Boots',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Ice Mimic',
        sourceRefInternalName: 'IceMimic',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '15.83%',
        quantityText: '1',
        rawJson: JSON.stringify({
          itemInternalName: 'FlurryBoots',
          itemName: 'Flurry Boots',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Ice Mimic',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '15.83%',
          quantityText: '1',
          sourcePage: 'Flurry Boots'
        })
      },
      {
        recordKey: 'npc-item:ice-mimic:loot:flurry-boots',
        itemInternalName: 'FlurryBoots',
        itemName: 'Flurry Boots',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Ice Mimic',
        sourceRefInternalName: 'IceMimic',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '15.83%',
        quantityText: '1',
        rawJson: JSON.stringify({
          recordKey: 'npc-item:ice-mimic:loot:flurry-boots',
          relationType: 'loot',
          npcInternalName: 'IceMimic',
          npcName: 'Ice Mimic',
          itemInternalName: 'FlurryBoots',
          itemName: 'Flurry Boots',
          sourceRefInternalName: 'IceMimic',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '15.83%',
          quantityText: '1',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Mimics'
        })
      }
    ],
    relationLootRows: [{
      npcInternalName: 'IceMimic',
      itemInternalName: 'FlurryBoots',
      chanceText: '15.83%',
      quantityText: '1',
    }],
    projectionLootRows: [{
      npcInternalName: 'IceMimic',
      itemInternalName: 'FlurryBoots',
      chanceText: '15.83%',
      quantityText: '1',
    }],
    localLootRows: [{
      npcInternalName: 'IceMimic',
      itemInternalName: 'FlurryBoots',
      chanceText: '15.83%',
      quantityText: '1',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.summary.duplicateSourceIdentity, 0);
  assert.equal(report.summary.duplicateOrPolluted, 0);
  assert.equal(report.sourceRows.length, 1);
  assert.equal(report.sourceRows[0].recordKey, 'npc-item:ice-mimic:loot:flurry-boots');
  assert.equal(report.sourceRows[0].sourceRowStatus, 'accepted_materializable');
});

test('duplicate generated NPC bundle evidence collapses when runtime materialization is clean', () => {
  const lootRow = {
    npcInternalName: 'AngryBones',
    itemInternalName: 'ClothierVoodooDoll',
    chanceText: '0.33%',
    quantityText: '1',
  };
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'AngryBones', npcType: 'enemy' }],
    sourceRows: [
      {
        recordKey: 'npc-item:angry-bones:loot:clothier-voodoo-doll',
        itemInternalName: 'ClothierVoodooDoll',
        itemName: 'Clothier Voodoo Doll',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        chanceText: '0.33%',
        quantityText: '1',
      },
      {
        recordKey: 'npc-item:angry-bones:loot:clothier-voodoo-doll:duplicate',
        itemInternalName: 'ClothierVoodooDoll',
        itemName: 'Clothier Voodoo Doll',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        chanceText: '0.33%',
        quantityText: '1',
      },
      {
        recordKey: 'item-page:clothier-voodoo-doll:angry-bones',
        itemInternalName: 'ClothierVoodooDoll',
        itemName: 'Clothier Voodoo Doll',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Angry Bones',
        sourceRefInternalName: 'AngryBones',
        sourceRefResolution: 'exact_internal_name',
        landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
        chanceText: '0.33%',
        quantityText: '1',
      },
    ],
    relationLootRows: [lootRow],
    projectionLootRows: [lootRow],
    localLootRows: [lootRow],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.summary.duplicateSourceIdentity, 0);
  assert.equal(report.summary.duplicateOrPolluted, 0);
  assert.equal(report.summary.releaseBlockingCount, 0);
  assert.equal(report.sourceRows.length, 1);
  assert.equal(report.sourceRows[0].recordKey, 'npc-item:angry-bones:loot:clothier-voodoo-doll');
  assert.equal(report.sourceRows[0].sourceRowStatus, 'accepted_materializable');
});

test('unprovenanced duplicate source identities remain blocking', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'DemonEye', npcType: 'enemy' }],
    sourceRows: [
      {
        itemInternalName: 'Lens',
        itemName: 'Lens',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Demon Eye',
        sourceRefInternalName: 'DemonEye',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '33%',
        quantityText: '1',
      },
      {
        itemInternalName: 'Lens',
        itemName: 'Lens',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Demon Eye',
        sourceRefInternalName: 'DemonEye',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '33%',
        quantityText: '1',
      },
    ],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.summary.duplicateSourceIdentity, 2);
  assert.equal(report.summary.duplicateOrPolluted, 1);
  assert.equal(report.releaseBlockers.some((row) => row.sourceRowStatus === 'duplicate_source_identity'), true);
});

test('reviewed Can Of Worms source rows are non-NPC exclusions and never materialize', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'Worm', npcType: 'friendly' }],
    sourceRows: [
      {
        itemInternalName: 'Worm',
        itemName: 'Worm',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Can Of Worms',
        sourceRefResolution: 'no_match',
        chanceText: '100%',
        quantityText: '5-8',
      },
    ],
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'exact',
      sourceRefName: 'Can Of Worms',
      reason: 'non_npc_item_source_entity',
      evidenceSource: 'docs/audits/2026-05-11_npc-can-of-worms-non-npc-source-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_non_npc_source_exclusion');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.summary.reviewedNonNpcExclusion, 1);
  assert.equal(report.summary.blockedGenericBucket, 0);
  assert.equal(report.summary.blockedNonNpcSourcePromoted, 0);
  assert.equal(report.blockedRows.some((row) => row.sourceRefName === 'Can Of Worms'), false);
});

test('reviewed Mechdusa item-page boss rows are boss-lane exclusions and never materialize', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'SkeletronPrime', npcType: 'boss' }],
    sourceRows: [
      {
        itemInternalName: 'WaffleIron',
        itemName: "Waffle's Iron",
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Mechdusa',
        sourceRefResolution: 'no_match',
        chanceText: '100%',
        quantityText: '1',
      },
    ],
    reviewedNonNpcSourceExclusions: [{
      sourceType: 'drop',
      sourceRefType: 'npc',
      matchType: 'exact',
      sourceRefName: 'Mechdusa',
      reason: 'boss_lane_reference_source',
      evidenceSource: 'docs/audits/2026-05-11_npc-mechdusa-non-npc-source-review.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-11',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.sourceRows[0].sourceRowStatus, 'reviewed_non_npc_source_exclusion');
  assert.equal(report.sourceRows[0].materializable, false);
  assert.equal(report.summary.reviewedNonNpcExclusion, 1);
  assert.equal(report.summary.blockedMissingItemOrNpcIdentity, 0);
  assert.equal(report.blockedRows.some((row) => row.sourceRefName === 'Mechdusa'), false);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'source_row' && row.sourceRefName === 'Mechdusa'), false);
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

test('invalid domain-separated contract rows block contract health', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [{ internalName: 'BossSegment', npcType: 'boss_segment' }],
    domainSeparatedRules: [{
      npcInternalName: 'BossSegment',
      npcType: 'boss_segment',
      reason: 'boss_segment_inherits',
      evidenceSource: 'docs/audits/invalid.md',
      reviewedBy: 'codex',
      reviewedAt: '2026-05-12',
    }],
    options: { requireApiEvidence: false },
  });

  assert.equal(report.contractHealth.invalidDomainSeparatedRules.length, 1);
  assert.equal(report.releaseBlockers.some((row) => row.type === 'contract_row' && row.contract === 'domain_separated_not_npc_drop'), true);
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
