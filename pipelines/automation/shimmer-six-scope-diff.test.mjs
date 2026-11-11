import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getVerifiedStructuredScopeDefinition } from './l2-automatic-ceiling.mjs';
import { buildStructuredRowLevelL2Diff, buildReadOnlyAutomaticL2Diff } from './l2-read-only-diff-producer.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import { buildShimmerImportProjection, buildShimmerImportPreview, loadVerifiedShimmerImportBundle } from '../import/import-wiki-shimmer-to-db.mjs';
import { applyFrozenDomainImport } from './run-supplementary-domain-l1-operation.mjs';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';
import { SHIMMER_POLICY_SCOPES } from './shimmer-policy-scope-transition.mjs';

function fixture() {
  const context = { code: 'SHIMMER', name_en: 'Shimmer', name_zh: '微光',
    context_type: 'ENVIRONMENT', description: null, icon_url: null, sort_order: 30, status: 1, deleted: 0 };
  const snapshot = { entity_type: 'wiki_shimmer_page', provider: 'wiki_zh', source_kind: 'wiki_page',
    source_locator: 'data/generated/shimmer/generations/example/wiki-shimmer.raw.json', source_page: '微光',
    source_revision_timestamp: '2026-09-29 12:00:00', fetched_at: '2026-09-29 12:05:00',
    payload_sha256: `sha256:${'a'.repeat(64)}`, is_current: 1, parse_status: 'parsed' };
  const current = { tables: Object.fromEntries(SHIMMER_POLICY_SCOPES.map((scope) => [scope.table,
    scope.table === 'world_contexts' ? [context, { code: 'RAIN' }]
      : scope.table === 'entity_source_snapshots' ? [snapshot, { provider: 'wiki_zh', source_page: '其他' }]
        : [],
  ])) };
  const candidateTables = SHIMMER_POLICY_SCOPES.map((scope) => {
    const contract = getVerifiedStructuredScopeDefinition('shimmer', scope);
    assert.ok(contract, `missing six-scope schema contract: ${scope.table}`);
    return {
      ...scope, keyColumns: contract.keyColumns, compareColumns: contract.compareColumns,
      numericColumns: contract.numericColumns, jsonColumns: contract.jsonColumns, mutationKind: contract.mutationKind,
      rows: scope.table === 'world_contexts' ? [structuredClone(context)]
        : scope.table === 'entity_source_snapshots' ? [structuredClone(snapshot)] : [],
    };
  });
  return { domainId: 'shimmer', ownedTables: SHIMMER_POLICY_SCOPES,
    sourceCheckedAt: '2026-09-29T12:05:00.000Z', executionTime: '2026-09-29T12:06:00.000Z',
    current, candidateTables };
}

test('six-scope row diff includes context and lineage while excluding unrelated partitions', () => {
  const value = fixture();
  const diff = buildStructuredRowLevelL2Diff(value);
  assert.equal(diff.scopes.length, 6);
  assert.equal(diff.counts.inserts, 0);
  assert.equal(diff.counts.updates, 0);
  assert.equal(diff.counts.softDisables, 0);
  assert.equal(diff.scopes.find((s) => s.table === 'world_contexts').entityBaselineCount, 1);
  assert.equal(diff.scopes.find((s) => s.table === 'entity_source_snapshots').entityBaselineCount, 1);
});

test('six-scope diff detects context and snapshot payload changes', () => {
  const value = fixture();
  value.candidateTables.find((s) => s.table === 'world_contexts').rows[0].name_zh = '微光区域';
  value.candidateTables.find((s) => s.table === 'entity_source_snapshots').rows[0].payload_sha256 = `sha256:${'b'.repeat(64)}`;
  const diff = buildStructuredRowLevelL2Diff(value);
  assert.equal(diff.counts.updates, 2);
  assert.equal(diff.counts.inserts, 0);
});

for (const table of ['world_contexts', 'entity_source_snapshots']) {
  test(`six-scope diff rejects a candidate outside ${table}'s exact partition`, () => {
    const value = fixture();
    const row = value.candidateTables.find((s) => s.table === table).rows[0];
    if (table === 'world_contexts') row.code = 'RAIN';
    else row.source_page = '其他';
    assert.throws(() => buildStructuredRowLevelL2Diff(value), /outside|partition|scope/);
  });
}

test('unknown predicate and incomplete six-scope claims cannot use registered schema contracts', () => {
  const value = fixture();
  const wrong = { ...SHIMMER_POLICY_SCOPES[0], logicalPredicateHash: `sha256:${'f'.repeat(64)}` };
  assert.equal(getVerifiedStructuredScopeDefinition('shimmer', wrong), null);
  assert.throws(() => buildStructuredRowLevelL2Diff({ ...value, ownedTables: SHIMMER_POLICY_SCOPES.slice(1) }), /scope|contract/);
  const mixed = structuredClone(SHIMMER_POLICY_SCOPES);
  mixed[2].fieldGroup = 'all_columns';
  delete mixed[2].logicalPredicateHash;
  value.candidateTables[2].fieldGroup = 'all_columns';
  delete value.candidateTables[2].logicalPredicateHash;
  assert.throws(() => buildStructuredRowLevelL2Diff({ ...value, ownedTables: mixed }), /scope|contract/);
});

test('real generation produces six-scope evidence and preserves historical lineage rows', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shimmer-six-real-generation-'));
  const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
  const snake = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
  try {
    const publication = publishShimmerGeneration({
      rawBytes: Buffer.from(JSON.stringify({ entity: 'wiki_shimmer_page', pageTitle: '微光', pageId: 42,
        revisionId: 99, revisionTimestamp: '2026-09-29T12:00:00.000Z', html: '<table></table>' })),
      shards: {
        context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER', sourcePage: '微光',
          sourceRevisionTimestamp: '2026-09-29T12:00:00.000Z' }] },
        ...Object.fromEntries([['itemTransforms', 'item_transforms'], ['decraftRules', 'decraft_rules'],
          ['entityTransforms', 'entity_transforms'], ['npcTransforms', 'npc_transforms']]
          .map(([key, name]) => [key, { entity: `wiki_shimmer_${name}_importable`, records: [] }])),
        titleResolution: { entity: 'wiki_shimmer_title_resolution', records: [] },
      },
      standardizedInputs: { items: { path: 'data/standardized/items.standardized.json', sha256: hash('items') },
        npcs: { path: 'data/standardized/npcs.standardized.json', sha256: hash('npcs') } },
      langlinkEvidenceBytes: Buffer.from('{"records":[]}'), producerCodeSha256: hash('producer'),
      tableRoleVersion: 'shimmer-table-roles/1', generatedAt: '2026-09-29T12:05:00.000Z',
      generationRoot: path.join(root, 'data/generated/shimmer/generations'),
      pointerPath: path.join(root, 'data/generated/shimmer/wiki-shimmer-current-generation.json'), runId: 'six-scope-test',
    });
    const manifestPath = path.relative(root, publication.manifestPath);
    const verified = loadVerifiedShimmerImportBundle({ repoRoot: root, bundleManifestPath: manifestPath });
    const projection = buildShimmerImportProjection({ bundle: verified });
    const historical = { ...snake(projection.snapshots[0]), source_locator: 'data/generated/shimmer/historical.json' };
    const current = { tables: Object.fromEntries(SHIMMER_POLICY_SCOPES.map((s) => [s.table,
      s.table === 'world_contexts' ? [{ ...snake(projection.worldContext), status: 1, deleted: 0 }]
        : s.table === 'entity_source_snapshots' ? [historical, { provider: 'other', source_page: '微光' }] : [],
    ])) };
    const payload = { generationId: verified.generationId, manifestPath,
      manifestSha256: verified.manifestSha256, dataBundleSha256: verified.dataBundleSha256 };
    const sourcePath = 'reports/authorization/canonical/shimmer-test-source.json';
    fs.mkdirSync(path.dirname(path.join(root, sourcePath)), { recursive: true });
    const bytes = JSON.stringify(payload);
    fs.writeFileSync(path.join(root, sourcePath), bytes, { mode: 0o600 });
    const diff = await buildReadOnlyAutomaticL2Diff({ repoRoot: root,
      connection: { query: async () => { throw new Error('must derive from frozen snapshot'); } },
      bundle: { domainId: 'shimmer', ownedTables: SHIMMER_POLICY_SCOPES,
        source: { path: sourcePath, sha256: hash(bytes) }, importPlan: { sourceCheckedAt: '2026-09-29T12:05:00.000Z' } },
      current, executionTime: '2026-09-29T12:06:00.000Z',
    });
    assert.equal(diff.scopes.length, 6);
    assert.equal(diff.counts.inserts, projection.snapshots.length);
    assert.equal(diff.counts.updates, 0);
    assert.equal(diff.counts.softDisables, 0);
    const lineage = diff.scopes.find((s) => s.table === 'entity_source_snapshots');
    assert.equal(lineage.entityBaselineCount + lineage.inserts, projection.snapshots.length + 1);

    const target = { host: '127.0.0.1', port: 13306, database: 'terria_v1_local', serverUuid: 'test-shimmer-server' };
    const existing = { worldContext: projection.worldContext, shimmerTables: projection.shimmerTables, snapshots: projection.snapshots };
    const preview = buildShimmerImportPreview({ bundle: verified, existing, target });
    const calls = [];
    const connection = {
      config: target,
      query: async (sql) => {
        assert.match(sql, /SELECT @@server_uuid/);
        return [[{ serverUuid: target.serverUuid }]];
      },
      execute: async (sql) => {
        calls.push(sql);
        if (/^\s*SELECT id\b/.test(sql)) return [[{ id: 42 }]];
        if (/^\s*SELECT/.test(sql)) {
          if (/FROM world_contexts/.test(sql)) return [[projection.worldContext]];
          if (/FROM entity_source_snapshots/.test(sql)) return [projection.snapshots];
          if (/FROM shimmer_/.test(sql)) return [[]];
          throw new Error(`Unexpected read: ${sql}`);
        }
        return [{ affectedRows: 1, insertId: 42 }];
      },
    };
    const result = await applyFrozenDomainImport({ connection, repoRoot: root, bundle: {
      domainId: 'shimmer', executionMode: 'ACTIVATION_GATED_AUTO', ownedTables: SHIMMER_POLICY_SCOPES,
      source: { path: sourcePath, sha256: hash(bytes) },
      importPlan: { previewSha256: preview.previewSha256, shimmerPartition: {
        scopes: SHIMMER_PARTITION_SCOPES, ownerApprovals: ['items', 'shimmer', 'town_npc_maintenance'],
        generationId: verified.generationId, previewSha256: preview.previewSha256,
        fences: SHIMMER_PARTITION_SCOPES.map((s) => ({ databaseRole: s.databaseRole, table: s.table,
          logicalPredicateHash: s.logicalPredicateHash, generation: 1, fenceToken: `test-${s.table}` })),
      } },
    } });
    assert.equal(result.worldContext.updated, 1);
    assert.equal(result.snapshots.updated, projection.snapshots.length);
    assert.equal(calls.filter((sql) => /SELECT \* FROM shimmer_.*FOR UPDATE/.test(sql)).length, 4);
    assert.ok(!calls.some((sql) => /DELETE FROM/.test(sql)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
