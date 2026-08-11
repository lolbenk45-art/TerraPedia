import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql',
  import.meta.url,
);

async function migrationSql() {
  assert.equal(existsSync(migrationUrl), true, 'V56 landing migration must exist');
  return readFile(migrationUrl, 'utf8');
}

test('V56 creates the legacy landing shape before evolving existing or clean schemas', async () => {
  const sql = await migrationSql();
  const createIndex = sql.indexOf('CREATE TABLE IF NOT EXISTS `source_dataset_landings`');
  const alterIndex = sql.indexOf('ALTER TABLE `source_dataset_landings`');

  assert.ok(createIndex >= 0);
  assert.ok(alterIndex > createIndex);
  assert.match(sql.slice(createIndex, alterIndex), /`source_page` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(sql.slice(createIndex, alterIndex), /`source_page`, `is_current`/);
});

test('V56 backfills required identity before constraints and replaces the current-row key', async () => {
  const sql = await migrationSql();
  const updateIndex = sql.indexOf('UPDATE `source_dataset_landings`');
  const constrainIndex = sql.indexOf('MODIFY COLUMN `artifact_role` VARCHAR(32) NOT NULL');

  assert.ok(updateIndex >= 0);
  assert.ok(constrainIndex > updateIndex);
  assert.match(sql, /`artifact_role` = 'legacy_compat'/);
  assert.match(sql, /`producer_id` = 'legacy\.source-dataset-importer'/);
  assert.match(sql, /`producer_version` = 'pre-v56'/);
  assert.match(sql, /`producer_run_key` = CONCAT\('legacy-', `id`\)/);
  assert.match(sql, /`source_page` = COALESCE\(`source_page`, `source_key`\)/);
  assert.match(sql, /DROP INDEX `uk_source_dataset_landings_current`/);
  assert.match(sql, /ADD UNIQUE KEY `uk_source_dataset_landings_current`\s*\(`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`\)/);
  assert.match(sql, /ADD UNIQUE KEY `uk_source_dataset_landings_bootstrap_hash`\s*\(`dataset_type`, `provider`, `source_key`, `source_page`, `bootstrap_manifest_hash`\)/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+`?source_dataset_landings`?/i);
});
