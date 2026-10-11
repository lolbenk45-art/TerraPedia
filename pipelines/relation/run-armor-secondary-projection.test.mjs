import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildArmorSecondaryPaths, applyArmorSecondaryProjection } from './run-armor-secondary-projection.mjs';
import { fixture } from './armor-secondary-projection.fixture.mjs';
import { ARMOR_SECONDARY_SOURCE_TABLES, ARMOR_SECONDARY_PROJECTION_TABLES,
  buildArmorSecondaryProjectionProposal } from './armor-secondary-projection.mjs';
import { buildCanonicalOperationExecutionManifest } from '../automation/canonical-operation-execution-manifest.mjs';
import { buildCanonicalAuthorizationRequestForOperation, authorizeCanonicalCutoverRequest,
  resolveCanonicalOperationTechnicalInput } from '../automation/build-canonical-cutover-authorization.mjs';
import { createAuthorizedOperationDispatchPermit } from '../automation/authorized-operation-context.mjs';
import { consumeDecisionIdentityFile } from '../automation/run-authorized-canonical-operation.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';

test('secondary paths require an exact new label and segregate preparation from terminal evidence', () => {
  const paths = buildArmorSecondaryPaths('retry-01');
  assert.deepEqual(paths, {
    proposalPath: 'reports/authorization/canonical/canonical-armor-secondary-projection.retry-01.proposal.json',
    preparedPath: 'reports/authorization/canonical/canonical-armor-secondary-projection.retry-01.prepared.json',
    resultPath: 'reports/authorization/canonical/canonical-armor-secondary-projection.retry-01.result.json',
  });
  for (const value of [null, '', '../retry', 'retry-01/other', 'Retry-01']) assert.throws(() => buildArmorSecondaryPaths(value), /label/);
});

test('secondary apply cannot open a connection without a fresh governed authorization context', async () => {
  let connections = 0;
  await assert.rejects(applyArmorSecondaryProjection({ repoRoot: path.resolve(import.meta.dirname, '../..'),
    resultLabel: 'test-no-authorization', env: {}, mysqlModule: { createConnection() { connections += 1; } } }), /authorization|canonical|packet/i);
  assert.equal(connections, 0);
});

test('secondary CLI rejects missing operation, ambiguous action and apply-time member overrides', () => {
  const entry = new URL('./run-armor-secondary-projection.mjs', import.meta.url);
  for (const args of [[], ['--operation-id=foreign', '--apply=true'],
    ['--operation-id=canonical-armor-secondary-projection', '--apply=true', '--prepare=true'],
    ['--operation-id=canonical-armor-secondary-projection', '--apply=true', '--members=256'],
    ['--operation-id=canonical-armor-secondary-projection', '--prepare=true', '--members=256', '--members=257']]) {
    const result = spawnSync(process.execPath, [entry.pathname, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /secondary CLI/);
  }
});

test('secondary governed runner binds real packet and one-use permit to private durable evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-secondary-runner-'));
  try {
    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    const operationId = 'canonical-armor-secondary-projection';
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
    const input = await fixture();
    const proposal = await buildArmorSecondaryProjectionProposal(input);
    const paths = buildArmorSecondaryPaths(resultLabel);
    write(paths.proposalPath, proposal);
    const fingerprint = { host: '127.0.0.1', port: 13306, serverUuid: input.serverUuid,
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
    const policies = [{ domainId: 'armor_sets', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
    const generatedAt = new Date(Date.now() - 5000).toISOString();
    const technical = { ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest: manifest }),
      serverFingerprint: fingerprint, policyRows: policies };
    const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot, operationId, executionManifest: manifest,
      serverFingerprint: fingerprint, policyRows: policies, generatedAt, expiresAt: new Date(Date.now() + 60000).toISOString() });
    const packet = authorizeCanonicalCutoverRequest({ request, requestHash: request.requestHash, actor: 'admin',
      reason: 'isolated test', authorizationReference: 'test://secondary', decisionIdentity: 'secondary-test-01',
      currentTechnicalInput: technical, authorizedAt: generatedAt });
    write('packet.json', packet);
    const permit = createAuthorizedOperationDispatchPermit({ directory: repoRoot, packet });
    consumeDecisionIdentityFile({ ledgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
      decisionIdentity: packet.decisionIdentity, dispatchPermitHash: permit.dispatchPermitHash });
    const env = { TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(repoRoot, 'packet.json'),
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path, TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
      TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: JSON.stringify(fingerprint) };
    const rows = structuredClone(input.beforeRows);
    const events = [];
    const connection = {
      async query(sql) {
        if (sql.startsWith('SET ')) return [[]];
        if (sql.includes('@@server_uuid')) return [[{ serverUuid: input.serverUuid, serverPort: 13306,
          databaseName: 'terria_v1_local', timezoneOffsetMinutes: 480,
          nowUtc: new Date().toISOString().slice(0, 19).replace('T', ' ') }]];
        if (sql.includes('crawler_automation_owner')) return [[{ username: 'admin', status: 'ACTIVE' }]];
        if (sql.includes('crawler_automation_policy p')) return [policies];
        if (sql.includes('crawler_automation_write_fence')) return [[]];
        const table = ARMOR_SECONDARY_PROJECTION_TABLES.find(table => sql.includes(`terria_v1_relation.${table}`));
        if (table) return [structuredClone(rows[table])];
        const source = Object.entries(ARMOR_SECONDARY_SOURCE_TABLES).find(([, table]) => sql.startsWith(`SELECT * FROM ${table} `)
          || sql.includes(`FROM ${table} ORDER BY`));
        assert.ok(source, sql);
        return [structuredClone(input.sourceRows[source[0]])];
      },
      async execute(sql, values) {
        assert.match(sql, /^INSERT INTO/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, paths.preparedPath))).status, 'PREPARED');
        const table = ARMOR_SECONDARY_PROJECTION_TABLES.find(table => sql.includes(table));
        const columns = [...sql.matchAll(/`([a-z0-9_]+)`/g)].map(match => match[1]).slice(2);
        rows[table].push(Object.fromEntries(columns.map((column, i) => [column,
          values[i] instanceof Date ? values[i].toISOString() : values[i]])));
        events.push('insert');
        return [{ affectedRows: 1 }];
      },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); },
      async rollback() { events.push('rollback'); },
      async end() { events.push('end'); },
    };
    const args = { repoRoot, resultLabel, env, mysqlModule: { async createConnection() { return connection; } } };
    const result = await applyArmorSecondaryProjection(args);
    assert.equal(result.status, 'COMMITTED');
    assert.equal(result.affectedRows, 2);
    assert.equal(result.dispatchPermitConsumed, true);
    assert.deepEqual(rows, proposal.afterRows);
    assert.deepEqual(events, ['begin', 'insert', 'insert', 'commit', 'end']);
    const terminal = JSON.parse(fs.readFileSync(path.join(repoRoot, paths.resultPath)));
    assert.equal(terminal.authorization.packetHash, packet.packetHash);
    assert.equal(terminal.proposalSha256, proposal.proposalSha256);
    assert.equal(fs.statSync(path.join(repoRoot, paths.resultPath)).mode & 0o077, 0);
    await assert.rejects(applyArmorSecondaryProjection(args), /exists|consumed/);
    assert.deepEqual(events, ['begin', 'insert', 'insert', 'commit', 'end']);
  } finally { fs.rmSync(repoRoot, { recursive: true, force: true }); }
});
