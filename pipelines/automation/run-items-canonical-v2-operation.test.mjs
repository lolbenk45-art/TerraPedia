import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemsCanonicalV2Diff,
  buildItemsCanonicalV2MaintCandidate,
  buildItemsCanonicalV2Plan,
  executeItemsCanonicalV2DatabaseImport,
} from './items-canonical-v2-db-executor.mjs';
import {
  ITEMS_CANONICAL_V2_OPERATION_ID,
  buildItemsCanonicalV2ExecutionPlan,
  runItemsCanonicalV2Operation,
} from './run-items-canonical-v2-operation.mjs';

const H = (letter) => `sha256:${letter.repeat(64)}`;

const OWNED_TABLES = [
  ['local', 'source_dataset_landings'], ['local', 'category'], ['local', 'item_images'],
  ['local', 'item_acquisition_sources'], ['local', 'recipes'], ['local', 'recipe_ingredients'],
  ['local', 'recipe_stations'], ['local', 'item_biomes'], ['local', 'biome_resources'],
  ['maint', 'maint_items'], ['maint', 'maint_item_categories'], ['maint', 'maint_item_images'],
  ['maint', 'maint_item_recipes'], ['maint', 'maint_item_sources'], ['maint', 'maint_item_biomes'],
  ['relation', 'relation_items'], ['relation', 'relation_item_images'], ['relation', 'relation_item_rarities'],
  ['relation', 'category_nodes'], ['relation', 'item_category_assignments'], ['relation', 'item_recipe_heads'],
  ['relation', 'item_recipe_ingredients'], ['relation', 'item_recipe_stations'], ['relation', 'item_source_facts'],
  ['relation', 'item_source_details'], ['relation', 'item_npc_shop_relations'], ['relation', 'item_npc_loot_relations'],
  ['relation', 'item_npc_relation_audits'], ['relation', 'item_biome_relations'], ['relation', 'projection_items'],
].map(([databaseRole, table]) => ({ databaseRole, table, fieldGroup: 'canonical_owned_rows', logicalPredicateHash: H('a') }));

const POLICY_OWNED_TABLES = [
  { databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' },
  ...OWNED_TABLES,
];

function baselineTablesWithLanding(scopes) {
  return Object.fromEntries(scopes.map((scope) => [
    scope.table,
    scope.table === 'source_dataset_landings' ? [{
      id: 55,
      dataset_type: 'items_raw',
      provider: 'terraria.wiki.gg',
      source_key: 'wiki.module.iteminfo',
      source_page: 'Module:Iteminfo/data',
      source_revision_timestamp: '2026-03-09 22:52:58',
      content_hash: 'old-content-hash',
      payload_json: '{}',
      fetched_at: '2026-03-09 22:52:58',
      parsed_at: '2026-03-09 22:52:58',
      parse_status: 'ok',
      artifact_role: 'source_evidence',
      producer_id: 'legacy',
      producer_version: '1',
      producer_run_key: 'legacy',
      is_current: 1,
      full_file_content_hash: 'old-content-hash',
      full_file_byte_size: 0,
      notes: null,
    }] : [],
  ]));
}

function sourceFixture() {
  return {
    path: 'reports/runtime/source-probe-snapshots/items.json',
    sha256: H('b'),
    payload: {
      datasets: {
        items: {
          entity: 'items',
          upstreamMeta: {
            sourceRevisionTimestamp: '2026-08-22T03:26:22Z',
            sourcePageTitle: 'Module:Iteminfo/data',
            wikiVersion: '1.4.5.7',
          },
          records: [{
            id: 1,
            internalName: 'IronPickaxe',
            name: 'Iron Pickaxe',
            categoryCode: 'MATERIAL',
            stats: { damage: 5, defense: 0, knockback: 2, useTime: 20, width: 24, height: 28 },
            economy: { buy: 0, sell: 0 },
            stack: { isStackable: false, stackSize: 1 },
            rarityId: 1,
          }],
        },
        itemRelations: { records: { itemSources: [], itemImages: [], recipes: [], itemBiomes: [], biomes: [] } },
      },
    },
  };
}

function writeBoundSourceFixture(root, { moduleContentOverride = null } = {}) {
  const payload = sourceFixture().payload;
  const sourceBytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  const sourcePath = path.join(root, 'source.json');
  fs.writeFileSync(sourcePath, sourceBytes);
  const moduleContent = moduleContentOverride
    ?? 'return { ["data"] = [=====[{"_terrariaversion":"1.4.5.7","1":{"name":"Iron Pickaxe","internalName":"IronPickaxe"}}]=====] }';
  const contentHash = `sha256:${createHash('sha256').update(moduleContent, 'utf8').digest('hex')}`;
  const sourceRunIdentity = '2026-10-25T09:02:07.554Z';
  const probeStateHash = H('e');
  const snapshot = {
    schemaVersion: 1,
    sourceKey: 'wiki.module.iteminfo',
    sourceFingerprint: contentHash,
    checkedAt: sourceRunIdentity,
    revisionId: 101,
    revisionTimestamp: '2026-08-22T03:26:22Z',
    metadataOnly: false,
    probeStateHash,
    payload: {
      moduleTitle: 'Module:Iteminfo/data',
      pageTitle: 'Module:Iteminfo/data',
      revisionId: 101,
      revisionTimestamp: '2026-08-22T03:26:22Z',
      moduleContent,
    },
  };
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  const snapshotPath = path.join(root, 'snapshot.json');
  fs.writeFileSync(snapshotPath, snapshotBytes, { mode: 0o600 });
  const sourceDispatchIdentity = {
    sourceFingerprint: contentHash,
    sourceRunIdentity,
    sourceContentIdentity: H('f'),
  };
  return {
    source: {
      path: 'source.json',
      sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
      upstreamMeta: payload.datasets.items.upstreamMeta,
    },
    sourceDispatchIdentity,
    sourceSnapshotBinding: {
      path: 'snapshot.json',
      snapshotHash: `sha256:${createHash('sha256').update(snapshotBytes).digest('hex')}`,
      sourceKey: snapshot.sourceKey,
      sourceFingerprint: contentHash,
      sourceRunIdentity,
      sourceContentIdentity: sourceDispatchIdentity.sourceContentIdentity,
      probeStateHash,
      revisionId: snapshot.revisionId,
      revisionTimestamp: snapshot.revisionTimestamp,
      contentHash,
    },
  };
}

test('Items V2 execution plan is the exact canonical three-database allowlist', () => {
  const plan = buildItemsCanonicalV2ExecutionPlan({
    source: sourceFixture(),
    ownedTables: OWNED_TABLES,
    dependencyEvidence: { complete: true, unresolvedCount: 0, duplicateCount: 0 },
    currentPolicy: { policyVersion: 3, policyHash: H('c'), policySetHash: H('d'), level: 'L2', operationalState: 'ACTIVE' },
  });
  assert.equal(plan.operationId, ITEMS_CANONICAL_V2_OPERATION_ID);
  assert.deepEqual(plan.stageOrder, ['landing', 'maint', 'relation', 'projection', 'local']);
  assert.deepEqual(plan.tables.map((entry) => `${entry.databaseRole}.${entry.table}`), OWNED_TABLES.map((entry) => `${entry.databaseRole}.${entry.table}`));
  assert.equal(plan.deletesAllowed, false);
});

test('Items V2 locked plan counts every executed table and keeps untouched owned tables at zero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-plan-'));
  try {
    const frozenSource = writeBoundSourceFixture(root);
    const currentTables = baselineTablesWithLanding(POLICY_OWNED_TABLES);
    let relationMaintItems = [];
    const plan = await buildItemsCanonicalV2Plan({
      connection: { query: async () => [[]] },
      bundle: {
        source: frozenSource.source,
        sourceDispatchIdentity: frozenSource.sourceDispatchIdentity,
        importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z', sourceSnapshotBinding: frozenSource.sourceSnapshotBinding },
        policy: { policySetHash: H('d') },
      },
      ownedTables: POLICY_OWNED_TABLES,
      current: {
        tables: currentTables,
        dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] },
        policySetHash: H('d'),
      },
      repoRoot: root,
      buildRelationResultsImpl: async (_connection, _repoRoot, { maintItemsOverride }) => {
        relationMaintItems = maintItemsOverride;
        return {
          results: {
            relationItems: [{ id: 10, sourceId: 1, internalName: 'IronPickaxe', recordKey: 'item-1' }],
            categoryNodes: [{ recordKey: 'category-material', nodeKey: 'material' }],
            projectionItems: [{ id: 1, internalName: 'IronPickaxe', relationRecordKey: 'item-1' }],
          },
        };
      },
    });

    assert.deepEqual(relationMaintItems.map(({ source_id, landing_source_id }) => ({ source_id, landing_source_id })), [
      { source_id: 1, landing_source_id: 55 },
    ]);
    const counts = new Map(plan.diff.scopes.map((scope) => [scope.table, { inserts: scope.inserts, updates: scope.updates }]));
    for (const table of ['maint_items', 'items', 'relation_items', 'category_nodes', 'projection_items']) {
      assert.equal(counts.get(table).inserts, 1, `${table} insert must be counted before apply`);
    }
    assert.equal(counts.get('source_dataset_landings').updates, 1);
    for (const table of ['category', 'item_images', 'item_acquisition_sources', 'recipes', 'relation_item_images']) {
      assert.deepEqual(counts.get(table), { inserts: 0, updates: 0 }, `${table} is preserved when there is no candidate write`);
    }
    assert.deepEqual(plan.writes.local.inserts.map((row) => row.id), [1]);
    assert.deepEqual(plan.writes.relation.category_nodes.inserts.map((row) => row.record_key), ['category-material']);
    assert.deepEqual(plan.writes.relation.relation_items.inserts.map((row) => row.record_key), ['item-1']);
    assert.deepEqual(plan.writes.projection.inserts.map((row) => row.id), [1]);
    const landing = plan.writes.landing.updates[0];
    const landingSource = JSON.parse(landing.payload_json);
    assert.equal(landing.dataset_type, 'items_raw');
    assert.equal(landing.source_key, 'wiki.module.iteminfo');
    assert.match(landingSource.moduleContent, /IronPickaxe/);
    assert.equal(landing.content_hash, frozenSource.sourceSnapshotBinding.contentHash.slice(7));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 plan blocks a local row whose id is not the frozen Wiki Item id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-id-drift-'));
  try {
    const frozenSource = writeBoundSourceFixture(root);
    const currentTables = baselineTablesWithLanding(POLICY_OWNED_TABLES);
    currentTables.items = [{ id: 9001, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', category_id: 4 }];
    await assert.rejects(() => buildItemsCanonicalV2Plan({
      connection: { query: async () => [[]] },
      bundle: {
        source: frozenSource.source,
        sourceDispatchIdentity: frozenSource.sourceDispatchIdentity,
        importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z', sourceSnapshotBinding: frozenSource.sourceSnapshotBinding },
        policy: { policySetHash: H('d') },
      },
      ownedTables: POLICY_OWNED_TABLES,
      current: { tables: currentTables, dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] }, policySetHash: H('d') },
      repoRoot: root,
      buildRelationResultsImpl: async () => ({ results: {} }),
    }), /local Item ID.*source ID/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 executor applies only the cached locked plan and verifies each written table', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-execute-plan-'));
  try {
    const frozenSource = writeBoundSourceFixture(root);
    const currentTables = baselineTablesWithLanding(POLICY_OWNED_TABLES);
    const bundle = {
      source: frozenSource.source,
      sourceDispatchIdentity: frozenSource.sourceDispatchIdentity,
      importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z', sourceSnapshotBinding: frozenSource.sourceSnapshotBinding },
      policy: { policySetHash: H('d') },
      ownedTables: POLICY_OWNED_TABLES,
    };
    const plan = await buildItemsCanonicalV2Plan({
      connection: { query: async () => [[]] },
      bundle,
      ownedTables: POLICY_OWNED_TABLES,
      current: {
        tables: currentTables,
        dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] },
        policySetHash: H('d'),
      },
      repoRoot: root,
      buildRelationResultsImpl: async () => ({
        results: {
          relationItems: [{ sourceId: 1, internalName: 'IronPickaxe', recordKey: 'item-1' }],
          categoryNodes: [{ recordKey: 'category-material', nodeKey: 'material' }],
          projectionItems: [{ id: 1, internalName: 'IronPickaxe', relationRecordKey: 'item-1' }],
        },
      }),
    });

    const writes = [];
    const expectedLanding = plan.writes.landing.updates[0];
    assert.equal(plan.writes.maint.inserts[0].landing_source_id, 55);
    const expectedMaint = plan.writes.maint.inserts[0];
    const expectedItems = plan.writes.local.inserts[0];
    const expectedRelation = plan.writes.relation.relation_items.inserts[0];
    const expectedCategory = plan.writes.relation.category_nodes.inserts[0];
    const expectedProjection = plan.writes.projection.inserts[0];
    const connection = {
      async query(sql) {
        if (/^USE /.test(sql)) return [[]];
        if (/SELECT id, code FROM `?category`?/.test(sql)) return [[{ id: 4, code: 'MATERIAL' }]];
        if (/FROM items WHERE deleted = 0/.test(sql)) return [[]];
        if (/SELECT id FROM `terria_v1_local`\.`source_dataset_landings` WHERE/.test(sql)) return [[{ id: 55 }]];
        if (/FROM `terria_v1_local`\.`source_dataset_landings` WHERE/.test(sql)) return [[expectedLanding]];
        if (/FROM `terria_v1_maint`\.`maint_items` WHERE/.test(sql)) return [[expectedMaint]];
        if (/FROM `terria_v1_relation`\.`relation_items` WHERE/.test(sql)) return [[expectedRelation]];
        if (/FROM `terria_v1_relation`\.`category_nodes` WHERE/.test(sql)) return [[expectedCategory]];
        if (/FROM `terria_v1_relation`\.`projection_items` WHERE/.test(sql)) return [[expectedProjection]];
        if (/FROM `terria_v1_local`\.`items` WHERE/.test(sql)) return [[expectedItems]];
        if (/SELECT id, internal_name, name, defense, damage FROM/.test(sql)) return [[expectedItems]];
        if (/SELECT source_id, internal_name, landing_source_key, landing_content_hash FROM/.test(sql)) return [[expectedMaint]];
        if (/SELECT source_id, internal_name, record_key FROM/.test(sql)) return [[expectedRelation]];
        if (/SELECT id, internal_name, relation_record_key FROM/.test(sql)) return [[expectedProjection]];
        return [[]];
      },
      async execute(sql, params) {
        writes.push({ sql, params });
        return [{ affectedRows: 1, insertId: 1 }];
      },
    };
    const result = await executeItemsCanonicalV2DatabaseImport({ connection, bundle, repoRoot: root, executionPlan: plan });

    const writtenTables = writes.map(({ sql }) => {
      return sql.match(/INSERT INTO `[^`]+`\.`([^`]+)`/)?.[1]
        ?? sql.match(/INSERT INTO `?([a-z_]+)`?/)?.[1];
    });
    assert.ok(writes.length > 0);
    assert.ok(result.readback.verified);
    assert.equal(result.readback.writeRows.source_dataset_landings.rowCount, 1);
    assert.equal(result.readback.writeRows.maint_items.rowCount, 1);
    assert.equal(result.readback.writeRows.items.rowCount, 1);
    assert.equal(result.receipts.find((receipt) => receipt.stage === 'landing').updated, 1);
    assert.deepEqual(new Set(writtenTables), new Set([
      'source_dataset_landings', 'maint_items', 'items', 'relation_items', 'category_nodes', 'projection_items',
    ]));
    assert.equal(writes.some(({ sql }) => /^\s*(?:DELETE|TRUNCATE)\b/i.test(sql)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 diff includes the source landing insert required by the executor', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-diff-'));
  try {
    const frozenSource = writeBoundSourceFixture(root);
    const scopes = POLICY_OWNED_TABLES.map((scope) => ({ ...scope }));
    const current = {
      tables: baselineTablesWithLanding(scopes),
      dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] },
    };
    const diff = await buildItemsCanonicalV2Diff({
      connection: { query: async () => [[]] },
      bundle: {
        source: frozenSource.source,
        sourceDispatchIdentity: frozenSource.sourceDispatchIdentity,
        importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z', sourceSnapshotBinding: frozenSource.sourceSnapshotBinding },
      },
      ownedTables: scopes,
      current,
      repoRoot: root,
      buildRelationResultsImpl: async () => ({ results: {} }),
    });

    const landing = diff.scopes.find((scope) => scope.table === 'source_dataset_landings');
    assert.equal(landing.updates, 1);
    assert.equal(landing.updatedKeys.length, 1);
    const landingEvidence = diff.rowLevelEvidence.scopes.find((scope) => scope.table === 'source_dataset_landings');
    assert.equal(landingEvidence.baselineRowCount, 1);
    assert.equal(landingEvidence.candidateRowCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 refuses to build a canonical landing without the immutable raw module snapshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-missing-raw-snapshot-'));
  let relationReads = 0;
  try {
    const source = sourceFixture();
    const sourcePath = path.join(root, 'source.json');
    const sourceBytes = Buffer.from(`${JSON.stringify(source.payload)}\n`);
    fs.writeFileSync(sourcePath, sourceBytes);
    const currentTables = Object.fromEntries(POLICY_OWNED_TABLES.map((scope) => [scope.table, []]));
    await assert.rejects(() => buildItemsCanonicalV2Plan({
      connection: { query: async () => [[]] },
      bundle: {
        source: { path: 'source.json', sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}` },
        importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z' },
        policy: { policySetHash: H('d') },
      },
      ownedTables: POLICY_OWNED_TABLES,
      current: { tables: currentTables, dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] }, policySetHash: H('d') },
      repoRoot: root,
      buildRelationResultsImpl: async () => { relationReads += 1; return { results: {} }; },
    }), /probe-bound immutable module source snapshot/i);
    assert.equal(relationReads, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 plan blocks raw Item IDs missing from normalized executor records', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'items-v2-normalization-gap-'));
  let relationReads = 0;
  try {
    const frozenSource = writeBoundSourceFixture(root, {
      moduleContentOverride: 'return { ["data"] = [=====[{"_terrariaversion":"1.4.5.7","1":{"name":"Iron Pickaxe","internalName":"IronPickaxe"},"2":{"name":"Dirt Block","internalName":"DirtBlock"}}]=====] }',
    });
    const currentTables = Object.fromEntries(POLICY_OWNED_TABLES.map((scope) => [scope.table, []]));
    await assert.rejects(() => buildItemsCanonicalV2Plan({
      connection: { query: async () => [[]] },
      bundle: {
        source: frozenSource.source,
        sourceDispatchIdentity: frozenSource.sourceDispatchIdentity,
        importPlan: { sourceCheckedAt: '2026-10-25T09:02:07.554Z', sourceSnapshotBinding: frozenSource.sourceSnapshotBinding },
        policy: { policySetHash: H('d') },
      },
      ownedTables: POLICY_OWNED_TABLES,
      current: { tables: currentTables, dependencyTables: { categories: [{ id: 4, code: 'MATERIAL' }] }, policySetHash: H('d') },
      repoRoot: root,
      buildRelationResultsImpl: async () => { relationReads += 1; return { results: {} }; },
    }), /normalized source identity mismatch: missing=1, foreign=0/i);
    assert.equal(relationReads, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Items V2 maint candidate preserves prior lineage when source-owned values are unchanged', () => {
  const record = {
    id: 1,
    internalName: 'Wood',
    name: 'Wood',
    categoryCode: 'MATERIAL',
    stats: { damage: 0, defense: 0, useTime: 15, width: 12, height: 12 },
    economy: { buy: 0 },
    stack: { stackSize: 9999 },
  };
  const existing = {
    source_id: 1,
    internal_name: 'Wood',
    english_name: 'Wood',
    name_zh: '木材',
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: '2026-08-22 03:26:22',
    landing_source_id: 10,
    landing_source_key: 'old-source-key',
    landing_source_page: 'Module:Iteminfo/data',
    landing_content_hash: 'old-content-hash',
    landing_fetched_at: '2026-08-22 03:26:22',
    landing_parsed_at: '2026-08-22 03:26:22',
    module_generated_at: null,
    terraria_version: '1.4.4.9',
    canonical_version: '1.4.4.9',
    major_value: 0,
    combat_value: 0,
    defense_value: 0,
    use_time: 15,
    stack_size: 9999,
    width: 12,
    height: 12,
    flags_json: null,
    raw_json: JSON.stringify(record),
    status: 1,
    deleted: 0,
  };
  const landing = { id: 77 };
  const identity = {
    sourceKey: 'new-source-key',
    contentHash: 'new-content-hash',
    sourceRevisionTimestamp: '2026-10-25 09:02:07',
  };

  assert.equal(buildItemsCanonicalV2MaintCandidate(record, existing, landing, identity), null);

  const changed = buildItemsCanonicalV2MaintCandidate({
    ...record,
    stats: { ...record.stats, damage: 1 },
  }, existing, landing, identity);
  assert.equal(changed.combat_value, 1);
  assert.equal(changed.landing_source_id, 77);
  assert.equal(changed.landing_source_key, 'new-source-key');

  const localOnlyChange = buildItemsCanonicalV2MaintCandidate({
    ...record,
    tooltip: 'updated tooltip',
  }, existing, landing, identity);
  assert.equal(localOnlyChange, null);
  const forcedLineageRefresh = buildItemsCanonicalV2MaintCandidate({
    ...record,
    tooltip: 'updated tooltip',
  }, existing, landing, identity, { forceUpdate: true });
  assert.equal(JSON.parse(forcedLineageRefresh.raw_json).tooltip, 'updated tooltip');
  assert.equal(forcedLineageRefresh.landing_source_key, 'new-source-key');
});

test('Items V2 executor consumes one frozen source, runs serial stages, and acknowledges only after independent readback', async () => {
  const calls = [];
  const result = await runItemsCanonicalV2Operation({
    plan: buildItemsCanonicalV2ExecutionPlan({
      source: sourceFixture(), ownedTables: OWNED_TABLES,
      dependencyEvidence: { complete: true, unresolvedCount: 0, duplicateCount: 0 },
      currentPolicy: { policyVersion: 3, policyHash: H('c'), policySetHash: H('d'), level: 'L2', operationalState: 'ACTIVE' },
    }),
    readSource: async () => { calls.push('source'); return sourceFixture().payload; },
    runStage: async ({ stage }) => { calls.push(stage); return { stage, inserted: 1, updated: 1, retired: 0, deleted: 0, receiptHash: H('e') }; },
    readback: async () => { calls.push('readback'); return { verified: true, rowCounts: { items: 1, maint_items: 1, relation_items: 1, projection_items: 1 } }; },
    acknowledge: async () => { calls.push('acknowledge'); },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['source', 'landing', 'maint', 'relation', 'projection', 'local', 'readback', 'acknowledge']);
  assert.equal(result.readback.verified, true);
});

test('Items V2 executor fails before acknowledgement when any stage retires or deletes rows', async () => {
  const plan = buildItemsCanonicalV2ExecutionPlan({
    source: sourceFixture(), ownedTables: OWNED_TABLES,
    dependencyEvidence: { complete: true, unresolvedCount: 0, duplicateCount: 0 },
    currentPolicy: { policyVersion: 3, policyHash: H('c'), policySetHash: H('d'), level: 'L2', operationalState: 'ACTIVE' },
  });
  let acknowledged = false;
  await assert.rejects(() => runItemsCanonicalV2Operation({
    plan,
    readSource: async () => sourceFixture().payload,
    runStage: async ({ stage }) => ({ stage, inserted: 0, updated: 0, retired: stage === 'relation' ? 1 : 0, deleted: 0, receiptHash: H('e') }),
    readback: async () => ({ verified: true }),
    acknowledge: async () => { acknowledged = true; },
  }), /delete|retire|retired/i);
  assert.equal(acknowledged, false);
});
