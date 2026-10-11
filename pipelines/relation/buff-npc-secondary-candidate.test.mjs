import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffNpcSecondaryCandidate } from './buff-npc-secondary-candidate.mjs';

const FACT = {
  factGroup: 'immuneNpcs',
  buffSourceId: 389,
  buffInternalName: 'PalworldMinionTrustyCattiva',
  sourceInternalName: 'DungeonGuardian',
  sourceName: 'Dungeon Guardian',
  stableSourceId: 68,
  maintSourceId: 68,
  maintInternalName: 'DungeonGuardian',
  classification: 'resolved-maint-source-id',
  promotable: true,
  sourceOrder: 0,
};

const MAINT_BUFF = {
  id: 413,
  source_id: 389,
  internal_name: 'PalworldMinionTrustyCattiva',
  landing_source_id: 12553,
  landing_source_key: 'canonical.buff-page-immunity.buff-insert-only-20261006-v2-389-400',
  landing_content_hash: 'd'.repeat(64),
  source_provider: 'terraria.wiki.gg',
  source_page: 'Template:GetBuffInfo',
  source_revision_timestamp: '2026-08-22 05:46:54',
};

const EXISTING = {
  id: 1,
  record_key: 'e'.repeat(64),
  npc_source_id: 23,
  npc_internal_name: 'MeteorHead',
  npc_name: 'Meteor Head',
  buff_source_id: 20,
  buff_internal_name: 'Poisoned',
  relation_type: 'immune',
  status: 1,
  deleted: 0,
};

test('builds an insert-only NPC immune candidate and preserves the baseline', () => {
  const result = buildBuffNpcSecondaryCandidate({
    facts: [FACT],
    maintBuffRows: [MAINT_BUFF],
    currentRows: [EXISTING],
    targetBuffIds: [389],
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
  });

  assert.equal(result.executable, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.changes.inserts.length, 1);
  assert.equal(result.changes.inserts[0].npc_source_id, 68);
  assert.equal(result.changes.inserts[0].buff_source_id, 389);
  assert.equal(result.changes.inserts[0].relation_type, 'immune');
  assert.equal(result.before.rowCount, 1);
  assert.equal(result.after.rowCount, 2);
});

test('preserves display-only facts and rejects them from executable inserts', () => {
  const result = buildBuffNpcSecondaryCandidate({
    facts: [{ ...FACT, stableSourceId: null, maintSourceId: 68, classification: 'display-only-npc-source-id-missing', promotable: false }],
    maintBuffRows: [MAINT_BUFF],
    currentRows: [EXISTING],
    targetBuffIds: [389],
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
  });

  assert.equal(result.changes.inserts.length, 0);
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].classification, 'display-only-npc-source-id-missing');
});

test('fails closed on target scope drift and duplicate identities', () => {
  assert.throws(() => buildBuffNpcSecondaryCandidate({
    facts: [FACT], maintBuffRows: [MAINT_BUFF], currentRows: [EXISTING], targetBuffIds: [400],
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
  }), /scope/i);
  assert.throws(() => buildBuffNpcSecondaryCandidate({
    facts: [FACT, FACT], maintBuffRows: [MAINT_BUFF], currentRows: [EXISTING], targetBuffIds: [389],
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
  }), /duplicate/i);
});
