import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBuffCanonicalIngestion,
  buildBuffCanonicalIngestionPaths,
  parseBuffCanonicalIngestionArgs,
  assertBuffLockedRowsMatchEnvelope,
  assertBuffSourceRowsMatchEnvelope,
} from './run-buff-canonical-ingestion.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

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
