import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcLootRuntimeParityReport,
  parseArgs,
  runNpcLootRuntimeParityAudit,
} from './npc-loot-runtime-parity-audit.mjs';

const baseRelation = {
  npcInternalName: 'Zombie',
  itemInternalName: 'Shackle',
  chanceText: '2%',
  quantityText: '1',
  conditionText: '',
  sourceFactKey: 'fact:zombie:shackle',
};

function row(overrides = {}) {
  return { ...baseRelation, ...overrides };
}

test('parseArgs defaults runtime parity audit to read-only report mode', () => {
  assert.deepEqual(parseArgs([]), {
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
    apiBaseUrl: 'http://localhost:18088',
    apiMode: 'public-detail',
    adminToken: null,
    writeReport: true,
    output: null,
    dateTag: new Date().toISOString().slice(0, 10),
  });
});

test('buildNpcLootRuntimeParityReport classifies required runtime parity statuses by stable row identity', () => {
  const report = buildNpcLootRuntimeParityReport({
    relationRows: [
      row({ npcInternalName: 'ProjectionGapNpc', itemInternalName: 'Torch', sourceFactKey: 'fact:projection-gap' }),
      row({ npcInternalName: 'LocalGapNpc', itemInternalName: 'Banner', sourceFactKey: 'fact:local-gap' }),
      row({ npcInternalName: 'ApiGapNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:api-gap' }),
      row({ npcInternalName: 'DuplicateNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:duplicate' }),
      row({ npcInternalName: 'CountParityNpc', itemInternalName: 'CorrectItem', sourceFactKey: 'fact:count-parity' }),
      row({ npcInternalName: 'HealthyNpc', itemInternalName: 'Shackle', sourceFactKey: 'fact:healthy' }),
    ],
    projectionRows: [
      row({ npcInternalName: 'LocalGapNpc', itemInternalName: 'Banner', sourceFactKey: 'fact:local-gap' }),
      row({ npcInternalName: 'ApiGapNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:api-gap' }),
      row({ npcInternalName: 'DuplicateNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:duplicate' }),
      row({ npcInternalName: 'CountParityNpc', itemInternalName: 'CorrectItem', sourceFactKey: 'fact:count-parity' }),
      row({ npcInternalName: 'HealthyNpc', itemInternalName: 'Shackle', sourceFactKey: 'fact:healthy' }),
      row({ npcInternalName: 'ProjectionOnlyNpc', itemInternalName: 'ProjectionBlade', sourceFactKey: 'fact:projection-only' }),
    ],
    localRows: [
      row({ npcInternalName: 'ApiGapNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:api-gap' }),
      row({ npcInternalName: 'DuplicateNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:duplicate', localEntryId: 10 }),
      row({ npcInternalName: 'DuplicateNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:duplicate', localEntryId: 11 }),
      row({ npcInternalName: 'CountParityNpc', itemInternalName: 'WrongItem', sourceFactKey: 'fact:count-parity' }),
      row({ npcInternalName: 'HealthyNpc', itemInternalName: 'Shackle', sourceFactKey: 'fact:healthy' }),
    ],
    apiRows: [
      row({ npcInternalName: 'FallbackNpc', itemInternalName: 'FallbackDrop', runtimeMode: 'prototype' }),
      row({ npcInternalName: 'ApiPollutedNpc', itemInternalName: 'UntrustedDrop', runtimeMode: 'direct' }),
      row({ npcInternalName: 'ProjectionOnlyNpc', itemInternalName: 'ProjectionBlade', runtimeMode: 'projection_only' }),
      row({ npcInternalName: 'DuplicateNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:duplicate', runtimeMode: 'direct' }),
      row({ npcInternalName: 'CountParityNpc', itemInternalName: 'WrongItem', sourceFactKey: 'fact:count-parity', runtimeMode: 'direct' }),
      row({ npcInternalName: 'HealthyNpc', itemInternalName: 'Shackle', sourceFactKey: 'fact:healthy', runtimeMode: 'direct' }),
    ],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.evidenceHealth, 'sufficient');
  assert.equal(report.summary.byStatus.projection_gap, 1);
  assert.equal(report.summary.byStatus.local_gap, 1);
  assert.equal(report.summary.byStatus.api_gap, 1);
  assert.equal(report.summary.byStatus.runtime_fallback_only, 1);
  assert.equal(report.summary.byStatus.projection_only, 1);
  assert.equal(report.summary.byStatus.duplicate_or_polluted, 2);
  assert.equal(report.summary.byStatus.count_parity_only, 1);
  assert.equal(report.summary.byStatus.trusted_direct_loot, 1);

  const byNpc = new Map(report.rows.map((entry) => [entry.npcInternalName, entry.status]));
  assert.equal(byNpc.get('ProjectionGapNpc'), 'projection_gap');
  assert.equal(byNpc.get('LocalGapNpc'), 'local_gap');
  assert.equal(byNpc.get('ApiGapNpc'), 'api_gap');
  assert.equal(byNpc.get('FallbackNpc'), 'runtime_fallback_only');
  assert.equal(byNpc.get('ApiPollutedNpc'), 'duplicate_or_polluted');
  assert.equal(byNpc.get('ProjectionOnlyNpc'), 'projection_only');
  assert.equal(byNpc.get('DuplicateNpc'), 'duplicate_or_polluted');
  assert.equal(byNpc.get('CountParityNpc'), 'count_parity_only');
  assert.equal(byNpc.get('HealthyNpc'), 'trusted_direct_loot');
  assert.equal(report.rows.find((entry) => entry.npcInternalName === 'CountParityNpc').countParityOnly, true);
});

test('buildNpcLootRuntimeParityReport does not classify structured API rows as projection-only just because projection JSON exists', () => {
  const trustedRow = row({ npcInternalName: 'HealthyWithProjectionJson', itemInternalName: 'Gel', sourceFactKey: 'fact:healthy-json' });
  const report = buildNpcLootRuntimeParityReport({
    relationRows: [trustedRow],
    projectionRows: [trustedRow],
    localRows: [trustedRow],
    apiRows: [{ ...trustedRow, runtimeMode: 'direct' }, { ...trustedRow, runtimeMode: 'projection_only' }],
  });

  const status = report.rows.find((entry) => entry.npcInternalName === 'HealthyWithProjectionJson');
  assert.equal(status.status, 'trusted_direct_loot');
});

test('row identity parity does not require sourceFactKey in local or API rows', () => {
  const relationRow = row({ npcInternalName: 'LineageNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:lineage' });
  const localShape = { ...relationRow, sourceFactKey: null };
  const report = buildNpcLootRuntimeParityReport({
    relationRows: [relationRow],
    projectionRows: [relationRow],
    localRows: [localShape],
    apiRows: [{ ...localShape, runtimeMode: 'direct' }],
  });

  const status = report.rows.find((entry) => entry.npcInternalName === 'LineageNpc');
  assert.equal(status.status, 'trusted_direct_loot');
});

test('buildNpcLootRuntimeParityReport blocks API rows with missing or unknown runtime provenance', () => {
  const missingModeRow = row({ npcInternalName: 'MissingModeNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:missing-mode' });
  const unknownModeRow = row({ npcInternalName: 'UnknownModeNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:unknown-mode' });
  const report = buildNpcLootRuntimeParityReport({
    relationRows: [missingModeRow, unknownModeRow],
    projectionRows: [missingModeRow, unknownModeRow],
    localRows: [missingModeRow, unknownModeRow],
    apiRows: [
      { ...missingModeRow, runtimeMode: null },
      { ...unknownModeRow, runtimeMode: 'runtime_projection_cache' },
    ],
  });

  const byNpc = new Map(report.rows.map((entry) => [entry.npcInternalName, entry]));
  assert.equal(report.auditStatus, 'blocked');
  assert.equal(byNpc.get('MissingModeNpc').status, 'duplicate_or_polluted');
  assert.equal(byNpc.get('MissingModeNpc').reason, 'api_runtime_mode_missing_or_unknown');
  assert.equal(byNpc.get('UnknownModeNpc').status, 'duplicate_or_polluted');
  assert.equal(byNpc.get('UnknownModeNpc').reason, 'api_runtime_mode_missing_or_unknown');
});

test('buildNpcLootRuntimeParityReport keeps known fallback and projection-only provenance classified by type', () => {
  const fallbackRow = row({ npcInternalName: 'KnownFallbackNpc', itemInternalName: 'Gel', sourceFactKey: 'fact:fallback-known' });
  const projectionOnlyRow = row({ npcInternalName: 'KnownProjectionOnlyNpc', itemInternalName: 'Hook', sourceFactKey: 'fact:projection-known' });
  const fallbackWithRelationRow = row({ npcInternalName: 'FallbackWithRelationNpc', itemInternalName: 'Vitamins', sourceFactKey: 'fact:fallback-with-relation' });
  const report = buildNpcLootRuntimeParityReport({
    relationRows: [fallbackWithRelationRow],
    projectionRows: [projectionOnlyRow, fallbackWithRelationRow],
    localRows: [fallbackWithRelationRow],
    apiRows: [
      { ...fallbackRow, runtimeMode: 'prototype' },
      { ...projectionOnlyRow, runtimeMode: 'projection_only' },
      { ...fallbackWithRelationRow, runtimeMode: 'same_name' },
    ],
  });

  const byNpc = new Map(report.rows.map((entry) => [entry.npcInternalName, entry]));
  assert.equal(byNpc.get('KnownFallbackNpc').status, 'runtime_fallback_only');
  assert.equal(byNpc.get('KnownProjectionOnlyNpc').status, 'projection_only');
  assert.equal(byNpc.get('FallbackWithRelationNpc').status, 'runtime_fallback_only');
});

test('runNpcLootRuntimeParityAudit blocks if admin list API mode is requested for structured API evidence', async () => {
  const result = await runNpcLootRuntimeParityAudit(
    { writeReport: false, apiMode: 'admin-list' },
    {
      loadRelationRows: async () => [],
      loadProjectionRows: async () => [],
      loadLocalRows: async () => [],
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'api_unavailable');
  assert.match(result.report.error.message, /admin-list API does not expose structured NPC loot relations/);
});

test('runNpcLootRuntimeParityAudit loads public detail aggregate rows for API evidence', async () => {
  const calls = [];
  const result = await runNpcLootRuntimeParityAudit(
    { writeReport: false, apiBaseUrl: 'http://local.test' },
    {
      connection: {},
      loadRelationRows: async () => [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })],
      loadProjectionRows: async () => [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })],
      loadLocalRows: async () => [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })],
      loadApiTargetNpcs: async () => [{ id: 12, npcInternalName: 'Zombie' }],
      apiClient: async (url) => {
        calls.push(url);
        return {
          ok: true,
          async json() {
            return {
              data: {
                npc: { internalName: 'Zombie' },
                loot: [row({ npcInternalName: 'Ignored', itemInternalName: 'Shackle', lootSourceMode: 'direct' })],
              },
            };
          },
        };
      },
    }
  );

  assert.deepEqual(calls, ['http://local.test/api/public/npcs/12/aggregate?include=loot']);
  assert.equal(result.report.summary.stageRows.api, 1);
});

test('runNpcLootRuntimeParityAudit treats public detail 404 as per-NPC API gap evidence', async () => {
  const result = await runNpcLootRuntimeParityAudit(
    { writeReport: false, apiBaseUrl: 'http://local.test' },
    {
      connection: {},
      loadRelationRows: async () => [row({ npcInternalName: 'MissingPublicNpc', itemInternalName: 'Gel' })],
      loadProjectionRows: async () => [row({ npcInternalName: 'MissingPublicNpc', itemInternalName: 'Gel' })],
      loadLocalRows: async () => [row({ npcInternalName: 'MissingPublicNpc', itemInternalName: 'Gel' })],
      loadApiTargetNpcs: async () => [{ id: 404, npcInternalName: 'MissingPublicNpc' }],
      apiClient: async () => ({ ok: false, status: 404 }),
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'sufficient');
  assert.equal(result.report.summary.byStatus.api_gap, 1);
});

test('runNpcLootRuntimeParityAudit keeps auth failures as global API blockers', async () => {
  const result = await runNpcLootRuntimeParityAudit(
    { writeReport: false, apiBaseUrl: 'http://local.test' },
    {
      connection: {},
      loadRelationRows: async () => [],
      loadProjectionRows: async () => [],
      loadLocalRows: async () => [],
      loadApiTargetNpcs: async () => [{ id: 401, npcInternalName: 'AuthNpc' }],
      apiClient: async () => ({ ok: false, status: 401 }),
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'api_auth_unavailable');
});

test('runNpcLootRuntimeParityAudit supports dependency injection without DB or API writes', async () => {
  const calls = [];
  const result = await runNpcLootRuntimeParityAudit(
    { writeReport: false, dateTag: '2026-05-10-test' },
    {
      loadRelationRows: async () => {
        calls.push('relation');
        return [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })];
      },
      loadProjectionRows: async () => {
        calls.push('projection');
        return [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })];
      },
      loadLocalRows: async () => {
        calls.push('local');
        return [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle' })];
      },
      loadApiRows: async () => {
        calls.push('api');
        return [row({ npcInternalName: 'Zombie', itemInternalName: 'Shackle', runtimeMode: 'direct' })];
      },
    }
  );

  assert.equal(result.report.auditStatus, 'pass');
  assert.deepEqual(calls, ['relation', 'projection', 'local', 'api']);
  assert.equal(result.report.summary.totalNpcs, 1);
  assert.equal(result.reportPath, null);
});

test('runNpcLootRuntimeParityAudit returns blocked report when DB or API is unavailable', async () => {
  const dbResult = await runNpcLootRuntimeParityAudit(
    { writeReport: false, dateTag: '2026-05-10-test' },
    {
      loadRelationRows: async () => {
        throw new Error('connection refused');
      },
    }
  );

  assert.equal(dbResult.report.auditStatus, 'blocked');
  assert.equal(dbResult.report.evidenceHealth, 'db_unavailable');
  assert.match(dbResult.report.error.message, /connection refused/);

  const apiResult = await runNpcLootRuntimeParityAudit(
    { writeReport: false, dateTag: '2026-05-10-test' },
    {
      loadRelationRows: async () => [],
      loadProjectionRows: async () => [],
      loadLocalRows: async () => [],
      loadApiRows: async () => {
        throw new Error('api timeout');
      },
    }
  );

  assert.equal(apiResult.report.auditStatus, 'blocked');
  assert.equal(apiResult.report.evidenceHealth, 'api_unavailable');
  assert.match(apiResult.report.error.message, /api timeout/);
});
