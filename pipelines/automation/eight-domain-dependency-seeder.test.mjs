import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDependencyInsertSql,
  buildDependencyManifest,
  seedExactDependencies,
  validateDependencyManifest,
} from './eight-domain-dependency-seeder.mjs';

const TARGET = {
  local: 'terria_v1_automation_acceptance_e8p_e1cd44a30171d90d_local',
  maint: 'terria_v1_automation_acceptance_e8p_e1cd44a30171d90d_maint',
  relation: 'terria_v1_automation_acceptance_e8p_e1cd44a30171d90d_relation',
};
const ITEMS_TARGET = {
  local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
  maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
  relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
};

test('dependency insert SQL encodes empty strings as valid utf8mb4 literals', () => {
  const sql = buildDependencyInsertSql({
    target: { table: 'source_dataset_landings' },
    columns: ['id', 'payload_json', 'source_locator'],
  }, [{ id: 1, payload_json: '{}', source_locator: '' }]);
  assert.match(sql, /CONVERT\(X'' USING utf8mb4\)/);
  assert.match(sql, /CONVERT\(X'7b7d' USING utf8mb4\)/);
  assert.doesNotMatch(sql, /CONVERT\(0x\s+USING/);
});

function dependency(overrides = {}) {
  return {
    id: 'items-for-boss',
    source: { database: 'terria_v1_local', table: 'items' },
    target: { database: TARGET.local, table: 'items' },
    keyColumns: ['id'],
    keyValues: [{ id: 42 }, { id: 43 }],
    columns: ['id', 'internal_name', 'name'],
    rowHashes: [
      { key: { id: 42 }, sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { key: { id: 43 }, sha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
    expectedRowCount: 2,
    ...overrides,
  };
}

function manifest(dependencies = [dependency()]) {
  return {
    schemaVersion: 1,
    domain: 'bosses',
    runId: 'e8pr-bosses-20261017-v1',
    runKey: 'e8p_e1cd44a30171d90d',
    dependencies,
  };
}

test('dependency manifest requires exact stable keys and bounded columns', () => {
  const result = validateDependencyManifest(manifest());
  assert.equal(result.dependencies.length, 1);
  assert.deepEqual(result.dependencies[0].keyColumns, ['id']);

  assert.throws(() => validateDependencyManifest(manifest([dependency({ keyColumns: [], keyValues: [] })])), /stable key|exact key/i);
  assert.throws(() => validateDependencyManifest(manifest([dependency({ keyColumns: ['internal_name'], keyValues: [{ internal_name: 'KingSlime' }] })])), /stable key|display/i);
  assert.throws(() => validateDependencyManifest(manifest([dependency({ keyValues: [{ id: 42 }, { id: 42 }] })])), /duplicate/i);
  assert.throws(() => validateDependencyManifest(manifest([dependency({ expectedRowCount: 3 })])), /count|truncated/i);
});

test('NPC dependency manifest permits exact local category lookup rows', () => {
  const npcManifest = {
    schemaVersion: 1,
    domain: 'npcs',
    runId: 'e8pr-npcs-20261017-v1',
    runKey: 'e8p_e6e949c02488c2b0',
    dependencies: [dependency({
      id: 'npc-category-lookup-dependencies',
      purpose: 'npc-category-lookup-dependencies',
      source: { database: 'terria_v1_local', table: 'category' },
      target: {
        database: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local',
        table: 'category',
      },
      keyColumns: ['id'],
      keyValues: [{ id: 352 }],
      columns: ['id', 'code', 'name'],
      rowHashes: [{ key: { id: 352 }, sha256: `sha256:${'a'.repeat(64)}` }],
      expectedRowCount: 1,
    })],
  };
  assert.equal(validateDependencyManifest(npcManifest).dependencies[0].target.table, 'category');
});

test('Projectile dependency manifest permits exact maintained Item rows only in its run maint schema', () => {
  const projectiles = {
    local: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_local',
    maint: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_maint',
    relation: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_relation',
  };
  const dependencyEntry = {
    id: 'projectile-explicit-item-projectile-dependencies',
    purpose: 'projectile-explicit-item-projectile-dependencies',
    source: { database: 'terria_v1_maint', table: 'maint_items' },
    target: { database: projectiles.maint, table: 'maint_items' },
    keyColumns: ['source_id'],
    keyValues: [{ source_id: 901 }],
    columns: ['source_id', 'internal_name', 'raw_json'],
    rowHashes: [{ key: { source_id: 901 }, sha256: `sha256:${'a'.repeat(64)}` }],
    expectedRowCount: 1,
  };
  const input = {
    schemaVersion: 1,
    domain: 'projectiles',
    runId: 'e8pr-projectiles-20261017-v1',
    runKey: 'e8p_cbf91b9072f33db5',
    dependencies: [dependencyEntry],
  };
  assert.equal(validateDependencyManifest(input, { databases: projectiles }).dependencies[0].target.table, 'maint_items');
  assert.throws(() => validateDependencyManifest({
    ...input,
    dependencies: [{ ...dependencyEntry, target: { database: projectiles.local, table: 'maint_items' } }],
  }, { databases: projectiles }), /not declared for projectiles/i);
});

test('dependency manifest rejects formal or broad targets and source-only whole-table declarations', () => {
  assert.throws(() => validateDependencyManifest(manifest([dependency({ target: { database: 'terria_v1_local', table: 'items' } })])), /formal|target/i);
  assert.throws(() => validateDependencyManifest(manifest([dependency({ target: { database: TARGET.local, table: '*' } })])), /table|identifier/i);
  assert.throws(() => validateDependencyManifest(manifest([dependency({ source: { database: 'terria_v1_local', table: 'items' }, keyValues: undefined })])), /key|whole-table/i);
});

test('Items dependency manifest can seed the exact source landing and selected maintained category rows but not Item business rows', () => {
  const landingDependency = {
    id: 'iteminfo-landing',
    purpose: 'iteminfo-landing',
    source: { database: 'terria_v1_local', table: 'source_dataset_landings' },
    target: { database: ITEMS_TARGET.local, table: 'source_dataset_landings' },
    keyColumns: ['id'],
    keyValues: [{ id: 6470 }],
    columns: ['id', 'dataset_type', 'provider', 'source_key', 'source_page', 'source_revision_timestamp', 'content_hash', 'payload_json', 'is_current'],
    rowHashes: [{ key: { id: 6470 }, sha256: `sha256:${'a'.repeat(64)}` }],
    expectedRowCount: 1,
  };
  const itemsManifest = {
    schemaVersion: 1,
    domain: 'items',
    runId: 'e8pr-items-20261017-v1',
    runKey: 'e8p_547b4e28fb4004a0',
    dependencies: [landingDependency, {
      id: 'selected-item-category-rows',
      purpose: 'selected-item-category-rows',
      source: { database: 'terria_v1_maint', table: 'maint_item_categories' },
      target: { database: ITEMS_TARGET.maint, table: 'maint_item_categories' },
      keyColumns: ['record_key'],
      keyValues: [{ record_key: 'a'.repeat(64) }],
      columns: ['record_key', 'item_internal_name'],
      rowHashes: [{ key: { record_key: 'a'.repeat(64) }, sha256: `sha256:${'c'.repeat(64)}` }],
      expectedRowCount: 1,
    }],
  };
  const accepted = validateDependencyManifest(itemsManifest, { databases: ITEMS_TARGET });
  assert.equal(accepted.dependencies[0].target.table, 'source_dataset_landings');
  assert.equal(accepted.dependencies[1].target.table, 'maint_item_categories');

  assert.throws(() => validateDependencyManifest({
    ...itemsManifest,
    dependencies: [{
      ...landingDependency,
      id: 'preseed-items',
      source: { database: 'terria_v1_local', table: 'items' },
      target: { database: ITEMS_TARGET.local, table: 'items' },
      columns: ['id', 'internal_name'],
      keyValues: [{ id: 2 }],
      rowHashes: [{ key: { id: 2 }, sha256: `sha256:${'b'.repeat(64)}` }],
    }],
  }, { databases: ITEMS_TARGET }), /purpose=recipe-item-dependencies/i);
});

test('Items manifest permits only purpose-bound external recipe Item and NPC identity dependencies', () => {
  const dependencies = [
    dependency({
      id: 'recipe-item-dependencies',
      purpose: 'recipe-item-dependencies',
      source: { database: 'terria_v1_local', table: 'items' },
      target: { database: ITEMS_TARGET.local, table: 'items' },
      keyValues: [{ id: 901 }],
      columns: ['id', 'internal_name'],
      rowHashes: [{ key: { id: 901 }, sha256: `sha256:${'d'.repeat(64)}` }],
      expectedRowCount: 1,
    }),
    dependency({
      id: 'recipe-maint-item-dependencies',
      purpose: 'recipe-item-maint-dependencies',
      source: { database: 'terria_v1_maint', table: 'maint_items' },
      target: { database: ITEMS_TARGET.maint, table: 'maint_items' },
      keyColumns: ['source_id'],
      keyValues: [{ source_id: 901 }],
      columns: ['source_id', 'internal_name'],
      rowHashes: [{ key: { source_id: 901 }, sha256: `sha256:${'e'.repeat(64)}` }],
      expectedRowCount: 1,
    }),
    dependency({
      id: 'item-source-local-npc-dependencies',
      purpose: 'stable-item-source-npc-dependencies-local',
      source: { database: 'terria_v1_local', table: 'npcs' },
      target: { database: ITEMS_TARGET.local, table: 'npcs' },
      keyColumns: ['id'],
      keyValues: [{ id: 123 }],
      columns: ['id', 'internal_name'],
      rowHashes: [{ key: { id: 123 }, sha256: `sha256:${'f'.repeat(64)}` }],
      expectedRowCount: 1,
    }),
  ];
  const itemsManifest = {
    schemaVersion: 1,
    domain: 'items',
    runId: 'e8pr-items-20261017-v1',
    runKey: 'e8p_547b4e28fb4004a0',
    dependencies,
  };
  assert.equal(validateDependencyManifest(itemsManifest, { databases: ITEMS_TARGET }).dependencies.length, 3);
  assert.throws(() => validateDependencyManifest({
    ...itemsManifest,
    dependencies: [{ ...dependencies[0], purpose: undefined }],
  }, { databases: ITEMS_TARGET }), /purpose=recipe-item-dependencies/i);
  assert.throws(() => validateDependencyManifest({
    ...itemsManifest,
    dependencies: [{ ...dependencies[0], purpose: 'recipe-item-dependencies', target: { database: ITEMS_TARGET.local, table: 'npcs' } }],
  }, { databases: ITEMS_TARGET }), /purpose=stable-item-source-npc-dependencies-local/i);
});

test('exact dependency seeder verifies source hashes, inserts only declared rows, and reads them back', async () => {
  const input = manifest();
  const sourceRows = [
    { id: 42, internal_name: 'KingSlime', name: 'King Slime' },
    { id: 43, internal_name: 'EyeofCthulhu', name: 'Eye of Cthulhu' },
  ];
  const targetRows = [];
  const calls = [];
  const sourceClient = {
    async query(sql, database) {
      calls.push(['source', sql, database]);
      return sourceRows.map((row) => JSON.stringify(row)).join('\n');
    },
  };
  const targetClient = {
    async query(sql, database) {
      calls.push(['target', sql, database]);
      if (/^SELECT COUNT\(\*\)/i.test(sql)) return String(targetRows.length);
      if (/^SELECT /i.test(sql)) return targetRows.map((row) => JSON.stringify(row)).join('\n');
      targetRows.push(...sourceRows);
      return '';
    },
  };
  const expected = buildDependencyManifest({ manifest: input, sourceRows });
  const result = await seedExactDependencies({
    manifest: expected,
    readonlyClient: sourceClient,
    provisionerClient: targetClient,
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.readbackVerified, true);
  assert.equal(result.dependencySeedRows, 2);
  assert.equal(result.dependencies[0].sourceRowCount, 2);
  assert.equal(result.dependencies[0].targetRowCount, 2);
  assert.equal(calls.filter(([role]) => role === 'source').length, 1);
  assert.equal(calls.filter(([role]) => role === 'target').length, 5);
  assert.ok(calls.every(([, , database]) => database !== 'terria_v1_local' || calls[0][0] === 'source'));
});

test('exact dependency seeder fails closed on source hash drift before target insert', async () => {
  const input = buildDependencyManifest({ manifest: manifest(), sourceRows: [
    { id: 42, internal_name: 'KingSlime', name: 'King Slime' },
    { id: 43, internal_name: 'EyeofCthulhu', name: 'Eye of Cthulhu' },
  ] });
  const sourceRows = [
    { id: 42, internal_name: 'KingSlime', name: 'Changed' },
    { id: 43, internal_name: 'EyeofCthulhu', name: 'Eye of Cthulhu' },
  ];
  let targetWrites = 0;
  const sourceClient = { async query() { return sourceRows.map((row) => JSON.stringify(row)).join('\n'); } };
  const targetClient = { async query(sql) { if (!/^SELECT /i.test(sql)) targetWrites += 1; return ''; } };
  await assert.rejects(() => seedExactDependencies({ manifest: input, readonlyClient: sourceClient, provisionerClient: targetClient }), /hash|drift/i);
  assert.equal(targetWrites, 0);
});

test('exact dependency seeder copies only declared selected maintained category rows', async () => {
  const input = buildDependencyManifest({
    manifest: {
      schemaVersion: 1,
      domain: 'items',
      runId: 'e8pr-items-20261017-v1',
      runKey: 'e8p_547b4e28fb4004a0',
      dependencies: [{
        id: 'selected-item-category-rows',
        purpose: 'selected-item-category-rows',
        source: { database: 'terria_v1_maint', table: 'maint_item_categories' },
        target: { database: ITEMS_TARGET.maint, table: 'maint_item_categories' },
        keyColumns: ['record_key'],
        keyValues: [{ record_key: 'a'.repeat(64) }],
        columns: ['record_key', 'item_internal_name'],
        rowHashes: [{ key: { record_key: 'a'.repeat(64) }, sha256: `sha256:${'a'.repeat(64)}` }],
        expectedRowCount: 1,
      }],
    },
    sourceRows: { 'selected-item-category-rows': [{ record_key: 'a'.repeat(64), item_internal_name: 'Item2' }] },
  });
  const rows = [{ record_key: 'a'.repeat(64), item_internal_name: 'Item2' }];
  const targets = [];
  const readonlyClient = { async query() { return rows.map((row) => JSON.stringify(row)).join('\n'); } };
  const provisionerClient = {
    async query(sql) {
      if (/^SELECT COUNT\(\*\)/i.test(sql)) return String(targets.length);
      if (/^SELECT JSON_OBJECT/i.test(sql)) return targets.map((row) => JSON.stringify(row)).join('\n');
      if (/^INSERT INTO/i.test(sql)) { targets.push(...rows); return ''; }
      return '';
    },
  };
  const evidence = await seedExactDependencies({ manifest: input, databases: ITEMS_TARGET, readonlyClient, provisionerClient });
  assert.equal(evidence.readbackVerified, true);
  assert.equal(evidence.dependencies[0].targetRowCount, 1);
  assert.equal(evidence.dependencies[0].targetTableCount, 1);
  assert.equal(targets.length, 1);
});

test('NPC category dependencies append exact nonconflicting rows and preserve migration defaults', async () => {
  const sourceRows = [{ id: 352, code: 'CATEGORY_NPC', name: 'NPC' }];
  const dependencyManifest = buildDependencyManifest({
    manifest: {
      schemaVersion: 1,
      domain: 'npcs',
      runId: 'e8pr-npcs-20261017-v1',
      runKey: 'e8p_e6e949c02488c2b0',
      dependencies: [dependency({
        id: 'npc-category-lookup-dependencies',
        purpose: 'npc-category-lookup-dependencies',
        source: { database: 'terria_v1_local', table: 'category' },
        target: { database: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local', table: 'category' },
        keyValues: [{ id: 352 }],
        columns: ['id', 'code', 'name'],
        rowHashes: [{ key: { id: 352 }, sha256: `sha256:${'a'.repeat(64)}` }],
        expectedRowCount: 1,
        targetPolicy: 'append-exact',
        conflictColumns: ['id', 'code'],
      })],
    },
    sourceRows: { 'npc-category-lookup-dependencies': sourceRows },
  });
  const migrationRows = [{ id: 1, code: 'WEAPON', name: 'Weapon' }];
  const targetRows = [...migrationRows];
  const sourceClient = { async query() { return sourceRows.map((row) => JSON.stringify(row)).join('\n'); } };
  const targetClient = {
    async query(sql) {
      if (/^SELECT COUNT\(\*\)/i.test(sql)) return String(targetRows.length);
      if (/WHERE \(?`id` = 352/i.test(sql)) return targetRows.filter((row) => row.id === 352).map((row) => JSON.stringify(row)).join('\n');
      if (/ORDER BY `id`$/i.test(sql)) return targetRows.map((row) => JSON.stringify(row)).join('\n');
      if (/^INSERT INTO/i.test(sql)) { targetRows.push(...sourceRows); return ''; }
      throw new Error(`unexpected target query: ${sql}`);
    },
  };
  const result = await seedExactDependencies({
    manifest: dependencyManifest,
    databases: {
      local: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local',
      maint: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_maint',
      relation: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_relation',
    },
    readonlyClient: sourceClient,
    provisionerClient: targetClient,
  });
  assert.deepEqual(targetRows.map((row) => row.code), ['WEAPON', 'CATEGORY_NPC']);
  assert.equal(result.dependencies[0].targetTableCount, 2);
  assert.equal(result.dependencies[0].preservedTargetRowCount, 1);
  assert.equal(result.readbackVerified, true);
});

test('NPC append-exact category dependency rejects ID or code conflicts before insert', async () => {
  const sourceRows = [{ id: 352, code: 'CATEGORY_NPC', name: 'NPC' }];
  const dependencyManifest = buildDependencyManifest({
    manifest: {
      schemaVersion: 1,
      domain: 'npcs',
      runId: 'e8pr-npcs-20261017-v1',
      runKey: 'e8p_e6e949c02488c2b0',
      dependencies: [dependency({
        id: 'npc-category-lookup-dependencies',
        purpose: 'npc-category-lookup-dependencies',
        source: { database: 'terria_v1_local', table: 'category' },
        target: { database: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local', table: 'category' },
        keyValues: [{ id: 352 }],
        columns: ['id', 'code', 'name'],
        rowHashes: [{ key: { id: 352 }, sha256: `sha256:${'a'.repeat(64)}` }],
        expectedRowCount: 1,
        targetPolicy: 'append-exact',
        conflictColumns: ['id', 'code'],
      })],
    },
    sourceRows: { 'npc-category-lookup-dependencies': sourceRows },
  });
  const migrationRows = [{ id: 1, code: 'CATEGORY_NPC', name: 'Migration NPC' }];
  let inserted = false;
  const readonlyClient = { async query() { return sourceRows.map((row) => JSON.stringify(row)).join('\n'); } };
  const provisionerClient = {
    async query(sql) {
      if (/^SELECT COUNT\(\*\)/i.test(sql)) return String(migrationRows.length);
      if (/ORDER BY `id`$/i.test(sql)) return migrationRows.map((row) => JSON.stringify(row)).join('\n');
      if (/^INSERT INTO/i.test(sql)) { inserted = true; return ''; }
      throw new Error(`unexpected target query: ${sql}`);
    },
  };
  await assert.rejects(() => seedExactDependencies({
    manifest: dependencyManifest,
    databases: {
      local: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local',
      maint: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_maint',
      relation: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_relation',
    },
    readonlyClient,
    provisionerClient,
  }), /existing category row conflicts with declared NPC dependency/i);
  assert.equal(inserted, false);
});

test('exact dependency seeder combines disjoint row manifests for one run-owned source landing table', async () => {
  const columns = ['id', 'dataset_type', 'source_key', 'source_page', 'payload_json', 'is_current'];
  const dependencies = [
    {
      id: 'iteminfo-landing',
      purpose: 'iteminfo-landing',
      source: { database: 'terria_v1_local', table: 'source_dataset_landings' },
      target: { database: ITEMS_TARGET.local, table: 'source_dataset_landings' },
      keyColumns: ['id'],
      keyValues: [{ id: 6470 }],
      columns,
      rowHashes: [{ key: { id: 6470 }, sha256: `sha256:${'0'.repeat(64)}` }],
      expectedRowCount: 1,
    },
    {
      id: 'selected-item-category-landings',
      purpose: 'selected-item-category-landings',
      source: { database: 'terria_v1_local', table: 'source_dataset_landings' },
      target: { database: ITEMS_TARGET.local, table: 'source_dataset_landings' },
      keyColumns: ['id'],
      keyValues: [{ id: 2 }],
      columns,
      rowHashes: [{ key: { id: 2 }, sha256: `sha256:${'1'.repeat(64)}` }],
      expectedRowCount: 1,
    },
  ];
  const input = {
    schemaVersion: 1,
    domain: 'items',
    runId: 'e8pr-items-20261017-v1',
    runKey: 'e8p_547b4e28fb4004a0',
    dependencies,
  };
  const sourceRows = [
    { id: 6470, dataset_type: 'items_raw', source_key: 'wiki.module.iteminfo', source_page: 'Module:Iteminfo/data', payload_json: '{}', is_current: 1 },
    { id: 2, dataset_type: 'categories_raw', source_key: 'wiki.category', source_page: 'Item2', payload_json: '{}', is_current: 1 },
  ];
  const manifest = buildDependencyManifest({ manifest: input, sourceRows: {
    'iteminfo-landing': [sourceRows[0]],
    'selected-item-category-landings': [sourceRows[1]],
  } });
  const targetRows = [];
  const sourceClient = {
    async query(sql) {
      const id = Number(sql.match(/`id` = (\d+)/)?.[1]);
      return JSON.stringify(sourceRows.find((row) => row.id === id));
    },
  };
  const targetClient = {
    async query(sql) {
      if (/^SELECT COUNT\(\*\)/i.test(sql)) return String(targetRows.length);
      if (/^SELECT /i.test(sql)) {
        const ids = [...sql.matchAll(/`id` = (\d+)/g)].map((match) => Number(match[1]));
        return targetRows.filter((row) => ids.includes(row.id)).map((row) => JSON.stringify(row)).join('\n');
      }
      targetRows.push(...sourceRows.filter((row) => !targetRows.some((existing) => existing.id === row.id)));
      return '';
    },
  };

  const result = await seedExactDependencies({ manifest, databases: ITEMS_TARGET, readonlyClient: sourceClient, provisionerClient: targetClient });
  assert.equal(result.status, 'verified');
  assert.equal(result.dependencySeedRows, 2);
  assert.deepEqual(targetRows.map((row) => row.id).sort((a, b) => a - b), [2, 6470]);
  assert.ok(result.dependencies.every((entry) => entry.targetTableCount === 2 && entry.readbackVerified));
});
