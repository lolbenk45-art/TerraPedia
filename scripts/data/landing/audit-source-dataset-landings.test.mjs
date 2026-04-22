import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDomainAuditPlan,
  buildLandingAuditSummary,
  buildQualifiedCountSql,
} from './audit-source-dataset-landings.mjs';

test('buildDomainAuditPlan defines comparable landing datasets for local and r2', () => {
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

test('buildQualifiedCountSql qualifies database and table names safely', () => {
  assert.equal(
    buildQualifiedCountSql('terria_v1_local', 'items'),
    'SELECT COUNT(*) AS total FROM `terria_v1_local`.`items`',
  );
});

test('buildLandingAuditSummary merges landing distribution with business table counts', () => {
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
