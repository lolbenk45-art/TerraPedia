import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  computePolicyHash,
  buildBootstrapPlan,
  executeBootstrapPlan,
  runBootstrapCli,
} from './bootstrap-automation-policy.mjs';

const DEFAULT_POLICY = {
  absoluteInsertCap: 500,
  absoluteUpdateCap: 500,
  absoluteDisableCap: 50,
  ratioDisableCap: 0.1,
  requireSnapshot: true,
};

function fakeConnection({ owner = null, policy = null, maxVersion = 0, versionForHash = null } = {}) {
  const executed = [];
  return {
    executed,
    async query(sql, params) {
      executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/FROM crawler_automation_owner/i.test(sql)) {
        return [owner ? [owner] : []];
      }
      if (/FROM crawler_automation_policy_version/i.test(sql) && /policy_hash = \?/.test(sql)) {
        return [versionForHash ? [versionForHash] : []];
      }
      if (/FROM crawler_automation_policy_version/i.test(sql)) {
        return [[{ maxVersion }]];
      }
      if (/FROM crawler_automation_policy\b/i.test(sql)) {
        return [policy ? [policy] : []];
      }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); },
    async commit() { executed.push({ sql: 'COMMIT' }); },
    async rollback() { executed.push({ sql: 'ROLLBACK' }); },
  };
}

test('computePolicyHash is canonical, stable, and key-order independent', () => {
  const a = computePolicyHash({ x: 1, y: 2 });
  const b = computePolicyHash({ y: 2, x: 1 });
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a, computePolicyHash({ x: 1, y: 3 }));
});

test('a plan defaults to dry-run and performs no writes', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'initial bootstrap',
    actor: 'admin',
  });
  assert.equal(plan.apply, false);

  const connection = fakeConnection();
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.applied, false);
  assert.ok(result.intendedStatements.length >= 3);
  assert.equal(connection.executed.filter((e) => /^(INSERT|UPDATE)/i.test(e.sql)).length, 0);
});

test('an explicit apply inserts the owner, a policy version, and the policy, inside one transaction', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'initial bootstrap',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection();
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.applied, true);
  const sqls = connection.executed.map((e) => e.sql);
  assert.equal(sqls[0], 'BEGIN');
  assert.equal(sqls.at(-1), 'COMMIT');
  assert.ok(sqls.some((s) => /INSERT INTO crawler_automation_owner/i.test(s)));
  assert.ok(sqls.some((s) => /INSERT INTO crawler_automation_policy_version/i.test(s)));
  assert.ok(sqls.some((s) => /INSERT INTO crawler_automation_policy/i.test(s)));
});

test('bootstrapping again is idempotent for the singleton owner', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 're-run',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection({ owner: { username: 'admin', status: 'ACTIVE', version: 0 } });
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.ownerAction, 'unchanged');
  assert.ok(!connection.executed.some((e) => /INSERT INTO crawler_automation_owner/i.test(e.sql)));
});

test('a different owner username is a conflict and blocks rather than overwriting the singleton', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'x',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection({ owner: { username: 'someone_else', status: 'ACTIVE', version: 0 } });
  await assert.rejects(
    () => executeBootstrapPlan({ connection, plan }),
    /owner is already bootstrapped as "someone_else"/,
  );
});

test('promotion appends a new immutable policy version and never updates an existing one', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L1',
    policy: DEFAULT_POLICY,
    reason: 'first L1 promotion for biomes',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection({
    owner: { username: 'admin', status: 'ACTIVE', version: 0 },
    policy: { domainId: 'biomes', currentVersion: 1, currentLevel: 'L0', operationalState: 'DISABLED' },
    maxVersion: 1,
  });
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.policyAction, 'promoted');
  assert.equal(result.policyVersion, 2);
  const sqls = connection.executed.map((e) => e.sql);
  assert.ok(sqls.some((s) => /INSERT INTO crawler_automation_policy_version/i.test(s)));
  assert.ok(sqls.some((s) => /UPDATE crawler_automation_policy SET/i.test(s)));
  assert.ok(!sqls.some((s) => /UPDATE crawler_automation_policy_version/i.test(s)));
  assert.ok(!sqls.some((s) => /DELETE FROM crawler_automation_policy_version/i.test(s)));
});

test('a formal database is refused unless formal authorization is explicit', () => {
  for (const databaseName of ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']) {
    assert.throws(
      () => buildBootstrapPlan({
        databaseName,
        ownerUsername: 'admin',
        domainId: 'biomes',
        level: 'L0',
        policy: DEFAULT_POLICY,
        reason: 'x',
        actor: 'admin',
        apply: true,
      }),
      /formal database .* requires formalAuthorization/,
      databaseName,
    );
  }
});

test('a formal database is allowed once authorization is recorded', () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'x',
    actor: 'admin',
    apply: true,
    formalAuthorization: { reference: 'user decision 2026-07-27', approvedBy: 'admin' },
  });
  assert.equal(plan.databaseName, 'terria_v1_local');
  assert.equal(plan.formalAuthorization.reference, 'user decision 2026-07-27');
});

test('an unnamed database, unknown level, bad domain, or missing reason all fail closed', () => {
  const base = {
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'x',
    actor: 'admin',
  };
  assert.throws(() => buildBootstrapPlan({ ...base, databaseName: '' }), /databaseName is required/);
  assert.throws(() => buildBootstrapPlan({ ...base, level: 'L3' }), /level must be one of/);
  assert.throws(() => buildBootstrapPlan({ ...base, domainId: 'support.recipe' }), /domainId must match/);
  assert.throws(() => buildBootstrapPlan({ ...base, reason: '' }), /reason is required/);
  assert.throws(() => buildBootstrapPlan({ ...base, ownerUsername: '' }), /ownerUsername is required/);
  assert.throws(() => buildBootstrapPlan({ ...base, policy: null }), /policy is required/);
});

test('a failure inside apply rolls back and does not leave a partial bootstrap', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'x',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection();
  const original = connection.query.bind(connection);
  connection.query = async (sql, params) => {
    if (/INSERT INTO crawler_automation_policy\b/i.test(sql)) {
      throw new Error('simulated failure');
    }
    return original(sql, params);
  };

  await assert.rejects(() => executeBootstrapPlan({ connection, plan }), /simulated failure/);
  assert.ok(connection.executed.some((e) => e.sql === 'ROLLBACK'));
  assert.ok(!connection.executed.some((e) => e.sql === 'COMMIT'));
});

test('re-running with an unchanged policy is a no-op, not a duplicate-hash crash', async () => {
  // V55 declares UNIQUE (domain_id, policy_hash) on crawler_automation_policy_version, so an
  // unchanged policy cannot be re-inserted under a new version. Rehearsing against real MySQL
  // caught this as ER_DUP_ENTRY; the fake connection had not modelled the constraint.
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L0',
    policy: DEFAULT_POLICY,
    reason: 'second run, same policy',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection({
    owner: { username: 'admin', status: 'ACTIVE', version: 0 },
    policy: { domainId: 'biomes', currentVersion: 1, currentLevel: 'L0', operationalState: 'DISABLED' },
    maxVersion: 1,
    versionForHash: { policyVersion: 1, level: 'L0' },
  });
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.policyAction, 'unchanged');
  assert.equal(result.policyVersion, 1);
  assert.deepEqual(result.intendedStatements, []);
  assert.ok(!connection.executed.some((e) => /^INSERT/i.test(e.sql)));
  assert.ok(!connection.executed.some((e) => /^UPDATE/i.test(e.sql)));
});

test('promoting an unchanged policy to a new level reuses its version rather than duplicating the hash', async () => {
  const plan = buildBootstrapPlan({
    databaseName: 'terria_v1_automation_test_abc_local',
    ownerUsername: 'admin',
    domainId: 'biomes',
    level: 'L1',
    policy: DEFAULT_POLICY,
    reason: 'promote to L1 with identical caps',
    actor: 'admin',
    apply: true,
  });

  const connection = fakeConnection({
    owner: { username: 'admin', status: 'ACTIVE', version: 0 },
    policy: { domainId: 'biomes', currentVersion: 1, currentLevel: 'L0', operationalState: 'DISABLED' },
    maxVersion: 1,
    versionForHash: { policyVersion: 1, level: 'L0' },
  });
  const result = await executeBootstrapPlan({ connection, plan });

  assert.equal(result.policyAction, 'promoted');
  assert.equal(result.policyVersion, 1);
  assert.ok(!connection.executed.some((e) => /INSERT INTO crawler_automation_policy_version/i.test(e.sql)));
  assert.ok(connection.executed.some((e) => /UPDATE crawler_automation_policy SET/i.test(e.sql)));
});

test('formal bootstrap CLI consumes one frozen input, uses environment credentials, and closes the connection', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-bootstrap-cli-'));
  const inputPath = path.join(tempDir, 'bootstrap.input.json');
  const outputPath = path.join(tempDir, 'bootstrap.result.json');
  fs.writeFileSync(inputPath, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-biomes-l0-bootstrap',
    databaseName: 'terria_v1_local',
    ownerUsername: 'system-owner',
    domainId: 'biomes',
    level: 'L0',
    operationalState: 'DISABLED',
    policy: DEFAULT_POLICY,
    actor: 'system-owner',
    reason: 'Bootstrap the exact disabled biomes L0 policy.',
    authorizationReference: 'decision://automation/bootstrap/1',
    decisionIdentity: 'automation-bootstrap-1',
  }, null, 2)}\n`);

  const connection = fakeConnection();
  let connectionOptions = null;
  let ended = false;
  connection.end = async () => { ended = true; };
  const result = await runBootstrapCli({
    argv: [`--input=${inputPath}`, `--output=${outputPath}`, '--apply=true'],
    env: {
      TERRAPEDIA_DB_HOST: '127.0.0.1',
      TERRAPEDIA_DB_PORT: '13306',
      TERRAPEDIA_DB_USERNAME: 'automation-owner',
      TERRAPEDIA_DB_PASSWORD: 'not-written-to-output',
    },
    mysqlModule: {
      async createConnection(options) {
        connectionOptions = options;
        return connection;
      },
    },
    now: '2026-07-28T01:00:00.000Z',
  });

  assert.equal(result.applied, true);
  assert.equal(result.operationId, 'automation-biomes-l0-bootstrap');
  assert.equal(result.operationalState, 'DISABLED');
  assert.equal(connectionOptions.database, 'terria_v1_local');
  assert.equal(connectionOptions.password, 'not-written-to-output');
  assert.equal(ended, true);
  const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(written.decisionIdentity, 'automation-bootstrap-1');
  assert.equal(JSON.stringify(written).includes('not-written-to-output'), false);
});

test('formal bootstrap CLI rejects unbound operation fields and missing credential environment', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-bootstrap-cli-invalid-'));
  const base = {
    schemaVersion: 1,
    operationId: 'automation-biomes-l0-bootstrap',
    databaseName: 'terria_v1_local',
    ownerUsername: 'system-owner',
    domainId: 'biomes',
    level: 'L0',
    operationalState: 'DISABLED',
    policy: DEFAULT_POLICY,
    actor: 'system-owner',
    reason: 'Bootstrap the exact disabled biomes L0 policy.',
    authorizationReference: 'decision://automation/bootstrap/2',
    decisionIdentity: 'automation-bootstrap-2',
  };
  const validEnv = {
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'automation-owner',
    TERRAPEDIA_DB_PASSWORD: 'secret',
  };

  for (const [label, mutation, pattern] of [
    ['operation', { operationId: 'canonical-image-sync' }, /operationId/i],
    ['database', { databaseName: 'terria_v1_maint' }, /terria_v1_local/i],
    ['domain', { domainId: 'items' }, /domainId.*biomes/i],
    ['level', { level: 'L1' }, /level.*L0/i],
    ['state', { operationalState: 'ENABLED' }, /operationalState.*DISABLED/i],
    ['decision', { decisionIdentity: '' }, /decisionIdentity/i],
  ]) {
    const inputPath = path.join(tempDir, `${label}.json`);
    fs.writeFileSync(inputPath, JSON.stringify({ ...base, ...mutation }));
    await assert.rejects(
      () => runBootstrapCli({
        argv: [`--input=${inputPath}`, `--output=${inputPath}.out`, '--apply=true'],
        env: validEnv,
        mysqlModule: { async createConnection() { throw new Error('must not connect'); } },
      }),
      pattern,
      label,
    );
  }

  const inputPath = path.join(tempDir, 'valid.json');
  fs.writeFileSync(inputPath, JSON.stringify(base));
  await assert.rejects(
    () => runBootstrapCli({
      argv: [`--input=${inputPath}`, `--output=${inputPath}.out`, '--apply=true'],
      env: { ...validEnv, TERRAPEDIA_DB_PASSWORD: '' },
      mysqlModule: { async createConnection() { throw new Error('must not connect'); } },
    }),
    /TERRAPEDIA_DB_PASSWORD/i,
  );
});
