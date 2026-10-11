import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildArmorItemSourcePaths, applyArmorItemEffectSource, prepareArmorItemEffectSource } from './run-armor-item-effect-source.mjs';
import { fixture } from '../relation/armor-shroomite-source-test-fixture.mjs';
import { buildArmorItemEffectSourceProposal } from './armor-item-effect-source-transaction.mjs';
import { buildCanonicalOperationExecutionManifest } from '../automation/canonical-operation-execution-manifest.mjs';
import { buildCanonicalAuthorizationRequestForOperation, authorizeCanonicalCutoverRequest,
  resolveCanonicalOperationTechnicalInput } from '../automation/build-canonical-cutover-authorization.mjs';
import { createAuthorizedOperationDispatchPermit } from '../automation/authorized-operation-context.mjs';
import { consumeDecisionIdentityFile } from '../automation/run-authorized-canonical-operation.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';

test('item-source paths require an exact new label and segregate preparation from terminal evidence', () => {
  const paths = buildArmorItemSourcePaths('retry-01');
  assert.deepEqual(paths, {
    proposalPath: 'reports/authorization/canonical/canonical-armor-item-effect-source.retry-01.proposal.json',
    preparedPath: 'reports/authorization/canonical/canonical-armor-item-effect-source.retry-01.prepared.json',
    resultPath: 'reports/authorization/canonical/canonical-armor-item-effect-source.retry-01.result.json',
  });
  for (const value of [null, '', '../retry', 'retry-01/other', 'Retry-01']) assert.throws(() => buildArmorItemSourcePaths(value), /label/);
});

test('item-source apply cannot open a connection without a fresh governed authorization context', async () => {
  let connections = 0;
  await assert.rejects(applyArmorItemEffectSource({ repoRoot: path.resolve(import.meta.dirname, '../..'),
    resultLabel: 'test-no-authorization', env: {}, mysqlModule: { createConnection() { connections += 1; } } }), /authorization|canonical|packet/i);
  assert.equal(connections, 0);
});

test('item-source CLI rejects missing operation, ambiguous action and apply-time member overrides', () => {
  const entry = new URL('./run-armor-item-effect-source.mjs', import.meta.url);
  for (const args of [[], ['--operation-id=foreign', '--apply=true'],
    ['--operation-id=canonical-armor-item-effect-source', '--apply=true', '--prepare=true'],
    ['--operation-id=canonical-armor-item-effect-source', '--apply=true', '--members=256'],
    ['--operation-id=canonical-armor-item-effect-source', '--prepare=true', '--members=256', '--members=257']]) {
    const result = spawnSync(process.execPath, [entry.pathname, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /item-source CLI/);
  }
});

for (const scenario of ['success', 'proposal-drift', 'label-drift', 'server-drift', 'prepared-exists', 'writer-fence', 'permit-rejected', 'commit-lost', 'teardown-lost']) {
test(`item-source governed runner: ${scenario}`, async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-item-source-runner-'));
  try {
    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    const operationId = 'canonical-armor-item-effect-source';
    const resultLabel = 'test-authorized-01';
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: sourceRoot, operationId, resultLabel });
    for (const entry of manifest.codeBundleEntries) {
      const target = path.join(repoRoot, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, entry.path), target);
    }
    const write = (relativePath, value) => writeJsonNoOverwrite(path.join(repoRoot, relativePath), value);
    write('platform/local/config/local-stack.config.json', {
      database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' },
    });
    const input = { source: fixture(), parsedAt: '2026-09-30T00:00:00Z', currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] };
    const proposal = buildArmorItemEffectSourceProposal({ input, serverUuid: 'uuid-1' });
    const paths = buildArmorItemSourcePaths(resultLabel);
    write(paths.proposalPath, proposal);
    const fingerprint = { host: '127.0.0.1', port: 13306, serverUuid: proposal.serverUuid,
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
    const policies = [{ domainId: 'armor_sets', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
    const generatedAt = new Date(Date.now() - 5000).toISOString();
    const technical = { ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest: manifest }),
      serverFingerprint: fingerprint, policyRows: policies };
    const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot, operationId, executionManifest: manifest,
      serverFingerprint: fingerprint, policyRows: policies, generatedAt, expiresAt: new Date(Date.now() + 60000).toISOString() });
    const packet = authorizeCanonicalCutoverRequest({ request, requestHash: request.requestHash, actor: 'admin',
      reason: 'isolated test', authorizationReference: 'test://item-source', decisionIdentity: 'item-source-test-01',
      currentTechnicalInput: technical, authorizedAt: generatedAt });
    write('packet.json', packet);
    const permit = createAuthorizedOperationDispatchPermit({ directory: repoRoot, packet });
    consumeDecisionIdentityFile({ ledgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
      decisionIdentity: packet.decisionIdentity, dispatchPermitHash: permit.dispatchPermitHash });
    const env = { TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(repoRoot, 'packet.json'),
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path, TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
      TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: JSON.stringify(fingerprint) };
    const tables = { currentLocalLandings: ['terria_v1_local', 'source_dataset_landings'],
      currentMaintLandings: ['terria_v1_maint', 'source_dataset_landings'],
      currentMaintRows: ['terria_v1_maint', 'maint_armor_attribute_rows'] };
    const rows = { currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] };
    const nextIds = { currentLocalLandings: 800, currentMaintLandings: 900, currentMaintRows: 1000 };
    const events = [];
    const connection = {
      async query(sql) {
        if (sql.startsWith('SET ')) return [[]];
        if (sql.includes('@@server_uuid')) return [[{ serverUuid: proposal.serverUuid, serverPort: 13306,
          databaseName: 'terria_v1_local', timezoneOffsetMinutes: 480, maxAllowedPacket: 67108864,
          nowUtc: new Date().toISOString().slice(0, 19).replace('T', ' ') }]];
        if (sql.includes('crawler_automation_owner')) return [[{ username: 'admin', status: 'ACTIVE' }]];
        if (sql.includes('crawler_automation_policy p')) return [policies];
        if (sql.includes('crawler_automation_write_fence')) return [scenario === 'writer-fence' ? [{ id: 1, active: 1 }] : []];
        if (sql.includes('information_schema.TABLES')) return [Object.values(tables).map(([databaseName, tableName]) => ({ databaseName, tableName, engine: 'InnoDB' }))];
        const key = Object.keys(tables).find(key => sql.includes(tables[key].map(part => `\`${part}\``).join('.')));
        assert.ok(key, sql);
        return [structuredClone(rows[key])];
      },
      async execute(sql, values) {
        assert.match(sql, /^INSERT INTO/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, paths.preparedPath))).status, 'PREPARED');
        const key = Object.keys(tables).find(key => sql.includes(tables[key].map(part => `\`${part}\``).join('.')));
        assert.ok(key, sql);
        const columns = [...sql.match(/\(([^)]+)\) VALUES/)[1].matchAll(/`([a-z_]+)`/g)].map(match => match[1]);
        const row = Object.fromEntries(columns.map((column, i) => [column,
          values[i] instanceof Date ? values[i].toISOString() : values[i]]));
        row.id = nextIds[key]++;
        rows[key].push(row);
        events.push('insert');
        return [{ affectedRows: 1, insertId: row.id }];
      },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (scenario === 'commit-lost') throw new Error('commit acknowledgement lost'); },
      async rollback() { events.push('rollback'); },
      async end() { events.push('end'); if (scenario === 'teardown-lost') throw new Error('teardown lost'); },
    };
    const args = { repoRoot, resultLabel, env, mysqlModule: { async createConnection() { return connection; } } };
    if (scenario === 'proposal-drift') fs.appendFileSync(path.join(repoRoot, paths.proposalPath), ' ');
    if (scenario === 'label-drift') args.resultLabel = 'different-label';
    if (scenario === 'server-drift') env.TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT = JSON.stringify({ ...fingerprint, serverUuid: 'foreign' });
    if (scenario === 'prepared-exists') write(paths.preparedPath, { status: 'existing-evidence' });
    if (scenario === 'permit-rejected') env.TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE = 'wrong-nonce';
    if (scenario !== 'success') {
      await assert.rejects(applyArmorItemEffectSource(args), error => {
        if (scenario === 'commit-lost' || scenario === 'teardown-lost') {
          assert.equal(error.requiresReadbackReconciliation, true);
          assert.equal(error.transactionCommitted, scenario === 'commit-lost' ? null : true);
        }
        return /drift|bundle|label|server|exists|fence|permit|acknowledgement|teardown/i.test(error.message);
      });
      if (['proposal-drift', 'label-drift', 'server-drift', 'prepared-exists'].includes(scenario)) {
        assert.deepEqual(events, []);
        assert.ok(fs.existsSync(permit.path));
      } else if (scenario === 'writer-fence' || scenario === 'permit-rejected') {
        assert.deepEqual(events, ['begin', 'rollback', 'end']);
        assert.equal(fs.existsSync(permit.path), scenario === 'writer-fence');
        if (scenario === 'permit-rejected') {
          const terminal = JSON.parse(fs.readFileSync(path.join(repoRoot, paths.resultPath)));
          assert.equal(terminal.status, 'ROLLBACK_CONFIRMED');
          assert.equal(terminal.dispatchPermitConsumed, null);
        }
      } else {
        assert.ok(events.includes('commit'));
        assert.ok(!events.includes('rollback'));
        const terminal = JSON.parse(fs.readFileSync(path.join(repoRoot, paths.resultPath)));
        assert.equal(terminal.status, scenario === 'commit-lost' ? 'COMMIT_UNKNOWN' : 'COMMITTED');
        assert.equal(terminal.authorization.packetHash, packet.packetHash);
      }
      return;
    }
    const result = await applyArmorItemEffectSource(args);
    assert.equal(result.status, 'COMMITTED');
    assert.equal(result.affectedRows, 5);
    assert.equal(result.dispatchPermitConsumed, true);
    assert.equal(result.acceptance, 'source-persistence-only');
    assert.deepEqual(result.bindings, { localLandingId: 800, maintLandingId: 900, maintIds: [1000, 1001, 1002] });
    assert.ok(rows.currentMaintRows.every(row => row.landing_source_id === 900));
    assert.deepEqual(events, ['begin', 'insert', 'insert', 'insert', 'insert', 'insert', 'commit', 'end']);
    const terminal = JSON.parse(fs.readFileSync(path.join(repoRoot, paths.resultPath)));
    assert.equal(terminal.authorization.packetHash, packet.packetHash);
    assert.equal(terminal.proposalSha256, proposal.proposalSha256);
    assert.equal(fs.statSync(path.join(repoRoot, paths.resultPath)).mode & 0o077, 0);
    await assert.rejects(applyArmorItemEffectSource(args), /exists|consumed/);
    assert.deepEqual(events, ['begin', 'insert', 'insert', 'insert', 'insert', 'insert', 'commit', 'end']);
  } finally { fs.rmSync(repoRoot, { recursive: true, force: true }); }
});
}

for (const invalidTimezone of [false, true]) {
  test(`item-source preparation captures a read-only live baseline; invalid timezone=${invalidTimezone}`, async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-item-source-prepare-'));
    const events = [];
    try {
      writeJsonNoOverwrite(path.join(repoRoot, 'platform/local/config/local-stack.config.json'), {
        database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' },
      });
      const connection = {
        async query(sql) {
          events.push(sql);
          if (sql.includes('@@server_uuid')) return [[{ serverUuid: 'uuid-1', timezoneOffsetMinutes: invalidTimezone ? 0 : 480 }]];
          assert.match(sql, /^(?:SET TRANSACTION ISOLATION LEVEL REPEATABLE READ|START TRANSACTION READ ONLY|SELECT \* FROM)/);
          assert.doesNotMatch(sql, /FOR UPDATE/);
          return [[]];
        },
        async rollback() { events.push('rollback'); },
        async end() { events.push('end'); },
      };
      const args = { repoRoot, resultLabel: 'prepare-01', source: fixture(), parsedAt: '2026-09-30T00:00:00Z',
        mysqlModule: { async createConnection() { events.push('connect'); return connection; } } };
      const paths = buildArmorItemSourcePaths(args.resultLabel);
      if (invalidTimezone) {
        await assert.rejects(prepareArmorItemEffectSource(args), /timezone/);
        assert.equal(fs.existsSync(path.join(repoRoot, paths.proposalPath)), false);
      } else {
        const result = await prepareArmorItemEffectSource(args);
        const proposal = JSON.parse(fs.readFileSync(path.join(repoRoot, paths.proposalPath)));
        assert.equal(result.proposalSha256, proposal.proposalSha256);
        assert.equal(result.plannedInsertCount, 5);
        assert.equal(proposal.serverUuid, 'uuid-1');
        assert.equal(fs.statSync(path.join(repoRoot, paths.proposalPath)).mode & 0o077, 0);
        assert.equal(fs.existsSync(path.join(repoRoot, paths.preparedPath)), false);
        assert.equal(fs.existsSync(path.join(repoRoot, paths.resultPath)), false);
        const count = events.length;
        await assert.rejects(prepareArmorItemEffectSource(args), /exists/);
        assert.equal(events.length, count);
      }
      assert.deepEqual(events.slice(-2), ['rollback', 'end']);
    } finally { fs.rmSync(repoRoot, { recursive: true, force: true }); }
  });
}
