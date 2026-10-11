import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyBuffCanonicalIngestion,
  buildBuffCanonicalIngestionPaths,
  parseBuffCanonicalIngestionArgs,
  assertBuffLockedRowsMatchEnvelope,
  assertBuffSourceRowsMatchEnvelope,
  assertBuffResultPathAvailable,
  applyBuffUpstreamMutations,
  bindBuffCandidateToLanding,
  getBuffLandingLockIds,
  assertBuffMaintAfterSet,
  assertBuffLandingAfterSet,
  buildBuffCanonicalPacket,
} from './run-buff-canonical-ingestion.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

test('Buff canonical packet is derived from the manifest-bound run and fence identity', () => {
  const packet = buildBuffCanonicalPacket({
    context: {
      actor: 'admin',
      packetHash: HASH,
      executionManifestHash: HASH,
      executionManifest: {
        buffFullChain: {
          schemaVersion: 'buff-full-chain-operation-binding/v1',
          operationId: 'canonical-buff-full-chain',
          resultLabel: 'retry-01',
          runId: 'buff-full-chain-retry-01',
          fenceToken: 'fence:buff-full-chain-retry-01',
        },
      },
    },
    fingerprint: { serverUuid: 'server-01' },
  });
  assert.deepEqual(packet, {
    runId: 'buff-full-chain-retry-01',
    fenceToken: 'fence:buff-full-chain-retry-01',
    serverUuid: 'server-01',
    actor: 'admin',
    packetHash: HASH,
    executionManifestHash: HASH,
  });
});

test('Buff canonical packet rejects a missing manifest-bound fence identity', () => {
  assert.throws(() => buildBuffCanonicalPacket({
    context: { executionManifest: { buffFullChain: {} } },
    fingerprint: { serverUuid: 'server-01' },
  }), /runId|fenceToken|binding/i);
});

test('Buff maint after-set comparison normalizes source and landing DATETIME values', () => {
  const base = {
    id: 389, source_id: 389, internal_name: 'NewBuff',
    source_revision_timestamp: '2026-08-22T05:46:54Z',
    landing_fetched_at: '2026-10-06T01:06:30.619Z',
    landing_parsed_at: '2026-10-06T01:06:30.619Z',
  };
  assert.doesNotThrow(() => assertBuffMaintAfterSet({
    envelope: { upstream: { maint: { inserts: [base], updates: [], unchanged: [], preserved: [] } } },
    rows: [{ ...base, source_revision_timestamp: '2026-08-22 05:46:54', landing_fetched_at: '2026-10-06 01:06:30', landing_parsed_at: '2026-10-06 01:06:30' }],
  }));
});

test('Buff landing after-set comparison normalizes DATETIME values', () => {
  const deferred = {
    source_key: 'canonical.buff-page-immunity.test',
    source_revision_timestamp: '2026-08-22T05:46:54Z',
    fetched_at: '2026-10-06 01:06:30.619',
    parsed_at: '2026-10-06 01:06:30.619',
  };
  assert.doesNotThrow(() => assertBuffLandingAfterSet({
    envelope: { upstream: { landing: { landing: deferred } } },
    rows: [{ ...deferred, source_revision_timestamp: '2026-08-22 05:46:54', fetched_at: '2026-10-06 01:06:30', parsed_at: '2026-10-06 01:06:30' }],
  }));
});

function envelopeForLockChecks() {
  const before = { record_key: 'r1', source_id: 24, internal_name: 'OnFire', status: 1, deleted: 0, updated_at: 'old' };
  const after = { ...before, tooltip_zh: '灼热', updated_at: 'new' };
  return {
    schemaVersion: 'buff-full-chain-execution/v1', executable: true, executionBlocker: null,
    candidateSha256: HASH,
    frozenLandingIdentity: { rows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: HASH }] },
    frozenMaintIdentity: { rows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }] },
    mutation: {
      changes: {
        relation_buffs: { inserts: [], updates: [{ before, after, changedColumns: ['tooltip_zh'] }], unchanged: [], preserved: [] },
        item_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        npc_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        relation_buff_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
        projection_buffs: { inserts: [], updates: [], unchanged: [], preserved: [] },
      },
      expectedRows: { relation_buffs: [after], item_buff_relations: [], npc_buff_relations: [], relation_buff_images: [], projection_buffs: [] },
      deletes: [],
    },
  };
}

test('Buff canonical ingestion compares locked landing and maint identities', () => {
  const envelope = envelopeForLockChecks();
  assert.doesNotThrow(() => assertBuffSourceRowsMatchEnvelope({
    envelope,
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: HASH }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
  }));
  assert.throws(() => assertBuffSourceRowsMatchEnvelope({
    envelope,
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: `sha256:${'b'.repeat(64)}` }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
  }), /landing|drift/i);
});

test('Buff canonical ingestion CLI requires exact operation, label and apply=true', () => {
  assert.deepEqual(parseBuffCanonicalIngestionArgs([
    '--operation-id=canonical-buff-full-chain', '--result-label=retry-01', '--apply=true',
  ]), { operationId: 'canonical-buff-full-chain', resultLabel: 'retry-01', apply: true });
  assert.throws(() => parseBuffCanonicalIngestionArgs(['--result-label=retry-01', '--apply=true']), /operation/i);
  assert.throws(() => parseBuffCanonicalIngestionArgs(['--operation-id=canonical-buff-full-chain', '--result-label=retry-01']), /apply/i);
});

test('Buff canonical ingestion compares locked before rows and rejects drift', () => {
  const envelope = envelopeForLockChecks();
  assert.doesNotThrow(() => assertBuffLockedRowsMatchEnvelope({
    envelope,
    rows: { relation_buffs: [{ record_key: 'r1', source_id: 24, internal_name: 'OnFire', status: 1, deleted: 0, tooltip_zh: '旧', updated_at: 'old' }] },
  }));
  assert.throws(() => assertBuffLockedRowsMatchEnvelope({
    envelope,
    rows: { relation_buffs: [{ record_key: 'r1', source_id: 25, internal_name: 'OnFire', status: 1, deleted: 0 }] },
  }), /before|drift/i);
});

test('Buff canonical ingestion binds a normalized result label to private envelope/result paths', () => {
  assert.deepEqual(buildBuffCanonicalIngestionPaths('retry-01'), {
    envelopePath: 'reports/authorization/canonical/canonical-buff-full-chain.retry-01.envelope.json',
    resultPath: 'reports/authorization/canonical/canonical-buff-full-chain.retry-01.result.json',
    journalPath: 'reports/authorization/canonical/canonical-buff-full-chain.retry-01.journal.json',
  });
  assert.throws(() => buildBuffCanonicalIngestionPaths('../escape'), /label/i);
});

test('Buff canonical ingestion refuses to apply without an authorized execution context', async () => {
  await assert.rejects(applyBuffCanonicalIngestion({
    repoRoot: process.cwd(),
    resultLabel: 'retry-01',
    env: {},
  }), /authorized|packet|context/i);
});

test('Buff upstream execution inserts the fresh landing before binding and applying maint', async () => {
  const calls = [];
  const envelope = {
    upstream: {
      landing: { schemaVersion: 'buff-landing-mutation/v1', landing: { source_key: 'fresh' } },
      maint: { schemaVersion: 'buff-maint-mutation-plan/v1', landingIdentity: { id: null, sourceKey: 'fresh', contentHash: 'a'.repeat(64) }, inserts: [], updates: [], unchanged: [], preserved: [], deletes: [] },
    },
  };
  const result = await applyBuffUpstreamMutations({
    envelope,
    connection: {},
    applyLanding: async () => { calls.push('landing'); return { landingId: 13001, row: { id: 13001, source_key: 'fresh', content_hash: 'a'.repeat(64) } }; },
    bindMaint: ({ plan, landingRow }) => ({ ...plan, landingIdentity: { ...plan.landingIdentity, id: landingRow.id } }),
    applyMaint: async ({ envelope: boundEnvelope }) => { calls.push('maint'); return boundEnvelope.upstream.maint; },
  });
  assert.deepEqual(calls, ['landing', 'maint']);
  assert.equal(result.landingId, 13001);
  assert.equal(result.maint.landingIdentity.id, 13001);
});

test('Buff deferred landing binding propagates the real ID through relation and secondary candidates', () => {
  const envelope = {
    mutation: {
      changes: {
        relation_buffs: {
          inserts: [],
          updates: [{ before: { record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire', landing_source_id: 17 }, after: { record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire', landing_source_id: 17 }, changedColumns: ['landing_source_id'] }],
          unchanged: [], preserved: [],
        },
        item_buff_relations: {
          inserts: [{ record_key: 'b'.repeat(64), buff_source_id: 24, buff_internal_name: 'OnFire', landing_source_id: null }],
          updates: [], unchanged: [], preserved: [],
        },
        npc_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
        relation_buff_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
        projection_buffs: {
          inserts: [{ id: 24, relation_record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire' }],
          updates: [], unchanged: [], preserved: [],
        },
      },
      expectedRows: {
        relation_buffs: [{ record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire', landing_source_id: 17 }],
        item_buff_relations: [{ record_key: 'b'.repeat(64), buff_source_id: 24, buff_internal_name: 'OnFire', landing_source_id: null }],
        npc_buff_relations: [], relation_buff_images: [],
        projection_buffs: [{ id: 24, relation_record_key: 'a'.repeat(64), source_id: 24, internal_name: 'OnFire' }],
      },
    },
  };
  const bound = bindBuffCandidateToLanding({
    envelope,
    landingRow: {
      id: 13001, source_key: 'canonical.buff-page-immunity.run-01', content_hash: 'a'.repeat(64),
      source_page: 'Template:GetBuffInfo', provider: 'terraria.wiki.gg',
      source_revision_timestamp: '2026-09-23 01:02:03',
    },
  });
  assert.equal(bound.mutation.changes.relation_buffs.updates[0].after.landing_source_id, 13001);
  assert.equal(bound.mutation.changes.item_buff_relations.inserts[0].landing_source_id, 13001);
  assert.equal(bound.mutation.expectedRows.relation_buffs[0].landing_source_id, 13001);
  assert.equal(bound.mutation.expectedRows.item_buff_relations[0].landing_source_id, 13001);
  assert.equal(bound.mutation.expectedRows.projection_buffs[0].relation_record_key, 'a'.repeat(64));
});

test('Buff deferred landing envelope does not require a preallocated landing lock ID', () => {
  assert.deepEqual(getBuffLandingLockIds({
    frozenLandingIdentity: { rows: [] },
    upstream: { landing: { schemaVersion: 'buff-landing-mutation/v1' } },
  }), []);
  assert.deepEqual(getBuffLandingLockIds({ frozenLandingIdentity: { rows: [{ id: 31 }] } }), [31]);
  assert.throws(() => getBuffLandingLockIds({ frozenLandingIdentity: { rows: [] } }), /landing.*identity|deferred/i);
});

test('Buff after-set verification covers every bound maint row by source identity', () => {
  const envelope = {
    upstream: {
      maint: {
        inserts: [{ source_id: 24, internal_name: 'OnFire', landing_source_id: 31, status: 1, deleted: 0 }],
        updates: [{ before: { id: 11, source_id: 25 }, after: { id: 11, source_id: 25, internal_name: 'Other', landing_source_id: 31, status: 1, deleted: 0 } }],
        unchanged: [{ id: 12, source_id: 26, internal_name: 'Frozen', landing_source_id: 31, status: 1, deleted: 0 }],
        preserved: [],
      },
    },
  };
  assert.doesNotThrow(() => assertBuffMaintAfterSet({
    envelope,
    rows: [
      { id: 101, source_id: 24, internal_name: 'OnFire', landing_source_id: 31, status: 1, deleted: 0 },
      { id: 11, source_id: 25, internal_name: 'Other', landing_source_id: 31, status: 1, deleted: 0 },
      { id: 12, source_id: 26, internal_name: 'Frozen', landing_source_id: 31, status: 1, deleted: 0 },
    ],
  }));
  assert.throws(() => assertBuffMaintAfterSet({
    envelope,
    rows: [{ id: 101, source_id: 24, internal_name: 'OnFire', landing_source_id: 99, status: 1, deleted: 0 }],
  }), /maint.*after|source_id|row count|drift/i);
});

test('Buff after-set verification binds a deferred landing result without accepting a foreign source', () => {
  const envelope = { upstream: { landing: { landing: { source_key: 'canonical.buff-page-immunity.run-01', content_hash: 'a'.repeat(64), dataset_type: 'buffs_raw', is_current: 1 } } } };
  assert.doesNotThrow(() => assertBuffLandingAfterSet({
    envelope,
    rows: [{ id: 31, source_key: 'canonical.buff-page-immunity.run-01', content_hash: 'a'.repeat(64), dataset_type: 'buffs_raw', is_current: 1 }],
  }));
  assert.throws(() => assertBuffLandingAfterSet({
    envelope,
    rows: [{ id: 31, source_key: 'canonical.buff-page-immunity.other', content_hash: 'a'.repeat(64), dataset_type: 'buffs_raw', is_current: 1 }],
  }), /landing.*after|source|drift/i);
});

for (const extra of [
  { record_key: 'unreviewed', source_id: 25 },
  { record_key: 'r1', source_id: 24 },
]) {
  test(`Buff locked baseline rejects additional or duplicate rows: ${extra.record_key}`, () => {
    const envelope = envelopeForLockChecks();
    const baseline = envelope.mutation.changes.relation_buffs.updates[0].before;
    assert.throws(() => assertBuffLockedRowsMatchEnvelope({
      envelope, rows: { relation_buffs: [baseline, extra] },
    }), /count|duplicate|unexpected/i);
  });
}

test('Buff source comparison matches IDs independently of property order', () => {
  const envelope = envelopeForLockChecks();
  envelope.frozenMaintIdentity.rows = [
    { id: 11, source_id: 24, internal_name: 'OnFire' },
    { id: 12, source_id: 25, internal_name: 'Other' },
  ];
  assert.doesNotThrow(() => assertBuffSourceRowsMatchEnvelope({
    envelope, landingRows: envelope.frozenLandingIdentity.rows,
    maintRows: [
      { id: '12', source_id: '25', internal_name: 'Other' },
      { internal_name: 'OnFire', source_id: '24', id: '11' },
    ],
  }));
});

test('Buff locked baseline rejects timestamp-only drift', () => {
  const envelope = envelopeForLockChecks();
  const baseline = envelope.mutation.changes.relation_buffs.updates[0].before;
  assert.throws(() => assertBuffLockedRowsMatchEnvelope({
    envelope, rows: { relation_buffs: [{ ...baseline, updated_at: 'changed' }] },
  }), /drift/);
});

test('Buff locked comparison normalizes JSON object ordering and decimal representations', () => {
  const envelope = envelopeForLockChecks();
  const baseline = envelope.mutation.changes.relation_buffs.updates[0].before;
  baseline.raw_json = '{"b":2,"a":1}';
  baseline.source_id = 24;
  assert.doesNotThrow(() => assertBuffLockedRowsMatchEnvelope({
    envelope, rows: { relation_buffs: [{ ...baseline, raw_json: { a: 1, b: 2 }, source_id: '24.000' }] },
  }));
});

test('Buff locked comparison rejects distinct JSON objects', () => {
  const envelope = envelopeForLockChecks();
  const baseline = envelope.mutation.changes.relation_buffs.updates[0].before;
  baseline.raw_json = { a: 1 };
  assert.throws(() => assertBuffLockedRowsMatchEnvelope({
    envelope, rows: { relation_buffs: [{ ...baseline, raw_json: { a: 2 } }] },
  }), /drift/);
});


test('Buff result path freshness fails before any transaction when an old result exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-result-freshness-'));
  const relative = 'reports/authorization/canonical/result.json';
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert.doesNotThrow(() => assertBuffResultPathAvailable({ repoRoot: root, resultPath: relative }));
  fs.writeFileSync(target, '{}\n', { mode: 0o600 });
  assert.throws(() => assertBuffResultPathAvailable({ repoRoot: root, resultPath: relative }), /already exists|new result label/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Buff result path freshness rejects a path outside the repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-result-confinement-'));
  assert.throws(() => assertBuffResultPathAvailable({ repoRoot: root, resultPath: '../result.json' }), /inside|confinement/i);
  fs.rmSync(root, { recursive: true, force: true });
});
