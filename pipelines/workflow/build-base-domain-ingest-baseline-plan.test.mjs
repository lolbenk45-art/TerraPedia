import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBaselinePlan, BASE_DOMAIN_TABLES } from './build-base-domain-ingest-baseline-plan.mjs';

test('buildBaselinePlan emits manual dump and count/max-updated SQL for base-domain tables', () => {
  const plan = buildBaselinePlan({
    database: 'terria_v1_local',
    outputDir: 'reports/data/base-domain-baseline',
    timestamp: '2026-06-20T07-00-00Z',
  });

  assert.equal(plan.database, 'terria_v1_local');
  assert.equal(plan.tables.length, BASE_DOMAIN_TABLES.length);
  assert.match(plan.mysqldumpCommand, /mysqldump\b/);
  assert.match(plan.mysqldumpCommand, /terria_v1_local/);
  assert.match(plan.mysqldumpCommand, /items/);
  assert.match(plan.countAndUpdatedAtSql, /SELECT 'items' AS table_name, COUNT\(\*\) AS row_count, MAX\(updated_at\) AS max_updated_at FROM `items`/);
  assert.match(plan.countAndUpdatedAtSql, /UNION ALL/);
  assert.equal(plan.executesDatabaseCommands, false);
});

test('buildBaselinePlan rejects non-primary database by default', () => {
  assert.throws(
    () => buildBaselinePlan({ database: 'terria_v1_maint' }),
    /Refusing to write to non-primary database/,
  );
});
