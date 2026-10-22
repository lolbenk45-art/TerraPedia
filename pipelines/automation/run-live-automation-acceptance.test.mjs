import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as liveAcceptance from './run-live-automation-acceptance.mjs';
import { runNpcCanonicalT0Acceptance } from '../npc-canonical/npc-canonical-t0-acceptance.mjs';
import { runBossCanonicalT1Acceptance } from '../boss/boss-canonical-t1-acceptance.mjs';
import { runProjectileCanonicalT1Acceptance } from '../projectile/projectile-canonical-t1-acceptance.mjs';
import { runBuffCanonicalT1Acceptance } from '../buff/buff-canonical-t1-acceptance.mjs';
import { runBiomeCanonicalT1Acceptance } from '../biome/biome-canonical-t1-acceptance.mjs';
import { openDurableRunKeyRegistry } from './automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from './eight-domain-isolated-allocation.mjs';

const npcT1Acceptance = await import('../npc-canonical/npc-canonical-t1-acceptance.mjs').catch(() => ({}));

const {
  buildAcceptanceProbeSql,
  buildLiveResourceNames,
  parseProbeCounts,
  resolveAcceptanceScope,
  executeIsolatedApiLifecycle,
  buildIsolatedApiLifecycle,
  assertIsolatedApiLifecycleBinding,
  buildRunOwnedApiCredentials,
} = liveAcceptance;

const T1_COMPLETION = {
  inputHash: `sha256:${'a'.repeat(64)}`,
  completionHash: `sha256:${'b'.repeat(64)}`,
};

const NPC_T1_SERVER_FINGERPRINT = Object.freeze({
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'npc-t1-server-uuid',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
});

function canonicalServerFingerprintHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    databases: value.databases,
    host: value.host,
    port: value.port,
    serverUuid: value.serverUuid,
  })).digest('hex')}`;
}

function t1DataBundleEntries(completion = T1_COMPLETION) {
  return [
    {
      path: 'reports/authorization/canonical/canonical-npc-apply.input.json',
      contentHash: completion.inputHash,
    },
    {
      path: 'reports/authorization/canonical/canonical-npc-apply.completion.json',
      contentHash: completion.completionHash,
    },
  ];
}

test('live resource names are exact runKey-isolated databases and bounded temporary accounts', () => {
  const value = buildLiveResourceNames({ profile: 't1', runKey: 'abc_0123456789abcdef' });
  assert.deepEqual(value.databases, {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation'
  });
  assert.match(value.accounts.provisioner, /^automation_prov_[0-9a-f]{12}$/);
  assert.match(value.accounts.readonly, /^automation_ro_[0-9a-f]{12}$/);
  assert.match(value.isolatedApiAccounts.apiReadonly, /^automation_apiro_[0-9a-f]{12}$/);
  assert.match(value.isolatedApiAccounts.apiV2Test, /^automation_apiv2_[0-9a-f]{12}$/);
  assert.equal(new Set(Object.values(value.accounts)).size, 2);
  assert.equal(new Set([...Object.values(value.accounts), ...Object.values(value.isolatedApiAccounts)]).size, 4);
  assert.equal(value.accounts.provisioner.length <= 32, true);
});

test('live acceptance accepts the dedicated NPC hybrid maintained scope', () => {
  assert.doesNotThrow(() => resolveAcceptanceScope('npc-hybrid-maintained', async () => ({ status: 'passed' })));
});

test('live acceptance rejects DB14 before creating or announcing isolated resources', async () => {
  const privateDirectory = path.join(os.tmpdir(), `terrapedia-db14-rejection-${process.pid}-${Date.now()}`);
  let resourcesAnnounced = false;

  await assert.rejects(
    () => liveAcceptance.runLiveAutomationAcceptance({
      profile: 't0',
      runId: 'db14-rejection-test',
      privateDirectory,
      mysql: {},
      redis: { logicalDb: 14 },
      onResources: () => {
        resourcesAnnounced = true;
        throw new Error('resources announced before Redis DB validation');
      },
    }),
  );

  assert.equal(resourcesAnnounced, false);
  assert.equal(fs.existsSync(privateDirectory), false);
});

test('eight-domain isolated allocation rejects a drifted Redis DB before creating or announcing resources', async () => {
  const privateDirectory = path.join(
    process.cwd(),
    'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0/automatic/acceptance-runtime',
  );
  let resourcesAnnounced = false;
  let adapterCreated = false;
  await assert.rejects(() => liveAcceptance.runLiveAutomationAcceptance({
    profile: 't1',
    runId: 'e8pr-items-20261017-v1',
    privateDirectory,
    mysql: { host: '127.0.0.1', port: 13306, username: 'writer', password: 'secret' },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 2 },
    isolatedAllocation: {
      domain: 'items',
      runId: 'e8pr-items-20261017-v1',
      runKey: 'e8p_547b4e28fb4004a0',
      executionRoot: process.cwd(),
      evidenceRoot: 'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0',
      automaticArtifactRoot: 'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0/automatic',
      mysql: {
        host: '127.0.0.1', port: 13306, serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
        databases: {
          local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
          maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
          relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
        },
      },
      redis: { host: '127.0.0.1', port: 16380, logicalDb: 1 },
      api: { host: '127.0.0.1', port: 18280 },
      preflight: { status: 'ready', observedAt: new Date().toISOString() },
    },
    createAdapterImpl: async () => { adapterCreated = true; throw new Error('adapter must not be created'); },
    onResources: () => { resourcesAnnounced = true; },
  }), /Redis.*(logical DB|allocation|identity)/i);
  assert.equal(resourcesAnnounced, false);
  assert.equal(adapterCreated, false);
  assert.equal(fs.existsSync(privateDirectory), false);
});

test('eight-domain isolated acceptance rejects a missing or stale live preflight before adapter creation', async () => {
  const privateDirectory = path.join(
    process.cwd(),
    'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0/automatic/stale-preflight',
  );
  const allocation = {
    domain: 'items',
    runId: 'e8pr-items-20261017-v1',
    runKey: 'e8p_547b4e28fb4004a0',
    executionRoot: process.cwd(),
    evidenceRoot: 'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0',
    automaticArtifactRoot: 'reports/runtime/eight-domain-production-readiness/20261017/items/e8p_547b4e28fb4004a0/automatic',
    mysql: { host: '127.0.0.1', port: 13306, serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf', databases: {
      local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
      maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
      relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
    } },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 1 },
    api: { host: '127.0.0.1', port: 18280 },
    preflight: { status: 'ready', observedAt: new Date(Date.now() - 180_000).toISOString() },
  };
  let adapterCreated = false;
  await assert.rejects(() => liveAcceptance.runLiveAutomationAcceptance({
    profile: 't1', runId: allocation.runId, privateDirectory,
    mysql: { host: '127.0.0.1', port: 13306, username: 'writer', password: 'secret' },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 1 }, isolatedAllocation: allocation,
    createAdapterImpl: async () => { adapterCreated = true; throw new Error('adapter must not be created'); },
  }), /stale|preflight/i);
  assert.equal(adapterCreated, false);
  assert.equal(fs.existsSync(privateDirectory), false);
});

test('probe SQL touches only the exact isolated three-database set and covers rollback commit restore', () => {
  const resources = buildLiveResourceNames({ profile: 't0', runKey: 'abc_0123456789abcdef' });
  const sql = buildAcceptanceProbeSql(resources.databases, 'probe_123');
  assert.doesNotMatch(sql, /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i);
  assert.match(sql, /START TRANSACTION/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /COMMIT/);
  for (const name of Object.values(resources.databases)) assert.match(sql, new RegExp(name));
});

test('probe count parser requires rollback zero, commit one, and restore zero for all roles', () => {
  const parsed = parseProbeCounts([
    'rollback\t0\t0\t0',
    'commit\t1\t1\t1',
    'restore\t0\t0\t0'
  ].join('\n'));
  assert.deepEqual(parsed, { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [0, 0, 0] });
  assert.throws(() => parseProbeCounts('rollback\t1\t0\t0\ncommit\t1\t1\t1\nrestore\t0\t0\t0'), /rollback/i);
});

test('live acceptance resolves only explicit registered scopes', () => {
  assert.equal(resolveAcceptanceScope(), null);
  const executor = () => {};
  assert.equal(resolveAcceptanceScope('item-groups', executor), executor);
  assert.equal(resolveAcceptanceScope('items-maintained', executor), executor);
  assert.equal(resolveAcceptanceScope('npc-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('recipe-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('boss-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('projectile-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('audio-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('biome-canonical', executor), executor);
  assert.equal(resolveAcceptanceScope('shimmer-canonical-isolated', executor), executor);
  assert.throws(() => resolveAcceptanceScope('unknown', executor), /scope/i);
  assert.throws(() => resolveAcceptanceScope('item-groups'), /executor/i);
  assert.throws(() => resolveAcceptanceScope('npc-canonical'), /executor/i);
});

test('live acceptance passes the run identity to the scoped executor', () => {
  const source = fs.readFileSync(new URL('./run-live-automation-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /const acceptanceContext = \{[\s\S]*?profile,\s*runId,\s*repoRoot:/);
  assert.match(source, /acceptanceContext[\s\S]*?migrationEvidence:\s*manifest\.migrationEvidence/);
  assert.match(source, /result = \{[\s\S]*?migrationEvidence:\s*manifest\.migrationEvidence/);
  assert.match(source, /apiAccounts:\s*adapter\.apiAccounts/);
  assert.match(source, /apiAccountGrantEvidence:\s*adapter\.getApiAccountGrantEvidence/);
  assert.match(source, /dependencyManifest/);
  assert.match(source, /dependencySeedEvidence:\s*manifest\.dependencySeedEvidence/);
  assert.match(source, /executeIsolatedApiLifecycle/);
  assert.match(source, /isolatedApiLifecycle/);
  assert.match(source, /username:\s*resources\.accounts\.provisioner/);
  assert.match(source, /password:\s*accountPasswords\.provisioner/);
  assert.match(source, /readonlyUsername:\s*resources\.accounts\.readonly/);
  assert.match(source, /readonlyPassword:\s*accountPasswords\.readonly/);
  assert.match(source, /\['recipe-canonical', 'boss-canonical', 'projectile-canonical', 'buff-canonical', 'biome-canonical'\]\.includes\(scope\)/);
});

test('isolated API lifecycle starts before acceptance, reads back after acceptance, and stops on success', async () => {
  const events = [];
  const result = await executeIsolatedApiLifecycle({
    lifecycle: {
      async start(context) { events.push(['start', context.runId]); return { pid: 1234, mode: 'consumer-readback' }; },
      async readback(context) { events.push(['readback', context.runId, context.acceptance.status]); return { routes: 2 }; },
      async stop(context) { events.push(['stop', context.runId]); return { stopped: true, cleanupVerified: true }; },
    },
    context: { runId: 'e8pr-items-20261017-v1' },
    acceptance: async () => { events.push(['acceptance']); return { status: 'passed' }; },
  });
  assert.deepEqual(events, [
    ['start', 'e8pr-items-20261017-v1'],
    ['acceptance'],
    ['readback', 'e8pr-items-20261017-v1', 'passed'],
    ['stop', 'e8pr-items-20261017-v1'],
  ]);
  assert.deepEqual(result, { acceptance: { status: 'passed' }, readback: { routes: 2 }, stop: { stopped: true, cleanupVerified: true }, start: { pid: 1234, mode: 'consumer-readback' } });
});

test('isolated API lifecycle stops after an acceptance failure and preserves the primary error', async () => {
  const events = [];
  await assert.rejects(() => executeIsolatedApiLifecycle({
    lifecycle: {
      async start() { events.push('start'); return { pid: 1234 }; },
      async readback() { events.push('readback'); throw new Error('readback must not run after acceptance failure'); },
      async stop() { events.push('stop'); return { stopped: true, cleanupVerified: true }; },
    },
    context: { runId: 'e8pr-items-20261017-v1' },
    acceptance: async () => { events.push('acceptance'); throw new Error('import failed'); },
  }), /import failed/);
  assert.deepEqual(events, ['start', 'acceptance', 'stop']);
});

test('run-live API lifecycle builder derives the JAR hash and binds the exact allocated run', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-api-lifecycle-builder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = openDurableRunKeyRegistry(path.join(root, 'keys.json'));
  const manifest = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json'),
    'utf8',
  ));
  const allocation = {
    ...buildEightDomainAllocationPlan({ manifest, domain: 'items', repoRoot: process.cwd(), runKeyRegistry: registry }),
    preflight: { status: 'ready', observedAt: new Date().toISOString() },
  };
  const jarPath = path.join(process.cwd(), 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
  const migrationEvidence = { status: 'verified', inputManifestHash: `sha256:${'a'.repeat(64)}` };
  const lifecycle = buildIsolatedApiLifecycle({
    allocation,
    credentials: {
      mysql: { host: '127.0.0.1', port: 13306 },
      apiAccount: { role: 'apiReadonly', username: 'api_readonly', password: 'a'.repeat(32) },
      redisPassword: 'r'.repeat(32),
      admin: { username: 'run-admin', password: 'p'.repeat(32) },
      authTokenSecret: 't'.repeat(48),
      userTokenSecret: 'u'.repeat(48),
    },
    migrationEvidence,
    routes: [{ routeId: 'public-items', params: {} }],
    jarPath,
  });
  assert.equal(lifecycle.binding.domain, 'items');
  assert.equal(lifecycle.binding.runId, allocation.runId);
  assert.equal(lifecycle.binding.mysql.databases.local, allocation.mysql.databases.local);
  assert.equal(lifecycle.binding.redis.logicalDb, allocation.redis.logicalDb);
  assert.equal(lifecycle.binding.mode, 'consumer-readback');
  assert.equal(lifecycle.binding.migrationEvidenceHash, migrationEvidence.inputManifestHash);
  assert.equal(typeof lifecycle.start, 'function');
  assert.equal(typeof lifecycle.readback, 'function');
  assert.equal(typeof lifecycle.stop, 'function');
  assert.equal(assertIsolatedApiLifecycleBinding({
    lifecycle,
    allocation,
    manifest: { migrationEvidence: { inputManifestHash: migrationEvidence.inputManifestHash } },
    apiAccounts: { apiReadonly: { username: 'api_readonly' } },
  }), true);
});

test('run-owned API credentials are isolated, distinct, and require the private Redis credential', () => {
  let sequence = 0;
  const credentials = buildRunOwnedApiCredentials({
    mysql: { host: '127.0.0.1', port: 13306 },
    apiAccount: { role: 'apiReadonly', username: 'automation_apiro_0123456789ab', password: 'mysql-api-password' },
    redisPassword: 'private-run-redis-password',
    runKey: 'e8p_0123456789abcdef',
    randomBytesImpl: (size) => Buffer.alloc(size, ++sequence),
  });
  assert.equal(credentials.admin.username, 'e8pr_e8p_0123456789abcdef');
  assert.equal(credentials.apiAccount.role, 'apiReadonly');
  assert.equal(credentials.redisPassword, 'private-run-redis-password');
  assert.notEqual(credentials.admin.password, credentials.authTokenSecret);
  assert.notEqual(credentials.authTokenSecret, credentials.userTokenSecret);
  assert.equal(credentials.authTokenSecret.length, 64);
  assert.equal(credentials.userTokenSecret.length, 64);
  assert.throws(() => buildRunOwnedApiCredentials({
    mysql: { host: '127.0.0.1', port: 13306 },
    apiAccount: credentials.apiAccount,
    runKey: 'e8p_0123456789abcdef',
  }), /Redis/i);
});

test('NPC canonical selects a distinct T1 executor instead of the fixture executor', () => {
  assert.equal(typeof liveAcceptance.resolveAcceptanceExecutor, 'function');
  assert.equal(typeof npcT1Acceptance.runNpcCanonicalT1Acceptance, 'function');
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't0', scope: 'npc-canonical' }),
    runNpcCanonicalT0Acceptance,
  );
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't1', scope: 'npc-canonical' }),
    npcT1Acceptance.runNpcCanonicalT1Acceptance,
  );
});

test('Boss canonical selects only the joint T1 executor', () => {
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't1', scope: 'boss-canonical' }),
    runBossCanonicalT1Acceptance,
  );
  assert.throws(
    () => liveAcceptance.resolveAcceptanceExecutor({ profile: 't0', scope: 'boss-canonical' }),
    /Boss canonical acceptance supports only T1/,
  );
});

test('Projectile canonical selects only the item-only T1 executor', () => {
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't1', scope: 'projectile-canonical' }),
    runProjectileCanonicalT1Acceptance,
  );
  assert.throws(
    () => liveAcceptance.resolveAcceptanceExecutor({ profile: 't0', scope: 'projectile-canonical' }),
    /Projectile canonical acceptance supports only T1/,
  );
});

test('Buff canonical selects only the isolated T1 executor', () => {
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't1', scope: 'buff-canonical' }),
    runBuffCanonicalT1Acceptance,
  );
  assert.throws(
    () => liveAcceptance.resolveAcceptanceExecutor({ profile: 't0', scope: 'buff-canonical' }),
    /Buff canonical acceptance supports only T1/,
  );
});

test('Biome canonical selects only the isolated T1 executor', () => {
  assert.equal(
    liveAcceptance.resolveAcceptanceExecutor({ profile: 't1', scope: 'biome-canonical' }),
    runBiomeCanonicalT1Acceptance,
  );
  assert.throws(
    () => liveAcceptance.resolveAcceptanceExecutor({ profile: 't0', scope: 'biome-canonical' }),
    /Biome canonical acceptance supports only T1/,
  );
});

test('NPC T1 preflights the one fixed evidence path before live resources are created', () => {
  assert.equal(typeof liveAcceptance.preflightLiveAcceptanceInvocation, 'function');
  assert.throws(
    () => liveAcceptance.preflightLiveAcceptanceInvocation({ profile: 't1', scope: 'npc-canonical' }),
    /output/i,
  );
  assert.throws(
    () => liveAcceptance.preflightLiveAcceptanceInvocation({
      profile: 't1', scope: 'npc-canonical', output: 'reports/canonical-migration/other.json', repoRoot: '/tmp/npc-t1',
    }),
    /canonical-npc-t1-acceptance/i,
  );
  assert.equal(
    liveAcceptance.preflightLiveAcceptanceInvocation({
      profile: 't1', scope: 'npc-canonical',
      output: 'reports/canonical-migration/canonical-npc-t1-acceptance.json', repoRoot: '/tmp/npc-t1', completion: T1_COMPLETION,
    }),
    '/tmp/npc-t1/reports/canonical-migration/canonical-npc-t1-acceptance.json',
  );
  assert.throws(
    () => liveAcceptance.preflightLiveAcceptanceInvocation({
      profile: 't1', scope: 'npc-canonical', output: 'reports/canonical-migration/canonical-npc-t1-acceptance.json', repoRoot: '/tmp/npc-t1',
    }),
    /completion/i,
  );
});

test('NPC T1 CLI preflight requires a private hash-bound config and one-time authorization permit', async () => {
  assert.equal(typeof liveAcceptance.preflightNpcT1AuthorizedCliInvocation, 'function');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-cli-'));
  const configPath = path.join(directory, 'local-stack.json');
  try {
    const configBytes = Buffer.from(`${JSON.stringify({
      database: { host: '127.0.0.1', port: 13306, username: 'automation', password: 'private' },
      redis: { port: 6379 },
      npcT1ServerFingerprint: NPC_T1_SERVER_FINGERPRINT,
    })}\n`);
    const configHash = `sha256:${createHash('sha256').update(configBytes).digest('hex')}`;
    fs.writeFileSync(configPath, configBytes, { mode: 0o600 });
    const calls = [];
    const result = await liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
      repoRoot: directory,
      configPath,
      expectedConfigHash: configHash,
      redisLogicalDb: 9,
      runId: 'npc-t1-20260730-01',
      env: { TERRAPEDIA_AUTHORIZED_PACKET_PATH: '/private/packet.json' },
      loadAuthorizationContextImpl: ({ operationId }) => {
        calls.push(['load', operationId]);
        return {
          operationId,
          decisionIdentity: 'npc-t1-decision',
          packetHash: `sha256:${'a'.repeat(64)}`,
          serverFingerprint: canonicalServerFingerprintHash(NPC_T1_SERVER_FINGERPRINT),
          dataBundleSha256: `sha256:${'b'.repeat(64)}`,
          executionManifestHash: `sha256:${'c'.repeat(64)}`,
          executionManifest: {
            operationId,
            isolatedAcceptance: {
              configPath,
              configSha256: configHash,
              redisLogicalDb: 9,
              runId: 'npc-t1-20260730-01',
              serverFingerprint: NPC_T1_SERVER_FINGERPRINT,
            },
          },
        };
      },
      resolveCurrentTechnicalInputImpl: () => ({
        dataBundleSha256: `sha256:${'b'.repeat(64)}`,
        executionManifestHash: `sha256:${'c'.repeat(64)}`,
        dataBundleEntries: t1DataBundleEntries(),
        completion: T1_COMPLETION,
      }),
      inspectServerFingerprintImpl: async () => NPC_T1_SERVER_FINGERPRINT,
      consumeDispatchPermitImpl: ({ authorizedContext, decisionLedgerPath }) => {
        calls.push(['consume', authorizedContext.operationId, decisionLedgerPath]);
        return true;
      },
    });
    assert.equal(result.configBytes.toString('utf8'), configBytes.toString('utf8'));
    assert.deepEqual(calls, [[
      'load', 'canonical-npc-t1-acceptance',
    ], [
      'consume', 'canonical-npc-t1-acceptance', path.join(directory, 'reports/authorization/canonical/used-decisions.json'),
    ]]);

    fs.chmodSync(configPath, 0o644);
    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
      }),
      /private ordinary/i,
    );
    fs.chmodSync(configPath, 0o600);
    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: `sha256:${'0'.repeat(64)}`,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => {
          throw new Error('authorization must not be reached after config hash drift');
        },
      }),
      /config hash/i,
    );

    const invalidConfigBytes = Buffer.from('{invalid-json}\n');
    const invalidConfigHash = `sha256:${createHash('sha256').update(invalidConfigBytes).digest('hex')}`;
    fs.writeFileSync(configPath, invalidConfigBytes, { mode: 0o600 });
    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: invalidConfigHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => {
          throw new Error('authorization must not be reached after config JSON validation fails');
        },
      }),
      /valid JSON/i,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('NPC T1 CLI preflight rejects packet data or server identity drift before permit consumption', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-packet-binding-'));
  const configPath = path.join(directory, 'local-stack.json');
  const configBytes = Buffer.from(`${JSON.stringify({
    database: { host: '127.0.0.1', port: 13306, username: 'automation', password: 'private' },
    redis: { port: 6379 },
    npcT1ServerFingerprint: NPC_T1_SERVER_FINGERPRINT,
  })}\n`);
  const configHash = `sha256:${createHash('sha256').update(configBytes).digest('hex')}`;
  const baseContext = {
    operationId: 'canonical-npc-t1-acceptance',
    decisionIdentity: 'npc-t1-binding-decision',
    packetHash: `sha256:${'a'.repeat(64)}`,
    serverFingerprint: canonicalServerFingerprintHash(NPC_T1_SERVER_FINGERPRINT),
    dataBundleSha256: `sha256:${'b'.repeat(64)}`,
    executionManifestHash: `sha256:${'c'.repeat(64)}`,
    executionManifest: {
      operationId: 'canonical-npc-t1-acceptance',
      isolatedAcceptance: {
        configPath,
        configSha256: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        serverFingerprint: NPC_T1_SERVER_FINGERPRINT,
      },
    },
  };
  try {
    fs.writeFileSync(configPath, configBytes, { mode: 0o600 });
    const calls = [];
    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => baseContext,
        resolveCurrentTechnicalInputImpl: () => ({
          dataBundleSha256: `sha256:${'d'.repeat(64)}`,
          executionManifestHash: baseContext.executionManifestHash,
          dataBundleEntries: t1DataBundleEntries(),
          completion: T1_COMPLETION,
        }),
        inspectServerFingerprintImpl: async () => NPC_T1_SERVER_FINGERPRINT,
        consumeDispatchPermitImpl: () => calls.push('consume'),
      }),
      /data bundle/i,
    );
    assert.deepEqual(calls, []);

    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => ({
          ...baseContext,
          executionManifest: {
            ...baseContext.executionManifest,
            isolatedAcceptance: {
              ...baseContext.executionManifest.isolatedAcceptance,
              serverFingerprint: { ...NPC_T1_SERVER_FINGERPRINT, serverUuid: 'wrong-server' },
            },
          },
        }),
        resolveCurrentTechnicalInputImpl: () => ({
          dataBundleSha256: baseContext.dataBundleSha256,
          executionManifestHash: baseContext.executionManifestHash,
          dataBundleEntries: t1DataBundleEntries(),
          completion: T1_COMPLETION,
        }),
        inspectServerFingerprintImpl: async () => NPC_T1_SERVER_FINGERPRINT,
        consumeDispatchPermitImpl: () => calls.push('consume'),
      }),
      /server fingerprint/i,
    );
    assert.deepEqual(calls, []);

    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => baseContext,
        resolveCurrentTechnicalInputImpl: () => ({
          dataBundleSha256: baseContext.dataBundleSha256,
          executionManifestHash: baseContext.executionManifestHash,
          dataBundleEntries: t1DataBundleEntries(),
          completion: T1_COMPLETION,
        }),
        inspectServerFingerprintImpl: async () => ({
          ...NPC_T1_SERVER_FINGERPRINT,
          serverUuid: 'live-server-uuid-drift',
        }),
        consumeDispatchPermitImpl: () => calls.push('consume'),
      }),
      /live server fingerprint/i,
    );
    assert.deepEqual(calls, []);

    await assert.rejects(
      () => liveAcceptance.preflightNpcT1AuthorizedCliInvocation({
        repoRoot: directory,
        configPath,
        expectedConfigHash: configHash,
        redisLogicalDb: 9,
        runId: 'npc-t1-20260730-01',
        loadAuthorizationContextImpl: () => baseContext,
        resolveCurrentTechnicalInputImpl: () => ({
          dataBundleSha256: baseContext.dataBundleSha256,
          executionManifestHash: baseContext.executionManifestHash,
          dataBundleEntries: t1DataBundleEntries(),
          completion: { ...T1_COMPLETION, completionHash: `sha256:${'e'.repeat(64)}` },
        }),
        inspectServerFingerprintImpl: async () => NPC_T1_SERVER_FINGERPRINT,
        consumeDispatchPermitImpl: () => calls.push('consume'),
      }),
      /completion.*data bundle/i,
    );
    assert.deepEqual(calls, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
