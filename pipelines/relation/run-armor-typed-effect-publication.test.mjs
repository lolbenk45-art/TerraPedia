import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

function readOnlyFixtureConnection() {
  const source = persistedItemSourceFixture();
  const calls = [];
  const generic = {
    id: 1, record_key: 'a'.repeat(64), owner_kind: 'item', owner_id: 256,
    source_kind: 'armor_attribute_cell', stat_key: 'crit_chance',
    operation: 'add', value_decimal: '3.0000', unit: 'percent', status: 1, deleted: 0,
  };
  return {
    calls,
    async query(sql) {
      calls.push(['query', sql]);
      if (sql.startsWith('SELECT @@server_uuid')) return [[{ serverUuid: 'server-01', timezoneOffsetMinutes: 480 }]];
      if (sql.includes('FROM terria_v1_maint.maint_armor_attribute_rows')) return [source.maintArmorAttributeRows];
      if (sql.includes('FROM terria_v1_maint.source_dataset_landings')) return [source.maintLandings];
      if (sql.includes('FROM terria_v1_maint.maint_items')) return [source.maintItems];
      if (sql.startsWith('SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes')) return [[generic]];
      return [[]];
    },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute() { throw new Error('candidate preparation attempted DML'); },
    async beginTransaction() { throw new Error('candidate preparation used a writable transaction'); },
    async commit() { throw new Error('candidate preparation attempted commit'); },
  };
}

async function loadRunner() {
  const module = await import('./run-armor-typed-effect-publication.mjs');
  assert.equal(typeof module.prepareArmorTypedEffectPublication, 'function');
  return module;
}

test('typed-effect candidate preparation writes a private no-write proposal from read-only source snapshots', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-prepare-'));
  writeJson(path.join(repoRoot, 'platform/local/config/local-stack.config.json'), {
    database: { host: '127.0.0.1', port: 13306, username: 'readonly', password: 'unused' },
  });
  const db = readOnlyFixtureConnection();
  try {
    const runner = await loadRunner();
    const result = await runner.prepareArmorTypedEffectPublication({
      repoRoot,
      resultLabel: 'candidate-01',
      mysqlModule: { createConnection: async () => db },
    });
    const proposalPath = path.join(repoRoot, result.proposalPath);
    const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));

    assert.equal(result.databaseWrites, false);
    assert.equal(result.applyAllowed, false);
    assert.equal(result.plannedChanges.inserts, 3);
    assert.deepEqual(proposal.sourceFingerprint, {
      pageRevisionId: 1027106,
      iteminfoRevisionId: 1023241,
      armorSetsRevisionId: 964993,
    });
    assert.equal(fs.statSync(proposalPath).mode & 0o077, 0);
    assert.equal(db.calls.some(([kind]) => kind === 'query' && /^(INSERT|UPDATE|DELETE)/i.test(kind)), false);
    assert.equal(db.calls.at(-2)[0], 'rollback');
    assert.equal(db.calls.at(-1)[0], 'end');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('typed-effect candidate preparation refuses an existing attempt artifact', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-prepare-'));
  writeJson(path.join(repoRoot, 'platform/local/config/local-stack.config.json'), {
    database: { host: '127.0.0.1', port: 13306, username: 'readonly', password: 'unused' },
  });
  const paths = `reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-02`;
  writeJson(path.join(repoRoot, `${paths}.result.json`), { retained: true });
  let connections = 0;
  try {
    const runner = await loadRunner();
    await assert.rejects(runner.prepareArmorTypedEffectPublication({
      repoRoot,
      resultLabel: 'candidate-02',
      mysqlModule: { createConnection: async () => { connections += 1; return readOnlyFixtureConnection(); } },
    }), /already exists/i);
    assert.equal(connections, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
