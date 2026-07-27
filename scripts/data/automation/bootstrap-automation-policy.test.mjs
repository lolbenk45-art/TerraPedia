import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computePolicyHash,
  buildBootstrapPlan,
  executeBootstrapPlan,
} from './bootstrap-automation-policy.mjs';

const DEFAULT_POLICY = {
  absoluteInsertCap: 500,
  absoluteUpdateCap: 500,
  absoluteDisableCap: 50,
  ratioDisableCap: 0.1,
  requireSnapshot: true,
};

function fakeConnection({ owner = null, policy = null, maxVersion = 0 } = {}) {
  const executed = [];
  return {
    executed,
    async query(sql, params) {
      executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/FROM crawler_automation_owner/i.test(sql)) {
        return [owner ? [owner] : []];
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
