import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffFullChainExecutionEnvelope } from './buff-canonical-full-chain.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function maintMutation() {
  return {
    schemaVersion: 'buff-maint-mutation-plan/v1', executable: false,
    executionBlocker: 'locked-upstream-executor-required', table: 'terria_v1_maint.maint_buffs',
    destructiveClear: false, inserts: [], updates: [], unchanged: [], preserved: [], deletes: [],
  };
}

function candidate() {
  return {
    schemaVersion: 'buff-incremental-candidate/v1',
    executable: false,
    tables: ['relation_buffs', 'item_buff_relations', 'npc_buff_relations', 'relation_buff_images', 'projection_buffs'],
    changes: {
      relation_buffs: { inserts: [], updates: [], unchanged: [], preserved: [] },
      item_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
      npc_buff_relations: { inserts: [], updates: [], unchanged: [], preserved: [] },
      relation_buff_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
      projection_buffs: { inserts: [], updates: [], unchanged: [], preserved: [] },
    },
    expectedRows: {
      relation_buffs: [{ internal_name: 'OnFire', source_id: 24 }],
      item_buff_relations: [],
      npc_buff_relations: [],
      relation_buff_images: [],
      projection_buffs: [{ internal_name: 'OnFire', id: 24 }],
    },
    summary: { inserts: 0, updates: 0, unchanged: 2, preserved: 0 },
    deletes: [],
    managedImageUrlPrefixes: ['https://media.example.test/buffs/'],
    managedImageUrlPrefixesSha256: HASH,
    destructiveClear: false,
  };
}

test('Buff full-chain envelope binds frozen landing, maint, page evidence, and managed image policy', () => {
  const landingContentHash = 'a'.repeat(64);
  const result = buildBuffFullChainExecutionEnvelope({
    candidate: candidate(),
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: landingContentHash }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: HASH,
    maintMutation: maintMutation(),
  });

  assert.equal(result.schemaVersion, 'buff-full-chain-execution/v1');
  assert.equal(result.executable, true);
  assert.equal(result.executionBlocker, null);
  assert.equal(result.frozenLandingIdentity.table, 'source_dataset_landings');
  assert.equal(result.frozenMaintIdentity.table, 'maint_buffs');
  assert.equal(result.pageEvidenceCount, 1);
});

test('Buff full-chain envelope rejects missing page evidence before execution', () => {
  assert.throws(() => buildBuffFullChainExecutionEnvelope({
    candidate: candidate(),
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map(),
    runtimeManagedImagePolicySha256: HASH,
    maintMutation: maintMutation(),
  }), /page immunity evidence/i);
});

test('Buff full-chain envelope rejects managed image policy drift', () => {
  assert.throws(() => buildBuffFullChainExecutionEnvelope({
    candidate: candidate(),
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: `sha256:${'b'.repeat(64)}`,
    maintMutation: maintMutation(),
  }), /managed image policy/i);
});

for (const duplicate of [
  { id: 12, source_id: 24, internal_name: 'Other' },
  { id: 12, source_id: 25, internal_name: 'OnFire' },
  { id: 11, source_id: 25, internal_name: 'Other' },
]) {
  test(`Buff maint identity rejects duplicate unique keys: ${JSON.stringify(duplicate)}`, () => {
    assert.throws(() => buildBuffFullChainExecutionEnvelope({
      candidate: candidate(),
      landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
      maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }, duplicate],
      pageEvidenceByInternalName: { OnFire: { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' } },
      runtimeManagedImagePolicySha256: HASH,
      maintMutation: maintMutation(),
    }), /duplicate.*maint|maint.*duplicate/i);
  });
}
