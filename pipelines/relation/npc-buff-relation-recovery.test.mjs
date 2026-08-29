import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as subject from './npc-buff-relation-recovery.mjs';

const {
  NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
  buildNpcBuffRelationRecoveryProposal,
  executeNpcBuffRelationRecoveryTransaction,
  validateNpcBuffRelationRecoveryProposal,
} = subject;

const UUID = 'b4ae6728-4f72-11f1-bcc9-00155d37eadf';

function evidence() {
  const maintNpcRows = [{
    id: 11,
    source_id: 1,
    internal_name: 'BlueSlime',
    english_name: 'Blue Slime',
    raw_json: JSON.stringify({ buffImmune: [20] }),
    landing_source_id: 101,
    landing_source_key: 'standardized.npcs',
    landing_content_hash: 'a'.repeat(64),
    source_provider: 'terrapedia.generated',
    source_page: 'npcs.standardized',
  }];
  const maintBuffRows = [{
    id: 20,
    source_id: 20,
    internal_name: 'Poisoned',
    raw_json: '{}',
    landing_source_id: 102,
    landing_source_key: 'generated.buffs.standardized',
    landing_content_hash: 'b'.repeat(64),
    source_provider: 'terrapedia.generated',
    source_page: 'buffs.standardized',
  }];
  const localRows = [{
    npcSourceId: 1,
    npcInternalName: 'BlueSlime',
    buffSourceId: 20,
    buffInternalName: 'Poisoned',
    relationType: 'immune',
    durationTicks: null,
    chanceValue: null,
    chanceText: null,
    conditions: null,
    reason: 'maint_npc_buff_immune',
  }];
  return { maintNpcRows, maintBuffRows, matchedCrawlerFacts: [], localRows, relationRows: [] };
}

test('NPC Buff recovery proposal binds an empty before-set to exact maint-derived rows', () => {
  const proposal = buildNpcBuffRelationRecoveryProposal({
    ...evidence(),
    serverUuid: UUID,
    expectedCount: 1,
    generatedAt: '2026-08-24T00:00:00.000Z',
  });

  assert.equal(proposal.operationId, NPC_BUFF_RELATION_RECOVERY_OPERATION_ID);
  assert.equal(proposal.ownerCapability, 'buffs');
  assert.equal(proposal.target.table, 'terria_v1_relation.npc_buff_relations');
  assert.equal(proposal.changedRowCount, 1);
  assert.equal(proposal.before.rowCount, 0);
  assert.equal(proposal.after.rowCount, 1);
  assert.equal(proposal.localEquivalence.exact, true);
  assert.equal(proposal.rows[0].relationType, 'immune');
  assert.equal(proposal.rows[0].reason, 'maint_npc_buff_immune');
  assert.equal(validateNpcBuffRelationRecoveryProposal(proposal, { expectedCount: 1 }), true);
});

test('NPC Buff recovery proposal rejects local mismatch and non-empty relation state', () => {
  const mismatched = evidence();
  mismatched.localRows[0].buffSourceId = 21;
  assert.throws(
    () => buildNpcBuffRelationRecoveryProposal({
      ...mismatched, serverUuid: UUID, expectedCount: 1,
    }),
    /local.*equivalence/i,
  );

  const nonEmpty = evidence();
  nonEmpty.relationRows.push({ recordKey: 'c'.repeat(64) });
  assert.throws(
    () => buildNpcBuffRelationRecoveryProposal({
      ...nonEmpty, serverUuid: UUID, expectedCount: 1,
    }),
    /relation.*empty/i,
  );
});

test('NPC Buff recovery consumes the permit only after the before-set is locked', async () => {
  const proposal = buildNpcBuffRelationRecoveryProposal({
    ...evidence(), serverUuid: UUID, expectedCount: 1,
  });
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };

  const result = await executeNpcBuffRelationRecoveryTransaction({
    connection,
    proposal,
    readCurrent: async (_connection, _proposal, { forUpdate }) => {
      events.push(forUpdate ? 'lock' : 'read');
      return [];
    },
    consumeDispatchPermit: async () => { events.push('permit'); },
    insertRows: async (_connection, rows) => {
      events.push(`insert:${rows.length}`);
      return rows.length;
    },
    readback: async () => {
      events.push('readback');
      return proposal.rows;
    },
  });

  assert.deepEqual(events, ['begin', 'lock', 'permit', 'insert:1', 'readback', 'commit']);
  assert.equal(result.transactionCommitted, true);
  assert.equal(result.affectedRows, 1);
});

test('NPC Buff recovery rolls back before permit consumption when the before-set drifts', async () => {
  const proposal = buildNpcBuffRelationRecoveryProposal({
    ...evidence(), serverUuid: UUID, expectedCount: 1,
  });
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };

  await assert.rejects(
    () => executeNpcBuffRelationRecoveryTransaction({
      connection,
      proposal,
      readCurrent: async () => [{ recordKey: 'd'.repeat(64) }],
      consumeDispatchPermit: async () => { events.push('permit'); },
      insertRows: async () => 1,
      readback: async () => proposal.rows,
    }),
    /before.*drift/i,
  );
  assert.deepEqual(events, ['begin', 'rollback']);
});

test('proposal preparation is independent from retained authorization material', async () => {
  assert.equal(typeof subject.prepareNpcBuffRelationRecoveryAuthorization, 'function');
  assert.match(subject.NPC_BUFF_RELATION_RECOVERY_INPUT_PATH, /\.retry-02\.input\.json$/);
  assert.match(subject.NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH, /\.retry-02\.execution-manifest\.json$/);
  assert.match(subject.NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH, /\.retry-02\.request\.json$/);
  assert.match(subject.NPC_BUFF_RELATION_RECOVERY_RESULT_PATH, /\.retry-02\.result\.json$/);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-buff-proposal-'));
  const retainedPaths = [
    'reports/authorization/canonical/canonical-npc-buff-relation-recovery.input.json',
    'reports/authorization/canonical/canonical-npc-buff-relation-recovery.execution-manifest.json',
    'reports/authorization/canonical/canonical-npc-buff-relation-recovery.request.json',
  ];
  for (const relativePath of retainedPaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, '{"retained":true}\n', { mode: 0o600 });
  }
  const fixture = evidence();
  const connection = {
    async query(sql) {
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: UUID }]];
      if (sql.includes('maint_npcs')) return [fixture.maintNpcRows];
      if (sql.includes('maint_buffs')) return [fixture.maintBuffRows];
      if (sql.includes('maint_npc_crawler_facts')) return [fixture.matchedCrawlerFacts];
      if (sql.includes('terria_v1_local.npc_buff_relations')) return [fixture.localRows];
      if (sql.includes('terria_v1_relation.npc_buff_relations')) return [fixture.relationRows];
      return [[]];
    },
    async end() {},
  };

  const result = await subject.prepareNpcBuffRelationRecoveryProposal({
    repoRoot,
    expectedCount: 1,
    generatedAt: '2026-08-24T00:00:00.000Z',
    mysqlModule: { async createConnection() { return connection; } },
  });

  assert.equal(result.changedRowCount, 1);
  assert.equal(fs.existsSync(path.join(repoRoot, subject.NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH)), true);
  for (const relativePath of retainedPaths) {
    assert.equal(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'), '{"retained":true}\n');
  }
  for (const relativePath of [
    subject.NPC_BUFF_RELATION_RECOVERY_INPUT_PATH,
    subject.NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH,
    subject.NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH,
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), false);
  }
});
