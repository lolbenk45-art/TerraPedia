import test from 'node:test';
import assert from 'node:assert/strict';

import * as subject from './buff-npc-infliction-dedup.mjs';

const {
  buildBuffNpcInflictionDedupProposal,
  validateBuffNpcInflictionDedupProposal
} = subject;

const HASH = `sha256:${'a'.repeat(64)}`;
const TARGETS = [
  { npcSourceId: 222, npcInternalName: 'QueenBee', buffSourceId: 20, buffInternalName: 'Poisoned', retainedId: 904, retireId: 1219 },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 30, buffInternalName: 'Bleeding', retainedId: 444, retireId: 393 },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 148, buffInternalName: 'Rabies', retainedId: 471, retireId: 627 },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 32, buffInternalName: 'Slow', retainedId: 773, retireId: 232 },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 47, buffInternalName: 'Frozen', retainedId: 575, retireId: 457 }
];

function rows() {
  return TARGETS.flatMap((target) => [target.retainedId, target.retireId].map((id) => ({
    id,
    record_key: `record-${id}`,
    npc_source_id: target.npcSourceId,
    npc_internal_name: target.npcInternalName,
    npc_name: target.npcInternalName,
    buff_source_id: target.buffSourceId,
    buff_internal_name: target.buffInternalName,
    relation_type: 'inflicts',
    duration_ticks: null,
    chance_value: null,
    chance_text: null,
    conditions: null,
    source_maint_table: 'maint_buffs',
    source_maint_record_key: null,
    source_maint_id: target.buffSourceId,
    landing_source_id: 18627,
    landing_source_key: 'generated.buffs.standardized',
    landing_content_hash: 'b'.repeat(64),
    source_provider: 'terrapedia.generated',
    source_page: 'buffs.standardized',
    source_revision_timestamp: null,
    confidence: '1.0000',
    reason: 'maint_buff_inflicting_npc',
    review_status: 'resolved',
    raw_json: null,
    status: 1,
    deleted: 0
  })));
}

function currentSourceRows() {
  const sourceIndexes = new Map([
    [20, { internalName: 'Poisoned', npc: 'QueenBee', indexes: [3, 4] }],
    [30, { internalName: 'Bleeding', npc: 'DukeFishron', indexes: [6] }],
    [148, { internalName: 'Rabies', npc: 'DukeFishron', indexes: [5] }],
    [32, { internalName: 'Slow', npc: 'Deerclops', indexes: [8] }],
    [47, { internalName: 'Frozen', npc: 'Deerclops', indexes: [1] }],
  ]);
  return [...sourceIndexes].map(([sourceId, value]) => {
    const lastIndex = Math.max(...value.indexes);
    const inflictingNpcs = Array.from({ length: lastIndex + 1 }, (_, index) => ({ internalName: `Npc${index}` }));
    for (const index of value.indexes) inflictingNpcs[index] = { internalName: value.npc };
    return {
      sourceId,
      internalName: value.internalName,
      rawJson: JSON.stringify({ inflictingNpcs }),
      status: 1,
      deleted: 0,
    };
  });
}

function sourceOrderRows() {
  const recordKeys = new Map([
    [904, 'b7e62390ad52ff1ca54f051b2197ef7436e87af412af9ff0793dc75ca11c8234'],
    [1219, 'f5789b2091662071ab2cada7e10cfe2661289568ccc2ce2d91004b469b169563'],
    [393, '4d96df32ebc0bb65413685ea5676b6398f4bacfa1c1b913b23d1a36e154d9a57'],
    [444, '5923d81ff8384ec7e52cec0e9e5e4c3cff8408d7752590b07ac884c804e14317'],
    [471, '5eb0233dcb37df21c5493b0b0cd51ee5149c06f322b86e1a32c4e1aeb7f59b80'],
    [627, '8033b465d6e1cd8075276be5acf52196dfe38351796d83f34c790f1b608973f3'],
    [232, '2ed2597d197c843ef89e24cb81b6ff9cfde937deb5e9615c9ad074a799b05534'],
    [773, '9c7c6552dceb552ee9c2c1e5bf1b652e2bb0102afd8f50c7bcbf0dcfe1d55363'],
    [457, '5c58c008caadd51f4d94ff816cebcfcc11f4c45a4ca19341241eddbdfe77563c'],
    [575, '74614c9eda39eaaed6c15e8abe83d50577f97aeecfbe41b52cb5c86bb7b060a7'],
  ]);
  return rows().map(row => ({ ...row, record_key: recordKeys.get(Number(row.id)) }));
}

function facts() {
  return TARGETS.map((target, index) => ({
    relationType: 'inflicts',
    npcSourceId: target.npcSourceId,
    npcInternalName: target.npcInternalName,
    npcName: target.npcInternalName,
    buffId: target.buffSourceId,
    buffInternalName: target.buffInternalName,
    buffName: target.buffInternalName,
    sourcePage: target.npcInternalName,
    sourcePageId: 1000 + index,
    sourceRevisionId: 2000 + index,
    sourceRevisionTimestamp: '2026-10-01T00:00:00Z',
    sourceRawSha256: `sha256:${String(index + 1).repeat(64)}`
  }));
}

function input(overrides = {}) {
  return {
    facts: facts(),
    source: { artifactSha256: HASH, manifestSha256: HASH },
    currentRows: sourceOrderRows(),
    currentBuffRows: currentSourceRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-07T00:00:00.000Z',
    ...overrides
  };
}

test('builds exact soft-retirement proposal and preserves one stable row per source fact', () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());

  assert.equal(proposal.operationId, 'canonical-buff-npc-infliction-dedup');
  assert.equal(proposal.executable, false);
  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.summary.currentActiveRows, 10);
  assert.equal(proposal.summary.retainedActiveRows, 5);
  assert.equal(proposal.summary.retirementCount, 5);
  assert.deepEqual(proposal.changes.retirements.map((row) => [row.before.id, row.after.status, row.after.deleted]), [
    [232, 0, 1], [393, 0, 1], [457, 0, 1], [627, 0, 1], [1219, 0, 1]
  ]);
  assert.deepEqual(proposal.changes.retained.map((row) => row.id), [444, 471, 575, 773, 904]);
  assert.equal(proposal.before.rowCount, 10);
  assert.equal(proposal.after.rowCount, 10);
  assert.notEqual(proposal.before.rowsSha256, proposal.after.rowsSha256);
  assert.equal(validateBuffNpcInflictionDedupProposal(proposal), true);
});

test('retains the row whose key matches the current source-order fact, even when its ID is higher', () => {
  const proposal = buildBuffNpcInflictionDedupProposal({
    ...input(),
    currentRows: sourceOrderRows(),
    currentBuffRows: currentSourceRows(),
  });
  assert.deepEqual(proposal.changes.retirements.map(change => change.before.id), [232, 393, 457, 627, 1219]);
  assert.deepEqual(proposal.changes.retained.map(row => row.id), [444, 471, 575, 773, 904]);
});

test('rejects source facts that omit, duplicate, or alter a target identity', () => {
  const sourceFacts = facts();
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ facts: sourceFacts.slice(1) })), /source fact scope/i);
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ facts: [...sourceFacts, sourceFacts[0]] })), /duplicate.*fact/i);
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ facts: sourceFacts.map((fact, index) => index === 0 ? { ...fact, npcSourceId: 999 } : fact) })), /source fact scope/i);
});

test('rejects duplicate pairs with changed business or lineage fields', () => {
  const changed = sourceOrderRows();
  changed.find((row) => row.id === 1219).landing_source_id = 999;
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ currentRows: changed })), /not exact duplicates/i);
});

test('rejects missing, extra, inactive, or remapped active relation rows', () => {
  const currentRows = rows();
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ currentRows: currentRows.slice(1) })), /pair must contain exactly two active rows/i);
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ currentRows: [...currentRows, { ...currentRows[0], id: 9000, record_key: 'extra' }] })), /pair must contain exactly two active rows/i);
  assert.throws(() => buildBuffNpcInflictionDedupProposal(input({ currentRows: currentRows.map((row) => row.id === 1219 ? { ...row, deleted: 1 } : row) })), /pair must contain exactly two active rows/i);
});

test('proposal validation rejects changed operation scope and retirement columns', () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  assert.throws(() => validateBuffNpcInflictionDedupProposal({ ...proposal, operationId: 'canonical-buff-additive-relation-apply' }), /identity or safety flags/i);
  const changed = structuredClone(proposal);
  changed.changes.retirements[0].after.record_key = 'changed';
  assert.throws(() => validateBuffNpcInflictionDedupProposal(changed), /retirement is invalid/i);
});

test('preserves auto-managed updated_at while soft retiring five rows', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  const statements = [];
  const result = await subject.applyBuffNpcInflictionDedupMutation({
    proposal,
    connection: {
      async execute(sql, values) {
        statements.push({ sql, values });
        return [{ affectedRows: 1 }];
      }
    }
  });

  assert.deepEqual(result, { retirementCount: 5 });
  assert.equal(statements.length, 5);
  assert.ok(statements.every(({ sql }) => sql === 'UPDATE `terria_v1_relation`.`npc_buff_relations` SET `status` = ?, `deleted` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND `record_key` = ? AND `status` = 1 AND `deleted` = 0'));
  assert.deepEqual(statements.map(({ values }) => values), proposal.changes.retirements.map((change) => [0, 1, change.before.id, change.before.record_key]));
});

test('transaction locks and rederives the exact after-set before commit', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); }
  };
  const journal = {
    async prepared() { events.push('prepared'); },
    async rolledBack() { events.push('journal-rollback'); },
    async commitUnknown() { events.push('journal-unknown'); },
    async committed() { events.push('journal-commit'); }
  };
  const result = await subject.executeBuffNpcInflictionDedupTransaction({
    connection,
    proposal,
    lockRuntime: async () => { events.push('lock'); },
    readLockedMaintSourceRows: async () => { events.push('read-source'); return proposal.maintSource?.rows ?? currentSourceRows(); },
    readLockedRows: async () => { events.push('read-before'); return proposal.before.rows; },
    consumeDispatchPermit: async () => { events.push('permit'); },
    applyMutation: async () => { events.push('mutate'); return { retirementCount: 5 }; },
    readAfterRows: async () => { events.push('read-after'); return proposal.after.rows; },
    journal
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(events, ['begin', 'lock', 'read-source', 'read-before', 'prepared', 'permit', 'mutate', 'read-after', 'commit', 'journal-commit']);
});

test('source drift rolls back before permit consumption or mutation', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  const changedSources = currentSourceRows().map((row) => row.sourceId === 30
    ? { ...row, rawJson: JSON.stringify({ inflictingNpcs: [{ internalName: 'DukeFishron' }] }) }
    : row);
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); }
  };
  await assert.rejects(subject.executeBuffNpcInflictionDedupTransaction({
    connection,
    proposal,
    lockRuntime: async () => { events.push('lock'); },
    readLockedMaintSourceRows: async () => { events.push('read-source'); return changedSources; },
    readLockedRows: async () => { events.push('read-before'); return proposal.before.rows; },
    consumeDispatchPermit: async () => { events.push('permit'); },
    applyMutation: async () => { events.push('mutate'); return { retirementCount: 5 }; },
    readAfterRows: async () => proposal.after.rows,
    journal: {
      async prepared() { events.push('prepared'); },
      async rolledBack() { events.push('journal-rollback'); },
      async commitUnknown() { events.push('journal-unknown'); },
      async committed() { events.push('journal-commit'); }
    }
  }), /locked source snapshot drifted/i);

  assert.deepEqual(events, ['begin', 'lock', 'read-source', 'rollback']);
});

test('baseline drift rolls back before permit consumption or mutation', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); }
  };
  await assert.rejects(subject.executeBuffNpcInflictionDedupTransaction({
    connection,
    proposal,
    lockRuntime: async () => { events.push('lock'); },
    readLockedMaintSourceRows: async () => { events.push('read-source'); return proposal.maintSource?.rows ?? currentSourceRows(); },
    readLockedRows: async () => { events.push('read-before'); return proposal.before.rows.slice(1); },
    consumeDispatchPermit: async () => { events.push('permit'); },
    applyMutation: async () => { events.push('mutate'); return { retirementCount: 5 }; },
    readAfterRows: async () => proposal.after.rows,
    journal: {
      async prepared() { events.push('prepared'); },
      async rolledBack() { events.push('journal-rollback'); },
      async commitUnknown() { events.push('journal-unknown'); },
      async committed() { events.push('journal-commit'); }
    }
  }), /locked before-set drifted/i);

  assert.deepEqual(events, ['begin', 'lock', 'read-source', 'read-before', 'rollback']);
});

test('unknown commit is journaled without issuing rollback or replaying mutation', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal(input());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); throw new Error('commit connection lost'); },
    async rollback() { events.push('rollback'); }
  };
  await assert.rejects(subject.executeBuffNpcInflictionDedupTransaction({
    connection,
    proposal,
    lockRuntime: async () => { events.push('lock'); },
    readLockedMaintSourceRows: async () => { events.push('read-source'); return proposal.maintSource?.rows ?? currentSourceRows(); },
    readLockedRows: async () => proposal.before.rows,
    consumeDispatchPermit: async () => { events.push('permit'); },
    applyMutation: async () => { events.push('mutate'); return { retirementCount: 5 }; },
    readAfterRows: async () => proposal.after.rows,
    journal: {
      async prepared() { events.push('prepared'); },
      async rolledBack() { events.push('journal-rollback'); },
      async commitUnknown() { events.push('journal-unknown'); },
      async committed() { events.push('journal-commit'); }
    }
  }), /commit connection lost/);

  assert.deepEqual(events, ['begin', 'lock', 'read-source', 'prepared', 'permit', 'mutate', 'commit', 'journal-unknown']);
});
