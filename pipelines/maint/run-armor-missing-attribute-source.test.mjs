import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildArmorMissingAttributeSourcePaths, applyArmorMissingAttributeSource, prepareArmorMissingAttributeSource } from './run-armor-missing-attribute-source.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const candidate = JSON.parse(fs.readFileSync(path.join(sourceRoot, '.local/tmp/armor-missing-attribute-maint-candidate-20261006.json'), 'utf8'));

test('missing-attribute source paths are exact and label-bound', () => {
  assert.deepEqual(buildArmorMissingAttributeSourcePaths('retry-01'), {
    proposalPath: 'reports/authorization/canonical/canonical-armor-missing-attribute-source.retry-01.proposal.json',
    preparedPath: 'reports/authorization/canonical/canonical-armor-missing-attribute-source.retry-01.prepared.json',
    resultPath: 'reports/authorization/canonical/canonical-armor-missing-attribute-source.retry-01.result.json',
    ownerDecisionPath: 'reports/authorization/canonical/canonical-armor-missing-attribute-source.retry-01.owner-decision.json',
  });
  for (const label of [null, '', '../retry', 'Retry-01']) assert.throws(() => buildArmorMissingAttributeSourcePaths(label), /label/i);
});

test('missing-attribute source apply cannot connect without exact authorization', async () => {
  let connections = 0;
  await assert.rejects(applyArmorMissingAttributeSource({
    repoRoot: path.resolve(import.meta.dirname, '../..'), resultLabel: 'no-auth', env: {},
    mysqlModule: { async createConnection() { connections++; } },
  }), /authorization|manifest|packet/i);
  assert.equal(connections, 0);
});

test('missing-attribute source preparation reads a live baseline and writes proposal only', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-missing-attribute-prepare-'));
  const events = [];
  try {
    fs.mkdirSync(path.join(repoRoot, 'platform/local/config'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'platform/local/config/local-stack.config.json'), JSON.stringify({
      database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' },
    }));
    const connection = {
      async query(sql) {
        events.push(sql);
        if (sql.includes('@@server_uuid')) return [[{ serverUuid: 'uuid-1', timezoneOffsetMinutes: 480 }]];
        if (sql.startsWith('SET ') || sql.startsWith('START ')) return [[]];
        assert.match(sql, /SELECT \* FROM/);
        assert.doesNotMatch(sql, /FOR UPDATE/);
        return [[]];
      },
      async rollback() { events.push('rollback'); },
      async end() { events.push('end'); },
    };
    const result = await prepareArmorMissingAttributeSource({
      repoRoot,
      resultLabel: 'prepare-01',
      candidate,
      mysqlModule: { async createConnection() { events.push('connect'); return connection; } },
    });
    assert.equal(result.databaseWrites, false);
    assert.equal(result.executionReady, false);
    const paths = buildArmorMissingAttributeSourcePaths('prepare-01');
    assert.equal(fs.existsSync(path.join(repoRoot, paths.proposalPath)), true);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.preparedPath)), false);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.resultPath)), false);
    assert.deepEqual(events.slice(-2), ['rollback', 'end']);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
