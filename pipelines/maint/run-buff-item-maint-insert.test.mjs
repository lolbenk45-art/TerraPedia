import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as runner from './run-buff-item-maint-insert.mjs';
import { sourceFixture } from './buff-item-maint-insert.fixture.mjs';
import { hashBuffItemMaintBytes, BUFF_ITEM_MAINT_INSERT_IDENTITIES } from './buff-item-maint-insert-contract.mjs';
import { computePolicySetHash } from '../automation/policy-set-hash.mjs';
import { buildBuffItemMaintInsertProposal } from './buff-item-maint-insert-contract.mjs';
import { buildCanonicalOperationExecutionManifest } from '../automation/canonical-operation-execution-manifest.mjs';
import { buildCanonicalAuthorizationRequestForOperation, authorizeCanonicalCutoverRequest,
  resolveCanonicalOperationTechnicalInput } from '../automation/build-canonical-cutover-authorization.mjs';
import { createAuthorizedOperationDispatchPermit } from '../automation/authorized-operation-context.mjs';
import { consumeDecisionIdentityFile } from '../automation/run-authorized-canonical-operation.mjs';
import { acquireFence } from '../automation/table-ownership-fence.mjs';

const codeRoot = path.resolve(import.meta.dirname, '../..');

test('committed recovery holds prevent competing fence takeover after the ordinary TTL', async t => {
  assert.equal(typeof runner.retainBuffItemMaintFences, 'function', 'durable Item recovery fence retention is missing');
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  const proposal = { runId: 'buff-items-hold-01', landing: { source_key: 'canonical.buff-item-dependency.buff-items-hold-01' },
    maintInserts: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => ({ source_id: row.sourceId })) };
  const authorization = { decisionIdentity: 'hold-decision', packetHash: `sha256:${'a'.repeat(64)}`,
    authorizedAt: new Date(current - 1000).toISOString(), expiresAt: new Date(current + 3600000).toISOString(),
    executionManifest: { buffItemMaintInsert: { fenceTokens: { landing: 'fence:hold-landing', maint: 'fence:hold-maint' } } } };
  const identities = runner.buildBuffItemMaintFenceIdentities(proposal);
  const fences = identities.map((identity, index) => ({ ...identity, latest_run_id: proposal.runId,
    fence_token: index === 0 ? 'fence:hold-landing' : 'fence:hold-maint', expires_at: new Date(current + 3600000) }));
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('hold-commit'); }, async rollback() { events.push('rollback'); },
    async query(sql, values) {
      if (sql.startsWith('UPDATE')) {
        const row = fences.find(fence => fence.fence_token === values[6]);
        assert.ok(row); assert.equal(row.latest_run_id, values[7]);
        row.expires_at = new Date(`${values[0].replace(' ', 'T')}Z`); events.push(`hold-${row.databaseRole}`);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO')) {
        const row = fences.find(fence => fence.logicalPredicateHash === values[4]);
        if (row.expires_at.getTime() < Date.now()) { row.latest_run_id = values[5]; row.fence_token = values[6]; }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('SELECT')) return [[fences.find(fence => fence.logicalPredicateHash === values[4])]];
      throw new Error(`Unexpected hold SQL ${sql}`);
    },
  };
  const journal = { async holdPrepared() { events.push('hold-prepared'); }, async holdCommitted() { events.push('hold-journal'); } };
  await runner.retainBuffItemMaintFences({ connection, authorization, proposal, lockRuntime: async () => events.push('locked'), journal });
  assert.deepEqual(events, ['begin', 'locked', 'hold-prepared', 'hold-local', 'hold-maint', 'hold-commit', 'hold-journal']);
  t.mock.timers.setTime(current + 7200000);
  for (const identity of identities) await assert.rejects(acquireFence(connection, identity, 'competitor', 0), /held by another run/);
  assert.ok(fences.every(row => row.latest_run_id === proposal.runId));
});

test('recovery hold failure stops before business mutation and preserves uncertain outcome', async () => {
  assert.equal(typeof runner.retainBuffItemMaintFences, 'function');
  for (const failure of ['update', 'commit', 'rollback', 'journal']) {
    const proposal = { runId: 'hold-failure-01', landing: { source_key: 'canonical.buff-item-dependency.hold-failure-01' },
      maintInserts: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => ({ source_id: row.sourceId })) };
    const authorization = { decisionIdentity: 'hold-decision', packetHash: `sha256:${'a'.repeat(64)}`,
      authorizedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      executionManifest: { buffItemMaintInsert: { fenceTokens: { landing: 'fence:hold-landing', maint: 'fence:hold-maint' } } } };
    const events = [];
    const connection = { async beginTransaction() {}, async query(sql) {
      assert.ok(sql.startsWith('UPDATE')); events.push('hold-update');
      if (['update', 'rollback'].includes(failure)) throw new Error('hold update failed');
      return [{ affectedRows: 1 }];
    }, async commit() { events.push('commit'); if (failure === 'commit') throw new Error('commit lost'); },
    async rollback() { events.push('rollback'); if (failure === 'rollback') throw new Error('rollback lost'); } };
    const journal = { async holdPrepared() {}, async holdCommitted() { if (failure === 'journal') throw new Error('journal unavailable'); } };
    await assert.rejects(runner.retainBuffItemMaintFences({ connection, authorization, proposal, lockRuntime: async () => {}, journal }),
      error => error.transactionOutcome === 'not-started'
        && error.fenceHoldOutcome === ({ update: 'rolled-back', commit: 'unknown', rollback: 'unknown', journal: 'committed' })[failure]);
    if (['commit', 'journal'].includes(failure)) assert.ok(!events.includes('rollback'));
  }
});

test('unknown hold commit requires independent reconciliation before fences can be trusted', async t => {
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  const proposal = { runId: 'hold-reconcile-01', landing: { source_key: 'canonical.buff-item-dependency.hold-reconcile-01' },
    maintInserts: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => ({ source_id: row.sourceId })) };
  const authorization = { decisionIdentity: 'hold-reconcile-decision', packetHash: `sha256:${'a'.repeat(64)}`,
    authorizedAt: new Date(current - 1000).toISOString(), expiresAt: new Date(current + 3600000).toISOString(),
    executionManifest: { buffItemMaintInsert: { fenceTokens: { landing: 'fence:reconcile-landing', maint: 'fence:reconcile-maint' } } } };
  const identities = runner.buildBuffItemMaintFenceIdentities(proposal);
  const fences = identities.map((identity, index) => ({ ...identity, latest_run_id: proposal.runId,
    fence_token: index === 0 ? 'fence:reconcile-landing' : 'fence:reconcile-maint',
    expires_at: new Date(current + 3600000) }));
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('hold-commit-unknown'); throw new Error('commit acknowledgement lost'); },
    async rollback() { events.push('rollback'); },
    async query(sql, values) {
      if (sql.startsWith('UPDATE')) {
        const row = fences.find(fence => fence.fence_token === values[6]);
        assert.ok(row);
        events.push(`hold-${row.databaseRole}`);
        // Model an acknowledgement-lost hold commit whose updates are not
        // visible to the independent recovery connection.
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO')) {
        const row = fences.find(fence => fence.logicalPredicateHash === values[4]);
        assert.ok(row);
        if (row.expires_at.getTime() < Date.now()) {
          row.latest_run_id = values[5];
          row.fence_token = values[6];
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('SELECT latest_run_id')) {
        const row = fences.find(fence => fence.logicalPredicateHash === values[4]);
        return [[row]];
      }
      throw new Error(`Unexpected hold SQL ${sql}`);
    },
  };
  let reconciled = false;
  const journal = { async holdPrepared() { events.push('hold-prepared'); }, async holdCommitted() {} };
  const recoveryConnection = {
    async beginTransaction() { events.push('reconcile-begin'); },
    async commit() { events.push('reconcile-commit'); },
    async rollback() { events.push('reconcile-rollback'); },
    async query(sql, values) {
      assert.ok(sql.startsWith('UPDATE'));
      const row = fences.find(fence => fence.fence_token === values[6]);
      assert.ok(row);
      if (sql.includes('expires_at > CURRENT_TIMESTAMP') && row.expires_at.getTime() <= Date.now()) {
        return [{ affectedRows: 0 }];
      }
      row.expires_at = new Date(`${values[0].replace(' ', 'T')}Z`);
      events.push(`reconcile-${row.databaseRole}`);
      return [{ affectedRows: 1 }];
    },
  };
  await assert.rejects(runner.retainBuffItemMaintFences({ connection, authorization, proposal,
    lockRuntime: async () => events.push('locked'), journal,
    reconcileUnknownHold: async ({ proposal: recoveryProposal, authorization: recoveryAuthorization }) => {
      reconciled = true;
      t.mock.timers.setTime(current + 7200000);
      await runner.reconcileBuffItemMaintFences({ connection: recoveryConnection,
        proposal: recoveryProposal, authorization: recoveryAuthorization,
        lockRuntime: async () => events.push('reconcile-locked'),
        journal: { async holdReconciled() { events.push('reconcile-journal'); } },
      });
    },
  }), error => error.fenceHoldOutcome === 'unknown' && error.requiresReadbackReconciliation === true);
  assert.equal(reconciled, true);
  assert.deepEqual(events, ['begin', 'locked', 'hold-prepared', 'hold-local', 'hold-maint', 'hold-commit-unknown',
    'reconcile-begin', 'reconcile-locked', 'reconcile-local', 'reconcile-maint', 'reconcile-commit', 'reconcile-journal']);
  for (const identity of identities) await assert.rejects(acquireFence(connection, identity, 'competitor', 0), /held by another run/);
});

test('confirmed rollback can release an exact fence after packet expiry', async () => {
  assert.equal(typeof runner.releaseBuffItemMaintFences, 'function');
  const proposal = { runId: 'expired-release-01', landing: { source_key: 'canonical.buff-item-dependency.expired-release-01' },
    maintInserts: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => ({ source_id: row.sourceId })) };
  const authorization = { authorizationStatus: 'AUTHORIZED', operationId: 'canonical-buff-item-maint-insert',
    authorizedAt: '2026-10-06T00:00:00.000Z', expiresAt: '2026-10-06T00:01:00.000Z',
    executionManifest: { buffItemMaintInsert: { runId: proposal.runId,
      fenceTokens: { landing: 'fence:expired-landing', maint: 'fence:expired-maint' } } } };
  const calls = [];
  const connection = { async query(sql, values) {
    calls.push(values[5]); return [{ affectedRows: 1 }];
  } };
  await runner.releaseBuffItemMaintFences({ connection, authorization, proposal });
  assert.deepEqual(calls, ['fence:expired-landing', 'fence:expired-maint']);
});

test('rejects non-loopback and wrong-port MySQL targets before opening a connection', () => {
  assert.equal(typeof runner.buildBuffItemMaintConnectionOptions, 'function', 'canonical Item runner is missing');
  for (const database of [{ host: 'remote.example', port: 13306 }, { host: '127.0.0.1', port: 3306 }]) {
    assert.throws(() => runner.buildBuffItemMaintConnectionOptions({ database }), /loopback|port/i);
  }
  const options = runner.buildBuffItemMaintConnectionOptions({ database: { host: '127.0.0.1', port: 13306, username: 'user', password: 'private' } });
  assert.equal(options.database, 'terria_v1_local');
  assert.equal(options.dateStrings, true);
  assert.equal(options.multipleStatements, false);
});

test('rereads only manifest-bound ordinary source files and rejects symlink replacement', () => {
  assert.equal(typeof runner.readBuffItemMaintSource, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-item-source-'));
  try {
    const source = sourceFixture();
    const captureDir = path.join(root, '.local/tmp/buff-iteminfo-semantic-capture-20261001-v2');
    const inputDir = path.join(root, '.local/tmp/b1-a63-20260929-08/raw');
    fs.mkdirSync(captureDir, { recursive: true }); fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'template__getbuffinfo.parsed.latest.json'), source.inputBytes, { mode: 0o600 });
    const manifest = JSON.parse(source.manifestBytes);
    manifest.pages.forEach((page, index) => { page.path = path.join(captureDir, `page-00${index + 1}.json`); });
    fs.writeFileSync(path.join(captureDir, 'capture.json'), JSON.stringify(manifest), { mode: 0o600 });
    source.semanticCapture.pages.forEach((page, index) => fs.writeFileSync(path.join(captureDir, `page-00${index + 1}.json`), page.rawBytes, { mode: 0o600 }));
    const binding = runner.readBuffItemMaintSource({ repoRoot: root });
    assert.equal(hashBuffItemMaintBytes(binding.semanticCapture.pages[0].rawBytes), manifest.pages[0].sha256);
    fs.renameSync(path.join(captureDir, 'page-001.json'), path.join(root, 'raw.json'));
    fs.symlinkSync(path.join(root, 'raw.json'), path.join(captureDir, 'page-001.json'));
    assert.throws(() => runner.readBuffItemMaintSource({ repoRoot: root }), /symbolic|symlink|ordinary/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runtime lock verifies exact Owner/server/policy and both fence predicates', async () => {
  assert.equal(typeof runner.lockBuffItemMaintRuntime, 'function');
  const policyRows = [{ domainId: 'items', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
  const proposal = { runId: 'buff-items-test-01', landing: { source_key: 'canonical.buff-item-dependency.buff-items-test-01' },
    maintInserts: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => ({ source_id: row.sourceId })) };
  const authorization = { actor: 'admin', policySetHash: computePolicySetHash(policyRows),
    executionManifest: { buffItemMaintInsert: { fenceTokens: { landing: 'fence:landing-01', maint: 'fence:maint-01' } } } };
  const expected = runner.buildBuffItemMaintFenceIdentities(proposal);
  const fences = expected.map((identity, index) => ({ environment_id: 'local', database_role: identity.databaseRole,
    physical_table: identity.table, field_group: identity.fieldGroup, logical_predicate_hash: identity.logicalPredicateHash,
    latest_run_id: proposal.runId, fence_token: index === 0 ? 'fence:landing-01' : 'fence:maint-01', active: 1 }));
  const state = { server: { serverUuid: 'test-server', serverPort: 13306 }, owner: { username: 'admin', status: 'ACTIVE' },
    control: { enabled: false }, policyRows, fences };
  const connection = { async query(sql) {
    assert.ok(/^SELECT/.test(sql));
    if (sql.includes('@@server_uuid')) return [[state.server]];
    if (sql.includes('crawler_automation_owner')) return [[state.owner]];
    if (sql.includes('crawler_automation_policy')) return [state.policyRows];
    if (sql.includes('crawler_automation_write_fence')) return [state.fences];
    if (sql.includes('crawler_automation_run_attempt') || sql.includes('crawler_automation_attempt_reservation')) return [[]];
    throw new Error(`Unexpected runtime SELECT ${sql}`);
  } };
  const args = { connection, authorization, proposal, fingerprint: { serverUuid: 'test-server', port: 13306 },
    readControl: async () => state.control };
  await runner.lockBuffItemMaintRuntime(args);
  for (const mutate of [() => { state.owner.status = 'INACTIVE'; }, () => { state.fences[1].logical_predicate_hash = 'foreign'; },
    () => { state.server.serverUuid = 'foreign'; }, () => { state.control.enabled = true; },
    () => { state.policyRows[0].policyVersion++; }]) {
    const saved = JSON.stringify(state); mutate();
    await assert.rejects(runner.lockBuffItemMaintRuntime(args), /Owner|owner|fence|server|scheduler|policy/i);
    Object.assign(state, JSON.parse(saved));
  }
  state.fences.forEach(row => { row.active = 0; });
  state.fences.push({ environment_id: 'local', database_role: 'stale', physical_table: 'old_table',
    field_group: 'old_scope', logical_predicate_hash: 'sha256:stale', latest_run_id: 'old-run',
    fence_token: 'fence:stale', active: 0 });
  await runner.lockBuffItemMaintRuntime({ ...args, allowExpiredFences: true });
  state.fences[0].latest_run_id = 'competing-run';
  await assert.rejects(runner.lockBuffItemMaintRuntime({ ...args, allowExpiredFences: true }), /fence/i);
});

test('missing packet fails before the runner can open MySQL', async () => {
  assert.equal(typeof runner.applyBuffItemMaintInsert, 'function');
  let connected = false;
  await assert.rejects(runner.applyBuffItemMaintInsert({ repoRoot: process.cwd(), resultLabel: 'test-01', env: {},
    mysqlModule: { createConnection: async () => { connected = true; } } }), /packet|authorized/i);
  assert.equal(connected, false);
});

test('journal phase files are immutable and private', async () => {
  assert.equal(typeof runner.createBuffItemMaintJournal, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-item-journal-'));
  try {
    const paths = runner.buildBuffItemMaintPaths('test-01');
    const journal = runner.createBuffItemMaintJournal({ repoRoot: root, paths });
    const evidence = { operationId: 'canonical-buff-item-maint-insert', contractHash: `sha256:${'a'.repeat(64)}`, landingId: 10, maintReceipts: [] };
    await journal.prepared(evidence);
    const file = path.join(root, paths.preparedPath);
    assert.equal(fs.statSync(file).mode & 0o077, 0);
    await assert.rejects(journal.prepared(evidence), /exists|overwritten/i);
    await journal.materialized(evidence);
    await journal.commitUnknown(evidence);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, paths.journalPath))).state, 'RECOVERY_REQUIRED');
    assert.equal(JSON.parse(fs.readFileSync(file)).state, 'PREPARED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('canonical runner consumes a real fixture packet/permit and releases fences only after independent readback', async () => {
  for (const failReadback of [false, true]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-item-runner-'));
    try {
      const source = sourceFixture();
      const operationId = 'canonical-buff-item-maint-insert';
      const resultLabel = 'runner-test-01';
      const runId = 'buff-items-runner-test-01';
      const paths = runner.buildBuffItemMaintPaths(resultLabel);
      const proposal = await buildBuffItemMaintInsertProposal({ source, runId, maintRows: [], landingRows: [] });
      const binding = { schemaVersion: 'buff-item-maint-operation-binding/v1', runId,
        contractHash: proposal.contractHash, sourceIds: proposal.maintInserts.map(row => row.source_id),
        fenceTokens: { landing: 'fence:runner-landing', maint: 'fence:runner-maint' } };
      const initial = buildCanonicalOperationExecutionManifest({ repoRoot: codeRoot, operationId, resultLabel, buffItemMaintInsertBinding: binding });
      for (const entry of initial.codeBundleEntries) {
        fs.mkdirSync(path.dirname(path.join(root, entry.path)), { recursive: true });
        fs.copyFileSync(path.join(codeRoot, entry.path), path.join(root, entry.path));
      }
      const write = (file, value) => {
        const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600 });
      };
      fs.mkdirSync(path.join(root, '.git')); fs.mkdirSync(path.join(root, 'docs/project-governance'), { recursive: true });
      write('platform/local/config/local-stack.config.json', { database: { host: '127.0.0.1', port: 13306, username: 'fixture', password: 'fixture' } });
      write('reports/crawler-monitor/v2/automation-config.json', { enabled: false });
      write(paths.proposalPath, proposal);
      write(initial.inputPaths[1], source.inputBytes); write(initial.inputPaths[2], source.manifestBytes);
      source.semanticCapture.pages.forEach((page, index) => write(initial.inputPaths[index + 3], page.rawBytes));
      const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: root, operationId, resultLabel, buffItemMaintInsertBinding: binding });
      const policyRows = [{ domainId: 'items', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
      const serverFingerprint = { host: '127.0.0.1', port: 13306, serverUuid: 'runner-test-server',
        databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
      const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot: root, operationId,
        executionManifest: manifest, serverFingerprint, policyRows });
      const packet = authorizeCanonicalCutoverRequest({ request, requestHash: request.requestHash, actor: 'admin',
        reason: 'isolated runner test', authorizationReference: 'test-only:fixture', decisionIdentity: 'runner-test-decision',
        authorizedAt: new Date().toISOString(), currentTechnicalInput: {
          ...resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest }), serverFingerprint, policyRows },
        usedDecisionIdentities: new Set() });
      const packetPath = 'reports/authorization/canonical/test.packet.json'; write(packetPath, packet);
      const permit = createAuthorizedOperationDispatchPermit({ directory: path.join(root, '.local/tmp'), packet });
      const ledgerPath = path.join(root, 'reports/authorization/canonical/used-decisions.json');
      consumeDecisionIdentityFile({ ledgerPath, decisionIdentity: packet.decisionIdentity, dispatchPermitHash: permit.dispatchPermitHash });
      const rows = { maintRows: [], landingRows: [] };
      const fences = runner.buildBuffItemMaintFenceIdentities(proposal).map((identity, index) => ({
        environment_id: 'local', database_role: identity.databaseRole, physical_table: identity.table,
        field_group: identity.fieldGroup, logical_predicate_hash: identity.logicalPredicateHash,
        latest_run_id: runId, fence_token: binding.fenceTokens[index === 0 ? 'landing' : 'maint'], active: 1 }));
      const events = []; let opened = 0; let maintId = 1000;
      const copy = value => JSON.parse(JSON.stringify(value));
      const mysqlModule = { async createConnection() {
        const index = opened++;
        return {
          async beginTransaction() { events.push('begin'); }, async commit() { events.push('commit'); },
          async rollback() { events.push(`rollback-${index}`); }, async end() { events.push(`end-${index}`); },
          async query(sql, values) {
            if (sql.startsWith('START')) { events.push('readonly'); return []; }
            if (sql.startsWith('UPDATE crawler_automation_write_fence')) {
              const row = fences.find(fence => fence.fence_token === values[6] && fence.latest_run_id === values[7]);
              assert.ok(row); row.expires_at = values[0]; events.push('hold-update');
              return [{ affectedRows: 1 }];
            }
            if (sql.startsWith('DELETE')) {
              assert.ok(events.includes('readonly')); events.push('release');
              const at = fences.findIndex(fence => fence.fence_token === values[5]);
              if (at >= 0) fences.splice(at, 1);
              return [{ affectedRows: at >= 0 ? 1 : 0 }];
            }
            if (sql.includes('@@server_uuid')) return [[{ serverUuid: serverFingerprint.serverUuid, serverPort: 13306 }]];
            if (sql.includes('crawler_automation_owner')) return [[{ username: 'admin', status: 'ACTIVE' }]];
            if (sql.includes('crawler_automation_policy')) return [policyRows];
            if (sql.includes('crawler_automation_write_fence')) return [copy(fences)];
            if (sql.includes('crawler_automation_run_attempt') || sql.includes('crawler_automation_attempt_reservation')) return [[]];
            if (sql.includes('maint_items')) {
              const out = copy(rows.maintRows); if (index === 1 && failReadback) out[0].combat_value++;
              if (index === 1) events.push('independent-readback');
              return [out];
            }
            if (sql.includes('source_dataset_landings')) return [copy(rows.landingRows)];
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          async execute(sql, values) {
            if (sql.startsWith('SELECT')) return [copy(rows.landingRows.filter(row => row.id === values[0]))];
            assert.ok(!fs.existsSync(permit.path), 'permit must already be consumed before INSERT');
            const columns = [...sql.matchAll(/`([a-z0-9_]+)`/g)].map(match => match[1]).slice(2);
            const isLanding = sql.includes('source_dataset_landings');
            const id = isLanding ? 100 : maintId++;
            const row = { ...Object.fromEntries(columns.map((column, i) => [column, values[i]])), id,
              created_at: '2026-10-06 00:00:00', updated_at: '2026-10-06 00:00:00' };
            rows[isLanding ? 'landingRows' : 'maintRows'].push(row);
            return [{ insertId: id, affectedRows: 1 }];
          },
        };
      } };
      const env = { TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(root, packetPath),
        TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: JSON.stringify(serverFingerprint),
        TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path, TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
        TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT: root };
      const apply = runner.applyBuffItemMaintInsert({ repoRoot: root, resultLabel, env, mysqlModule });
      if (failReadback) {
        await assert.rejects(apply, error => /readback drifted/.test(error.message)
          && error.transactionOutcome === 'committed' && error.requiresReadbackReconciliation === true);
        assert.equal(fences.length, 2);
        assert.ok(fences.every(fence => fence.expires_at === '9999-12-31 23:59:59'));
        assert.ok(!fs.existsSync(path.join(root, paths.resultPath)));
      } else {
        const result = await apply;
        assert.equal(result.status, 'COMPLETED');
        assert.equal(fences.length, 0);
        assert.ok(events.indexOf('commit') < events.indexOf('independent-readback'));
        assert.ok(events.indexOf('independent-readback') < events.indexOf('release'));
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, paths.readbackPath))).status, 'verified');
        assert.equal(rows.maintRows.length, 6);
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, paths.holdCommittedPath))).state, 'FENCE_HOLD_COMMITTED');
      assert.ok(events.indexOf('hold-update') < events.indexOf('commit'));
      assert.equal(opened, 2);
      assert.ok(events.includes('end-0') && events.includes('end-1'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});
