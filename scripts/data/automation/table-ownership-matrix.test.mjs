import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { RELATION_TABLE_NAMES } from '../relation/relation-schema.mjs';
import { PROJECTION_TABLE_NAMES } from '../relation/projection-schema.mjs';
import {
  LOCAL_TARGET_SCHEMA_CATALOG,
  TABLE_OWNERSHIP_MATRIX,
  validateOwnershipMatrix,
  findOwnershipRows,
  assertNoOwnershipOverlap,
  matchesOwnershipPredicate,
  extractLocalTargetColumnsFromMigrations
} from './table-ownership-matrix.mjs';

test('matrix covers every relation/projection table and validates at module load', () => {
  assert.doesNotThrow(() => validateOwnershipMatrix());
  for (const table of [...RELATION_TABLE_NAMES, ...PROJECTION_TABLE_NAMES]) {
    assert.ok(TABLE_OWNERSHIP_MATRIX.some((row) => row.databaseRole === 'relation' && row.table === table), table);
  }
});

test('all reviewed shared tables expose every owner with conservative read/write modes', () => {
  const expected = new Map([
    ['maint:maint_npcs', ['npcs:write', 'town_npc_maintenance:write']],
    ['maint:maint_item_sources', ['items:write', 'npcs:read', 'town_npc_maintenance:read']],
    ['maint:maint_item_biomes', ['biomes:write', 'items:read']],
    ['relation:item_source_facts', ['items:write', 'npcs:read', 'town_npc_maintenance:read']],
    ['relation:item_source_details', ['items:write', 'npcs:read', 'town_npc_maintenance:read']],
    ['relation:item_npc_shop_relations', ['items:write', 'npcs:read', 'town_npc_maintenance:read']],
    ['relation:item_npc_loot_relations', ['boss_loot:read', 'items:write', 'npc_loot:read', 'npcs:read']],
    ['relation:npc_buff_relations', ['buffs:write', 'npcs:read']],
    ['local:npc_buff_relations', ['buffs:write', 'npcs:read']],
    ['local:npc_biomes', ['biomes:write', 'npcs:read']],
    ['local:item_acquisition_sources', ['biomes:write', 'items:read']]
  ]);
  for (const [identity, owners] of expected) {
    const [databaseRole, table] = identity.split(':');
    const actual = findOwnershipRows(table, databaseRole)
      .map((row) => `${row.capability}:${row.writeMode}`).sort();
    assert.deepEqual(actual, owners.sort(), identity);
  }
});

test('non-boss and Boss loot use certified disjoint predicate partitions', () => {
  const npc = findOwnershipRows('npc_loot_entries', 'local').find((row) => row.capability === 'npc_loot');
  const boss = findOwnershipRows('npc_loot_entries', 'local').find((row) => row.capability === 'boss_loot');
  assert.deepEqual(npc.logicalPredicate, { kind: 'partition', group: 'npc_loot_parent_kind', partition: 'non_boss', resolver: 'resolveNpcLootParentKind', resolverVersion: 1 });
  assert.deepEqual(boss.logicalPredicate, { kind: 'partition', group: 'npc_loot_parent_kind', partition: 'boss', resolver: 'resolveNpcLootParentKind', resolverVersion: 1 });
  assert.doesNotThrow(() => assertNoOwnershipOverlap([npc, boss]));
});

test('ownership predicates resolve representative rows through a versioned resolver', () => {
  const npc = findOwnershipRows('npc_loot_entries', 'local').find((row) => row.capability === 'npc_loot');
  const boss = findOwnershipRows('npc_loot_entries', 'local').find((row) => row.capability === 'boss_loot');
  const nonTown = findOwnershipRows('maint_npcs', 'maint').find((row) => row.capability === 'npcs');
  const town = findOwnershipRows('maint_npcs', 'maint').find((row) => row.capability === 'town_npc_maintenance');
  assert.equal(matchesOwnershipPredicate(npc, { parentKind: 'non_boss', dropSourceKind: 'npc_drop' }), true);
  assert.equal(matchesOwnershipPredicate(boss, { parentKind: 'boss', bossGroupDeclared: true }), true);
  assert.equal(matchesOwnershipPredicate(npc, { parentKind: 'boss' }), false);
  assert.equal(matchesOwnershipPredicate(npc, { parentKind: 'non_boss', dropSourceKind: 'shop' }), false);
  assert.equal(matchesOwnershipPredicate(npc, { parentKind: 'non_boss' }), false);
  assert.equal(matchesOwnershipPredicate(boss, { parentKind: 'boss', bossGroupDeclared: false }), false);
  assert.equal(matchesOwnershipPredicate(nonTown, {}), false);
  assert.equal(matchesOwnershipPredicate(town, {}), false);
});

test('physical column overlap is rejected even when fieldGroup labels differ', () => {
  const base = TABLE_OWNERSHIP_MATRIX.find((row) => row.key === 'local.npcs');
  assert.throws(() => validateOwnershipMatrix([
    { ...base, key: 'local.npcs.a', capability: 'a', fieldGroup: 'a', columns: ['name'] },
    { ...base, key: 'local.npcs.b', capability: 'b', fieldGroup: 'b', columns: ['name'] }
  ]), /overlap/i);
});

test('missing capability, key, physical columns, or structured predicates fail closed', () => {
  const base = TABLE_OWNERSHIP_MATRIX.find((row) => row.key === 'local.npcs');
  for (const field of ['capability', 'key']) {
    const invalid = { ...base };
    delete invalid[field];
    assert.throws(() => validateOwnershipMatrix([invalid]), new RegExp(field, 'i'));
  }
  assert.throws(() => validateOwnershipMatrix([{ ...base, columns: ['not_a_real_column'] }]), /physical column/i);
  assert.throws(() => validateOwnershipMatrix([{ ...base, logicalPredicate: 'npc_id > 0' }]), /structured.*predicate/i);
  assert.throws(() => validateOwnershipMatrix([{ ...base, logicalPredicate: {
    kind: 'partition', group: 'made_up', partition: 'a'
  } }]), /predicate partition/i);
});

test('category_id has one write owner and items base columns exclude it', () => {
  const category = TABLE_OWNERSHIP_MATRIX.find((row) => row.key === 'local.items.category_id');
  const items = TABLE_OWNERSHIP_MATRIX.find((row) => row.key === 'local.items.base');
  assert.deepEqual(category.columns, ['category_id']);
  assert.equal(category.capability, 'category_support');
  assert.equal(items.columns.includes('category_id'), false);
  assert.equal(items.columns.some((column) => ['id', 'created_at', 'updated_at'].includes(column)), false);
  assert.doesNotThrow(() => assertNoOwnershipOverlap([category, items]));
});

test('local catalog exactly matches columns parsed from every Flyway migration', () => {
  const migrationRoot = new URL('../../../back/src/main/resources/db/migration/', import.meta.url);
  const sources = fs.readdirSync(migrationRoot)
    .filter((file) => /^V\d+.*\.sql$/.test(file))
    .sort((left, right) => Number(left.match(/^V(\d+)/)[1]) - Number(right.match(/^V(\d+)/)[1]))
    .map((file) => fs.readFileSync(new URL(file, migrationRoot), 'utf8'));
  const actual = extractLocalTargetColumnsFromMigrations(sources, Object.keys(LOCAL_TARGET_SCHEMA_CATALOG));
  for (const [table, columns] of Object.entries(LOCAL_TARGET_SCHEMA_CATALOG)) {
    assert.deepEqual([...actual[table]].sort(), [...columns].sort(), table);
  }
});

test('Flyway parser tracks supported column DDL and rejects unsupported target-table DDL', () => {
  const sources = [
    'CREATE TABLE sample (id BIGINT, old_name VARCHAR(32), PRIMARY KEY (id), UNIQUE KEY uk_old_name (old_name));',
    'ALTER TABLE sample ADD COLUMN added_name TEXT;',
    'ALTER TABLE sample DROP COLUMN old_name;',
    'ALTER TABLE sample RENAME COLUMN added_name TO renamed_name;',
    'ALTER TABLE sample CHANGE COLUMN renamed_name final_name TEXT;',
    'ALTER TABLE sample MODIFY COLUMN final_name VARCHAR(64);',
    'ALTER TABLE sample ADD UNIQUE KEY uk_sample_final_name (final_name);'
  ];
  const actual = extractLocalTargetColumnsFromMigrations(sources, ['sample']);
  assert.deepEqual([...actual.sample].sort(), ['final_name', 'id']);
  const omittedColumnKeyword = extractLocalTargetColumnsFromMigrations([
    'CREATE TABLE sample (id BIGINT);',
    'ALTER TABLE sample ADD untracked_col INT;'
  ], ['sample']);
  assert.deepEqual([...omittedColumnKeyword.sample].sort(), ['id', 'untracked_col']);
  const mixed = extractLocalTargetColumnsFromMigrations([
    'CREATE TABLE sample (id BIGINT);',
    'ALTER TABLE sample MODIFY COLUMN id BIGINT, ADD hidden_col INT;'
  ], ['sample']);
  assert.deepEqual([...mixed.sample].sort(), ['hidden_col', 'id']);
  assert.throws(
    () => extractLocalTargetColumnsFromMigrations(['CREATE TABLE sample LIKE source;'], ['sample']),
    /unsupported Flyway table DDL/i
  );
  for (const unsupportedCreate of [
    'CREATE OR REPLACE TABLE sample (id BIGINT);',
    'CREATE TEMPORARY TABLE sample (id BIGINT);',
    'CREATE TABLE sample (id BIGINT)'
  ]) {
    assert.throws(
      () => extractLocalTargetColumnsFromMigrations([unsupportedCreate], ['sample']),
      /unsupported Flyway table DDL/i
    );
  }
  assert.throws(
    () => extractLocalTargetColumnsFromMigrations(['ALTER TABLE sample ALTER COLUMN id DROP DEFAULT;'], ['sample']),
    /unsupported Flyway column DDL/i
  );
  assert.throws(
    () => extractLocalTargetColumnsFromMigrations(['ALTER TABLE sample RENAME TO sample_archive;'], ['sample']),
    /unsupported Flyway table DDL/i
  );
});
