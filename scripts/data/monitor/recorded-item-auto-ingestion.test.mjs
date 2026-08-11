import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectRecordedItemSelection,
  runRecordedItemAutoIngestion,
} from './recorded-item-auto-ingestion.mjs';

const databases = {
  local: 'terria_v1_automation_acceptance_itm_0123456789abcdef_local',
  maint: 'terria_v1_automation_acceptance_itm_0123456789abcdef_maint',
  relation: 'terria_v1_automation_acceptance_itm_0123456789abcdef_relation',
};

test('Item recorded selection is bounded to 100, offline, and repository-relative', () => {
  const payload = { entity: 'items', records: Array.from({ length: 101 }, (_, index) => ({ id: index + 1, internalName: `Item${index + 1}` })) };
  const result = collectRecordedItemSelection({ payload, sourcePath: 'data/standardized/items.standardized.json', limit: 100 });
  assert.equal(result.networkAccess, false);
  assert.equal(result.records.length, 100);
  assert.equal(result.internalNames.at(-1), 'Item100');
  assert.throws(() => collectRecordedItemSelection({ payload, sourcePath: '/etc/items.json', limit: 100 }), /repository-relative/);
  assert.throws(() => collectRecordedItemSelection({ payload, sourcePath: 'https://example.test/items.json', limit: 100 }), /repository-relative/);
  assert.throws(() => collectRecordedItemSelection({ payload, sourcePath: 'data/standardized/items.standardized.json', limit: 101 }), /at most one hundred/);
});

test('Item ingestion resolves every selected identity through formal readonly rows and writes all three derived schemas', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-recorded-item-'));
  fs.mkdirSync(path.join(root, 'data', 'standardized'), { recursive: true });
  fs.writeFileSync(path.join(root, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n');
  const sourcePath = path.join(root, 'data', 'standardized', 'items.json');
  fs.writeFileSync(sourcePath, JSON.stringify({ entity: 'items', records: [
    { id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe', stats: { damage: 5 } },
    { id: 2, internalName: 'DirtBlock', name: 'Dirt Block', stats: { damage: 0 } },
  ] }));
  const calls = [];
  const formalRows = [
    { id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', status: 1, deleted: 0 },
    { id: 2, internal_name: 'DirtBlock', name: 'Dirt Block', status: 1, deleted: 0 },
  ];
  const connection = (database) => ({
    config: { database },
    async query(sql, params = []) {
      calls.push({ database, sql, params });
      if (/FROM `terria_v1_local`\.`items`/i.test(sql)) return [formalRows, []];
      if (/COUNT\(\*\)/i.test(sql)) return [[{ total: 2 }], []];
      return [[], []];
    },
    async beginTransaction() { calls.push({ database, op: 'begin' }); },
    async commit() { calls.push({ database, op: 'commit' }); },
    async rollback() { calls.push({ database, op: 'rollback' }); },
    async end() { calls.push({ database, op: 'end' }); },
  });
  const result = await runRecordedItemAutoIngestion({
    profile: 't1', runId: 'item-test-01', repoRoot: root, sourcePath: 'data/standardized/items.json', markerRoot: root,
    databases, mysql: { host: '127.0.0.1', port: 3306, username: 'prov', password: 'pw', readonlyUsername: 'ro', readonlyPassword: 'ro-pw' },
    createConnectionImpl: async ({ database, user }) => connection(user === 'ro' ? 'formal' : database),
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.itemCount, 2);
  assert.equal(result.maintCount, 2);
  assert.equal(result.relationCount, 2);
  assert.equal(result.unresolvedIdentities, 0);
  assert.ok(calls.some((call) => /INSERT INTO `terria_v1_automation_acceptance_itm_0123456789abcdef_local`\.`items`/i.test(call.sql)));
  assert.ok(calls.some((call) => /INSERT INTO `terria_v1_automation_acceptance_itm_0123456789abcdef_maint`\.`maint_items`/i.test(call.sql)));
  assert.ok(calls.some((call) => /INSERT INTO `terria_v1_automation_acceptance_itm_0123456789abcdef_relation`\.`relation_items`/i.test(call.sql)));
});

test('Item ingestion fails closed and rolls back when formal identity is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-recorded-item-missing-'));
  fs.mkdirSync(path.join(root, 'data', 'standardized'), { recursive: true });
  fs.writeFileSync(path.join(root, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n');
  fs.writeFileSync(path.join(root, 'data', 'standardized', 'items.json'), JSON.stringify({ entity: 'items', records: [{ id: 1, internalName: 'MissingItem' }] }));
  const events = [];
  const conn = {
    async query(sql) { if (/FROM `terria_v1_local`\.`items`/i.test(sql)) return [[], []]; return [[], []]; },
    async beginTransaction() { events.push('begin'); }, async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, async end() {},
  };
  await assert.rejects(() => runRecordedItemAutoIngestion({
    profile: 't1', runId: 'item-test-02', repoRoot: root, sourcePath: 'data/standardized/items.json', markerRoot: root, databases,
    mysql: { host: '127.0.0.1', port: 3306, username: 'prov', password: 'pw', readonlyUsername: 'ro', readonlyPassword: 'ro-pw' },
    createConnectionImpl: async () => conn,
  }), /dependency closure is incomplete/);
  assert.deepEqual(events, []);
});
