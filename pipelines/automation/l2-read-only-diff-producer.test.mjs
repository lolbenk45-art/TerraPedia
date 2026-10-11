import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertL2AutomaticGate,
  getVerifiedStructuredScopeDefinition,
} from './l2-automatic-ceiling.mjs';
import { buildReadOnlyAutomaticL2Diff } from './l2-read-only-diff-producer.mjs';
import * as diffProducer from './l2-read-only-diff-producer.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

function writeFrozenSource(root, payload) {
  const relativePath = 'reports/authorization/canonical/automatic/items/source.json';
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  return {
    path: relativePath,
    sha256: `sha256:${createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')}`,
  };
}

function bundle({
  domainId = 'items',
  source,
  ownedTables = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
} = {}) {
  return {
    domainId,
    source,
    ownedTables,
    importPlan: { sourceCheckedAt: '2026-08-31T09:59:00.000Z' },
  };
}

function structuredBundle({
  domainId = 'items',
  source,
  ownedTables = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
  structuredTables,
  producer = 'structured_source_rows_v1',
} = {}) {
  return {
    domainId,
    source,
    ownedTables,
    importPlan: {
      sourceCheckedAt: '2026-08-31T09:59:00.000Z',
      structuredCandidate: {
        schemaVersion: 1,
        producer,
        completeSnapshot: true,
        tables: structuredTables,
      },
    },
  };
}

function structuredTable({
  table,
  databaseRole = 'local',
  rows,
  keyColumns,
  compareColumns,
  numericColumns,
  jsonColumns,
  mutationKind,
  fieldGroup = 'all_columns',
  logicalPredicateHash,
} = {}) {
  const domainId = table === 'items'
    ? 'items'
    : table === 'boss_groups' || fieldGroup === 'boss_owned'
      ? 'bosses'
      : fieldGroup === 'npc_owned' ? 'npcs' : null;
  const contract = domainId
    ? getVerifiedStructuredScopeDefinition(domainId, {
        databaseRole,
        table,
        fieldGroup,
        ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
      })
    : null;
  const effectiveKeyColumns = keyColumns ?? contract?.keyColumns ?? ['source_id'];
  const effectiveCompareColumns = compareColumns ?? contract?.compareColumns
    ?? ['source_id', 'internal_name', 'name', 'status', 'deleted'];
  const effectiveNumericColumns = numericColumns ?? contract?.numericColumns ?? [];
  const effectiveJsonColumns = jsonColumns ?? contract?.jsonColumns ?? [];
  const effectiveMutationKind = mutationKind ?? contract?.mutationKind ?? 'entity';
  return {
    databaseRole,
    table,
    keyColumns: effectiveKeyColumns,
    compareColumns: effectiveCompareColumns,
    numericColumns: effectiveNumericColumns,
    jsonColumns: effectiveJsonColumns,
    mutationKind: effectiveMutationKind,
    fieldGroup,
    ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
    rows: (rows ?? []).map((row) => padStructuredRow(row, effectiveCompareColumns)),
  };
}

function padStructuredRow(row, columns) {
  const result = { ...(row ?? {}) };
  for (const column of columns) {
    if (!Object.hasOwn(result, column)) result[column] = null;
  }
  return result;
}

function structuredCurrentRows({ domainId, table, fieldGroup = 'all_columns', logicalPredicateHash, rows }) {
  const contract = getVerifiedStructuredScopeDefinition(domainId, {
    databaseRole: 'local',
    table,
    fieldGroup,
    ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
  });
  if (!contract) return rows;
  return (rows ?? []).map((row) => padStructuredRow(row, contract.compareColumns));
}

function noSideEffectConnection() {
  let touched = 0;
  return {
    get touched() { return touched; },
    config: { database: 'terria_v1_local' },
    async query() { touched += 1; throw new Error('connection must not be touched'); },
    async execute() { touched += 1; throw new Error('connection must not be touched'); },
  };
}

const NPC_SCOPE_HASH = 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d';
const BOSS_SCOPE_HASH = 'sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842';

test('derives a zero-mutation L2 diff through a read-only importer trace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [{ id: 1, internalName: 'CopperShortsword' }] } },
  });
  const calls = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async query(sql, params) {
      calls.push({ kind: 'query', sql, params });
      if (/^SELECT/i.test(sql.trim())) return [[{ id: 7, internal_name: 'CopperShortsword' }]];
      throw new Error(`unexpected non-read query reached MySQL: ${sql}`);
    },
    async execute(sql, params) {
      calls.push({ kind: 'execute', sql, params });
      if (/^SELECT/i.test(sql.trim())) return [[{ id: 7, internal_name: 'CopperShortsword' }]];
      throw new Error(`unexpected non-read execute reached MySQL: ${sql}`);
    },
  };

  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection,
    bundle: bundle({ source }),
    current: { tables: { items: [{ id: 7, internal_name: 'CopperShortsword' }] } },
    executionTime: '2026-08-31T10:00:00.000Z',
  }, {
    runBaseItemsImportImpl: async ({ connection: previewConnection, records }) => {
      assert.deepEqual(records, [{ id: 1, internalName: 'CopperShortsword' }]);
      await previewConnection.query('SELECT id FROM items WHERE id = ?', [7]);
      return { items: { errors: [] } };
    },
  });

  assert.equal(calls.every(({ sql }) => /^SELECT/i.test(sql.trim())), true);
  assert.deepEqual(diff.counts, {
    entityBaselineCount: 1,
    relationshipBaselineCount: 1,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
  });
  assert.deepEqual(diff.scopes.map(({ databaseRole, table, fieldGroup }) => ({ databaseRole, table, fieldGroup })), [
    { databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' },
  ]);
  assert.equal(diff.producer, 'read_only_sql_intent_zero_mutation_v2');
  assert.equal(diff.rowCountEvidence, 'zero_mutation_sql_trace');
  assert.equal(diff.snapshot, true);
  assert.equal(diff.sourceCheckedAt, '2026-08-31T09:59:00.000Z');
});

test('rejects semicolon-bearing multi-statements before delegation on query and execute', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-semicolon-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [] } },
  });
  const delegated = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async query() {
      delegated.push('query');
      return [[]];
    },
    async execute() {
      delegated.push('execute');
      return [[]];
    },
  };

  for (const method of ['query', 'execute']) {
    await assert.rejects(
      buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection,
        bundle: bundle({ source }),
        current: { tables: { items: [] } },
        executionTime: '2026-08-31T10:00:00.000Z',
      }, {
        runBaseItemsImportImpl: async ({ connection: previewConnection }) => {
          await previewConnection[method]('SELECT 1; UPDATE items SET name = name', []);
          return { items: { errors: [] } };
        },
      }),
      /semicolon|multi.?statement|single SQL statement|compound/i,
      method,
    );
  }

  assert.deepEqual(delegated, []);
});

test('rejects compound SET NAMES before delegation on query and execute', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-session-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [] } },
  });
  const delegated = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async query() {
      delegated.push('query');
      return [[]];
    },
    async execute() {
      delegated.push('execute');
      return [[]];
    },
  };

  for (const method of ['query', 'execute']) {
    await assert.rejects(
      buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection,
        bundle: bundle({ source }),
        current: { tables: { items: [] } },
        executionTime: '2026-08-31T10:00:00.000Z',
      }, {
        runBaseItemsImportImpl: async ({ connection: previewConnection }) => {
          await previewConnection[method]('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', []);
          return { items: { errors: [] } };
        },
      }),
      /compound|SET NAMES|single SQL statement|session/i,
      method,
    );
  }

  assert.deepEqual(delegated, []);
});

test('blocks a multi-row UPDATE before it can evade a one-row automatic L2 ceiling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-multi-row-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [] } },
  });
  const connection = {
    config: { database: 'terria_v1_local' },
    query: async () => [[]],
    execute: async () => [[]],
  };
  const ownedTables = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }];
  const oneRowCeiling = {
    level: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyJson: {
      level: 'L2',
      ratioInsertCap: 1,
      ratioUpdateCap: 1,
      ratioRelationshipDeleteCap: 1,
      ratioDisableCap: 1,
      absoluteInsertCap: 1,
      absoluteUpdateCap: 1,
      absoluteRelationshipDeleteCap: 1,
      absoluteDisableCap: 1,
      sourceFreshnessMaxAgeMinutes: 60,
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ownedTables,
    },
  };

  await assert.rejects(
    async () => {
      const generated = await buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection,
        bundle: bundle({ source, ownedTables }),
        // Both snapshot rows satisfy category_id = 7, so the statement has two
        // affected rows even though a SQL-intent recorder sees one statement.
        current: { tables: { items: [{ id: 1, category_id: 7 }, { id: 2, category_id: 7 }] } },
        executionTime: '2026-08-31T10:00:00.000Z',
      }, {
        runBaseItemsImportImpl: async ({ connection: previewConnection }) => {
          await previewConnection.execute('UPDATE items SET rarity = ? WHERE category_id = ?', [2, 7]);
          return { items: { errors: [] } };
        },
      });
      return assertL2AutomaticGate({
        policy: oneRowCeiling,
        ownedTables,
        diff: generated,
        now: '2026-08-31T10:00:00.000Z',
      });
    },
    /actual affected.row|row.level evidence|structured.*producer|cannot prove.*row/i,
  );
});

test('fails closed when table-only SQL intent would claim a narrow field group or row predicate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-unproven-scope-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [] } },
  });
  const connection = {
    config: { database: 'terria_v1_local' },
    query: async () => [[]],
    execute: async () => [[]],
  };
  const unsafeScopes = [
    {
      label: 'narrow field group',
      scope: { databaseRole: 'local', table: 'items', fieldGroup: 'item_name' },
    },
    {
      label: 'row predicate',
      scope: {
        databaseRole: 'local',
        table: 'items',
        fieldGroup: 'all_columns',
        logicalPredicateHash: HASH('a'),
      },
    },
  ];

  for (const { label, scope } of unsafeScopes) {
    let previewRan = false;
    await assert.rejects(
      buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection,
        bundle: bundle({ source, ownedTables: [scope] }),
        current: { tables: { items: [] } },
        executionTime: '2026-08-31T10:00:00.000Z',
      }, {
        runBaseItemsImportImpl: async ({ connection: previewConnection }) => {
          previewRan = true;
          await previewConnection.execute('UPDATE items SET name = ? WHERE id = ?', ['unsafe', 7]);
          return { items: { errors: [] } };
        },
      }),
      /cannot prove.*scope|structured SQL target producer|all_columns.*predicate/i,
      label,
    );
    assert.equal(previewRan, false, `${label} must reject before importer preview`);
  }
});

test('rejects scoped ownership before reading a missing frozen source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-missing-source-'));
  let connectionTouched = false;
  let previewRan = false;

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: {
        config: { database: 'terria_v1_local' },
        query: async () => { connectionTouched = true; return [[]]; },
        execute: async () => { connectionTouched = true; return [[]]; },
      },
      bundle: bundle({
        source: {
          path: 'reports/authorization/canonical/automatic/items/missing-source.json',
          sha256: HASH('a'),
        },
        ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'item_name' }],
      }),
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }, {
      runBaseItemsImportImpl: async () => {
        previewRan = true;
        return { items: { errors: [] } };
      },
    }),
    /cannot prove.*scoped ownership|structured SQL target producer/i,
  );
  assert.equal(connectionTouched, false);
  assert.equal(previewRan, false);
});

test('fails closed when an importer preview would touch an undeclared table', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-scope-'));
  const source = writeFrozenSource(root, {
    datasets: { items: { entity: 'items', records: [] } },
  });
  const connection = {
    config: { database: 'terria_v1_local' },
    query: async () => [[]],
    execute: async () => [[]],
  };

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: bundle({ source }),
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }, {
      runBaseItemsImportImpl: async ({ connection: previewConnection }) => {
        await previewConnection.execute('UPDATE category SET name = ? WHERE id = ?', ['unsafe', 1]);
      },
    }),
    /undeclared.*table|outside.*owned/i,
  );
});

test('fails closed before preview when the frozen source bytes drift', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-hash-'));
  const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
  fs.writeFileSync(path.join(root, source.path), '{"mutated":true}\n', { mode: 0o600 });

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: { config: { database: 'terria_v1_local' }, query: async () => [[]], execute: async () => [[]] },
      bundle: bundle({ source }),
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /frozen source hash drifted/i,
  );
});

test('fails closed before preview when the frozen source is not private', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-diff-mode-'));
  const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
  fs.chmodSync(path.join(root, source.path), 0o644);

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: { config: { database: 'terria_v1_local' }, query: async () => [[]], execute: async () => [[]] },
      bundle: bundle({ source }),
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /private|0600/i,
  );
});

test('derives a Projectiles candidate without invoking the complete importer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-projectile-diff-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      projectiles: { entity: 'projectiles', records: [{ id: 17, internalName: 'CopperArrow', name: 'Copper Arrow', flags: {} }] },
    },
  });
  const calls = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async query(sql, params) {
      calls.push({ kind: 'query', sql, params });
      if (/^SELECT/i.test(sql.trim())) return [[]];
      throw new Error(`unexpected non-read query reached MySQL: ${sql}`);
    },
    async execute(sql, params) {
      calls.push({ kind: 'execute', sql, params });
      if (/^SELECT/i.test(sql.trim())) return [[]];
      throw new Error(`unexpected non-read execute reached MySQL: ${sql}`);
    },
  };

  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection,
    bundle: bundle({
      domainId: 'projectiles',
      source,
      ownedTables: [{ databaseRole: 'local', table: 'projectiles', fieldGroup: 'all_columns' }],
    }),
    current: { tables: { projectiles: [] } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(calls.every(({ sql }) => /^SELECT/i.test(sql.trim())), true);
  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.deepEqual(diff.scopes[0].insertedKeys, ['projectiles:17']);
});

test('fails closed when a Buff baseline lacks the stable parent identity required by its relation projection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-buff-diff-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      buffs: { entity: 'buffs', records: [{ id: 7, internalName: 'WellFed' }] },
    },
  });
  const calls = [];
  const connection = {
    config: { database: 'terria_v1_local' },
    async query(sql, params) {
      calls.push({ kind: 'query', sql, params });
      if (/^SELECT/i.test(sql.trim())) return [[]];
      throw new Error(`unexpected non-read query reached MySQL: ${sql}`);
    },
    async execute(sql, params) {
      calls.push({ kind: 'execute', sql, params });
      if (!/^SELECT/i.test(sql.trim())) throw new Error(`unexpected non-read execute reached MySQL: ${sql}`);
      if (/FROM buffs/i.test(sql)) return [[{ id: 77 }]];
      if (/FROM buff_source_items/i.test(sql)) {
        assert.deepEqual(params, [77]);
        return [[{ id: 701 }]];
      }
      return [[]];
    },
  };
  const ownedTables = [
    { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
  ];

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: bundle({ domainId: 'buffs', source, ownedTables }),
      current: {
        tables: { buffs: [{ id: 77 }], buff_source_items: [{ id: 701 }] },
        dependencyTables: { items: [] },
      },
      executionTime: '2026-08-31T10:00:00.000Z',
    }, {
      runIndependentEntityImportImpl: async (args, { connection: previewConnection }) => {
        assert.equal(args.entity, 'buffs');
        await previewConnection.execute('SELECT id FROM buffs WHERE source_id = ?', [7]);
        await previewConnection.execute('INSERT INTO buffs (source_id) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)', [7]);
        return { buffs: { errors: [] } };
      },
    }),
    /missing identity column source_id|parent ID|structured/i,
  );

  assert.equal(calls.every(({ sql }) => /^SELECT/i.test(sql.trim())), true);
});

test('fails closed when an Audio source introduces a link whose parent asset ID is unknown', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-read-only-audio-diff-'));
  const audioPath = path.join(root, 'audio.ogg');
  fs.writeFileSync(audioPath, Buffer.from('audio-fixture'));
  const source = writeFrozenSource(root, {
    assets: [{
      assetId: 'music:new',
      shard: 'bgm',
      kind: 'music',
      sourceKey: 'Music-New',
      fileTitle: 'Music-New.ogg',
      wikiFileUrl: 'https://example.invalid/Music-New.ogg',
      sourceUrl: 'https://example.invalid/Music-New.ogg',
      absoluteLocalPath: audioPath,
      localPath: 'audio.ogg',
      mime: 'audio/ogg',
      size: Buffer.byteLength('audio-fixture'),
      sha256: HASH('c'),
    }],
  });
  const connection = {
    config: { database: 'terria_v1_local' },
    query: async () => [[]],
    execute: async () => [[]],
  };
  const ownedTables = [
    { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
  ];

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: bundle({ domainId: 'audio', source, ownedTables }),
      current: {
        tables: { audio_assets: [], audio_asset_links: [] },
        dependencyTables: { items: [], npcs: [], audioBgmDisplayNames: [] },
      },
      executionTime: '2026-08-31T10:00:00.000Z',
    }, {
      runAudioAssetImportImpl: async (options, { connection: previewConnection, transactionOwner }) => {
        assert.equal(options.apply, true);
        assert.equal(options.reportPath, null);
        assert.equal(transactionOwner, 'caller');
        await previewConnection.execute('INSERT INTO audio_assets (asset_id) VALUES (?)', ['music:test']);
        return { summary: { failures: [] } };
      },
    }),
    /existing parent ID|parent ID|structured/i,
  );

});

test('derives structured insert, update, and soft-disable rows from a candidate snapshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-diff-'));
  const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
  const connection = noSideEffectConnection();
  const ownedTables = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }];
  const candidateRows = [
    { source_id: 1, internal_name: 'Alpha', name: 'Alpha', status: 1, deleted: 0 },
    { source_id: 2, internal_name: 'Beta', name: 'Beta v2', status: 1, deleted: 0 },
    { source_id: 4, internal_name: 'Delta', name: 'Delta', status: 1, deleted: 0 },
  ];
  const currentRows = [
    { source_id: 1, internal_name: 'Alpha', name: 'Alpha', status: 1, deleted: 0 },
    { source_id: 2, internal_name: 'Beta', name: 'Beta', status: 1, deleted: 0 },
    { source_id: 3, internal_name: 'Gamma', name: 'Gamma', status: 1, deleted: 0 },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection,
    bundle: structuredBundle({
      source,
      ownedTables,
      structuredTables: [structuredTable({ table: 'items', rows: candidateRows })],
    }),
    current: { tables: { items: structuredCurrentRows({ domainId: 'items', table: 'items', rows: currentRows }) } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(connection.touched, 0);
  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.rowCountEvidence, 'verified_structured_row_diff');
  assert.deepEqual(diff.counts, {
    entityBaselineCount: 3,
    relationshipBaselineCount: 0,
    inserts: 1,
    updates: 1,
    relationshipDeletes: 0,
    softDisables: 1,
    hardDeletes: 0,
  });
  assert.deepEqual(diff.scopes[0].insertedKeys, ['items:Delta']);
  assert.deepEqual(diff.scopes[0].updatedKeys, ['items:Beta']);
  assert.deepEqual(diff.scopes[0].softDisabledKeys, ['items:Gamma']);
  assert.deepEqual(diff.rowLevelEvidence.scopes[0], {
    scopeId: 'local.items.all_columns',
    databaseRole: 'local',
    table: 'items',
    fieldGroup: 'all_columns',
    keyColumns: ['internal_name'],
    compareColumns: [
      'name',
      'internal_name',
      'image',
      'category_id',
      'description',
      'damage',
      'defense',
      'knockback',
      'use_time',
      'width',
      'height',
      'buy',
      'sell',
      'tooltip',
      'rarity_id',
      'game_period_id',
      'game_model_id',
      'is_stackable',
      'stack_size',
      'status',
      'deleted',
    ],
    mutationKind: 'entity',
    candidateRowCount: 3,
    baselineRowCount: 3,
    candidateRowsSha256: diff.rowLevelEvidence.scopes[0].candidateRowsSha256,
    baselineRowsSha256: diff.rowLevelEvidence.scopes[0].baselineRowsSha256,
  });
  assert.equal(Object.isFrozen(diff), true);
  assert.equal(Object.isFrozen(diff.rowLevelEvidence.scopes[0]), true);
});

test('rejects an Items structured candidate that narrows compareColumns and could hide a changed name', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-schema-binding-'));
  const source = writeFrozenSource(root, {});
  const connection = noSideEffectConnection();
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: structuredBundle({
        source,
        structuredTables: [structuredTable({
          table: 'items',
          keyColumns: ['source_id'],
          compareColumns: ['source_id'],
          numericColumns: [],
          jsonColumns: [],
          rows: [{ source_id: 7, name: 'Changed name' }],
        })],
      }),
      current: { tables: { items: [{ source_id: 7, name: 'Old name' }] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /schema contract|compareColumns|registered|field contract|columns/i,
  );
  assert.equal(connection.touched, 0);
});

test('rejects duplicate candidate or baseline identities before any connection side effect', async () => {
  const cases = [
    {
      label: 'duplicate candidate',
      candidateRows: [
        { source_id: 1, internal_name: 'Alpha', name: 'Alpha', status: 1, deleted: 0 },
        { source_id: 1, internal_name: 'Alpha', name: 'Alpha duplicate', status: 1, deleted: 0 },
      ],
      currentRows: [],
    },
    {
      label: 'duplicate baseline',
      candidateRows: [],
      currentRows: [
        { source_id: 1, internal_name: 'Alpha', name: 'Alpha', status: 1, deleted: 0 },
        { source_id: 1, internal_name: 'Alpha', name: 'Alpha duplicate', status: 1, deleted: 0 },
      ],
    },
  ];
  for (const entry of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-duplicate-'));
    const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
    const connection = noSideEffectConnection();
    await assert.rejects(
      buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection,
        bundle: structuredBundle({
          source,
          structuredTables: [structuredTable({ table: 'items', rows: entry.candidateRows })],
        }),
        current: { tables: { items: structuredCurrentRows({ domainId: 'items', table: 'items', rows: entry.currentRows }) } },
        executionTime: '2026-08-31T10:00:00.000Z',
      }),
      /duplicate|ambiguous|identity/i,
      entry.label,
    );
    assert.equal(connection.touched, 0, `${entry.label} must not touch connection`);
  }
});

test('rejects an unknown structured producer before importer or connection work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-unknown-'));
  const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
  const connection = noSideEffectConnection();
  let importerCalled = false;
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: structuredBundle({
        source,
        producer: 'unregistered_structured_rows_v99',
        structuredTables: [structuredTable({ table: 'items', rows: [] })],
      }),
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }, {
      runBaseItemsImportImpl: async () => { importerCalled = true; return { items: { errors: [] } }; },
    }),
    /producer|registered|structured/i,
  );
  assert.equal(connection.touched, 0);
  assert.equal(importerCalled, false);
});

test('enforces the known non-boss NPC predicate and excludes Boss rows from the baseline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-npcs-'));
  const source = writeFrozenSource(root, { datasets: { npcs: { entity: 'npcs', records: [] } } });
  const ownedTables = [{
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: NPC_SCOPE_HASH,
  }];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: structuredBundle({
      domainId: 'npcs',
      source,
      ownedTables,
      structuredTables: [structuredTable({
        table: 'npcs',
        fieldGroup: 'npc_owned',
        logicalPredicateHash: NPC_SCOPE_HASH,
        rows: [
          { source_id: 10, internal_name: 'Merchant', is_boss: 0, name: 'Merchant', status: 1, deleted: 0 },
          { source_id: 11, internal_name: 'Guide', is_boss: null, name: 'Guide', status: 1, deleted: 0 },
        ],
      })],
    }),
    current: { tables: { npcs: structuredCurrentRows({ domainId: 'npcs', table: 'npcs', fieldGroup: 'npc_owned', logicalPredicateHash: NPC_SCOPE_HASH, rows: [
      { source_id: 10, internal_name: 'Merchant', is_boss: 0, name: 'Merchant', status: 1, deleted: 0 },
      { source_id: 11, internal_name: 'Guide', is_boss: null, name: 'Guide old', status: 1, deleted: 0 },
      { source_id: 99, internal_name: 'EyeOfCthulhu', is_boss: 1, name: 'Eye', status: 1, deleted: 0 },
    ] }) } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.scopes[0].entityBaselineCount, 2);
  assert.equal(diff.scopes[0].updates, 1);
  assert.deepEqual(diff.scopes[0].updatedKeys, ['npcs:11']);
  assert.equal(diff.scopes[0].softDisables, 0);
});

test('structured NPC output carries concrete evidence accepted by the automatic ceiling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-npc-gate-'));
  const source = writeFrozenSource(root, {});
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: NPC_SCOPE_HASH,
  };
  const candidateRows = [
    { source_id: 10, internal_name: 'Merchant', is_boss: 0, name: 'Merchant v2', status: 1, deleted: 0 },
  ];
  const currentRows = [
    { source_id: 10, internal_name: 'Merchant', is_boss: 0, name: 'Merchant', status: 1, deleted: 0 },
  ];
  const generated = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: structuredBundle({
      domainId: 'npcs',
      source,
      ownedTables: [npcScope],
      structuredTables: [structuredTable({
        table: 'npcs',
        fieldGroup: npcScope.fieldGroup,
        logicalPredicateHash: npcScope.logicalPredicateHash,
        rows: candidateRows,
      })],
    }),
    current: { tables: { npcs: structuredCurrentRows({ domainId: 'npcs', table: 'npcs', fieldGroup: 'npc_owned', logicalPredicateHash: NPC_SCOPE_HASH, rows: currentRows }) } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });
  const npcPolicy = {
    domainId: 'npcs',
    level: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: HASH('a'),
    policySetHash: HASH('b'),
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      ratioInsertCap: 1,
      ratioUpdateCap: 1,
      ratioRelationshipDeleteCap: 1,
      ratioDisableCap: 1,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ownedTables: [npcScope],
    },
  };
  const accepted = assertL2AutomaticGate({
    policy: npcPolicy,
    ownedTables: [npcScope],
    diff: generated,
    now: '2026-08-31T10:00:00.000Z',
  });
  assert.equal(accepted.status, 'passed');
  assert.equal(accepted.producer, 'structured_source_rows_v1');
  assert.equal(accepted.counts.updates, 1);
  assert.equal(accepted.rowLevelEvidence.scopes[0].table, 'npcs');
});

test('structured Boss output carries both table fences into the automatic ceiling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-boss-gate-'));
  const source = writeFrozenSource(root, {});
  const bossScope = {
    databaseRole: 'local',
    table: 'boss_groups',
    fieldGroup: 'all_columns',
  };
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'boss_owned',
    logicalPredicateHash: BOSS_SCOPE_HASH,
  };
  const generated = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: structuredBundle({
      domainId: 'bosses',
      source,
      ownedTables: [bossScope, npcScope],
      structuredTables: [
        structuredTable({
          ...bossScope,
          table: 'boss_groups',
          rows: [{ code: 'WALL', name_en: 'Wall v2' }],
        }),
        structuredTable({
          ...npcScope,
          table: 'npcs',
          rows: [{ id: 50, source_id: 50, internal_name: 'Wall', is_boss: 1, name: 'Wall v2', status: 1, deleted: 0 }],
        }),
      ],
    }),
    current: { tables: {
      boss_groups: structuredCurrentRows({ domainId: 'bosses', table: 'boss_groups', rows: [{ code: 'WALL', name_en: 'Wall' }] }),
      npcs: structuredCurrentRows({ domainId: 'bosses', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: BOSS_SCOPE_HASH, rows: [{ id: 50, is_boss: 1, boss_group_id: 7, boss_role: 'primary' }] }),
    } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });
  const bossPolicy = {
    domainId: 'bosses',
    level: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: HASH('a'),
    policySetHash: HASH('b'),
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      ratioInsertCap: 1,
      ratioUpdateCap: 1,
      ratioRelationshipDeleteCap: 1,
      ratioDisableCap: 1,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ownedTables: [bossScope, npcScope],
    },
  };
  const accepted = assertL2AutomaticGate({
    policy: bossPolicy,
    ownedTables: [bossScope, npcScope],
    diff: generated,
    now: '2026-08-31T10:00:00.000Z',
  });
  assert.equal(accepted.status, 'passed');
  assert.equal(accepted.counts.updates, 2);
  assert.deepEqual(accepted.rowLevelEvidence.scopes.map((scope) => scope.table).sort(), ['boss_groups', 'npcs']);
});

test('enforces the known Boss predicate and ignores candidate rows outside its shared NPC fence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-bosses-'));
  const source = writeFrozenSource(root, { entity: 'bosses', records: [] });
  const ownedTables = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: BOSS_SCOPE_HASH },
  ];
  const connection = noSideEffectConnection();
  const diff = await buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection,
      bundle: structuredBundle({
        domainId: 'bosses',
        source,
        ownedTables,
        structuredTables: [
          structuredTable({ table: 'boss_groups', rows: [] }),
          structuredTable({
            table: 'npcs',
            fieldGroup: 'boss_owned',
            logicalPredicateHash: BOSS_SCOPE_HASH,
            rows: [{ id: 12, source_id: 12, internal_name: 'Guide', is_boss: 0, name: 'Guide', status: 1, deleted: 0 }],
          }),
        ],
      }),
      current: { tables: { boss_groups: [], npcs: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    });
  assert.deepEqual(diff.counts, {
    entityBaselineCount: 0,
    relationshipBaselineCount: 0,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
  });
  assert.equal(connection.touched, 0);
});

test('exports a pure structured producer for callers that already hold frozen rows', () => {
  assert.equal(typeof diffProducer.buildStructuredRowLevelL2Diff, 'function');
  const result = diffProducer.buildStructuredRowLevelL2Diff({
    domainId: 'items',
    sourceCheckedAt: '2026-08-31T09:59:00.000Z',
    ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
    candidate: {
      schemaVersion: 1,
      producer: 'structured_source_rows_v1',
      completeSnapshot: true,
      tables: [structuredTable({
        table: 'items',
        rows: [{ source_id: 1, internal_name: 'Alpha', name: 'Alpha', status: 1, deleted: 0 }],
      })],
    },
    current: { tables: { items: [] } },
  });
  assert.equal(result.counts.inserts, 1);
  assert.deepEqual(result.scopes[0].insertedKeys, ['items:Alpha']);
});

test('rejects accessor-backed structured bundle data before source or connection work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-accessor-'));
  const source = writeFrozenSource(root, { datasets: { items: { entity: 'items', records: [] } } });
  const candidate = {
    schemaVersion: 1,
    producer: 'structured_source_rows_v1',
    completeSnapshot: true,
    tables: [structuredTable({ table: 'items', rows: [] })],
  };
  let getterReads = 0;
  Object.defineProperty(candidate, 'tables', {
    enumerable: true,
    configurable: true,
    get() {
      getterReads += 1;
      return [];
    },
  });
  const input = structuredBundle({ source, structuredTables: [] });
  input.importPlan.structuredCandidate = candidate;
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: input,
      current: { tables: { items: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /data property|accessor|stable/i,
  );
  assert.equal(getterReads, 0);
});

test('accepts the reviewed structuredRows and candidateTables compatibility aliases', async () => {
  for (const alias of ['structuredRows', 'candidateTables']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `l2-structured-${alias}-`));
    const source = writeFrozenSource(root, {});
    const npcScope = {
      databaseRole: 'local',
      table: 'npcs',
      fieldGroup: 'npc_owned',
      logicalPredicateHash: NPC_SCOPE_HASH,
    };
    const input = bundle({
      domainId: 'npcs',
      source,
      ownedTables: [npcScope],
    });
    input.importPlan[alias] = [structuredTable({
      table: 'npcs',
      fieldGroup: npcScope.fieldGroup,
      logicalPredicateHash: npcScope.logicalPredicateHash,
      rows: [],
    })];
    input.importPlan.structuredProducer = 'structured_source_rows_v1';
    const result = await buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: input,
      current: { tables: { npcs: [] } },
      executionTime: '2026-08-31T10:00:00.000Z',
    });
    assert.equal(result.producer, 'structured_source_rows_v1', alias);
    assert.equal(result.counts.inserts, 0, alias);
  }
});

test('derives a Projectiles candidate from the real independent importer projection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-projectiles-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      projectiles: {
        entity: 'projectiles',
        records: [{
          id: 17,
          internalName: 'CopperArrow',
          name: 'Copper Arrow',
          localized: { zh: { name: '铜箭' } },
          flags: { friendly: true, hostile: false, tileCollide: true },
          combat: { damage: 4, knockBack: 1, penetrate: 1 },
          lifecycle: { timeLeft: 1200 },
          dimensions: { width: 10, height: 10, scale: 1 },
        }],
      },
    },
  });
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({
      domainId: 'projectiles',
      source,
      ownedTables: [{ databaseRole: 'local', table: 'projectiles', fieldGroup: 'all_columns' }],
    }),
    current: { tables: { projectiles: [] } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.scopes[0].table, 'projectiles');
  assert.equal(diff.counts.inserts, 1);
  assert.deepEqual(diff.scopes[0].insertedKeys, ['projectiles:17']);
});

test('derives an Items candidate from the real standardized importer projection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-items-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: {
        entity: 'items',
        records: [{
          id: 1,
          internalName: 'CopperShortsword',
          name: 'Copper Shortsword',
          categoryCode: 'WEAPON',
          stats: { damage: 5, useTime: 13 },
          stack: { isStackable: false, stackSize: 1 },
        }],
      },
    },
  });
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'items', source }),
    current: {
      tables: { items: [] },
      dependencyTables: {
        categories: [{ id: 7, code: 'WEAPON' }],
      },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.counts.inserts, 1);
  assert.deepEqual(diff.scopes[0].insertedKeys, ['items:CopperShortsword']);
});

test('derives an NPC candidate from the real independent importer projection and excludes Boss rows', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-npcs-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      npcs: {
        entity: 'npcs',
        records: [
          { id: 4, internalName: 'Guide', name: 'Guide', flags: { boss: false, friendly: true }, extras: { townNPC: true } },
          { id: 5, internalName: 'KingSlime', name: 'King Slime', flags: { boss: true } },
        ],
      },
    },
  });
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: NPC_SCOPE_HASH,
  };
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'npcs', source, ownedTables: [npcScope] }),
    current: { tables: { npcs: [] }, dependencyTables: { items: [], categories: [], npcZhMap: [] } },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.counts.inserts, 1);
  assert.deepEqual(diff.scopes[0].insertedKeys, ['npcs:4']);
});

test('derives a Boss candidate from the offline importer projection and freezes shared NPC assignments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-bosses-'));
  const source = writeFrozenSource(root, {
    datasets: { bosses: { entity: 'bosses', records: [{
      status: 'ok',
      titleEn: 'King Slime',
      titleZh: '史莱姆王',
      groupType: 'PRE_HARDMODE',
      progressionOrder: 1,
      imageUrl: 'https://terraria.wiki.gg/images/King_Slime.gif',
      notes: 'King Slime is a pre-Hardmode boss.',
      notesZh: '史莱姆王是困难模式之前的 Boss。',
      sourceUrl: 'https://terraria.wiki.gg/wiki/King_Slime',
      revisionTimestamp: '2026-08-11T22:35:00Z',
    }] } },
  });
  const bossGroupScope = { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' };
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'boss_owned',
    logicalPredicateHash: BOSS_SCOPE_HASH,
  };
  const currentBossGroup = {
    id: 7,
    code: 'KING_SLIME',
    name_en: 'King Slime',
    name_zh: '史莱姆王',
    boss_type: 'PRE_HARDMODE',
    image_url: 'http://localhost:9000/terrapedia-images/bosses/king-slime.gif',
    progression_order: 1,
    notes: '史莱姆王是困难模式之前的 Boss。',
    source_page: 'https://terraria.wiki.gg/wiki/King_Slime',
    source_revision_timestamp: '2026-08-11 22:35:00',
    status: 1,
    deleted: 0,
  };
  const currentNpc = {
    id: 50,
    source_id: 50,
    internal_name: 'KingSlime',
    name: 'King Slime',
    name_zh: '史莱姆王',
    is_boss: 1,
    boss_group_id: 7,
    boss_role: 'primary',
    status: 1,
    deleted: 0,
  };
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'bosses', source, ownedTables: [bossGroupScope, npcScope] }),
    current: {
      tables: {
        boss_groups: [currentBossGroup],
        npcs: [currentNpc],
      },
      dependencyTables: {
        npcs: [{ id: 50, game_id: 50, internal_name: 'KingSlime', name: 'King Slime', name_zh: '史莱姆王', is_boss: 1, raw_json: null }],
      },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.deepEqual(diff.scopes.map((scope) => scope.table), ['boss_groups', 'npcs']);
  assert.equal(diff.counts.inserts, 0);
  assert.equal(diff.counts.updates, 0);
});

test('fails closed when a Boss member mapping has no existing parent group identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-boss-parent-'));
  const source = writeFrozenSource(root, {
    datasets: { bosses: { entity: 'bosses', records: [{ status: 'ok', titleEn: 'King Slime', titleZh: '史莱姆王', groupType: 'PRE_HARDMODE' }] } },
  });
  const scopes = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned', logicalPredicateHash: BOSS_SCOPE_HASH },
  ];
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: bundle({ domainId: 'bosses', source, ownedTables: scopes }),
      current: {
        tables: { boss_groups: [], npcs: [] },
        dependencyTables: {
          npcs: [{ id: 50, game_id: 50, internal_name: 'KingSlime', name: 'King Slime', name_zh: '史莱姆王', is_boss: 1, raw_json: null }],
        },
      },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /parent.*ID|existing.*boss|structured/i,
  );
});

test('derives an Armor Sets candidate through both importer-owned tables when parent identity is known', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-armor-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      armor_sets: {
        entity: 'armor_sets',
        records: [{
          textKey: 'ArmorSetBonus.Wood',
          benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
          primaryPart: null,
          setCount: 0,
          sets: [],
          uniqueItemIds: [],
        }],
      },
    },
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'armor_sets', source, ownedTables }),
    current: {
      tables: {
        armor_sets: [{
          id: 5,
          source_key: 'ArmorSetBonus.Wood',
          text_key: 'ArmorSetBonus.Wood',
          benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
          primary_part: null,
          set_count: 0,
          unique_item_count: 0,
          sets_json: '[]',
          unique_item_ids_json: '[]',
          status: 1,
          deleted: 0,
        }],
        armor_set_items: [],
      },
      dependencyTables: { items: [] },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.scopes.length, 2);
  assert.equal(diff.counts.updates, 0);
  assert.equal(diff.counts.inserts, 0);
});

test('fails closed when an Armor Sets projection has no locked Item dependency snapshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-armor-missing-dependency-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [{ id: 8, internalName: 'WoodHelmet', name: 'Wood Helmet' }] },
      armor_sets: {
        entity: 'armor_sets',
        records: [{
          textKey: 'ArmorSetBonus.Wood',
          benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
          primaryPart: 'WoodHelmet',
          setCount: 1,
          sets: [[8]],
          uniqueItemIds: [8],
        }],
      },
    },
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
  ];

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: bundle({ domainId: 'armor_sets', source, ownedTables }),
      current: {
        tables: {
          armor_sets: [{
            id: 5,
            source_key: 'ArmorSetBonus.Wood',
            text_key: 'ArmorSetBonus.Wood',
            benefit_expression: 'ArmorSetBonuses.Benefits.Wood',
            primary_part: 'WoodHelmet',
            set_count: 1,
            unique_item_count: 1,
            sets_json: '[[8]]',
            unique_item_ids_json: '[8]',
            status: 1,
            deleted: 0,
          }],
          armor_set_items: [],
        },
      },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /dependency.*items|items.*dependency/i,
  );
});

test('derives a Buff candidate from the real independent importer projection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-buffs-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      buffs: {
        entity: 'buffs',
        records: [{
          id: 7,
          internalName: 'WellFed',
          englishName: 'Well Fed',
          localized: { zh: { name: '饱食' } },
          sourceItems: [],
          immuneNpcs: [],
        }],
      },
    },
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'buffs', source, ownedTables }),
    current: {
      tables: { buffs: [], buff_source_items: [] },
      dependencyTables: { items: [] },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.deepEqual(diff.scopes.map((scope) => scope.table), ['buff_source_items', 'buffs']);
  assert.equal(diff.counts.inserts, 1);
});

test('uses the locked Item dependency snapshot for Buff source-item IDs and names', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-buff-dependency-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [{ id: 1, internalName: 'Potion', name: 'Potion' }] },
      buffs: {
        entity: 'buffs',
        records: [{
          id: 7,
          internalName: 'WellFed',
          englishName: 'Well Fed',
          sourceItems: [{ itemId: 1, buffTime: 60 }],
          immuneNpcs: [],
        }],
      },
    },
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'buffs', source, ownedTables }),
    current: {
      tables: {
        buffs: [{
          id: 77,
          source_id: 7,
          internal_name: 'WellFed',
          english_name: 'Well Fed',
          name_zh: null,
          tooltip_en: null,
          tooltip_zh: null,
          image: null,
          buff_type: null,
          source_item_count: 1,
          immune_npc_count: 0,
          source_items_json: '[{"itemId":1,"buffTime":60}]',
          immune_npcs_json: '[]',
          immune_npc_sample_json: '[]',
          source_evidence_json: 'null',
          status: 1,
          deleted: 0,
        }],
        buff_source_items: [{
          buff_id: 77,
          source_item_id: 1,
          source_item_internal_name: 'Potion',
          source_item_name: 'Potion',
          item_id: 42,
          buff_time: 60,
          sort_order: 0,
        }],
      },
      dependencyTables: {
        items: [{ id: 42, source_id: 1, internal_name: 'Potion', name: 'Potion' }],
      },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.counts.inserts, 0);
  assert.equal(diff.counts.updates, 0);
  assert.equal(diff.counts.relationshipDeletes, 0);
});

test('derives an Audio candidate from the real audio importer projection for an existing asset/link identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-audio-'));
  const audioPath = path.join(root, 'audio.ogg');
  fs.writeFileSync(audioPath, Buffer.from('audio-fixture'));
  const audioSha = `sha256:${createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex')}`;
  const source = writeFrozenSource(root, {
    assets: [{
      assetId: 'music:test',
      shard: 'bgm',
      kind: 'music',
      sourceKey: 'Music-Test',
      fileTitle: 'Music-Test.ogg',
      wikiFileUrl: 'https://example.invalid/Music-Test.ogg',
      sourceUrl: 'https://example.invalid/Music-Test.ogg',
      absoluteLocalPath: audioPath,
      localPath: 'audio.ogg',
      mime: 'audio/ogg',
      size: Buffer.byteLength('audio-fixture'),
      sha256: audioSha,
    }],
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'audio', source, ownedTables }),
    current: {
      tables: {
        audio_assets: [{
          id: 7,
          asset_id: 'music:test',
          shard: 'bgm',
          kind: 'music',
          source_key: 'Music-Test',
          display_name_zh: null,
          display_name_en: null,
          file_title: 'Music-Test.ogg',
          wiki_file_url: 'https://example.invalid/Music-Test.ogg',
          source_url: 'https://example.invalid/Music-Test.ogg',
          local_path: 'audio.ogg',
          absolute_local_path: audioPath,
          mime: 'audio/ogg',
          size_bytes: Buffer.byteLength('audio-fixture'),
          sha256: audioSha,
          provider: 'wiki_gg',
          status: 'active',
          crawl_report_path: null,
          raw_json: JSON.stringify({ assetId: 'music:test' }),
          deleted: 0,
        }],
        audio_asset_links: [{
          id: 8,
          audio_asset_id: 7,
          entity_type: 'bgm_track',
          entity_id: null,
          source_key: 'Music-Test',
          relation_type: 'bgm_track',
          match_status: 'unmatched',
          match_reason: 'bgm ownership mapping not available',
          sort_order: 0,
          deleted: 0,
        }],
      },
      dependencyTables: {
        items: [],
        npcs: [],
        audioBgmDisplayNames: [],
      },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.producer, 'structured_source_rows_v1');
  assert.equal(diff.scopes.length, 2);
  assert.equal(diff.counts.inserts, 0);
});

test('uses the locked Audio Items/NPC/BGM dependency snapshots for asset projection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-audio-dependency-'));
  const audioPath = path.join(root, 'audio.ogg');
  fs.writeFileSync(audioPath, Buffer.from('audio-fixture'));
  const audioSha = `sha256:${createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex')}`;
  const asset = {
    assetId: 'music:test',
    shard: 'bgm',
    kind: 'music',
    sourceKey: 'Music-Test',
    fileTitle: 'Music-Test.ogg',
    wikiFileUrl: 'https://example.invalid/Music-Test.ogg',
    sourceUrl: 'https://example.invalid/Music-Test.ogg',
    absoluteLocalPath: audioPath,
    localPath: 'audio.ogg',
    mime: 'audio/ogg',
    size: Buffer.byteLength('audio-fixture'),
    sha256: audioSha,
  };
  const source = writeFrozenSource(root, { assets: [asset] });
  const ownedTables = [
    { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
  ];
  const diff = await buildReadOnlyAutomaticL2Diff({
    repoRoot: root,
    connection: noSideEffectConnection(),
    bundle: bundle({ domainId: 'audio', source, ownedTables }),
    current: {
      tables: {
        audio_assets: [{
          id: 7,
          asset_id: 'music:test',
          shard: 'bgm',
          kind: 'music',
          source_key: 'Music-Test',
          display_name_zh: '测试音乐',
          display_name_en: 'Test Music',
          file_title: 'Music-Test.ogg',
          wiki_file_url: 'https://example.invalid/Music-Test.ogg',
          source_url: 'https://example.invalid/Music-Test.ogg',
          local_path: 'audio.ogg',
          absolute_local_path: audioPath,
          mime: 'audio/ogg',
          size_bytes: Buffer.byteLength('audio-fixture'),
          sha256: audioSha,
          provider: 'wiki_gg',
          status: 'active',
          crawl_report_path: null,
          raw_json: JSON.stringify(asset),
          deleted: 0,
        }],
        audio_asset_links: [{
          audio_asset_id: 7,
          entity_type: 'bgm_track',
          entity_id: null,
          source_key: 'Music-Test',
          relation_type: 'bgm_track',
          match_status: 'unmatched',
          match_reason: 'bgm ownership mapping not available',
          sort_order: 0,
          deleted: 0,
        }],
      },
      dependencyTables: {
        items: [],
        npcs: [],
        audioBgmDisplayNames: [{ sourceKey: 'Music-Test', displayNameZh: '测试音乐', displayNameEn: 'Test Music' }],
      },
    },
    executionTime: '2026-08-31T10:00:00.000Z',
  });

  assert.equal(diff.counts.inserts, 0);
  assert.equal(diff.counts.updates, 0);
  assert.equal(diff.counts.relationshipDeletes, 0);
});

test('rejects a Shimmer source that cannot be resolved to a verified importer generation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-shimmer-'));
  const source = writeFrozenSource(root, {
    generationId: 'a'.repeat(64),
    manifestPath: `data/generated/shimmer/generations/${'a'.repeat(64)}/wiki-shimmer-manifest.json`,
    manifestSha256: HASH('a'),
    dataBundleSha256: HASH('b'),
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'shimmer_item_transforms', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_decraft_rules', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_entity_transforms', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_npc_transforms', fieldGroup: 'all_columns' },
  ];
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: bundle({ domainId: 'shimmer', source, ownedTables }),
      current: { tables: Object.fromEntries(ownedTables.map(({ table }) => [table, []])) },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /verified shimmer|generation|structured/i,
  );
});

test('Shimmer structured candidates fail closed on source-scope drift and all-null identities', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-structured-shimmer-scope-'));
  const source = writeFrozenSource(root, {});
  const scope = {
    databaseRole: 'local',
    table: 'shimmer_entity_transforms',
    fieldGroup: 'all_columns',
  };
  const contract = getVerifiedStructuredScopeDefinition('shimmer', scope);
  const pad = (row) => Object.fromEntries(contract.compareColumns.map((column) => [column, row?.[column] ?? null]));
  const makeTable = (rows) => ({
    ...scope,
    keyColumns: [...contract.keyColumns],
    compareColumns: [...contract.compareColumns],
    numericColumns: [...contract.numericColumns],
    jsonColumns: [...contract.jsonColumns],
    mutationKind: contract.mutationKind,
    rows: rows.map(pad),
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'shimmer_item_transforms', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_decraft_rules', fieldGroup: 'all_columns' },
    scope,
    { databaseRole: 'local', table: 'shimmer_npc_transforms', fieldGroup: 'all_columns' },
  ];
  const emptyTables = ownedTables.map((entry) => {
    const definition = getVerifiedStructuredScopeDefinition('shimmer', entry);
    return {
      ...entry,
      keyColumns: [...definition.keyColumns],
      compareColumns: [...definition.compareColumns],
      numericColumns: [...definition.numericColumns],
      jsonColumns: [...definition.jsonColumns],
      mutationKind: definition.mutationKind,
      rows: [],
    };
  });
  const makeBundle = (rows) => structuredBundle({
    domainId: 'shimmer',
    source,
    ownedTables,
    structuredTables: emptyTables.map((entry) => entry.table === scope.table ? makeTable(rows) : entry),
  });
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: makeBundle([{
        context_code: 'SHIMMER',
        transform_group: 'critter_to_item',
        input_entity_type: 'item_group',
        input_name_en: 'Gem Squirrels',
        input_name_zh: '紫晶松鼠',
        input_internal_name: null,
        output_entity_type: 'item',
        output_name_en: 'Amethyst',
        output_name_zh: '紫晶',
        output_internal_name: 'Amethyst',
        source_provider: 'wiki_en',
        source_page: '微光',
        sort_order: 1,
        status: 1,
        deleted: 0,
      }]),
      current: { tables: Object.fromEntries(ownedTables.map(({ table }) => [table, []])) },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /source scope|wiki_zh|微光/i,
  );
  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: makeBundle([{ source_provider: 'wiki_zh', source_page: '微光', deleted: 0 }]),
      current: { tables: Object.fromEntries(ownedTables.map(({ table }) => [table, []])) },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /stable identity|identity/i,
  );
});

test('rejects an orphan relation baseline before it can be carried into a structured candidate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-importer-orphan-relation-'));
  const source = writeFrozenSource(root, {
    datasets: {
      items: { entity: 'items', records: [] },
      buffs: {
        entity: 'buffs',
        records: [{ id: 7, internalName: 'WellFed', sourceItems: [] }],
      },
    },
  });
  const ownedTables = [
    { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
  ];

  await assert.rejects(
    buildReadOnlyAutomaticL2Diff({
      repoRoot: root,
      connection: noSideEffectConnection(),
      bundle: bundle({ domainId: 'buffs', source, ownedTables }),
      current: {
        tables: {
          buffs: [{ id: 77, source_id: 7 }],
          buff_source_items: [{ id: 701, buff_id: 999, sort_order: 0 }],
        },
        dependencyTables: { items: [] },
      },
      executionTime: '2026-08-31T10:00:00.000Z',
    }),
    /orphan|parent|foreign key|buff_source_items/i,
  );
});

test('rejects duplicate source or current Item identities before relation projection', async () => {
  const duplicateCases = [
    {
      label: 'source id',
      items: [
        { id: 1, internalName: 'PotionA' },
        { id: 1, internalName: 'PotionB' },
      ],
    },
    {
      label: 'current internal name',
      items: [
        { id: 1, source_id: 1, internal_name: 'Potion', name: 'Potion A' },
        { id: 2, source_id: 2, internal_name: 'Potion', name: 'Potion B' },
      ],
    },
  ];
  for (const entry of duplicateCases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `l2-importer-duplicate-${entry.label.replaceAll(' ', '-')}-`));
    const source = writeFrozenSource(root, {
      datasets: {
        items: { entity: 'items', records: entry.items },
        buffs: {
          entity: 'buffs',
          records: [{ id: 7, internalName: 'WellFed', sourceItems: [{ itemId: 1 }] }],
        },
      },
    });
    const ownedTables = [
      { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
    ];
    await assert.rejects(
      buildReadOnlyAutomaticL2Diff({
        repoRoot: root,
        connection: noSideEffectConnection(),
        bundle: bundle({ domainId: 'buffs', source, ownedTables }),
        current: {
          tables: {
            buffs: [{ id: 77, source_id: 7 }],
            buff_source_items: [],
          },
          dependencyTables: {
            items: entry.label === 'current internal name' ? entry.items : [],
          },
        },
        executionTime: '2026-08-31T10:00:00.000Z',
      }),
      /duplicate|ambiguous|identity/i,
      entry.label,
    );
  }
});
