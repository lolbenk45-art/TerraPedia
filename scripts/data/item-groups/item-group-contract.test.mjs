import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await import('./item-group-contract.mjs').catch(() => ({}));
const migrationUrl = new URL(
  '../../../back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql',
  import.meta.url,
);

test('canonical group source layers and consumer predicates stay explicit', () => {
  assert.deepEqual(contract.ITEM_GROUP_SOURCE_LAYERS, [
    'recipe_reference',
    'source_group',
    'central_override',
  ]);
  assert.deepEqual(contract.ITEM_GROUP_SOURCE_PRIORITIES, {
    recipe_reference: 100,
    source_group: 300,
    central_override: 400,
  });
  assert.deepEqual(contract.ITEM_GROUP_ALLOWED_LAYERS.recipe_expansion, ['recipe_reference']);
  assert.deepEqual(contract.ITEM_GROUP_ALLOWED_LAYERS.admin_recipe_groups, [
    'recipe_reference',
    'central_override',
  ]);
});

test('V57 defines layer-preserving local runtime tables and a published singleton', async () => {
  const sql = await readFile(migrationUrl, 'utf8').catch(() => '');

  for (const table of [
    'item_groups',
    'item_group_members',
    'item_group_aliases',
    'item_group_projection_state',
  ]) {
    assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS `' + table + '`'));
  }
  assert.match(
    sql,
    /UNIQUE KEY `uk_item_groups_canonical_layer` \(`canonical_key`, `source_layer`\)/,
  );
  assert.match(sql, /KEY `idx_item_groups_source_layer` \(`source_layer`, `deleted`\)/);
  assert.match(
    sql,
    /UNIQUE KEY `uk_item_group_members_group_item` \(`group_id`, `item_id`\)/,
  );
  assert.match(
    sql,
    /UNIQUE KEY `uk_item_group_aliases_alias_group_layer` \(`normalized_alias`, `canonical_key`, `source_layer`\)/,
  );
  assert.match(sql, /UNIQUE KEY `uk_item_group_projection_state_singleton` \(`singleton_key`\)/);
  assert.match(sql, /CHECK \(`singleton_key` = 1\)/);
  assert.match(sql, /`publication_status` VARCHAR\(32\) NOT NULL DEFAULT 'UNPUBLISHED'/);
  assert.match(sql, /FOREIGN KEY \(`group_id`\) REFERENCES `item_groups` \(`id`\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/i);
});

test('V57 persists append-only admin item group audit evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS `item_group_admin_audit`/);
  for (const column of [
    'record_key',
    'actor',
    'action',
    'canonical_key',
    'before_logical_key',
    'after_logical_key',
    'canonical_snapshot_hash',
  ]) {
    assert.match(sql, new RegExp('`' + column + '`'));
  }
  assert.match(sql, /CREATE TRIGGER `trg_item_group_admin_audit_no_update`[\s\S]*BEFORE UPDATE/);
  assert.match(sql, /CREATE TRIGGER `trg_item_group_admin_audit_no_delete`[\s\S]*BEFORE DELETE/);
});
