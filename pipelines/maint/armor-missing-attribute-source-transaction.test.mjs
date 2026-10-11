import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  buildArmorMissingAttributeSourceProposal,
  validateArmorMissingAttributeSourceProposal,
  executeArmorMissingAttributeSourceTransaction,
} from './armor-missing-attribute-source-transaction.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const candidate = JSON.parse(fs.readFileSync(path.join(repoRoot, '.local/tmp/armor-missing-attribute-maint-candidate-20261006.json'), 'utf8'));
const proposal = () => buildArmorMissingAttributeSourceProposal({ candidate, serverUuid: 'uuid-1' });
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const rehashCandidate = value => {
  const { candidateSha256: _ignored, ...body } = value;
  return { ...body, candidateSha256: `sha256:${createHash('sha256').update(JSON.stringify(stable(body)), 'utf8').digest('hex')}` };
};

function setup(options = {}) {
  const tables = {
    currentLanding: ['terria_v1_maint', 'source_dataset_landings'],
    currentMaintRows: ['terria_v1_maint', 'maint_armor_attribute_rows'],
  };
  const rows = { currentLanding: [], currentMaintRows: [] };
  const nextIds = { currentLanding: 700, currentMaintRows: 900 };
  const events = [];
  let committing = false;
  const currentProposal = proposal();
  const connection = {
    async query(sql, params = []) {
      events.push({ sql, params });
      if (sql.startsWith('SET ')) return [[]];
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: options.wrongServer ? 'foreign' : 'uuid-1', maxAllowedPacket: 67108864 }]];
      if (sql.includes('information_schema.TABLES')) return [Object.values(tables).map(([databaseName, tableName]) => ({ databaseName, tableName, engine: 'InnoDB' }))];
      const key = Object.keys(tables).find(name => sql.includes(tables[name].map(part => `\`${part}\``).join('.')));
      assert.ok(key, sql);
      assert.ok(params.includes(currentProposal.candidate.proposedLanding.source_key));
      const result = structuredClone(rows[key]);
      if (options.drift && key === 'currentLanding') result.push({ ...currentProposal.candidate.proposedLanding, id: 1, payload_json: '{}' });
      if (options.postCommitDrift && committing && key === 'currentMaintRows') result.pop();
      return [result];
    },
    async execute(sql, values) {
      events.push('dml');
      assert.match(sql, /^INSERT INTO /);
      if (options.failInsert) throw new Error('insert failed');
      const key = Object.keys(tables).find(name => sql.includes(tables[name].map(part => `\`${part}\``).join('.')));
      assert.ok(key, sql);
      const columns = [...sql.match(/\(([^)]+)\) VALUES/)[1].matchAll(/`([a-z_]+)`/g)].map(match => match[1]);
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index] instanceof Date ? values[index].toISOString() : values[index]]));
      row.id = nextIds[key]++;
      rows[key].push(row);
      return [{ affectedRows: options.badReceipt ? 0 : 1, insertId: row.id }];
    },
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); committing = true; if (options.commitLost) throw new Error('commit acknowledgement lost'); },
    async rollback() { events.push('rollback'); if (options.rollbackLost) throw new Error('rollback uncertain'); },
  };
  const args = {
    connection,
    proposal: currentProposal,
    assertRuntimeFence: async () => { events.push('fence'); },
    consumePermit: async () => { events.push('permit'); if (options.badPermit) throw new Error('permit rejected'); },
    persistPrepared: async evidence => { events.push('prepared'); assert.equal(evidence.status, 'PREPARED'); },
    persistOutcome: async evidence => { events.push(evidence.status); },
  };
  return { args, events, rows };
}

test('missing-attribute transaction inserts one landing and nine maint rows after PREPARED and permit', async () => {
  const fixture = setup();
  const result = await executeArmorMissingAttributeSourceTransaction(fixture.args);
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.affectedRows, 10);
  assert.ok(fixture.events.indexOf('prepared') < fixture.events.indexOf('permit'));
  assert.ok(fixture.events.indexOf('permit') < fixture.events.indexOf('dml'));
  assert.ok(fixture.events.indexOf('commit') < fixture.events.indexOf('COMMITTED'));
  assert.equal(fixture.rows.currentMaintRows.length, 9);
});

test('exact replay reuses the landing and maint IDs without new inserts', async () => {
  const fixture = setup();
  await executeArmorMissingAttributeSourceTransaction(fixture.args);
  const replayCandidate = rehashCandidate({
      ...candidate,
      proposedLanding: { ...candidate.proposedLanding, id: 700 },
      changes: {
        ...candidate.changes,
        landing: { inserts: [], reused: [{ ...candidate.proposedLanding, id: 700 }], preserved: [] },
        maint: { ...candidate.changes.maint, inserts: [], reused: fixture.rows.currentMaintRows, preserved: [] },
      },
      maintRows: candidate.maintRows.map((row, index) => ({ ...row, id: 900 + index, landing_source_id: 700 })),
    });
  const replayProposal = buildArmorMissingAttributeSourceProposal({
    candidate: replayCandidate,
    serverUuid: 'uuid-1',
  });
  fixture.args.proposal = replayProposal;
  fixture.events.length = 0;
  const result = await executeArmorMissingAttributeSourceTransaction(fixture.args);
  assert.equal(result.affectedRows, 0);
  assert.equal(fixture.events.includes('dml'), false);
});

for (const option of ['badPermit', 'commitLost', 'rollbackLost', 'postCommitDrift']) {
  test(`records ${option} without blind success`, async () => {
    const fixture = setup({ [option]: true, ...(option === 'rollbackLost' ? { failInsert: true } : {}) });
    await assert.rejects(executeArmorMissingAttributeSourceTransaction(fixture.args), error => {
      if (option === 'commitLost' || option === 'postCommitDrift' || option === 'rollbackLost') {
        assert.equal(error.requiresReadbackReconciliation, true);
      }
      return true;
    });
    if (option === 'commitLost' || option === 'postCommitDrift') assert.equal(fixture.events.includes('rollback'), false);
  });
}

test('proposal validation is required before a transaction begins', async () => {
  const fixture = setup();
  fixture.args.proposal.candidate.maintRows[0].defense_value = 999;
  assert.throws(() => validateArmorMissingAttributeSourceProposal(fixture.args.proposal), /candidate|hash|drift/i);
  await assert.rejects(executeArmorMissingAttributeSourceTransaction(fixture.args), /candidate|hash|drift/i);
  assert.deepEqual(fixture.events, []);
});
