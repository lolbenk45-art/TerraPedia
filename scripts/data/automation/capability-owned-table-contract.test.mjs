import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAINT_TABLE_NAMES } from '../maint/maint-schema.mjs';
import { RELATION_TABLE_CATALOG } from '../relation/relation-schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

function loadCapabilities() {
  const raw = fs.readFileSync(path.join(here, 'fixtures', 'crawler-automation-capabilities.json'), 'utf8');
  return JSON.parse(raw).operations;
}

// Local physical tables come from the authoritative Flyway migrations rather than a live
// database, so this contract runs offline like the rest of the suite.
function loadLocalTableNames() {
  const dir = path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration');
  const names = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z0-9_]+)`?/gi)) {
      names.add(match[1]);
    }
  }
  return names;
}

function loadRelationTableNames() {
  return new Set(RELATION_TABLE_CATALOG.map((entry) => entry.table));
}

function physicalTablesByRole() {
  return {
    local: loadLocalTableNames(),
    relation: loadRelationTableNames(),
    maint: new Set(MAINT_TABLE_NAMES),
  };
}

test('the offline table catalogs are non-empty, so this contract cannot pass vacuously', () => {
  const byRole = physicalTablesByRole();
  assert.ok(byRole.local.size > 50, `expected many local tables, found ${byRole.local.size}`);
  assert.ok(byRole.relation.size > 10, `expected many relation tables, found ${byRole.relation.size}`);
  assert.ok(byRole.maint.size > 10, `expected many maint tables, found ${byRole.maint.size}`);
});

test('every ownedTables entry names a physical table that actually exists', () => {
  const byRole = physicalTablesByRole();
  const problems = [];

  for (const operation of loadCapabilities()) {
    for (const owned of operation.ownedTables ?? []) {
      const known = byRole[owned.databaseRole];
      if (!known) {
        problems.push(`${operation.actionId}: unknown databaseRole "${owned.databaseRole}"`);
        continue;
      }
      if (!known.has(owned.table)) {
        problems.push(`${operation.actionId}: ${owned.databaseRole}.${owned.table} does not exist`);
      }
    }
  }

  assert.deepEqual(problems, [], `ownedTables drift:\n${problems.join('\n')}`);
});

test('a capability that writes the database owns at least one table, and one that does not owns none', () => {
  for (const operation of loadCapabilities()) {
    const owned = operation.ownedTables ?? [];
    if (operation.writesDatabase) {
      assert.ok(owned.length > 0, `${operation.actionId}: writesDatabase but owns no table`);
    } else {
      assert.equal(owned.length, 0, `${operation.actionId}: does not write but declares ownedTables`);
    }
  }
});

test('readDependencies are logical descriptors and are declared as such, never mistaken for physical tables', () => {
  // readDependencies use logical names such as maint.items_module_source, which deliberately do
  // not correspond to physical tables (the physical maint tables are all maint_* prefixed).
  // Only ownedTables drives the write fence, so only ownedTables must be physical. This test
  // pins that distinction so nobody "fixes" readDependencies into physical names by accident,
  // and so nobody assumes they are checkable.
  const byRole = physicalTablesByRole();
  let logicalCount = 0;

  for (const operation of loadCapabilities()) {
    for (const dependency of operation.readDependencies ?? []) {
      const [role, table] = String(dependency).split('.', 2);
      assert.ok(byRole[role], `${operation.actionId}: readDependency "${dependency}" has unknown role`);
      assert.ok(table, `${operation.actionId}: readDependency "${dependency}" has no name part`);
      if (!byRole[role].has(table)) {
        logicalCount += 1;
      }
    }
  }

  assert.ok(logicalCount > 0, 'expected some logical read dependencies; if all became physical, update this contract deliberately');
});

test('canonical item-group capability owns the exact maint relation and local projection tables', () => {
  const apply = loadCapabilities().find((operation) => (
    operation.actionId === 'item-group-canonical-apply'
  ));

  assert.ok(apply, 'item-group-canonical-apply must be registered');
  assert.deepEqual(
    apply.ownedTables.map(({ databaseRole, table }) => `${databaseRole}.${table}`).sort(),
    [
      'local.item_group_aliases',
      'local.item_group_members',
      'local.item_group_projection_state',
      'local.item_groups',
      'maint.maint_item_group_aliases',
      'maint.maint_item_group_members',
      'maint.maint_item_groups',
      'relation.relation_item_group_aliases',
      'relation.relation_item_group_members',
      'relation.relation_item_groups',
    ],
  );
});

test('NPC crawler-fact capability owns only the canonical maint fact table', () => {
  const apply = loadCapabilities().find((operation) => operation.actionId === 'npc-crawler-facts-apply');
  assert.ok(apply);
  assert.deepEqual(apply.ownedTables.map(({ databaseRole, table }) => `${databaseRole}.${table}`), [
    'maint.maint_npc_crawler_facts',
  ]);
});

test('biome apply capability owns every table written by the biome-only importer', () => {
  const apply = loadCapabilities().find((operation) => operation.actionId === 'biome-sync');
  assert.ok(apply);
  assert.deepEqual(apply.ownedTables.map(({ databaseRole, table }) => `${databaseRole}.${table}`).sort(), [
    'local.biome_relations',
    'local.biome_resources',
    'local.biomes',
    'local.item_biomes',
  ]);
});
