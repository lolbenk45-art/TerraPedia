import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  assertPrimaryDb,
  booleanOption,
  expandLandingEntries,
  formatDateTag,
  parseArgs,
  planLandingImportExecution,
  resolveImportOptions,
  runLandingImport,
} from './import-source-dataset-landings.mjs';

test('parseArgs parses key value and flag options', () => {
  assert.deepEqual(parseArgs([
    '--apply=true',
    '--database=terria_v1_local',
    '--allow-non-primary-db',
  ]), {
    apply: 'true',
    database: 'terria_v1_local',
    'allow-non-primary-db': 'true',
  });
});

test('booleanOption normalizes cli boolean values', () => {
  assert.equal(booleanOption('true', false), true);
  assert.equal(booleanOption('1', false), true);
  assert.equal(booleanOption('false', true), false);
  assert.equal(booleanOption(undefined, true), true);
});

test('resolveImportOptions prefers cli args then env then local config', () => {
  const repoRoot = 'G:/ClaudeCode/TerraPedia-dev';
  const options = resolveImportOptions(
    {
      apply: 'false',
      output: 'reports/custom-landing-report.json',
    },
    {
      repoRoot,
      env: {
        TERRAPEDIA_DB_HOST: '192.168.1.10',
        TERRAPEDIA_DB_PORT: '4306',
        TERRAPEDIA_DB_USERNAME: 'env_user',
        TERRAPEDIA_DB_PASSWORD: 'env_password',
      },
      config: {
        database: {
          name: 'terria_v1_local',
          host: '127.0.0.1',
          port: 3306,
          username: 'root',
          password: 'root',
        },
      },
      now: new Date('2026-04-23T08:00:00.000Z'),
    },
  );

  assert.equal(options.apply, false);
  assert.equal(options.db.host, '192.168.1.10');
  assert.equal(options.db.port, 4306);
  assert.equal(options.db.user, 'env_user');
  assert.equal(options.db.password, 'env_password');
  assert.equal(options.db.database, 'terria_v1_local');
  assert.deepEqual(options.datasets, []);
  assert.equal(
    options.reportPath,
    path.resolve(repoRoot, 'reports', 'custom-landing-report.json'),
  );
});

test('resolveImportOptions parses requested dataset filter list', () => {
  const options = resolveImportOptions(
    {
      datasets: 'items_raw,recipes_raw',
    },
    {
      repoRoot: 'G:/ClaudeCode/TerraPedia-dev',
      config: { database: { name: 'terria_v1_local' } },
    },
  );

  assert.deepEqual(options.datasets, ['items_raw', 'recipes_raw']);
});

test('formatDateTag uses local calendar date instead of utc slice', () => {
  const actual = formatDateTag(new Date(2026, 3, 23, 1, 30, 0));
  assert.equal(actual, '2026-04-23');
});

test('assertPrimaryDb blocks apply mode writes to non-primary database', () => {
  assert.throws(
    () => assertPrimaryDb('terria_v1_item_staging_20260413_r2', true, false),
    /Refusing to write to non-primary database/,
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_item_staging_20260413_r2', false, false));
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_item_staging_20260413_r2', true, true));
});

test('planLandingImportExecution returns dry-run summary without write actions', () => {
  const summary = planLandingImportExecution(
    {
      apply: false,
      db: { database: 'terria_v1_local' },
      datasets: ['items_raw'],
      reportPath: 'G:/ClaudeCode/TerraPedia-dev/reports/source-dataset-landing-schema-2026-04-23.json',
    },
    [
      { datasetType: 'items_raw' },
      { datasetType: 'items_raw' },
    ],
  );

  assert.equal(summary.apply, false);
  assert.equal(summary.database, 'terria_v1_local');
  assert.equal(summary.tableName, 'source_dataset_landings');
  assert.equal(summary.schema.willApply, false);
  assert.equal(summary.schema.datasetTypes.length, 14);
  assert.deepEqual(summary.datasets.requested, ['items_raw']);
  assert.equal(summary.datasets.located, 2);
  assert.equal(summary.datasets.byType.items_raw, 2);
});

test('expandLandingEntries splits oversized array payloads into chunked landing entries', async () => {
  const expanded = await expandLandingEntries(
    [
      {
        datasetType: 'item_relations_bundle_raw',
        provider: 'terrapedia.generated',
        sourceKind: 'generated_bundle',
        sourceKey: 'generated.item_relations_bundle',
        sourcePage: 'item-relations.bundle',
        sourceLocator: 'shared://normalized/item-relations.bundle.json',
        payloadBytes: 1000,
        payload: {
          source: 'terraria.wiki.gg:item-page-assembly',
          itemImages: [
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
            { id: 4, name: 'D' },
          ],
        },
      },
    ],
    { maxPayloadBytes: 160 },
  );

  assert.ok(expanded.length > 1);
  assert.match(expanded[0].sourceKey, /:chunk:0001$/);
  assert.match(expanded[0].sourcePage, /#itemImages\/1$/);
  assert.equal(expanded.every((entry) => entry.payloadBytes <= 160), true);
});

test('runLandingImport skips db connection in dry-run mode', async () => {
  let createConnectionCalled = false;
  const summary = await runLandingImport(
    {
      apply: false,
      datasets: ['items_raw'],
      db: { database: 'terria_v1_local' },
      reportPath: 'G:/ClaudeCode/TerraPedia-dev/reports/source-dataset-landing-schema-2026-04-23.json',
    },
    {
      locateDatasetEntries: async () => [
        {
          datasetType: 'items_raw',
          provider: 'terraria.wiki.gg',
          sourceKind: 'module',
          sourceKey: 'wiki.module.iteminfo',
          sourcePage: 'Module:Iteminfo/data',
          sourceLocator: 'shared://raw/wiki/module__iteminfo__data.latest.json',
          contentHash: 'a'.repeat(64),
          payload: { pageTitle: 'Module:Iteminfo/data' },
          fetchedAt: '2026-04-23T01:00:00.000Z',
          parsedAt: '2026-04-23T01:00:00.000Z',
          parseStatus: 'ok',
        },
      ],
      mysqlModule: {
        async createConnection() {
          createConnectionCalled = true;
          throw new Error('should not connect in dry-run mode');
        },
      },
      writeReport: async () => {},
    },
  );

  assert.equal(createConnectionCalled, false);
  assert.equal(summary.schema.applied, false);
  assert.equal(summary.datasets.located, 1);
});

test('runLandingImport executes schema sql and upserts landing rows in apply mode', async () => {
  const executedSql = [];
  const executeCalls = [];
  let ended = false;
  const summary = await runLandingImport(
    {
      apply: true,
      datasets: ['items_raw'],
      db: { database: 'terria_v1_local' },
      reportPath: 'G:/ClaudeCode/TerraPedia-dev/reports/source-dataset-landing-schema-2026-04-23.json',
    },
    {
      locateDatasetEntries: async () => [
        {
          datasetType: 'items_raw',
          provider: 'terraria.wiki.gg',
          sourceKind: 'module',
          sourceKey: 'wiki.module.iteminfo',
          sourcePage: 'Module:Iteminfo/data',
          sourceLocator: 'shared://raw/wiki/module__iteminfo__data.latest.json',
          sourceRevisionTimestamp: '2026-04-22T11:00:00Z',
          contentHash: 'a'.repeat(64),
          payload: { pageTitle: 'Module:Iteminfo/data' },
          fetchedAt: '2026-04-23T01:00:00.000Z',
          parsedAt: '2026-04-23T01:00:00.000Z',
          parseStatus: 'ok',
          notes: null,
        },
      ],
      mysqlModule: {
        async createConnection() {
          return {
            async beginTransaction() {},
            async commit() {},
            async rollback() {},
            async query(sql) {
              executedSql.push(sql);
            },
            async execute(sql, params) {
              executeCalls.push({ sql, params });
              if (sql.startsWith('SELECT id, content_hash')) {
                return [[]];
              }
              if (sql.startsWith('INSERT INTO source_dataset_landings')) {
                return [{ insertId: 1 }];
              }
              return [{}];
            },
            async end() {
              ended = true;
            },
          };
        },
      },
      writeReport: async () => {},
    },
  );

  assert.equal(executedSql.length, 1);
  assert.match(executedSql[0], /CREATE TABLE IF NOT EXISTS `source_dataset_landings`/);
  assert.equal(executeCalls.length, 2);
  assert.match(executeCalls[0].sql, /^SELECT id, content_hash/);
  assert.match(executeCalls[1].sql, /^INSERT INTO source_dataset_landings/);
  assert.equal(ended, true);
  assert.equal(summary.schema.applied, true);
  assert.equal(summary.datasets.located, 1);
  assert.equal(summary.rows.inserted, 1);
});
