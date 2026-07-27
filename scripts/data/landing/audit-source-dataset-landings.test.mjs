import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function loadAuditModule() {
  return import('./audit-source-dataset-landings.mjs');
}

test('audit resolves mysql2 from the package that declares it', async () => {
  const source = await fs.readFile(new URL('./audit-source-dataset-landings.mjs', import.meta.url), 'utf8');

  assert.match(source, /createRequire\(path\.join\(repoRoot, 'data-query-app', 'package\.json'\)\)/);
  assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/);
});

test('buildDomainAuditPlan defines comparable landing datasets for local and r2', async () => {
  const { buildDomainAuditPlan } = await loadAuditModule();
  const plan = buildDomainAuditPlan('terria_v1_item_staging_20260413_r2');
  const items = plan.find((entry) => entry.datasetType === 'items_raw');
  const bosses = plan.find((entry) => entry.datasetType === 'bosses_raw');
  const recipes = plan.find((entry) => entry.datasetType === 'recipes_raw');

  assert.deepEqual(items, {
    datasetType: 'items_raw',
    localTable: 'items',
    compareDatabase: 'terria_v1_item_staging_20260413_r2',
    compareTable: 'items',
  });
  assert.deepEqual(bosses, {
    datasetType: 'bosses_raw',
    localTable: 'boss_groups',
    compareDatabase: 'terria_v1_item_staging_20260413_r2',
    compareTable: 'boss_groups',
  });
  assert.deepEqual(recipes, {
    datasetType: 'recipes_raw',
    localTable: 'recipes',
    compareDatabase: 'terria_v1_item_staging_20260413_r2',
    compareTable: 'recipes',
  });
});

test('buildQualifiedCountSql qualifies database and table names safely', async () => {
  const { buildQualifiedCountSql } = await loadAuditModule();
  assert.equal(
    buildQualifiedCountSql('terria_v1_local', 'items'),
    'SELECT COUNT(*) AS total FROM `terria_v1_local`.`items`',
  );
});

test('buildLandingAuditSummary merges landing distribution with business table counts', async () => {
  const { buildLandingAuditSummary } = await loadAuditModule();
  const summary = buildLandingAuditSummary({
    generatedAt: '2026-04-23T10:00:00.000Z',
    landingByType: [
      { datasetType: 'items_raw', total: 1 },
      { datasetType: 'item_pages_raw', total: 6131 },
    ],
    landingByProvider: [
      { provider: 'terraria.wiki.gg', total: 6133 },
      { provider: 'terraria.wiki.gg/zh', total: 41 },
    ],
    businessTableCounts: [
      {
        datasetType: 'items_raw',
        localTable: 'items',
        localCount: 6134,
        compareDatabase: 'terria_v1_item_staging_20260413_r2',
        compareTable: 'items',
        compareCount: 6146,
      },
      {
        datasetType: 'recipes_raw',
        localTable: 'recipes',
        localCount: 8539,
        compareDatabase: 'terria_v1_item_staging_20260413_r2',
        compareTable: 'recipes',
        compareCount: 5020,
      },
    ],
  });

  assert.equal(summary.generatedAt, '2026-04-23T10:00:00.000Z');
  assert.equal(summary.landing.totalRows, 6132);
  assert.equal(summary.landing.byType.items_raw, 1);
  assert.equal(summary.landing.byProvider['terraria.wiki.gg/zh'], 41);
  assert.equal(summary.business.items_raw.localCount, 6134);
  assert.equal(summary.business.items_raw.compareCount, 6146);
  assert.equal(summary.business.recipes_raw.localCount, 8539);
});

test('landing integrity queries use generated current slots and full source identity', async () => {
  const { buildLandingIntegrityQueries } = await loadAuditModule();
  const queries = buildLandingIntegrityQueries();

  assert.equal(queries.length, 4);
  assert.ok(queries.every(({ sql }) => sql.trimStart().toUpperCase().startsWith('SELECT')));
  assert.match(queries.find(({ id }) => id === 'duplicateCurrentIdentityCount').sql, /current_slot = 1/);
  assert.match(queries.find(({ id }) => id === 'governedCurrentMissingIdentityCount').sql, /current_slot = 1/);
  assert.match(
    queries.find(({ id }) => id === 'duplicateBootstrapManifestCount').sql,
    /GROUP BY dataset_type, provider, source_key, source_page, bootstrap_manifest_hash/,
  );
});

test('landing integrity query execution requires one numeric total per check', async () => {
  const { queryLandingIntegrityCounts } = await loadAuditModule();
  const totals = ['0', 0, '0', 2];
  let callIndex = 0;
  const connection = {
    async query() {
      return [[{ total: totals[callIndex++] }]];
    },
  };

  assert.deepEqual(await queryLandingIntegrityCounts(connection), {
    duplicateCurrentIdentityCount: 0,
    governedCurrentMissingIdentityCount: 0,
    governedCompatExportCount: 0,
    duplicateBootstrapManifestCount: 2,
  });
  assert.equal(callIndex, 4);

  await assert.rejects(
    queryLandingIntegrityCounts({ query: async () => [[{ total: 'not-a-number' }]] }),
    /landing integrity query rejected: duplicateCurrentIdentityCount must return one numeric total/,
  );
  await assert.rejects(
    queryLandingIntegrityCounts({ query: async () => [[{ total: null }]] }),
    /landing integrity query rejected: duplicateCurrentIdentityCount must return one numeric total/,
  );
});

test('landing integrity summary blocks any non-zero artifact contract count', async () => {
  const { buildLandingAuditSummary } = await loadAuditModule();
  const clean = buildLandingAuditSummary({
    integrityCounts: {
      duplicateCurrentIdentityCount: 0,
      governedCurrentMissingIdentityCount: 0,
      governedCompatExportCount: 0,
      duplicateBootstrapManifestCount: 0,
    },
  });
  const blocked = buildLandingAuditSummary({
    integrityCounts: {
      duplicateCurrentIdentityCount: 0,
      governedCurrentMissingIdentityCount: 1,
      governedCompatExportCount: 0,
      duplicateBootstrapManifestCount: 0,
    },
  });

  assert.equal(clean.integrity.status, 'pass');
  assert.equal(clean.integrity.blockingCount, 0);
  assert.equal(blocked.integrity.status, 'blocked');
  assert.equal(blocked.integrity.blockingCount, 1);
  assert.equal(blocked.integrity.governedCurrentMissingIdentityCount, 1);
});
