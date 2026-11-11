import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUFF_ADDITIVE_RELATION_OPERATION_ID,
  applyBuffAdditiveRelationMutation,
  buildBuffAdditiveRelationProposal,
  executeBuffAdditiveRelationTransaction,
  validateBuffAdditiveRelationProposal,
} from './buff-additive-relation-apply.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const RAW_HASH = `sha256:${'b'.repeat(64)}`;
const BUFF_KEY = '1'.repeat(64);
const NPC_KEY = '2'.repeat(64);

function fact(overrides = {}) {
  return {
    relationType: 'inflicts',
    buffId: 37,
    buffInternalName: 'Horrified',
    npcId: 113,
    internalName: 'WallofFlesh',
    name: 'Wall of Flesh',
    durationText: 'While the player is within 120 tiles from the boss.',
    sourcePage: 'Wall of Flesh',
    sourcePageId: 10220,
    sourceRevisionId: 1032375,
    sourceRevisionTimestamp: '2026-09-28T10:16:13Z',
    sourceRawSha256: RAW_HASH,
    ...overrides,
  };
}

function source(overrides = {}) {
  return {
    schemaVersion: 'buff-npc-page-infliction-evidence/v1',
    artifactSha256: HASH,
    factSources: [{
      pageTitle: 'Wall of Flesh',
      pageId: 10220,
      revisionId: 1032375,
      revisionTimestamp: '2026-09-28T10:16:13Z',
      rawSha256: RAW_HASH,
    }],
    ...overrides,
  };
}

function relationBuff(overrides = {}) {
  return {
    id: 37,
    record_key: BUFF_KEY,
    source_id: 37,
    internal_name: 'Horrified',
    inflicting_npcs_json: JSON.stringify([{ npcId: 38, internalName: 'TheTongue' }]),
    immune_npcs_json: JSON.stringify([{ npcId: 1, internalName: 'Zombie' }]),
    source_items_json: JSON.stringify([{ itemId: 99, internalName: 'ExampleItem' }]),
    source_evidence_json: JSON.stringify({ provider: 'terraria.wiki.gg', pageTitle: 'Template:GetBuffInfo' }),
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function projectionBuff(overrides = {}) {
  return {
    id: 37,
    relation_record_key: BUFF_KEY,
    source_id: 37,
    internal_name: 'Horrified',
    inflicting_npcs_json: JSON.stringify([{ npcId: 38, internalName: 'TheTongue' }]),
    immune_npcs_json: JSON.stringify([{ npcId: 1, internalName: 'Zombie' }]),
    source_items_json: JSON.stringify([{ itemId: 99, internalName: 'ExampleItem' }]),
    source_evidence_json: JSON.stringify({ provider: 'terraria.wiki.gg', pageTitle: 'Template:GetBuffInfo' }),
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function reverseRow(overrides = {}) {
  return {
    id: 700,
    record_key: NPC_KEY,
    npc_source_id: 113,
    npc_internal_name: 'WallofFlesh',
    npc_name: 'Wall of Flesh',
    buff_source_id: 37,
    buff_internal_name: 'Horrified',
    relation_type: 'inflicts',
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    facts: [fact()],
    source: source(),
    relationBuffRows: [relationBuff()],
    npcBuffRelationRows: [],
    projectionBuffRows: [projectionBuff()],
    ...overrides,
  };
}

test('additive proposal updates only verified infliction JSON and inserts one reverse row', () => {
  const proposal = buildBuffAdditiveRelationProposal(input());

  assert.equal(proposal.operationId, BUFF_ADDITIVE_RELATION_OPERATION_ID);
  assert.deepEqual(proposal.target.tables, ['relation_buffs', 'npc_buff_relations', 'projection_buffs']);
  assert.equal(proposal.changes.relation_buffs.updates.length, 1);
  assert.equal(proposal.changes.npc_buff_relations.inserts.length, 1);
  assert.equal(proposal.changes.projection_buffs.updates.length, 1);
  assert.deepEqual(proposal.changes.relation_buffs.inserts, []);
  assert.deepEqual(proposal.changes.projection_buffs.inserts, []);

  const relationAfter = proposal.changes.relation_buffs.updates[0].after;
  const projectionAfter = proposal.changes.projection_buffs.updates[0].after;
  assert.deepEqual(JSON.parse(relationAfter.inflicting_npcs_json), [
    { npcId: 38, internalName: 'TheTongue' },
    { npcId: 113, internalName: 'WallofFlesh', name: 'Wall of Flesh', relationType: 'inflicts',
      durationText: 'While the player is within 120 tiles from the boss.', sourcePage: 'Wall of Flesh',
      sourcePageId: 10220, sourceRevisionId: 1032375, sourceRevisionTimestamp: '2026-09-28T10:16:13Z' },
  ]);
  assert.deepEqual(JSON.parse(projectionAfter.inflicting_npcs_json), JSON.parse(relationAfter.inflicting_npcs_json));
  assert.equal(relationAfter.immune_npcs_json, relationBuff().immune_npcs_json);
  assert.equal(relationAfter.source_items_json, relationBuff().source_items_json);
  assert.equal(proposal.executable, false);
  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.changes.npc_buff_relations.inserts[0].relation_type, 'inflicts');
  assert.equal(proposal.changes.npc_buff_relations.inserts[0].npc_source_id, 113);
  assert.equal(proposal.changes.npc_buff_relations.inserts[0].buff_source_id, 37);
  assert.equal(
    proposal.changes.npc_buff_relations.inserts[0].source_revision_timestamp,
    '2026-09-28 10:16:13',
  );
  assert.equal(validateBuffAdditiveRelationProposal(proposal), true);
});

test('additive proposal accepts legacy infliction JSON without numeric NPC ids', () => {
  const legacy = JSON.stringify([{ name: 'Wall of Flesh', internalName: 'WallofFlesh', source: 'buff-page-causes' }]);
  const proposal = buildBuffAdditiveRelationProposal(input({
    relationBuffRows: [relationBuff({ inflicting_npcs_json: legacy })],
    projectionBuffRows: [projectionBuff({ inflicting_npcs_json: legacy })],
  }));

  assert.equal(proposal.changes.relation_buffs.updates.length, 0);
  assert.equal(proposal.changes.projection_buffs.updates.length, 0);
  assert.equal(JSON.parse(proposal.before.relationBuffs[0].inflicting_npcs_json).length, 1);
  assert.equal(proposal.changes.npc_buff_relations.inserts.length, 1);
});

test('additive proposal deduplicates an already active relation without changing any row', () => {
  const proposal = buildBuffAdditiveRelationProposal(input({
    npcBuffRelationRows: [reverseRow()],
    relationBuffRows: [relationBuff({
      inflicting_npcs_json: JSON.stringify([{ npcId: 38, internalName: 'TheTongue' }, { npcId: 113, internalName: 'WallofFlesh' }]),
    })],
    projectionBuffRows: [projectionBuff({
      inflicting_npcs_json: JSON.stringify([{ npcId: 38, internalName: 'TheTongue' }, { npcId: 113, internalName: 'WallofFlesh' }]),
    })],
  }));

  assert.deepEqual(proposal.changes.relation_buffs.updates, []);
  assert.deepEqual(proposal.changes.npc_buff_relations.inserts, []);
  assert.deepEqual(proposal.changes.projection_buffs.updates, []);
  assert.equal(proposal.summary.changedRows, 0);
});

test('additive reverse deduplication is scoped to the Buff identity', () => {
  const secondFact = fact({ buffId: 38, buffInternalName: 'TheTongue' });
  const secondRelation = relationBuff({ id: 38, source_id: 38, internal_name: 'TheTongue', record_key: '3'.repeat(64) });
  const secondProjection = projectionBuff({ id: 38, source_id: 38, internal_name: 'TheTongue', relation_record_key: '3'.repeat(64) });
  const proposal = buildBuffAdditiveRelationProposal(input({
    facts: [fact(), secondFact],
    relationBuffRows: [relationBuff(), secondRelation],
    projectionBuffRows: [projectionBuff(), secondProjection],
    npcBuffRelationRows: [reverseRow({ buff_source_id: 38, buff_internal_name: 'TheTongue' })],
  }));
  assert.equal(proposal.changes.npc_buff_relations.inserts.length, 1);
  assert.equal(proposal.changes.npc_buff_relations.inserts[0].buff_source_id, 37);
});

test('additive proposal rejects unknown or incomplete source claims', () => {
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    facts: [],
  })), /positive.*fact|facts/i);
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    source: source({ factSources: [] }),
  })), /source|provenance/i);
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    facts: [fact({ sourceRawSha256: null })],
  })), /raw|provenance/i);
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    facts: [fact({ buffId: 389, buffInternalName: 'NewBuff' })],
  })), /baseline|identity|Buff/i);
});

test('additive proposal rejects identity conflicts and non-infliction changes', () => {
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    facts: [fact({ npcId: 113, internalName: 'DifferentNpc' })],
    relationBuffRows: [relationBuff({
      inflicting_npcs_json: JSON.stringify([{ npcId: 113, internalName: 'WallofFlesh' }]),
    })],
    projectionBuffRows: [projectionBuff({
      inflicting_npcs_json: JSON.stringify([{ npcId: 113, internalName: 'WallofFlesh' }]),
    })],
  })), /identity|conflict/i);
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    relationBuffRows: [relationBuff({ immune_npcs_json: '[]' })],
  })), /immune|baseline|drift/i);
  assert.throws(() => buildBuffAdditiveRelationProposal(input({
    projectionBuffRows: [projectionBuff({ relation_record_key: '9'.repeat(64) })],
  })), /projection|identity|lineage/i);
});

test('additive transaction locks, consumes the permit, mutates, reads back, journals, and commits', async () => {
  const proposal = buildBuffAdditiveRelationProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const result = await executeBuffAdditiveRelationTransaction({
    connection,
    proposal,
    lockRuntime: async () => events.push('runtime-lock'),
    readLockedRows: async () => { events.push('before-read'); return proposal.before; },
    consumeDispatchPermit: async () => events.push('permit'),
    applyMutation: async () => events.push('mutation'),
    readAfterRows: async () => { events.push('after-read'); return proposal.after; },
    journal: {
      prepared: async () => events.push('prepared'),
      commitUnknown: async () => events.push('commit-unknown'),
      committed: async () => events.push('committed'),
      rolledBack: async () => events.push('rolled-back'),
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(events, ['begin', 'runtime-lock', 'before-read', 'prepared', 'permit', 'mutation', 'after-read', 'commit', 'committed']);
});

test('additive after-set snapshot ignores database-generated relation metadata', async () => {
  const proposal = buildBuffAdditiveRelationProposal(input());
  const after = structuredClone(proposal.after);
  after.relationBuffs = after.relationBuffs.map((row) => ({
    ...row,
    updated_at: '2026-10-04 09:50:33',
  }));
  after.projectionBuffs = after.projectionBuffs.map((row) => ({
    ...row,
    updated_at: '2026-10-04 09:50:33',
  }));
  after.npcBuffRelations = after.npcBuffRelations.map((row, index) => ({
    ...row,
    id: index + 900,
    confidence: '1.0000',
    raw_json: null,
    created_at: '2026-10-04 09:50:33',
    updated_at: '2026-10-04 09:50:33',
  }));
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
  };

  const result = await executeBuffAdditiveRelationTransaction({
    connection,
    proposal,
    lockRuntime: async () => {},
    readLockedRows: async () => proposal.before,
    consumeDispatchPermit: async () => {},
    applyMutation: async () => {},
    readAfterRows: async () => after,
  });

  assert.equal(result.status, 'completed');
});

test('additive transaction rolls back before permit when locked before-set drifts', async () => {
  const proposal = buildBuffAdditiveRelationProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  await assert.rejects(() => executeBuffAdditiveRelationTransaction({
    connection,
    proposal,
    lockRuntime: async () => events.push('runtime-lock'),
    readLockedRows: async () => ({ ...proposal.before, hash: 'sha256:drift' }),
    consumeDispatchPermit: async () => events.push('permit'),
    applyMutation: async () => events.push('mutation'),
    readAfterRows: async () => proposal.after,
  }), /before.*drift/i);
  assert.deepEqual(events, ['begin', 'runtime-lock', 'rollback']);
});

test('additive transaction preserves a pre-journal runtime-lock failure', async () => {
  const proposal = buildBuffAdditiveRelationProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const journal = {
    prepared: async () => events.push('prepared'),
    commitUnknown: async () => events.push('commit-unknown'),
    committed: async () => events.push('committed'),
    rolledBack: async () => events.push('rolled-back'),
  };

  await assert.rejects(() => executeBuffAdditiveRelationTransaction({
    connection,
    proposal,
    lockRuntime: async () => {
      events.push('runtime-lock');
      throw new Error('Buff ownership fence is missing or expired');
    },
    readLockedRows: async () => proposal.before,
    consumeDispatchPermit: async () => events.push('permit'),
    applyMutation: async () => events.push('mutation'),
    readAfterRows: async () => proposal.after,
    journal,
  }), /fence is missing or expired/);
  assert.deepEqual(events, ['begin', 'runtime-lock', 'rollback']);
});

test('additive SQL mutation owns only the three declared relation tables', async () => {
  const proposal = buildBuffAdditiveRelationProposal(input());
  const statements = [];
  const connection = {
    async execute(sql, values) { statements.push({ sql, values }); return [{ affectedRows: 1, insertId: 701 }]; },
  };
  const result = await applyBuffAdditiveRelationMutation({ connection, proposal });
  assert.deepEqual(result, { updates: 2, inserts: 1 });
  assert.equal(statements.length, 3);
  assert.ok(statements.every(({ sql }) => /terria_v1_relation/.test(sql)));
  assert.ok(statements.every(({ sql }) => /relation_buffs|npc_buff_relations|projection_buffs/.test(sql)));
  assert.ok(statements.every(({ sql }) => !/\bDELETE\s+FROM|`terria_v1_(maint|local)`/i.test(sql)));
});
