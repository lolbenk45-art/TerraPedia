import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDurableRunKeyRegistry } from '../../pipelines/automation/automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from '../../pipelines/automation/eight-domain-isolated-allocation.mjs';

const apiModule = await import('./run-eight-domain-isolated-api.mjs').catch(() => null);

test('isolated API lifecycle module is available', () => {
  assert.ok(apiModule, 'run-owned isolated API lifecycle must exist before any API start');
});

if (apiModule) {
  const {
    buildEightDomainApiEnvironment,
    writePrivateApiEnvironment,
    readPrivateApiEnvironment,
    writePrivateMinioCredentials,
    startEightDomainIsolatedApi,
    stopEightDomainIsolatedApi,
    readEightDomainApiRoutes,
    createEightDomainApiLifecycle,
    buildPublicReadinessPath,
    ISOLATED_API_READBACK_ROUTES,
  } = apiModule;

  test('Shimmer registers context, overview, and public/admin routes for all four transform datasets', () => {
    const routes = ISOLATED_API_READBACK_ROUTES.shimmer;
    assert.ok(routes['public-shimmer-context']);
    assert.ok(routes['public-shimmer-overview']);
    assert.ok(routes['admin-shimmer-overview']);
    for (const dataset of ['item-transforms', 'decraft-rules', 'entity-transforms', 'npc-transforms']) {
      assert.ok(routes[`public-shimmer-${dataset}`]);
      assert.ok(routes[`admin-shimmer-${dataset}`]);
    }
  });

  test('public readiness uses a route that does not require an unrelated seeded focus Item', () => {
    assert.equal(buildPublicReadinessPath('items'), '/public/items?limit=1');
    assert.equal(buildPublicReadinessPath('npcs'), '/public/items?limit=1');
  });

  function fixture(t, domain = 'items') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-e8pr-api-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repoRoot = path.resolve(process.cwd());
    const manifest = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json'),
      'utf8',
    ));
    manifest.executionRoot = repoRoot;
    manifest.sourceRoot = repoRoot;
    const registry = openDurableRunKeyRegistry(path.join(root, 'run-keys.json'));
    const allocation = buildEightDomainAllocationPlan({ manifest, domain, repoRoot, runKeyRegistry: registry });
    const ready = Object.freeze({
      ...allocation,
      preflight: Object.freeze({ status: 'ready', observedAt: new Date().toISOString() }),
    });
    return { root, repoRoot, allocation: ready };
  }

  function credentials(role = 'apiReadonly') {
    return {
      mysql: { host: '127.0.0.1', port: 13306 },
      apiAccount: { role, username: 'api_runtime', password: 'api-account-password-long-enough' },
      redisPassword: 'redis-password-long-enough',
      admin: { username: 'e8pr-admin', password: 'admin-password-long-enough' },
      authTokenSecret: 'a'.repeat(48),
      userTokenSecret: 'b'.repeat(48),
      minio: { url: 'http://127.0.0.1:19100', accessKey: 'e8pr-access', secretKey: 'e8pr-secret-key-long' },
    };
  }

  function migrationEvidence(allocation) {
    const hash = (letter) => `sha256:${letter.repeat(64)}`;
    return {
      status: 'verified',
      inputManifestHash: hash('a'),
      inputManifest: {
        schemaVersion: 1,
        schemaBuilders: [{ id: 'maint' }, { id: 'relation' }, { id: 'projection' }],
        migrationFiles: [{ path: 'services/catalog-api/src/main/resources/db/migration/V1__test.sql', version: 1 }],
      },
      applied: ['local', 'maint', 'relation'].map((role) => ({
        role,
        database: allocation.mysql.databases[role],
        inputManifestHash: hash('a'),
        appliedSqlSha256: [hash('b')],
        schemaFingerprint: {
          database: allocation.mysql.databases[role],
          tableCount: 1,
          tablesSha256: hash('c'),
        },
      })),
    };
  }

  function removeEmptyRunDirectories(allocation) {
    const automaticRoot = path.join(allocation.executionRoot, allocation.automaticArtifactRoot);
    const runKeyRoot = path.dirname(automaticRoot);
    const domainRoot = path.dirname(runKeyRoot);
    for (const directory of [automaticRoot, runKeyRoot, domainRoot]) {
      try { fs.rmdirSync(directory); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error; }
    }
  }

  test('consumer mode emits an allowlisted read-only environment with isolated bindings', (t) => {
    const { allocation } = fixture(t, 'items');
    const env = buildEightDomainApiEnvironment({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials('apiReadonly'),
      environment: { MYSQL_PWD: 'host-secret', TERRAPEDIA_DB_URL: 'jdbc:mysql://formal', REDISCLI_AUTH: 'host-redis' },
    });
    assert.equal(env.APP_PORT, '18280');
    assert.equal(env.SERVER_ADDRESS, '127.0.0.1');
    assert.equal(env.PATH, '/home/lolben/.nvm/versions/node/v22.23.0/bin:/home/lolben/.local/share/jdks/openjdk17-root/usr/lib/jvm/java-17-openjdk-amd64/bin:/usr/bin:/bin');
    assert.equal(env.JAVA_HOME, '/home/lolben/.local/share/jdks/openjdk17-root/usr/lib/jvm/java-17-openjdk-amd64');
    assert.equal(env.TERRAPEDIA_DB_NAME, allocation.mysql.databases.local);
    assert.equal(env.TERRAPEDIA_DB_MAINT, allocation.mysql.databases.maint);
    assert.equal(env.TERRAPEDIA_DB_RELATION, allocation.mysql.databases.relation);
    assert.equal(env.TERRAPEDIA_DB_USERNAME, 'api_runtime');
    assert.equal(env.TERRAPEDIA_REDIS_PORT, '16380');
    assert.equal(env.TERRAPEDIA_REDIS_DATABASE, '1');
    assert.equal(env.TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY, 'true');
    assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED, 'false');
    assert.equal(env.SPRING_TASK_SCHEDULING_ENABLED, 'false');
    assert.equal(env.SPRING_FLYWAY_ENABLED, 'false');
    assert.equal(env.TERRAPEDIA_MAIL_ENABLED, 'false');
    assert.equal(env.MYSQL_PWD, undefined);
    assert.equal(env.TERRAPEDIA_REDIS_PASSWORD, 'redis-password-long-enough');
    assert.equal(env.TERRAPEDIA_MINIO_ENABLED, 'false');
    assert.equal(env.TERRAPEDIA_MINIO_CREDENTIALS_FILE, undefined);
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE, undefined);
    assert.equal(Object.keys(env).some((key) => /MYSQL_PWD|JAVA_TOOL_OPTIONS|SPRING_CONFIG_IMPORT/.test(key)), false);
  });

  test('V2 mode is explicit, run-bound and uses the separate apiV2Test account', (t) => {
    const { allocation } = fixture(t, 'items');
    const env = buildEightDomainApiEnvironment({
      allocation,
      mode: 'isolated-v2-attempt',
      credentials: credentials('apiV2Test'),
      sourceStatePath: path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/source-state/items.json'),
      sourceManifestPath: path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/source-manifests/items.json'),
      isolatedAcceptanceManifestPath: path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/acceptance-manifests/items.json'),
    });
    assert.equal(env.TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY, 'false');
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE, 'true');
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_DOMAIN, 'items');
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_RUN_ID, allocation.runId);
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_SOURCE_PROBE_MODE, 'frozen-run-manifest');
    assert.equal(env.TERRAPEDIA_CRAWLER_SOURCE_MODE, 'local');
    assert.equal(env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH, path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/source-state/items.json'));
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_SOURCE_MANIFEST_PATH, path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/source-manifests/items.json'));
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_MANIFEST_PATH, path.join(allocation.executionRoot, '.local/tmp/eight-domain-production-readiness/20261017/acceptance-manifests/items.json'));
    assert.equal(env.TERRAPEDIA_EIGHT_DOMAIN_ARTIFACT_ROOT, path.join(allocation.executionRoot, allocation.automaticArtifactRoot));
    assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED, 'false');
    assert.equal(env.TERRAPEDIA_MINIO_CREDENTIALS_FILE, undefined);
    assert.equal(env.SPRING_TASK_SCHEDULING_ENABLED, 'false');
    assert.equal(env.SPRING_FLYWAY_ENABLED, 'false');
  });

  test('mode/account mismatch, missing source binding and unsafe credentials fail closed', (t) => {
    const { allocation } = fixture(t, 'items');
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation, mode: 'consumer-readback', credentials: credentials('apiV2Test'),
    }), /apiReadonly|account/i);
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation, mode: 'isolated-v2-attempt', credentials: credentials('apiReadonly'),
      sourceStatePath: '/tmp/source.json', sourceManifestPath: '/tmp/manifest.json',
    }), /apiV2Test|account/i);
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation, mode: 'isolated-v2-attempt', credentials: credentials('apiV2Test'),
      sourceStatePath: '/tmp/source.json', sourceManifestPath: '/tmp/manifest.json',
    }), /execution root|inside/i);
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation, mode: 'unknown', credentials: credentials(),
    }), /mode/i);
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation, mode: 'consumer-readback', credentials: { ...credentials(), authTokenSecret: 'short' },
    }), /secret/i);
    assert.throws(() => buildEightDomainApiEnvironment({
      allocation,
      mode: 'consumer-readback',
      credentials: { ...credentials(), inheritedEnvironment: { MYSQL_PWD: 'foreign-secret' } },
    }), /unexpected|allowlist|credential/i);
  });

  test('bounded API readback accepts only registered domain routes and returns body hashes without payloads', async (t) => {
    const { allocation } = fixture(t, 'items');
    const calls = [];
    const result = await readEightDomainApiRoutes({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials('apiReadonly'),
      routes: [
        { routeId: 'public-item-detail', params: { id: '42' } },
        { routeId: 'admin-item-recipes', params: { id: '42' } },
      ],
      leaseVerificationImpl: async () => true,
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).endsWith('/auth/login')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { token: 'temporary-admin-token' } }) };
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: { id: 42, name: 'example' } }) };
      },
    });
    assert.deepEqual(calls.map(({ url }) => url), [
      'http://127.0.0.1:18280/api/auth/login',
      'http://127.0.0.1:18280/api/public/items/42',
      'http://127.0.0.1:18280/api/admin/items/42/recipes',
    ]);
    assert.equal(calls[2].options.headers.authorization, 'Bearer temporary-admin-token');
    assert.deepEqual(result.map(({ routeId, status, bodySha256 }) => ({ routeId, status, bodySha256 })), [
      { routeId: 'public-item-detail', status: 200, bodySha256: `sha256:${crypto.createHash('sha256').update(JSON.stringify({ data: { id: 42, name: 'example' } })).digest('hex')}` },
      { routeId: 'admin-item-recipes', status: 200, bodySha256: `sha256:${crypto.createHash('sha256').update(JSON.stringify({ data: { id: 42, name: 'example' } })).digest('hex')}` },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /temporary-admin-token|example/);
    assert.equal(ISOLATED_API_READBACK_ROUTES.items['public-item-detail'].requiresAdmin, false);
    assert.equal(ISOLATED_API_READBACK_ROUTES.items['admin-item-recipes'].requiresAdmin, true);
  });

test('bounded API readback rejects an undeclared route, foreign-domain route, unsafe ID, and excessive route count before HTTP', async (t) => {
    const { allocation } = fixture(t, 'items');
    let calls = 0;
    const fetchImpl = async () => { calls += 1; throw new Error('HTTP must not be reached'); };
    for (const routes of [
      [{ routeId: '../auth/login' }],
      [{ routeId: 'public-shimmer-overview', params: {} }],
      [{ routeId: 'public-item-detail', params: { id: '../formal' } }],
      Array.from({ length: 13 }, () => ({ routeId: 'public-items', params: {} })),
    ]) {
      await assert.rejects(() => readEightDomainApiRoutes({
        allocation,
        mode: 'consumer-readback',
        credentials: credentials(),
        routes,
        fetchImpl,
      }), /route|parameter|limit|domain/i);
    }
    assert.equal(calls, 0);
});

  test('API lifecycle factory binds one allocation, lease, migration evidence, and route set across all phases', async (t) => {
    const { allocation } = fixture(t, 'items');
    const events = [];
    const jarPath = path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
    const jarSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(jarPath)).digest('hex')}`;
    const lifecycle = createEightDomainApiLifecycle({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials('apiReadonly'),
      jarPath,
      expectedJarSha256: jarSha256,
      migrationEvidence: migrationEvidence(allocation),
      routes: [{ routeId: 'public-items', params: {} }],
      startImpl: async (input) => { events.push(['start', input.mode, input.leasePath, input.migrationEvidence.status]); return { pid: 901, stopped: false }; },
      readbackImpl: async (input) => { events.push(['readback', input.leasePath, input.routes[0].routeId]); return [{ routeId: 'public-items', status: 200 }]; },
      stopImpl: async (input) => { events.push(['stop', input.leasePath]); return { stopped: true, pid: 901 }; },
    });
    assert.deepEqual(lifecycle.binding.mysql.databases, allocation.mysql.databases);
    assert.equal(lifecycle.binding.redis.logicalDb, allocation.redis.logicalDb);
    assert.equal(lifecycle.binding.api.port, allocation.api.port);
    assert.equal(lifecycle.binding.leasePath, path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json'));
    const started = await lifecycle.start({
      runId: allocation.runId,
      mode: 'isolated-v2-attempt',
      routes: [{ routeId: 'admin-shimmer-overview', params: {} }],
    });
    const readback = await lifecycle.readback({ started, acceptance: { status: 'passed' } });
    const stopped = await lifecycle.stop({ started, readback });
    const expectedLease = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json');
    assert.deepEqual(events, [
      ['start', 'consumer-readback', expectedLease, 'verified'],
      ['readback', expectedLease, 'public-items'],
      ['stop', expectedLease],
    ]);
    assert.deepEqual(started, { pid: 901, stopped: false });
    assert.deepEqual(readback, [{ routeId: 'public-items', status: 200 }]);
    assert.deepEqual(stopped, { stopped: true, pid: 901 });
  });

  test('environment persistence uses mode 0600 and reports a redacted config hash', async (t) => {
    const { root, allocation } = fixture(t, 'items');
    const env = buildEightDomainApiEnvironment({ allocation, mode: 'consumer-readback', credentials: credentials() });
    const filePath = path.join(root, 'api.env.json');
    const persisted = await writePrivateApiEnvironment(filePath, env);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.match(persisted.configSha256, /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(persisted), /redis-password|admin-password|a{48}|b{48}/);
    assert.deepEqual(readPrivateApiEnvironment(filePath), env);
    fs.chmodSync(filePath, 0o644);
    assert.throws(() => readPrivateApiEnvironment(filePath), /0600|permission/i);
  });

  test('MinIO credentials file uses the application JSON schema and private mode', async (t) => {
    const { root, allocation } = fixture(t, 'armor_sets');
    const tempAllocation = {
      ...allocation,
      executionRoot: root,
    };
    const filePath = path.join(root, allocation.automaticArtifactRoot, 'secrets/minio.credentials.json');
    t.after(() => {
      fs.rmSync(filePath, { force: true });
      for (const directory of [path.dirname(filePath), path.dirname(path.dirname(filePath)), path.dirname(path.dirname(path.dirname(filePath)))]) {
        try { fs.rmdirSync(directory); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error; }
      }
    });
    const result = await writePrivateMinioCredentials({
      filePath,
      allocation: tempAllocation,
      credentials: credentials().minio,
    });
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.match(result.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), credentials().minio);
    await assert.rejects(() => writePrivateMinioCredentials({
      filePath: path.join(root, 'audio.credentials.json'),
      allocation: fixture(t, 'audio').allocation,
      credentials: credentials().minio,
    }), /object.?store|domain/i);
  });

  test('MinIO API environment derives its run-owned credentials path from the fixed allocation', (t) => {
    const { allocation } = fixture(t, 'armor_sets');
    const env = buildEightDomainApiEnvironment({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials(),
    });
    assert.equal(
      env.TERRAPEDIA_MINIO_CREDENTIALS_FILE,
      path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets/minio.credentials.json'),
    );
  });

  test('start rejects occupied ports before writing secrets or spawning Java', async (t) => {
    const { root, allocation } = fixture(t, 'items');
    const envPath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets/consumer-readback.env.json');
    const leasePath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json');
    let spawned = false;
    await assert.rejects(() => startEightDomainIsolatedApi({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials(),
      jarPath: path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'),
      expectedJarSha256: 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'))).digest('hex'),
      environmentFile: envPath,
      leasePath,
      migrationEvidence: migrationEvidence(allocation),
      portAvailableImpl: async () => false,
      spawnImpl: () => { spawned = true; throw new Error('spawn must not occur'); },
    }), /port.*occupied/i);
    assert.equal(spawned, false);
    assert.equal(fs.existsSync(envPath), false);
  });

  test('start rejects missing migration and schema fingerprint evidence before port or secret setup', async (t) => {
    const { allocation } = fixture(t, 'items');
    const jarPath = path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
    let portChecked = false;
    let spawned = false;
    await assert.rejects(() => startEightDomainIsolatedApi({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials(),
      jarPath,
      expectedJarSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(jarPath)).digest('hex')}`,
      environmentFile: path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets/consumer-readback.env.json'),
      leasePath: path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json'),
      runtimeCheckImpl: async () => true,
      portAvailableImpl: async () => { portChecked = true; return true; },
      spawnImpl: async () => { spawned = true; throw new Error('Java must not start'); },
    }), /migration evidence|schema fingerprint/i);
    assert.equal(portChecked, false);
    assert.equal(spawned, false);
  });

  test('startup failure removes only this run API environment and MinIO credentials', async (t) => {
    const { allocation } = fixture(t, 'armor_sets');
    const secretsRoot = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets');
    const envPath = path.join(secretsRoot, 'consumer-readback.env.json');
    const leasePath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json');
    const minioPath = path.join(secretsRoot, 'minio.credentials.json');
    for (const filePath of [envPath, leasePath, minioPath]) assert.equal(fs.existsSync(filePath), false);
    t.after(() => {
      for (const filePath of [envPath, leasePath, minioPath]) fs.rmSync(filePath, { force: true });
      try { fs.rmdirSync(secretsRoot); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error; }
      removeEmptyRunDirectories(allocation);
    });

    let killed = false;
    await assert.rejects(() => startEightDomainIsolatedApi({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials(),
      jarPath: path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'),
      expectedJarSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(
        path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'),
      )).digest('hex')}`,
      environmentFile: envPath,
      leasePath,
      migrationEvidence: migrationEvidence(allocation),
      portAvailableImpl: async () => true,
      spawnImpl: async () => ({ pid: 98761, exitCode: null, kill: () => { killed = true; } }),
      portOwnerImpl: async () => 98761,
      processIdentityImpl: async () => ({ commandLine: `java -jar ${path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar')}`, startIdentity: 'start-98761' }),
      waitForReadyImpl: async () => { throw new Error('injected readiness failure'); },
      waitForExitImpl: async () => true,
    }), /readiness failure/i);

    assert.equal(killed, true);
    assert.equal(fs.existsSync(envPath), false);
    assert.equal(fs.existsSync(minioPath), false);
    assert.equal(fs.existsSync(leasePath), false);
  });

  test('successful API start records its exact owned process and stop removes only its lease files', async (t) => {
    const { allocation } = fixture(t, 'items');
    const secretsRoot = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets');
    const envPath = path.join(secretsRoot, 'consumer-readback.env.json');
    const leasePath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json');
    assert.equal(fs.existsSync(envPath), false);
    assert.equal(fs.existsSync(leasePath), false);
    t.after(() => {
      for (const filePath of [envPath, leasePath]) fs.rmSync(filePath, { force: true });
      try { fs.rmdirSync(secretsRoot); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error; }
      removeEmptyRunDirectories(allocation);
    });

    const jarPath = path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
    const jarSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(jarPath)).digest('hex')}`;
    const identity = { commandLine: `java -jar ${jarPath}`, startIdentity: 'start-98762' };
    const started = await startEightDomainIsolatedApi({
      allocation,
      mode: 'consumer-readback',
      credentials: credentials(),
      jarPath,
      expectedJarSha256: jarSha256,
      environmentFile: envPath,
      leasePath,
      migrationEvidence: migrationEvidence(allocation),
      portAvailableImpl: async () => true,
      spawnImpl: async () => ({ pid: 98762, exitCode: null, kill() {} }),
      portOwnerImpl: async () => 98762,
      processIdentityImpl: async () => identity,
      waitForReadyImpl: async () => ({ status: 200, bodySha256: `sha256:${'a'.repeat(64)}` }),
    });

    assert.equal(started.jarSha256, jarSha256);
    assert.equal(started.environmentFile, envPath);
    assert.equal(started.minioCredentialsFile, null);
    assert.equal(started.migrationEvidence.inputManifest.schemaVersion, 1);
    assert.equal(started.migrationEvidence.applied.length, 3);
    assert.ok(started.migrationEvidence.applied.every((entry) => (
      entry.inputManifestHash === started.migrationEvidence.inputManifestHash
    )));
    assert.equal(fs.statSync(leasePath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(leasePath, 'utf8')).pid, 98762);

    const stopped = await stopEightDomainIsolatedApi({
      allocation,
      leasePath,
      processIdentityImpl: async () => identity,
      portOwnerImpl: async () => 98762,
      killImpl() {},
      waitForExitImpl: async () => true,
      portAvailableImpl: async () => true,
    });
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.cleanupVerified, true);
    assert.equal(fs.existsSync(envPath), false);
    assert.equal(fs.existsSync(leasePath), false);
  });

  test('stop refuses a PID or port owner that does not match the recorded API lease', async (t) => {
    const { root, allocation } = fixture(t, 'items');
    const leasePath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'api.lease.json');
    const environmentPath = path.join(allocation.executionRoot, allocation.automaticArtifactRoot, 'secrets/consumer-readback.env.json');
    t.after(() => {
      fs.rmSync(leasePath, { force: true });
      fs.rmSync(environmentPath, { force: true });
      removeEmptyRunDirectories(allocation);
    });
    t.after(() => removeEmptyRunDirectories(allocation));
    const env = buildEightDomainApiEnvironment({ allocation, mode: 'consumer-readback', credentials: credentials() });
    const envEvidence = await writePrivateApiEnvironment(environmentPath, env);
    fs.mkdirSync(path.dirname(leasePath), { recursive: true, mode: 0o700 });
    const jarPath = path.join(allocation.executionRoot, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
    fs.writeFileSync(leasePath, JSON.stringify({
      schemaVersion: 1,
      mode: 'consumer-readback',
      runId: allocation.runId,
      runKey: allocation.runKey,
      domain: allocation.domain,
      pid: 12345,
      processStartIdentity: 'start-1',
      commandLineSha256: 'sha256:' + crypto.createHash('sha256').update('/usr/bin/java -jar expected.jar').digest('hex'),
      host: allocation.api.host,
      jarPath,
      jarSha256: 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(
        jarPath,
      )).digest('hex'),
      port: allocation.api.port,
      environmentFile: environmentPath,
      environmentConfigSha256: envEvidence.configSha256,
      minioCredentialsFile: null,
      minioCredentialsSha256: null,
    }), { mode: 0o600 });
    let killed = false;
    await assert.rejects(() => stopEightDomainIsolatedApi({
      allocation,
      leasePath,
      processIdentityImpl: async () => ({ startIdentity: 'other', commandLine: '/usr/bin/java -jar other.jar' }),
      portOwnerImpl: async () => 98765,
      killImpl: () => { killed = true; },
      waitForExitImpl: async () => true,
    }), /identity|owner|PID|port/i);
    assert.equal(killed, false);
  });
}
