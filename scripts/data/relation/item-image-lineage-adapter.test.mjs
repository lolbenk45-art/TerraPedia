import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildItemImageLineagePlan, executeItemImageLineageApply } from './apply-item-image-lineage.mjs';
import { createItemImageLineageAdapter } from './item-image-lineage-adapter.mjs';

const DATABASES = Object.freeze({
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local'
});

test('the whole chain applies and every stage sits in its own transaction', async () => {
  const db = fakeDatabase();
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter(db),
    generatedAt: '2026-08-01T00:00:00.000Z'
  });

  assert.equal(result.status, 'COMPLETED', result.message);
  assert.deepEqual(result.stages.map((stage) => stage.name), ['landing', 'maint', 'relation', 'local']);
  assert.deepEqual(result.stages.map((stage) => stage.status), ['applied', 'applied', 'applied', 'applied']);
  // One BEGIN/COMMIT pair per stage, never one transaction spanning two layers.
  assert.deepEqual(
    db.statements.filter((sql) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)),
    ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']
  );
  assert.deepEqual(result.counts, { landing: 2, maint: 2, relation: 2, local: 2 });
});

test('a stage that throws rolls its own transaction back', async () => {
  const db = fakeDatabase({ failOn: /INSERT INTO `terria_v1_relation`/ });
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter(db)
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(result.stages[2].status, 'failed');
  assert.equal(result.stages[3].status, 'skipped');
  assert.deepEqual(
    db.statements.filter((sql) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)),
    ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']
  );
});

test('the landing stage retires the previous current generation before inserting', async () => {
  const db = fakeDatabase();
  await executeItemImageLineageApply({ plan: buildItemImageLineagePlan(planInput()), adapter: adapter(db) });

  const demote = db.statements.findIndex((sql) => /UPDATE .*source_dataset_landings.* SET `is_current` = 0/s.test(sql));
  const insert = db.statements.findIndex((sql) => /INSERT INTO `terria_v1_maint`\.`source_dataset_landings`/.test(sql));
  assert.ok(demote >= 0 && insert > demote, 'the current generation must be retired first');
  const params = db.paramsFor(/INSERT INTO `terria_v1_maint`\.`source_dataset_landings`/);
  assert.ok(params.includes('item_image_sources_raw'));
  assert.ok(params.includes('source_evidence'));
});

test('the maint stage removes only owned identities and rebuilds them from the landing', async () => {
  const db = fakeDatabase();
  await executeItemImageLineageApply({ plan: buildItemImageLineagePlan(planInput()), adapter: adapter(db) });

  const deleteParams = db.paramsFor(/DELETE FROM `terria_v1_maint`\.`maint_item_images`/);
  assert.deepEqual(deleteParams, ['CopperCoin', 'Torch']);
  const insert = db.paramsFor(/INSERT INTO `terria_v1_maint`\.`maint_item_images`/);
  // The landing id the previous stage produced has to reach the maint row, or
  // the lane has no traceable source.
  assert.ok(insert.includes(4711));
});

test('the relation stage projects from maint rows, not from the bundle', async () => {
  const db = fakeDatabase();
  await executeItemImageLineageApply({ plan: buildItemImageLineagePlan(planInput()), adapter: adapter(db) });

  const read = db.statements.find((sql) => /SELECT .*FROM `terria_v1_maint`\.`maint_item_images`/s.test(sql));
  assert.ok(read, 'the relation stage must read what maint actually holds');
  const insert = db.paramsFor(/INSERT INTO `terria_v1_relation`\.`relation_item_images`/);
  assert.ok(insert.includes('maint-record-CopperCoin'));
  assert.ok(insert.includes('maint_item_images'));
});

test('the local stage replaces only the owned role and leaves the others alone', async () => {
  const db = fakeDatabase();
  await executeItemImageLineageApply({ plan: buildItemImageLineagePlan(planInput()), adapter: adapter(db) });

  const del = db.statements.find((sql) => /^DELETE\b.*`terria_v1_local`\.`item_images`/s.test(sql));
  assert.ok(del, 'the local stage must scope its delete to this lane');
  assert.match(del, /`role` = \?/);
  assert.ok(db.paramsFor(/^DELETE\b.*`terria_v1_local`\.`item_images`/s).includes('icon'));
  // A multi-table DELETE resolves the alias in its delete list against the
  // default database, not against the qualified name in the FROM clause. This
  // connection selects no default database, so that form dies with
  // "No database selected". Scope by the item ids already resolved instead.
  assert.ok(!/\bJOIN\b/i.test(del), 'the local delete must not be a multi-table delete');
  assert.match(del, /^DELETE FROM `terria_v1_local`\.`item_images`/);
  const deleteParams = db.paramsFor(/^DELETE FROM `terria_v1_local`\.`item_images`/);
  assert.ok(deleteParams.includes(8) && deleteParams.includes(71), 'the delete must name the resolved item ids');
  assert.ok(!deleteParams.includes('Torch'), 'the delete must not go through internal names');
  assert.ok(db.statements.some((sql) => /UPDATE `terria_v1_local`\.`items`/.test(sql)));
});

test('the snapshot is taken before the first mutation and names every owned layer', async () => {
  const db = fakeDatabase();
  const saved = [];
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter(db, { saveSnapshot: (payload) => { saved.push(payload); return 'snapshot-2026-08-01'; } })
  });

  assert.equal(result.snapshot.snapshotId, 'snapshot-2026-08-01');
  assert.equal(saved.length, 1);
  assert.deepEqual(Object.keys(saved[0].layers).sort(), ['landing', 'local', 'maint', 'relation']);
  const firstMutation = db.statements.findIndex((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql));
  const snapshotReads = db.statements.slice(0, firstMutation);
  assert.ok(snapshotReads.some((sql) => /SELECT/i.test(sql)), 'the snapshot must read before anything writes');
});

test('parity counts identities per layer inside the owned scope only', async () => {
  const db = fakeDatabase({ parityCounts: { local: 1 } });
  const result = await executeItemImageLineageApply({
    plan: buildItemImageLineagePlan(planInput()),
    adapter: adapter(db)
  });

  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /local layer parity is 1, expected 2/);
});

function adapter(db, options = {}) {
  return createItemImageLineageAdapter({
    connection: db.connection,
    databases: DATABASES,
    generatedAt: '2026-08-01T00:00:00.000Z',
    saveSnapshot: options.saveSnapshot ?? (() => 'snapshot-1')
  });
}

function fakeDatabase({ failOn = null, parityCounts = {} } = {}) {
  const statements = [];
  const params = [];

  async function run(sql, values = []) {
    const text = String(sql).trim();
    statements.push(text);
    params.push([text, values]);
    if (failOn && failOn.test(text)) {
      throw new Error('injected stage failure');
    }
    if (/INSERT INTO `terria_v1_maint`\.`source_dataset_landings`/.test(text)) {
      return [{ insertId: 4711, affectedRows: 1 }, []];
    }
    if (/^SELECT/i.test(text) && /FROM `terria_v1_maint`\.`maint_item_images`/s.test(text)) {
      if (/COUNT\(/i.test(text)) return [[{ identity_count: parityCounts.maint ?? 2 }], []];
      return [['CopperCoin', 'Torch'].map((key, index) => ({
        id: index + 1,
        record_key: `maint-record-${key}`,
        item_internal_name: key,
        item_name: key,
        role: 'icon',
        source_provider: 'terraria.wiki.gg',
        source_file_title: `${key}.png`,
        source_page: 'Items',
        source_revision_timestamp: null,
        original_url: `https://terraria.wiki.gg/images/${key}.png`,
        cached_url: `/terrapedia-images/items/${key.toLowerCase()}.png`,
        width: 16,
        height: 16,
        content_type: 'image/png',
        is_primary: 1,
        sort_order: 0,
        landing_source_id: 4711,
        landing_source_key: 'canonical.item_image_sources',
        landing_content_hash: 'a'.repeat(64),
        raw_json: '{}'
      })), []];
    }
    if (/^SELECT/i.test(text) && /FROM `terria_v1_relation`\.`relation_item_images`/s.test(text)) {
      if (/COUNT\(/i.test(text)) return [[{ identity_count: parityCounts.relation ?? 2 }], []];
      return [['CopperCoin', 'Torch'].map((key, index) => ({
        id: index + 1,
        record_key: `maint-record-${key}`,
        item_internal_name: key,
        item_name: key,
        role: 'icon',
        source_file_title: `${key}.png`,
        source_page: 'Items',
        source_provider: 'terraria.wiki.gg',
        source_revision_timestamp: null,
        original_url: `https://terraria.wiki.gg/images/${key}.png`,
        cached_url: `/terrapedia-images/items/${key.toLowerCase()}.png`,
        width: 16,
        height: 16,
        content_type: 'image/png',
        is_primary: 1,
        sort_order: 0,
        landing_source_id: 4711
      })), []];
    }
    if (/FROM `terria_v1_local`\.`items`/.test(text)) {
      if (/COUNT\(/i.test(text)) return [[{ identity_count: parityCounts.local ?? 2 }], []];
      return [[{ id: 8, internal_name: 'Torch' }, { id: 71, internal_name: 'CopperCoin' }], []];
    }
    if (/FROM `terria_v1_local`\.`item_images`/.test(text)) {
      if (/COUNT\(/i.test(text)) return [[{ identity_count: parityCounts.local ?? 2 }], []];
      return [[], []];
    }
    if (/FROM `terria_v1_maint`\.`source_dataset_landings`/.test(text)) {
      return [[{
        id: 4711,
        content_hash: 'b'.repeat(64),
        producer_run_key: 'c'.repeat(64),
        payload_json: JSON.stringify({
          itemImages: (parityCounts.landing === 0 ? [] : ['CopperCoin', 'Torch'])
            .map((key) => ({ itemInternalName: key }))
        })
      }], []];
    }
    return [[], []];
  }

  return {
    statements,
    paramsFor(pattern) {
      return params.filter(([sql]) => pattern.test(sql)).flatMap(([, values]) => values);
    },
    connection: {
      query: run,
      execute: run,
      async beginTransaction() { statements.push('BEGIN'); },
      async commit() { statements.push('COMMIT'); },
      async rollback() { statements.push('ROLLBACK'); }
    }
  };
}

function planInput() {
  const targetKeys = ['CopperCoin', 'Torch'];
  const lineageBundleBytes = JSON.stringify({
    schemaVersion: 1,
    entity: 'item_image_lineage_bundle',
    datasetType: 'item_image_sources_raw',
    provider: 'terraria.wiki.gg',
    generatedAt: '2026-08-01T00:00:00.000Z',
    counters: { total: 2 },
    itemImages: targetKeys.map((key, index) => ({
      itemId: index + 1,
      itemInternalName: key,
      itemName: key,
      role: 'icon',
      provider: 'terraria.wiki.gg',
      sourceFileTitle: `${key}.png`,
      sourcePage: 'Items',
      originalUrl: `https://terraria.wiki.gg/images/${key}.png`,
      cachedUrl: `/terrapedia-images/items/${key.toLowerCase()}.png`,
      width: 16,
      height: 16,
      contentType: 'image/png',
      isPrimary: true,
      sortOrder: 0
    }))
  });
  return {
    contract: {
      schemaVersion: 1,
      operationId: 'canonical-item-image-lineage-apply',
      lineageBundle: {
        path: 'reports/audit/item-image-lineage-2026-08-01.bundle.json',
        sha256: `sha256:${createHash('sha256').update(lineageBundleBytes).digest('hex')}`
      }
    },
    lineageBundleBytes,
    previews: Object.fromEntries(['landing', 'maint', 'relation', 'local'].map((layer) => [
      layer,
      { targetKeys: [...targetKeys], deleteCandidateKeys: [] }
    ]))
  };
}
