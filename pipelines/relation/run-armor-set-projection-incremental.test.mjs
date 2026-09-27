import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { computePolicySetHash } from '../automation/policy-set-hash.mjs';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from '../automation/canonical-operation-execution-manifest.mjs';
import { resolveCanonicalOperationTechnicalInput } from '../automation/build-canonical-cutover-authorization.mjs';
import { authorizeCanonicalCutoverRequest, buildCanonicalAuthorizationRequestForOperation } from '../automation/build-canonical-cutover-authorization.mjs';
import { createAuthorizedOperationDispatchPermit } from '../automation/authorized-operation-context.mjs';
import { consumeDecisionIdentityFile } from '../automation/run-authorized-canonical-operation.mjs';
import { buildArmorSetProjectionIncrementalProposal } from './armor-set-projection-incremental.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

const runner = await import('./run-armor-set-projection-incremental.mjs').catch(() => ({}));
const operationId = 'canonical-armor-set-projection-incremental';
const serverUuid = '11111111-2222-3333-8444-555555555555';
const policies = [{ domainId: 'armor_sets', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
const context = { actor: 'admin', policySetHash: computePolicySetHash(policies), authorizedAt: '2026-09-24T01:00:00Z', expiresAt: '2026-09-24T02:00:00Z' };

test('Armor attempt paths require a fresh normalized label and separate restoration', () => {
  assert.equal(typeof runner.buildArmorIncrementalPaths, 'function');
  for (const resultLabel of [undefined, '', '../retry-1', 'retry/1', 'Retry-1', 'retry-1.json']) {
    assert.throws(() => runner.buildArmorIncrementalPaths(resultLabel), /label/);
  }
  assert.deepEqual(runner.buildArmorIncrementalPaths('retry-01'), {
    proposalPath: `reports/authorization/canonical/${operationId}.retry-01.proposal.json`,
    resultPath: `reports/authorization/canonical/${operationId}.retry-01.result.json`,
  });
});

test('Armor connection pins historical CST source decoding and rejects remote targets', () => {
  assert.equal(typeof runner.buildArmorIncrementalConnectionOptions, 'function');
  const options = runner.buildArmorIncrementalConnectionOptions({ database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' } });
  assert.equal(options.timezone, '+08:00');
  assert.equal(options.dateStrings, false);
  assert.equal(options.database, 'terria_v1_local');
  assert.throws(() => runner.buildArmorIncrementalConnectionOptions({ database: { host: 'example.com', port: 13306 } }), /loopback/);
  assert.throws(() => runner.buildArmorIncrementalConnectionOptions({ database: { host: '127.0.0.1', port: 3306 } }), /13306/);
});

function gateConnection(overrides = {}) {
  const sqls = [];
  return {
    sqls,
    async query(sql) {
      sqls.push(sql);
      if (sql.includes('@@server_uuid')) return [[{ serverUuid, serverPort: 13306, databaseName: 'terria_v1_local', timezoneOffsetMinutes: 480, nowUtc: '2026-09-24 01:30:00', ...overrides.server }]];
      if (sql.includes('crawler_automation_owner')) return [overrides.owner ?? [{ username: 'admin', status: 'ACTIVE' }]];
      if (sql.includes('crawler_automation_policy p')) return [overrides.policies ?? policies];
      if (sql.includes('crawler_automation_write_fence')) return [overrides.fences ?? []];
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

test('Armor runtime gate locks real Owner policy and the full writer-fence range', async () => {
  assert.equal(typeof runner.assertArmorIncrementalRuntimeFence, 'function');
  const c = gateConnection();
  await runner.assertArmorIncrementalRuntimeFence({ connection: c, authorizedContext: context, serverUuid });
  for (const table of ['crawler_automation_owner', 'crawler_automation_policy p', 'crawler_automation_write_fence']) {
    assert.match(c.sqls.find(sql => sql.includes(table)), /FOR UPDATE$/);
  }
  assert.doesNotMatch(c.sqls.find(sql => sql.includes('crawler_automation_write_fence')), /WHERE/i);
  assert.ok(c.sqls.every(sql => /^SELECT /.test(sql)));
});

test('Armor runtime gate denies expired packets, drifted policy, Owner, server and live fences', async () => {
  assert.equal(typeof runner.assertArmorIncrementalRuntimeFence, 'function');
  for (const overrides of [
    { server: { nowUtc: '2026-09-24 02:00:00' } },
    { server: { nowUtc: '2026-09-24 00:59:59' } },
    { server: { serverUuid: 'wrong' } },
    { server: { timezoneOffsetMinutes: 0 } },
    { server: { databaseName: 'other' } },
    { owner: [{ username: 'admin', status: 'DISABLED' }] },
    { policies: [{ ...policies[0], policyVersion: 2 }] },
    { fences: [{ active: 1 }] },
  ]) await assert.rejects(() => runner.assertArmorIncrementalRuntimeFence({ connection: gateConnection(overrides), authorizedContext: context, serverUuid }), /Armor/);
});

test('Armor artifacts are private ordinary immutable files', () => {
  assert.equal(typeof runner.writeArmorIncrementalArtifact, 'function');
  assert.equal(typeof runner.readArmorIncrementalArtifact, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-incremental-'));
  try {
    const file = 'reports/test.json';
    runner.writeArmorIncrementalArtifact(root, file, { evidence: true });
    assert.deepEqual(runner.readArmorIncrementalArtifact(root, file), { evidence: true });
    assert.equal(fs.statSync(path.join(root, file)).mode & 0o077, 0);
    assert.throws(() => runner.writeArmorIncrementalArtifact(root, file, {}), /exist/);
    fs.symlinkSync('test.json', path.join(root, 'reports/link.json'));
    assert.throws(() => runner.readArmorIncrementalArtifact(root, 'reports/link.json'), /ordinary|symbolic/);
    fs.chmodSync(path.join(root, file), 0o644);
    assert.throws(() => runner.readArmorIncrementalArtifact(root, file), /private/);
    assert.throws(() => runner.writeArmorIncrementalArtifact(root, '../escape.json', {}), /inside/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Armor manifest pins a labeled proposal, result, update-only scope and real executor', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  assert.throws(() => buildCanonicalOperationExecutionManifest({ repoRoot, operationId }), /label/);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'retry-01' });
  assert.deepEqual(manifest.command, ['node', 'pipelines/relation/run-armor-set-projection-incremental.mjs', `--operation-id=${operationId}`, '--result-label=retry-01', '--apply=true']);
  const paths = runner.buildArmorIncrementalPaths('retry-01');
  assert.deepEqual(manifest.inputPaths, [paths.proposalPath]);
  assert.deepEqual(manifest.outputPaths, [paths.resultPath]);
  assert.deepEqual(manifest.ownershipKeys, ['relation.projection_armor_sets.update']);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.ok(manifest.codeBundleEntries.some(e => e.path === 'pipelines/relation/armor-set-projection-incremental.mjs'));
  for (const mutate of [
    m => { m.inputPaths[0] = m.inputPaths[0].replace('retry-01', 'retry-02'); },
    m => { m.outputPaths[0] = m.inputPaths[0]; },
    m => { m.command.push('--prepare=true'); },
    m => { m.ownershipKeys.push('relation.projection_armor_sets.insert'); },
  ]) {
    const changed = structuredClone(manifest); mutate(changed);
    assert.throws(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: changed }), /drift|match|contract|command|manifest/);
  }
  assert.throws(() => resolveCanonicalOperationTechnicalInput({ repoRoot, operationId }), /manifest/);
});

test('Armor apply cannot open a connection without canonical packet context', async () => {
  assert.equal(typeof runner.applyArmorIncrementalProposal, 'function');
  let opened = false;
  await assert.rejects(() => runner.applyArmorIncrementalProposal({ resultLabel: 'test-no-packet', env: {},
    mysqlModule: { async createConnection() { opened = true; throw new Error('should not connect'); } },
  }), /TERRAPEDIA_AUTHORIZED_PACKET_PATH/);
  assert.equal(opened, false);
});

function authorizedFixture({ changed = false } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-authorized-'));
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const resultLabel = 'test-01';
  const paths = runner.buildArmorIncrementalPaths(resultLabel);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: sourceRoot, operationId, resultLabel });
  for (const entry of manifest.codeBundleEntries) {
    const target = path.join(repoRoot, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, entry.path), target);
  }
  runner.writeArmorIncrementalArtifact(repoRoot, 'platform/local/config/local-stack.config.json', { database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' }, minio: { publicEndpoint: 'http://localhost:9000', bucket: 'terrapedia-images', managedImageObjectPrefixes: 'items' } });
  const sourceRows = { relationItems: [], relationItemImages: [], relationArmorSetItems: [], relationArmorSetImages: [], relationArmorAttributeRows: [], relationEquipmentEffectAttributes: [],
    relationArmorSets: [{ id: 1, recordKey: 'b'.repeat(64), textKey: 'ArmorSetBonus.Wood', rawJson: JSON.stringify({ entityType: 'armor_set', pageTitle: 'Wood armor', nameZh: 'Wood armor' }), setsJson: '[]', uniqueItemIdsJson: '[]', setCount: 0, uniqueItemCount: 0, status: 1, deleted: 0 }],
  };
  const prefixes = ['http://localhost:9000/terrapedia-images/items/'];
  const beforeRows = buildProjectionPayload({ ...sourceRows, managedImageUrlPrefixes: prefixes }).projectionArmorSets;
  if (changed) beforeRows[0].nameZh = 'Old name';
  const proposal = buildArmorSetProjectionIncrementalProposal({ beforeRows, sourceRows, serverUuid, managedImageUrlPrefixes: prefixes });
  runner.writeArmorIncrementalArtifact(repoRoot, paths.proposalPath, proposal);
  const fingerprint = { host: '127.0.0.1', port: 13306, serverUuid, databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
  const generatedAt = new Date(Date.now() - 5000).toISOString();
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const technical = { ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest: manifest }), serverFingerprint: fingerprint, policyRows: policies };
  const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot, operationId, executionManifest: manifest, serverFingerprint: fingerprint, policyRows: policies, generatedAt, expiresAt });
  const packet = authorizeCanonicalCutoverRequest({ request, requestHash: request.requestHash, actor: 'admin', reason: 'isolated test fixture', authorizationReference: 'test://armor', decisionIdentity: 'armor-test-01', currentTechnicalInput: technical, authorizedAt: generatedAt });
  const packetPath = path.join(repoRoot, 'packet.json');
  runner.writeArmorIncrementalArtifact(repoRoot, 'packet.json', packet);
  const permit = createAuthorizedOperationDispatchPermit({ directory: repoRoot, packet });
  consumeDecisionIdentityFile({ ledgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'), decisionIdentity: packet.decisionIdentity, dispatchPermitHash: permit.dispatchPermitHash });
  const env = { TERRAPEDIA_AUTHORIZED_PACKET_PATH: packetPath, TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path, TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce, TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: JSON.stringify(fingerprint) };
  const events = [];
  let wrote = false;
  let clock = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const base = gateConnection();
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async rollback() { events.push('rollback'); },
    async commit() { events.push('commit'); },
    async end() { events.push('end'); },
    async execute() { events.push('update'); wrote = true; return [{ affectedRows: 1 }]; },
    async query(sql) {
      events.push(sql);
      if (sql.startsWith('SET TRANSACTION')) return [[]];
      if (sql.includes('@@server_uuid')) return [[{ serverUuid, serverPort: 13306, databaseName: 'terria_v1_local', timezoneOffsetMinutes: 480, nowUtc: clock }]];
      for (const [key, table] of Object.entries(proposal.source.tables)) {
        if (sql.includes(table.split('.').map(part => '`' + part + '`').join('.'))) return [sourceRows[key]];
      }
      if (sql.includes('FROM terria_v1_relation.projection_armor_sets')) return [wrote ? proposal.after.rows : beforeRows];
      return base.query(sql);
    },
  };
  const mysqlModule = { async createConnection(options) { assert.equal(options.timezone, '+08:00'); return connection; } };
  return { repoRoot, resultLabel, paths, env, mysqlModule, events, proposal, permit, connection,
    expire() { clock = new Date(Date.now() + 120000).toISOString().slice(0, 19).replace('T', ' '); },
    cleanup() { fs.rmSync(repoRoot, { recursive: true, force: true }); },
  };
}

test('Armor authorized no-op and changed paths use the real packet/permit/transaction chain', async () => {
  for (const changed of [false, true]) {
    const f = authorizedFixture({ changed });
    try {
      const result = await runner.applyArmorIncrementalProposal(f);
      assert.equal(result.affectedRows, changed ? 1 : 0);
      assert.equal(result.acceptance, changed ? 'projection-publication-only' : 'mechanism-no-op-only');
      assert.equal(fs.existsSync(f.permit.path), false);
      assert.equal(f.events.filter(v => v === 'commit').length, 1);
      assert.deepEqual(runner.readArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath), result);
      await assert.rejects(() => runner.applyArmorIncrementalProposal(f), /exists/);
    } finally { f.cleanup(); }
  }
});

test('Armor rechecks DB expiry after source locks and never consumes or writes on expiry', async () => {
  const f = authorizedFixture({ changed: true });
  try {
    const query = f.connection.query;
    f.connection.query = async sql => { const result = await query(sql); if (sql.includes('FROM terria_v1_relation.projection_armor_sets')) f.expire(); return result; };
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), /DB-clock/);
    assert.equal(f.events.includes('update'), false);
    assert.equal(f.events.includes('rollback'), true);
    assert.equal(fs.existsSync(f.permit.path), true);
    assert.equal(fs.existsSync(path.join(f.repoRoot, f.paths.resultPath)), false);
  } finally { f.cleanup(); }
});

test('Armor private read binds the same bytes as the authorized bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-byte-binding-'));
  try {
    runner.writeArmorIncrementalArtifact(root, 'evidence.json', { original: true });
    assert.throws(() => runner.readArmorIncrementalArtifact(root, 'evidence.json', `sha256:${'0'.repeat(64)}`), /hash/);
    const hash = `sha256:${createHash('sha256').update(fs.readFileSync(path.join(root, 'evidence.json'))).digest('hex')}`;
    assert.deepEqual(runner.readArmorIncrementalArtifact(root, 'evidence.json', hash), { original: true });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Armor no-op expiry at the commit gate explicitly rolls back without an ambiguity claim', async () => {
  const f = authorizedFixture();
  try {
    const query = f.connection.query;
    f.connection.query = async sql => { const result = await query(sql); if (sql.includes('FROM terria_v1_relation.projection_armor_sets')) f.expire(); return result; };
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => /DB-clock/.test(error.message) && error.requiresReadbackReconciliation !== true);
    assert.equal(f.events.includes('rollback'), true);
    assert.equal(f.events.includes('commit'), false);
  } finally { f.cleanup(); }
});

test('Armor ambiguous commit and post-commit result collision require reconciliation without replay', async () => {
  for (const failure of ['commit', 'publication']) {
    const f = authorizedFixture({ changed: true });
    try {
      f.connection.commit = async () => {
        f.events.push('commit');
        if (failure === 'commit') throw new Error('connection lost during commit');
        runner.writeArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath, { retained: true });
      };
      await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => error.requiresReadbackReconciliation === true);
      assert.equal(fs.existsSync(f.permit.path), false);
      assert.equal(f.events.includes('rollback'), false);
      if (failure === 'publication') assert.deepEqual(runner.readArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath), { retained: true });
    } finally { f.cleanup(); }
  }
});

test('Armor teardown failure retains committed state and consumed permit for changed and no-op results', async (t) => {
  for (const changed of [true, false]) {
    await t.test(changed ? 'changed publication' : 'no-op publication', async () => {
      const f = authorizedFixture({ changed });
      const teardownError = new Error('connection close failed');
      try {
        f.connection.end = async () => { throw teardownError; };
        await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => {
          assert.equal(error, teardownError);
          assert.equal(error.requiresReadbackReconciliation, true);
          assert.equal(error.transactionCommitted, true);
          assert.equal(error.commitAttempted, true);
          assert.equal(error.dispatchPermitConsumed, true);
          assert.equal(error.resultPublished, true);
          return true;
        });
        assert.equal(fs.existsSync(f.permit.path), false);
        const result = runner.readArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath);
        assert.equal(result.transactionCommitted, true);
        assert.equal(result.affectedRows, changed ? 1 : 0);
        assert.equal(f.events.includes('rollback'), false);
      } finally { f.cleanup(); }
    });
  }
});

test('Armor teardown failure preserves the primary error and uncertain commit classification', async () => {
  const f = authorizedFixture({ changed: true });
  const primaryError = new Error('connection lost during commit');
  const teardownError = new Error('connection close failed');
  try {
    f.connection.commit = async () => { f.events.push('commit'); throw primaryError; };
    f.connection.end = async () => { throw teardownError; };
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => {
      assert.equal(error, primaryError);
      assert.equal(error.teardownError, teardownError);
      assert.equal(error.requiresReadbackReconciliation, true);
      assert.equal(error.transactionCommitted, null);
      assert.equal(error.commitAttempted, true);
      assert.equal(error.dispatchPermitConsumed, true);
      assert.equal(error.resultPublished, false);
      return true;
    });
    assert.equal(f.events.includes('rollback'), false);
    assert.equal(fs.existsSync(f.permit.path), false);
  } finally { f.cleanup(); }
});

test('Armor teardown failure preserves a result publication error after commit', async () => {
  const f = authorizedFixture({ changed: true });
  const teardownError = new Error('connection close failed');
  try {
    f.connection.commit = async () => {
      f.events.push('commit');
      runner.writeArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath, { retained: true });
    };
    f.connection.end = async () => { throw teardownError; };
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => {
      assert.equal(error.code, 'EEXIST');
      assert.equal(error.teardownError, teardownError);
      assert.equal(error.requiresReadbackReconciliation, true);
      assert.equal(error.transactionCommitted, true);
      assert.equal(error.commitAttempted, true);
      assert.equal(error.dispatchPermitConsumed, true);
      assert.equal(error.resultPublished, false);
      return true;
    });
    assert.deepEqual(runner.readArmorIncrementalArtifact(f.repoRoot, f.paths.resultPath), { retained: true });
  } finally { f.cleanup(); }
});

test('Armor teardown failure preserves an earlier error after a confirmed pre-commit rollback', async () => {
  const f = authorizedFixture();
  const teardownError = new Error('connection close failed');
  try {
    const query = f.connection.query;
    f.connection.query = async sql => { const result = await query(sql); if (sql.includes('FROM terria_v1_relation.projection_armor_sets')) f.expire(); return result; };
    f.connection.end = async () => { throw teardownError; };
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), error => {
      assert.match(error.message, /DB-clock/);
      assert.equal(error.teardownError, teardownError);
      assert.equal(error.requiresReadbackReconciliation, false);
      assert.equal(error.transactionCommitted, false);
      assert.equal(error.commitAttempted, false);
      assert.equal(error.dispatchPermitConsumed, false);
      assert.equal(error.resultPublished, false);
      return true;
    });
    assert.equal(f.events.includes('rollback'), true);
    assert.equal(f.events.includes('commit'), false);
    assert.equal(fs.existsSync(f.permit.path), true);
  } finally { f.cleanup(); }
});

test('Armor apply rejects changed managed-media configuration before opening MySQL', async () => {
  const f = authorizedFixture();
  try {
    let opened = false;
    f.mysqlModule.createConnection = async () => { opened = true; throw new Error('should not connect'); };
    f.env.TERRAPEDIA_MANAGED_IMAGE_URL_PREFIXES = 'https://changed.invalid/items/';
    await assert.rejects(() => runner.applyArmorIncrementalProposal(f), /managed.*prefix/);
    assert.equal(opened, false);
  } finally { f.cleanup(); }
});
