import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildBuffFullChainExecutionEnvelope } from './buff-canonical-full-chain.mjs';
import { buildBuffLandingInsertPlan } from '../landing/buff-bounded-landing-mutation.mjs';

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
    executionManifestHash: HASH,
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
    executionManifestHash: HASH,
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
    executionManifestHash: HASH,
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: `sha256:${'b'.repeat(64)}`,
    maintMutation: maintMutation(),
  }), /managed image policy/i);
});

test('Buff full-chain envelope rejects a partial-fact candidate before it becomes executable', () => {
  const partial = candidate();
  partial.expectedRows.relation_buffs[0].source_evidence_json = JSON.stringify({
    partialFactDisposition: {
      schemaVersion: 'buff-partial-fact-disposition/v1',
      executionBlocker: 'partial-fact-contract-review-required',
    },
  });
  assert.throws(() => buildBuffFullChainExecutionEnvelope({
    candidate: partial,
    executionManifestHash: HASH,
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: HASH,
    maintMutation: maintMutation(),
  }), /partial.*candidate|partial.*contract|executable/i);
});

test('Buff full-chain envelope carries a deferred landing insert plan without inventing an ID', () => {
  const body = {
    sourcePageTitle: 'Template:GetBuffInfo', sourceRevisionTimestamp: '2026-08-22T05:46:54Z',
    totalBuffs: 1, buffs: [{ id: 24, internalName: 'OnFire', sourceEvidence: {
      canonicalPageTitle: 'On Fire!', revisionId: 954224, revisionTimestamp: '2026-01-03T06:22:18Z', parseStatus: 'parsed',
    }}],
  };
  const landingMutation = buildBuffLandingInsertPlan({
    landingRow: {
      id: null, dataset_type: 'buffs_raw', provider: 'terraria.wiki.gg', source_kind: 'buff-page-immunity-evidence',
      source_key: 'canonical.buff-page-immunity.b1-a63-20260929-07', source_locator: 'source.json', source_page: 'Template:GetBuffInfo',
      source_revision_timestamp: body.sourceRevisionTimestamp, content_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      payload_json: JSON.stringify(body), fetched_at: '2026-09-29 01:00:00', parsed_at: '2026-09-29 01:00:00', parse_status: 'ok',
      artifact_role: 'source_evidence', producer_id: 'canonical-buff-page-immunity-refresh', producer_version: '1',
      producer_run_key: 'b1-a63-20260929-07', is_current: 1,
    },
    sourceEvidenceHash: HASH,
    runId: 'b1-a63-20260929-07',
  });
  const result = buildBuffFullChainExecutionEnvelope({
    candidate: candidate(),
    executionManifestHash: HASH,
    landingRows: [],
    landingMutation,
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: HASH,
    maintMutation: maintMutation(),
  });
  assert.equal(result.frozenLandingIdentity.rows.length, 0);
  assert.equal(result.upstream.landing.schemaVersion, 'buff-landing-mutation/v1');
  assert.equal(result.upstream.landing.landing.id, undefined);
  assert.equal(result.executable, false);
  assert.equal(result.executionBlocker, 'deferred-lineage-integration-required');
});

test('Buff full-chain envelope can explicitly enable deferred landing execution', () => {
  const body = {
    sourcePageTitle: 'Template:GetBuffInfo', sourceRevisionTimestamp: '2026-08-22T05:46:54Z',
    totalBuffs: 1, buffs: [{ id: 24, internalName: 'OnFire', sourceEvidence: {
      canonicalPageTitle: 'On Fire!', revisionId: 954224, revisionTimestamp: '2026-01-03T06:22:18Z', parseStatus: 'parsed',
    }}],
  };
  const landingMutation = buildBuffLandingInsertPlan({
    landingRow: {
      id: null, dataset_type: 'buffs_raw', provider: 'terraria.wiki.gg', source_kind: 'buff-page-immunity-evidence',
      source_key: 'canonical.buff-page-immunity.b1-a63-20260929-07', source_locator: 'source.json', source_page: 'Template:GetBuffInfo',
      source_revision_timestamp: body.sourceRevisionTimestamp, content_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      payload_json: JSON.stringify(body), fetched_at: '2026-09-29 01:00:00', parsed_at: '2026-09-29 01:00:00', parse_status: 'ok',
      artifact_role: 'source_evidence', producer_id: 'canonical-buff-page-immunity-refresh', producer_version: '1',
      producer_run_key: 'b1-a63-20260929-07', is_current: 1,
    }, sourceEvidenceHash: HASH, runId: 'b1-a63-20260929-07',
  });
  const result = buildBuffFullChainExecutionEnvelope({
    candidate: candidate(), executionManifestHash: HASH, landingRows: [], landingMutation,
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }], pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: HASH, maintMutation: maintMutation(), allowDeferredLandingExecution: true,
  });
  assert.equal(result.executable, true);
  assert.equal(result.executionBlocker, null);
});

for (const duplicate of [
  { id: 12, source_id: 24, internal_name: 'Other' },
  { id: 12, source_id: 25, internal_name: 'OnFire' },
  { id: 11, source_id: 25, internal_name: 'Other' },
]) {
  test(`Buff maint identity rejects duplicate unique keys: ${JSON.stringify(duplicate)}`, () => {
    assert.throws(() => buildBuffFullChainExecutionEnvelope({
      candidate: candidate(),
      executionManifestHash: HASH,
      landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
      maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }, duplicate],
      pageEvidenceByInternalName: { OnFire: { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' } },
      runtimeManagedImagePolicySha256: HASH,
      maintMutation: maintMutation(),
    }), /duplicate.*maint|maint.*duplicate/i);
  });
}

test('Buff full-chain envelope rejects a missing execution manifest hash', () => {
  assert.throws(() => buildBuffFullChainExecutionEnvelope({
    candidate: candidate(),
    landingRows: [{ id: 31, dataset_type: 'buffs_raw', content_hash: 'a'.repeat(64) }],
    maintRows: [{ id: 11, source_id: 24, internal_name: 'OnFire' }],
    pageEvidenceByInternalName: new Map([['OnFire', { revisionId: 12345, revisionTimestamp: '2026-09-23T01:02:03Z' }]]),
    runtimeManagedImagePolicySha256: HASH,
    maintMutation: maintMutation(),
  }), /manifest hash/i);
});
