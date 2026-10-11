import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildBuffInsertOnlyCandidate } from './buff-insert-only-candidate.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const IDS = Array.from({ length: 12 }, (_, index) => 389 + index);

function landingPayload() {
  return {
    sourcePageTitle: 'Template:GetBuffInfo',
    sourceRevisionTimestamp: '2026-09-29T05:31:41Z',
    fetchedAt: '2026-10-05T14:00:00.000Z',
    totalBuffs: IDS.length,
    buffs: IDS.map((id) => ({
      id,
      internalName: `Buff${id}`,
      name: `Buff ${id}`,
      type: id < 395 ? 'buff' : 'debuff',
      sourceItems: [{ itemId: id + 1000, internalName: `Item${id}` }],
      inflictingNpcs: [],
      immuneNpcs: [{ npcId: 10, internalName: 'TargetDummy' }],
      immuneNpcSample: [{ npcId: 10, internalName: 'TargetDummy' }],
      immuneNpcCount: 1,
      sourceEvidence: {
        provider: 'terraria.wiki.gg',
        pageTitle: `Buff ${id}`,
        canonicalPageTitle: `Buff ${id}`,
        revisionId: id + 10000,
        revisionTimestamp: '2026-10-05T00:00:00Z',
        parseStatus: 'parsed',
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: ['Iteminfo'] },
          inflictingNpcs: { status: 'parsed', count: 0, sections: ['NPC page infobox debuffs'] },
          immuneNpcs: { status: 'parsed', count: 1, sections: ['Immune NPCs'] },
        },
        unresolvedFacts: [],
      },
    })),
  };
}

function landing(overrides = {}) {
  const payload = landingPayload();
  const payloadJson = JSON.stringify(payload);
  return {
    id: null,
    dataset_type: 'buffs_raw',
    provider: 'terraria.wiki.gg',
    source_kind: 'buff-page-immunity-evidence',
    source_key: 'canonical.buff-page-immunity.buff-insert-only-20261005',
    source_locator: 'reports/authorization/canonical/buff-insert-only-20261005.json',
    source_page: 'Template:GetBuffInfo',
    source_revision_timestamp: payload.sourceRevisionTimestamp,
    content_hash: createHash('sha256').update(payloadJson).digest('hex'),
    payload_json: payloadJson,
    fetched_at: '2026-10-05 14:00:00',
    parsed_at: '2026-10-05 14:00:00',
    parse_status: 'ok',
    artifact_role: 'source_evidence',
    producer_id: 'canonical-buff-insert-only-candidate',
    producer_version: '1',
    producer_run_key: 'buff-insert-only-20261005',
    is_current: 1,
    ...overrides,
  };
}

function row(table, id) {
  const key = `${String(table)}-${id}`.padStart(64, '0').slice(-64);
  if (table === 'projection_buffs') {
    return { id, relation_record_key: key, source_id: id, internal_name: `Existing${id}`, status: 1, deleted: 0 };
  }
  return { id, record_key: key, source_id: id, internal_name: `Existing${id}`, status: 1, deleted: 0 };
}

function currentRows() {
  return {
    relation_buffs: [row('relation_buffs', 1)],
    item_buff_relations: [],
    npc_buff_relations: [row('npc_buff_relations', 1)],
    relation_buff_images: [row('relation_buff_images', 1)],
    projection_buffs: [row('projection_buffs', 1)],
  };
}

function currentMaintRows() {
  return [{
    id: 1,
    source_id: 1,
    internal_name: 'Existing1',
    english_name: 'Existing 1',
    status: 1,
    deleted: 0,
  }];
}

function relationPayload() {
  return {
    relationBuffs: IDS.map((id) => ({
      sourceId: id,
      internalName: `Buff${id}`,
      englishName: `Buff ${id}`,
      nameZh: null,
      buffType: id < 395 ? 'buff' : 'debuff',
      tooltipEn: null,
      tooltipZh: null,
      sourceItemCount: 1,
      immuneNpcCount: 1,
      sourceItemsJson: JSON.stringify([{ itemId: id + 1000, internalName: `Item${id}` }]),
      inflictingNpcsJson: '[]',
      immuneNpcsJson: JSON.stringify([{ npcId: 10, internalName: 'TargetDummy' }]),
      immuneNpcSampleJson: JSON.stringify([{ npcId: 10, internalName: 'TargetDummy' }]),
      sourceEvidenceJson: JSON.stringify({
        provider: 'terraria.wiki.gg', pageTitle: `Buff ${id}`, canonicalPageTitle: `Buff ${id}`,
        revisionId: id + 10000, revisionTimestamp: '2026-10-05T00:00:00Z', parseStatus: 'parsed',
        factGroups: {
          sourceItems: { status: 'parsed', count: 1, sections: ['Iteminfo'] },
          inflictingNpcs: { status: 'parsed', count: 0, sections: ['NPC page infobox debuffs'] },
          immuneNpcs: { status: 'parsed', count: 1, sections: ['Immune NPCs'] },
        }, unresolvedFacts: [],
      }),
      sourceMaintTable: 'maint_buffs', sourceMaintRecordKey: null, sourceMaintId: null,
      landingSourceId: null, landingSourceKey: landing().source_key,
      landingContentHash: landing().content_hash, sourceProvider: 'terraria.wiki.gg',
      sourcePage: 'Template:GetBuffInfo', sourceRevisionTimestamp: landing().source_revision_timestamp,
      recordKey: `${String(id).padStart(64, '0')}`,
      confidence: '1.0000', reason: 'maint_buffs_mirrored', reviewStatus: 'resolved',
      rawJson: JSON.stringify(landingPayload().buffs.find((buff) => buff.id === id)), status: 1, deleted: 0,
    })),
    itemBuffRelations: IDS.map((id) => ({
      recordKey: `${String(id + 1000).padStart(64, '0')}`, itemSourceId: id + 1000,
      itemInternalName: `Item${id}`, buffSourceId: id, buffInternalName: `Buff${id}`,
      relationType: 'buff_source_item', sourceMaintTable: 'maint_buffs', sourceMaintRecordKey: null,
      sourceMaintId: null, landingSourceId: null, landingSourceKey: landing().source_key,
      landingContentHash: landing().content_hash, sourceProvider: 'terraria.wiki.gg', sourcePage: 'Template:GetBuffInfo',
      sourceRevisionTimestamp: landing().source_revision_timestamp, confidence: '1.0000', reason: 'maint_buff_source_item',
      reviewStatus: 'resolved', status: 1, deleted: 0,
    })),
    npcBuffRelations: IDS.map((id) => ({
      recordKey: `${String(id + 2000).padStart(64, '0')}`, npcSourceId: 10,
      npcInternalName: 'TargetDummy', npcName: 'Target Dummy', buffSourceId: id, buffInternalName: `Buff${id}`,
      relationType: 'immune', sourceMaintTable: 'maint_npcs', sourceMaintRecordKey: null, sourceMaintId: 10,
      landingSourceId: 77, landingSourceKey: 'standardized.npcs', landingContentHash: HASH.slice(7),
      sourceProvider: 'terrapedia.standardized', sourcePage: 'npcs.standardized', sourceRevisionTimestamp: null,
      confidence: '1.0000', reason: 'maint_npc_buff_immune', reviewStatus: 'resolved', status: 1, deleted: 0,
    })),
    relationBuffImages: [],
    projectionBuffs: IDS.map((id) => ({
      id, relationRecordKey: `${String(id).padStart(64, '0')}`, sourceId: id,
      internalName: `Buff${id}`, englishName: `Buff ${id}`, nameZh: null,
      tooltipEn: null, tooltipZh: null, image: null, buffType: id < 395 ? 'buff' : 'debuff',
      sourceItemCount: 1, immuneNpcCount: 1, sourceItemsJson: JSON.stringify([{ itemId: id + 1000, internalName: `Item${id}` }]),
      inflictingNpcsJson: '[]', immuneNpcsJson: JSON.stringify([{ npcId: 10, internalName: 'TargetDummy' }]),
      immuneNpcSampleJson: JSON.stringify([{ npcId: 10, internalName: 'TargetDummy' }]), sourceEvidenceJson: '{}', status: 1, deleted: 0,
    })),
    issues: [],
  };
}

function evidenceMap() {
  return new Map(IDS.map((id) => [`Buff${id}`, {
    id,
    buffId: id,
    sourceItems: [{ itemId: id + 1000, internalName: `Item${id}` }],
    inflictingNpcs: [],
    immuneNpcs: [{ npcId: 10, internalName: 'TargetDummy' }],
    immuneNpcSample: [{ npcId: 10, internalName: 'TargetDummy' }],
    immuneNpcCount: 1,
    sourceEvidence: {
      provider: 'terraria.wiki.gg', pageTitle: `Buff ${id}`, canonicalPageTitle: `Buff ${id}`,
      revisionId: id + 10000, revisionTimestamp: '2026-10-05T00:00:00Z', parseStatus: 'parsed',
      factGroups: {
        sourceItems: { status: 'parsed', count: 1, sections: ['Iteminfo'] },
        inflictingNpcs: { status: 'parsed', count: 0, sections: ['NPC page infobox debuffs'] },
        immuneNpcs: { status: 'parsed', count: 1, sections: ['Immune NPCs'] },
      }, unresolvedFacts: [],
    },
  }]));
}

function input(overrides = {}) {
  return {
    runId: 'buff-insert-only-20261005',
    landing: landing(),
    sourceEvidenceHash: HASH,
    payload: relationPayload(),
    pageEvidenceByInternalName: evidenceMap(),
    currentMaintRows: currentMaintRows(),
    currentRows: currentRows(),
    managedImageUrlPrefixes: ['http://localhost:9000/terrapedia-images/buffs/'],
    sourceInputSha256: HASH,
    ...overrides,
  };
}

test('builds a read-only zero-baseline Buff candidate with deferred landing lineage', async () => {
  const result = await buildBuffInsertOnlyCandidate(input());
  assert.equal(result.schemaVersion, 'buff-insert-only-candidate/v1');
  assert.equal(result.status, 'ready-for-owner-review');
  assert.equal(result.executable, false);
  assert.equal(result.applyAllowed, false);
  assert.equal(result.databaseWrites, false);
  assert.deepEqual(result.scope.buffIds, IDS);
  assert.equal(result.scope.missingBaselineIds.length, 12);
  assert.equal(result.upstream.landing.landing.id, undefined);
  assert.equal(result.upstream.maint.inserts.length, 12);
  assert.equal(result.upstream.maint.updates.length, 0);
  assert.equal(result.changes.relation_buffs.inserts.length, 12);
  assert.deepEqual(result.changes.relation_buffs.updates, []);
  assert.equal(result.changes.projection_buffs.inserts.length, 12);
  assert.equal(result.changes.item_buff_relations.inserts.length, 12);
  assert.equal(result.changes.npc_buff_relations.inserts.length, 12);
  assert.equal(result.changes.relation_buff_images.inserts.length, 0);
  assert.equal(result.summary.preservedRows, 4);
});

test('rejects source scope drift and baseline overlap before producing a candidate', async () => {
  await assert.rejects(buildBuffInsertOnlyCandidate(input({
    landing: landing({ payload_json: JSON.stringify({ ...landingPayload(), buffs: landingPayload().buffs.slice(0, 11), totalBuffs: 11 }) }),
  })), /scope|hash|payload/i);

  const overlap = input();
  overlap.currentMaintRows.push({ ...currentMaintRows()[0], id: 2, source_id: 389, internal_name: 'Buff389' });
  await assert.rejects(buildBuffInsertOnlyCandidate(overlap), /baseline|overlap|identity/i);
});

test('rejects executable or incomplete source inputs', async () => {
  await assert.rejects(buildBuffInsertOnlyCandidate(input({ sourceInputSha256: 'bad' })), /hash/i);
  const missing = input();
  missing.pageEvidenceByInternalName.delete('Buff389');
  await assert.rejects(buildBuffInsertOnlyCandidate(missing), /evidence|identity/i);
});
