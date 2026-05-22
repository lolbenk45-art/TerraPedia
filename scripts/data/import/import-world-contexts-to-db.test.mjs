import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorldContextImportPlan,
  importWorldContextDataset,
  assertPrimaryDb
} from './import-world-contexts-to-db.mjs';

test('buildWorldContextImportPlan summarizes importable world contexts', () => {
  const plan = buildWorldContextImportPlan({
    worldContexts: [
      worldContext({ code: 'DAY' }),
      worldContext({ code: 'NIGHT' }),
      worldContext({ code: '' })
    ],
    sourceFiles: {
      wikiWorldContextsFile: 'data/generated/wiki-world-contexts.importable.latest.json'
    }
  });

  assert.equal(plan.worldContexts.length, 3);
  assert.equal(plan.summary.worldContexts.input, 3);
  assert.equal(plan.sourceFiles.wikiWorldContextsFile, 'data/generated/wiki-world-contexts.importable.latest.json');
});

test('importWorldContextDataset dry-run plans creates and updates without mutating SQL', async () => {
  const conn = createFakeConnection({
    existing: new Map([['DAY', { id: 1, code: 'DAY' }]])
  });
  const plan = buildWorldContextImportPlan({
    worldContexts: [
      worldContext({ code: 'DAY', nameEn: 'Day updated' }),
      worldContext({ code: 'NIGHT', nameEn: 'Night' })
    ]
  });

  const summary = await importWorldContextDataset(conn, plan, { apply: false });

  assert.equal(summary.worldContexts.input, 2);
  assert.equal(summary.worldContexts.created, 1);
  assert.equal(summary.worldContexts.updated, 1);
  assert.equal(conn.calls.some(call => /\bINSERT INTO world_contexts\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some(call => /\bUPDATE world_contexts\b/i.test(call.sql)), false);
});

test('importWorldContextDataset apply upserts only world_contexts with source fields', async () => {
  const conn = createFakeConnection({
    existing: new Map([['DAY', { id: 1, code: 'DAY' }]])
  });
  const plan = buildWorldContextImportPlan({
    worldContexts: [
      worldContext({ code: 'DAY', nameEn: 'Day updated' }),
      worldContext({ code: 'NIGHT', nameEn: 'Night' })
    ]
  });

  const summary = await importWorldContextDataset(conn, plan, { apply: true });

  assert.equal(summary.worldContexts.created, 1);
  assert.equal(summary.worldContexts.updated, 1);

  const sql = conn.calls.map(call => call.sql).join('\n');
  assert.match(sql, /\bSELECT id, code FROM world_contexts\b/i);
  assert.match(sql, /\bINSERT INTO world_contexts\b/i);
  assert.match(sql, /\bON DUPLICATE KEY UPDATE\b/i);
  assert.match(sql, /\bsource_provider\b/i);
  assert.match(sql, /\bsource_page\b/i);
  assert.match(sql, /\bsource_revision_timestamp\b/i);
  assert.match(sql, /\blast_synced_at\b/i);
  assert.match(sql, /\braw_json\b/i);
  assert.doesNotMatch(sql, /\brecipes\b|\bnpc_shop_conditions\b|\bitems\b|\bbiomes\b|\bshimmer_/i);
});

test('assertPrimaryDb blocks non-primary apply writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_local', false));
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true));
});

function worldContext(overrides = {}) {
  return {
    code: 'DAY',
    nameEn: 'Day',
    nameZh: '白天',
    contextType: 'TIME',
    description: 'Daytime.',
    iconUrl: 'https://terraria.wiki.gg/images/Mock.png',
    sourceProvider: 'wiki_gg',
    sourcePage: 'Day and night cycle',
    sourceRevisionTimestamp: '2026-05-20T00:00:00Z',
    lastSyncedAt: '2026-05-22T00:00:00Z',
    rawJson: '{"sourcePage":"Day and night cycle"}',
    sortOrder: 205,
    status: 1,
    ...overrides
  };
}

function createFakeConnection({ existing = new Map() } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ method: 'query', sql, params });
      if (/SELECT id, code FROM world_contexts/i.test(sql)) {
        return [[...existing.values()]];
      }
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ method: 'execute', sql, params });
      return [{ affectedRows: 1, insertId: 10 }];
    }
  };
}
