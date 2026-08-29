import assert from 'node:assert/strict';
import test from 'node:test';

import { buildL2PolicyCeilingArtifact, approveL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import {
  registerL2PolicyCeiling,
  recoverL2PolicyCeilingRegistration,
  buildL2PolicyCeilingRegistrationPlan,
  buildL2PolicyCeilingRegistrationInput,
  runL2PolicyCeilingRegistrationCli,
} from './register-l2-policy-ceiling.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const rows = [{ domainId: 'items', policyVersion: 1, policyHash: HASH_A }];

function artifact(targetPolicyVersion = 2) {
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: rows,
    targetPolicyVersion,
    ceiling: {
      schemaVersion: 1, level: 'L2', requireSnapshot: true,
      absoluteInsertCap: 10, absoluteUpdateCap: 10, absoluteRelationshipDeleteCap: 10, absoluteDisableCap: 1,
      ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioRelationshipDeleteCap: 0.05,
      ratioDisableCap: 0.01, sourceFreshnessMaxAgeMinutes: 60, anomalyAction: 'CIRCUIT_OPEN',
      ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
    },
    generatedAt: '2026-08-26T06:00:00.000Z',
  });
  return approveL2PolicyCeilingArtifact({
    artifact: candidate, actor: 'owner', approvalReference: 'owner://items/l2-ceiling/1', approvedAt: '2026-08-26T06:01:00.000Z',
  });
}

function auth() {
  return {
    operationId: 'automation-items-l2-policy-ceiling-registration', actor: 'owner',
    reason: 'register approved L2 ceiling', authorizationReference: 'owner://items/l2-ceiling/1',
    decisionIdentity: 'decision-items-l2-ceiling-1', packetHash: HASH_B,
  };
}

function connection({ targetExists = false, current = rows[0] } = {}) {
  const calls = [];
  return {
    calls,
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    end: async () => calls.push(['end']),
    query: async (sql, params = []) => {
      calls.push([sql, params]);
      if (/FROM crawler_automation_owner/.test(sql)) return [[{ username: 'owner', status: 'ACTIVE' }]];
      if (/FROM crawler_automation_policy p/.test(sql) && /FOR UPDATE/.test(sql)) return [[{
        domainId: 'items', policyVersion: current.policyVersion, policyHash: current.policyHash,
        currentLevel: 'L1', operationalState: 'ACTIVE',
      }]];
      if (/SELECT p\.domain_id/.test(sql)) return [[current]];
      if (/MAX\(policy_version\)/.test(sql)) return [[{ maxVersion: 1 }]];
      if (/FROM crawler_automation_policy_version/.test(sql)) return [targetExists ? [{ policyVersion: 2 }] : []];
      if (/INSERT INTO crawler_automation_policy_version/.test(sql)) return [{ affectedRows: 1, insertId: 2 }];
      return [[]];
    },
  };
}

function runRegistrationCli(options = {}) {
  return runL2PolicyCeilingRegistrationCli({
    assertDataBundle: () => true,
    loadServerFingerprint: () => ({
      host: '127.0.0.1', port: 13306, serverUuid: 'test-server',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    }),
    consumeDispatchPermit: () => true,
    assertServerFingerprint: async () => true,
    ...options,
  });
}

test('registers an approved immutable L2 policy version without changing current policy state', async () => {
  const db = connection();
  const result = await registerL2PolicyCeiling({ connection: db, artifact: artifact(), authorizationContext: auth() });
  assert.equal(result.status, 'registered');
  assert.equal(result.domainId, 'items');
  assert.equal(result.policyVersion, 2);
  const sqlCalls = db.calls.map(([sql]) => sql);
  assert.equal(sqlCalls[0], 'begin');
  for (const fragment of ['crawler_automation_owner', 'crawler_automation_policy p', 'SELECT p.domain_id', 'MAX(policy_version)', 'FROM crawler_automation_policy_version', 'INSERT INTO crawler_automation_policy_version']) {
    assert.ok(sqlCalls.some((sql) => String(sql).includes(fragment)), fragment);
  }
  const policySetSql = sqlCalls.find((sql) => /FROM crawler_automation_policy p/.test(sql) && /ORDER BY p\.domain_id/.test(sql));
  assert.match(policySetSql, /FOR UPDATE$/i);
  assert.equal(sqlCalls.at(-1), 'commit');
});

test('exposes a non-authoritative pending result before commit and a committed result after commit', async () => {
  const db = connection();
  const events = [];
  const result = await registerL2PolicyCeiling({
    connection: db,
    artifact: artifact(),
    authorizationContext: auth(),
    beforeCommit: async (pending) => events.push({ phase: 'before', result: pending, lastSql: db.calls.at(-1)?.[0] }),
    afterCommit: async (committed) => events.push({ phase: 'after', result: committed, lastSql: db.calls.at(-1)?.[0] }),
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    phase: 'before',
    lastSql: expectInsertSql(db),
      result: {
      schemaVersion: 1,
      status: 'pending',
      authoritative: false,
      operationId: 'automation-items-l2-policy-ceiling-registration',
      domainId: 'items',
      policyVersion: 2,
        policyHash: artifact().targetPolicy.policyHash,
        policySetHash: artifact().targetPolicySetHash,
        artifactHash: artifact().artifactHash,
        actor: 'owner',
        reason: 'register approved L2 ceiling',
        authorizationReference: 'owner://items/l2-ceiling/1',
        decisionIdentity: 'decision-items-l2-ceiling-1',
        packetHash: HASH_B,
      },
  });
  assert.equal(events[1].phase, 'after');
  assert.equal(events[1].lastSql, 'commit');
  assert.equal(events[1].result.status, 'registered');
  assert.equal(events[1].result.authoritative, true);
  assert.equal(result.status, 'registered');
  assert.equal(result.authoritative, true);
  assert.equal(db.calls.filter(([sql]) => sql === 'commit').length, 1);
});

function expectInsertSql(db) {
  return db.calls.find(([sql]) => /INSERT INTO crawler_automation_policy_version/.test(sql))?.[0];
}

test('does not attempt rollback after the database commit when committed marker publication fails', async () => {
  const db = connection();
  await assert.rejects(() => registerL2PolicyCeiling({
    connection: db,
    artifact: artifact(),
    authorizationContext: auth(),
    beforeCommit: async () => {},
    afterCommit: async () => { throw new Error('marker write failed'); },
  }), /marker write failed/);
  assert.equal(db.calls.filter(([sql]) => sql === 'commit').length, 1);
  assert.equal(db.calls.filter(([sql]) => sql === 'rollback').length, 0);
});

test('registration fails closed for stale policy identity, duplicate target, or wrong Owner', async () => {
  await assert.rejects(() => registerL2PolicyCeiling({
    connection: connection({ current: { ...rows[0], policyHash: HASH_B } }), artifact: artifact(), authorizationContext: auth(),
  }), /current policy/i);
  await assert.rejects(() => registerL2PolicyCeiling({ connection: connection({ targetExists: true }), artifact: artifact(), authorizationContext: auth() }), /already exists/i);
  await assert.rejects(() => registerL2PolicyCeiling({ connection: connection(), artifact: artifact(), authorizationContext: { ...auth(), actor: 'other' } }), /Owner|approval/i);
});

test('registration rejects a policy version that skips the next immutable version', async () => {
  await assert.rejects(() => registerL2PolicyCeiling({
    connection: connection(), artifact: artifact(3), authorizationContext: auth(),
  }), /next immutable version|next policy version|version/i);
});

test('registration plan is exact-domain and does not authorize promotion or scheduler activation', () => {
  const plan = buildL2PolicyCeilingRegistrationPlan({ artifact: artifact(), authorizationContext: auth() });
  assert.equal(plan.operationId, 'automation-items-l2-policy-ceiling-registration');
  assert.equal(plan.domainId, 'items');
  assert.equal(plan.targetLevel, 'L2');
  assert.equal(plan.promotesCurrentPolicy, false);
  assert.equal(plan.createsPromotionDecision, false);
});

test('registration plan requires a traceable reason, decision identity, and packet hash', () => {
  const approved = artifact();
  for (const overrides of [
    { reason: '' },
    { decisionIdentity: '' },
    { packetHash: 'not-a-hash' },
  ]) {
    assert.throws(() => buildL2PolicyCeilingRegistrationPlan({
      artifact: approved,
      authorizationContext: { ...auth(), ...overrides },
    }), /reason|decision|packet/i);
  }
});

test('registration input binds the exact approved artifact path and hash', () => {
  const approved = artifact();
  const value = buildL2PolicyCeilingRegistrationInput({
    artifact: approved,
    artifactPath: 'reports/authorization/canonical/l2-policy-ceiling/items/' + approved.artifactHash.slice(7) + '/artifact.json',
    artifactFileSha256: HASH_B,
  });
  assert.equal(value.proposalOnly, false);
  assert.equal(value.artifactHash, approved.artifactHash);
  assert.throws(() => buildL2PolicyCeilingRegistrationInput({
    artifact: approved,
    artifactPath: 'reports/authorization/canonical/l2-policy-ceiling/items/' + `${'a'.repeat(64)}/artifact.json`,
    artifactFileSha256: HASH_B,
  }), /artifact hash|content-addressed/i);
  assert.throws(() => buildL2PolicyCeilingRegistrationInput({ artifact: artifact(), artifactPath: 'reports/x.json', artifactFileSha256: HASH_B }), /content-addressed/i);
});

test('CLI validates the result output before opening a database connection', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-cli-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(absoluteOutput, '{"existing":true}\n', { mode: 0o600 });
  let createConnectionCalls = 0;
  try {
    await assert.rejects(() => runRegistrationCli({
      argv: [
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration',
        '--apply=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
        TERRAPEDIA_DB_NAME: 'terria_v1_local',
      },
      loadAuthorizationContext: () => auth(),
      mysqlModule: { createConnection: async () => { createConnectionCalls += 1; throw new Error('must not connect'); } },
    }), /already exists|overwrite/i);
    assert.equal(createConnectionCalls, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('CLI rejects a result path outside the canonical authorization root before opening a database connection', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-root-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }) + '\n', { mode: 0o600 });
  let createConnectionCalls = 0;
  try {
    await assert.rejects(() => runRegistrationCli({
      argv: [
        `--input=${inputPath}`,
        '--output=reports/runtime/registration-result.json',
        '--operation-id=automation-items-l2-policy-ceiling-registration',
        '--apply=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
        TERRAPEDIA_DB_NAME: 'terria_v1_local',
      },
      loadAuthorizationContext: () => auth(),
      mysqlModule: { createConnection: async () => { createConnectionCalls += 1; throw new Error('must not connect'); } },
    }), /authorization root|canonical|confined/i);
    assert.equal(createConnectionCalls, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('CLI rolls back the registration when the result target appears before commit', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-race-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  const db = connection();
  const originalQuery = db.query;
  db.query = async (sql, params = []) => {
    const result = await originalQuery(sql, params);
    if (/INSERT INTO crawler_automation_policy_version/.test(sql)) {
      fs.writeFileSync(absoluteOutput, '{"raced":true}\n', { mode: 0o600 });
    }
    return result;
  };
  try {
    await assert.rejects(() => runRegistrationCli({
      argv: [
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration',
        '--apply=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
        TERRAPEDIA_DB_NAME: 'terria_v1_local',
      },
      loadAuthorizationContext: () => auth(),
      mysqlModule: { createConnection: async () => db },
    }), /already exists|overwrite/i);
    assert.deepEqual(db.calls.filter(([sql]) => sql === 'rollback').at(-1), ['rollback']);
    assert.equal(db.calls.some(([sql]) => sql === 'commit'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(absoluteOutput, 'utf8')), { raced: true });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('CLI publishes pending result before commit and an immutable committed marker after commit', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-marker-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  const absoluteMarker = `${absoluteOutput}.commit.json`;
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  const db = connection();
  let markerExistedAtCommit = null;
  const originalCommit = db.commit;
  db.commit = async () => {
    markerExistedAtCommit = fs.existsSync(absoluteMarker);
    await originalCommit();
  };
  try {
    const result = await runRegistrationCli({
      argv: [
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration',
        '--apply=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
      },
      loadAuthorizationContext: () => auth(),
      mysqlModule: { createConnection: async () => db },
    });
    assert.equal(result.status, 'registered');
    assert.equal(markerExistedAtCommit, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(absoluteOutput, 'utf8')), {
      schemaVersion: 1,
      status: 'pending',
      authoritative: false,
      operationId: 'automation-items-l2-policy-ceiling-registration',
      domainId: 'items',
      policyVersion: 2,
      policyHash: approved.targetPolicy.policyHash,
      policySetHash: approved.targetPolicySetHash,
      artifactHash: approved.artifactHash,
      actor: 'owner',
      reason: 'register approved L2 ceiling',
      authorizationReference: 'owner://items/l2-ceiling/1',
      decisionIdentity: 'decision-items-l2-ceiling-1',
      packetHash: HASH_B,
    });
    const marker = JSON.parse(fs.readFileSync(absoluteMarker, 'utf8'));
    assert.equal(marker.markerKind, 'l2_policy_ceiling_registration_commit');
    assert.equal(marker.status, 'committed');
    assert.equal(marker.authoritative, true);
    assert.equal(marker.registrationStatus, 'registered');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('CLI retains pending result and a raced marker when marker publication fails after commit', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-marker-race-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  const absoluteMarker = `${absoluteOutput}.commit.json`;
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  const db = connection();
  const originalCommit = db.commit;
  db.commit = async () => {
    await originalCommit();
    fs.writeFileSync(absoluteMarker, '{"raced":true}\n', { mode: 0o600, flag: 'wx' });
  };
  try {
    await assert.rejects(() => runRegistrationCli({
      argv: [
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration',
        '--apply=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
      },
      loadAuthorizationContext: () => auth(),
      mysqlModule: { createConnection: async () => db },
    }), /already exists|overwrite/i);
    assert.equal(db.calls.filter(([sql]) => sql === 'commit').length, 1);
    assert.equal(db.calls.filter(([sql]) => sql === 'rollback').length, 0);
    assert.equal(JSON.parse(fs.readFileSync(absoluteOutput, 'utf8')).status, 'pending');
    assert.deepEqual(JSON.parse(fs.readFileSync(absoluteMarker, 'utf8')), { raced: true });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('recovery finalizes a committed registration only with a fresh authorization and exact DB readback', async () => {
  const approved = artifact();
  const pending = {
    schemaVersion: 1,
    status: 'pending',
    authoritative: false,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    policyVersion: 2,
    policyHash: approved.targetPolicy.policyHash,
    policySetHash: approved.targetPolicySetHash,
    artifactHash: approved.artifactHash,
    actor: 'owner',
    reason: 'register approved L2 ceiling',
    authorizationReference: 'owner://items/l2-ceiling/1',
    decisionIdentity: 'decision-items-l2-ceiling-1',
    packetHash: HASH_B,
  };
  const recoveryAuth = {
    ...auth(),
    decisionIdentity: 'decision-items-l2-ceiling-recovery-1',
    packetHash: `sha256:${'c'.repeat(64)}`,
    reason: 'finalize registration after process crash',
  };
  const db = connection();
  db.query = async (sql, params = []) => {
    db.calls.push([sql, params]);
    if (/FROM crawler_automation_owner/.test(sql)) return [[{ username: 'owner', status: 'ACTIVE' }]];
    if (/SELECT domain_id AS domainId, policy_version AS policyVersion/.test(sql)) return [[{
      domainId: 'items', policyVersion: 2, level: 'L2',
      policyHash: approved.targetPolicy.policyHash,
      policyJson: JSON.stringify(approved.targetPolicy.policyJson),
      createdBy: 'owner', approvedBy: 'owner', reason: 'register approved L2 ceiling',
    }]];
    return [[]];
  };
  const marker = await recoverL2PolicyCeilingRegistration({
    connection: db,
    artifact: approved,
    pendingResult: pending,
    authorizationContext: recoveryAuth,
  });
  assert.equal(marker.status, 'committed');
  assert.equal(marker.authoritative, true);
  assert.equal(marker.registrationDecisionIdentity, pending.decisionIdentity);
  assert.equal(marker.finalizerDecisionIdentity, recoveryAuth.decisionIdentity);
  assert.equal(db.calls.some(([sql]) => /SELECT domain_id AS domainId, policy_version AS policyVersion/.test(sql)), true);
});

test('recovery rejects a missing DB row, replayed authorization, or malformed pending identity', async () => {
  const approved = artifact();
  const pending = {
    schemaVersion: 1,
    status: 'pending',
    authoritative: false,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    policyVersion: 2,
    policyHash: approved.targetPolicy.policyHash,
    policySetHash: approved.targetPolicySetHash,
    artifactHash: approved.artifactHash,
    actor: 'owner',
    reason: 'register approved L2 ceiling',
    authorizationReference: 'owner://items/l2-ceiling/1',
    decisionIdentity: 'decision-items-l2-ceiling-1',
    packetHash: HASH_B,
  };
  await assert.rejects(() => recoverL2PolicyCeilingRegistration({
    connection: connection(), artifact: approved, pendingResult: pending,
    authorizationContext: auth(),
  }), /fresh|recovery|different/i);
  const missingDb = connection();
  const recovered = await recoverL2PolicyCeilingRegistration({
    connection: missingDb, artifact: approved, pendingResult: pending,
    authorizationContext: {
      ...auth(), decisionIdentity: 'decision-items-l2-ceiling-recovery-2',
      packetHash: `sha256:${'d'.repeat(64)}`,
    },
  });
  assert.equal(recovered.status, 'committed');
  assert.equal(missingDb.calls.some(([sql]) => /INSERT INTO crawler_automation_policy_version/.test(sql)), true);
  await assert.rejects(() => recoverL2PolicyCeilingRegistration({
    connection: missingDb, artifact: approved, pendingResult: { ...pending, artifactHash: HASH_A },
    authorizationContext: {
      ...auth(), decisionIdentity: 'decision-items-l2-ceiling-recovery-3',
      packetHash: `sha256:${'e'.repeat(64)}`,
    },
  }), /pending|identity|artifact/i);
});

test('CLI recovery reads the pending result and writes only the exact missing commit marker', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-recovery-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  const absoluteMarker = `${absoluteOutput}.commit.json`;
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items',
    artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  const pending = {
    schemaVersion: 1, status: 'pending', authoritative: false,
    operationId: 'automation-items-l2-policy-ceiling-registration', domainId: 'items',
    policyVersion: 2, policyHash: approved.targetPolicy.policyHash, policySetHash: approved.targetPolicySetHash, artifactHash: approved.artifactHash,
    actor: 'owner', reason: 'register approved L2 ceiling', authorizationReference: 'owner://items/l2-ceiling/1',
    decisionIdentity: 'decision-items-l2-ceiling-1', packetHash: HASH_B,
  };
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  const db = connection();
  try {
    const first = await runRegistrationCli({
      argv: [
        `--input=${inputPath}`, `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration', '--recover=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root', TERRAPEDIA_DB_PASSWORD: 'root',
      },
      loadAuthorizationContext: () => ({
        ...auth(), decisionIdentity: 'decision-items-l2-ceiling-recovery-cli-missing',
        packetHash: `sha256:${'9'.repeat(64)}`, reason: 'retry after incomplete commit readback',
      }),
      mysqlModule: { createConnection: async () => db },
    });
    assert.equal(first.status, 'committed');
    assert.equal(fs.existsSync(absoluteOutput), true);
    assert.equal(first.markerKind, 'l2_policy_ceiling_registration_commit');
    assert.equal(JSON.parse(fs.readFileSync(absoluteOutput, 'utf8')).status, 'pending');
    assert.equal(JSON.parse(fs.readFileSync(absoluteMarker, 'utf8')).finalizerDecisionIdentity, 'decision-items-l2-ceiling-recovery-cli-missing');
    assert.equal(db.calls.some(([sql]) => sql === 'begin'), true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('CLI recovery retains the pre-existing pending result when marker publication races after readback', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-registration-recovery-race-'));
  const approved = artifact();
  const artifactBytes = Buffer.from(`${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  const artifactPath = `reports/authorization/canonical/l2-policy-ceiling/items/${approved.artifactHash.slice(7)}/artifact.json`;
  const inputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.input.json';
  const outputPath = 'reports/authorization/canonical/automation-items-l2-policy-ceiling-registration.result.json';
  const absoluteArtifact = path.join(repoRoot, artifactPath);
  const absoluteInput = path.join(repoRoot, inputPath);
  const absoluteOutput = path.join(repoRoot, outputPath);
  const absoluteMarker = `${absoluteOutput}.commit.json`;
  const pending = {
    schemaVersion: 1, status: 'pending', authoritative: false,
    operationId: 'automation-items-l2-policy-ceiling-registration', domainId: 'items',
    policyVersion: 2, policyHash: approved.targetPolicy.policyHash, policySetHash: approved.targetPolicySetHash, artifactHash: approved.artifactHash,
    actor: 'owner', reason: 'register approved L2 ceiling', authorizationReference: 'owner://items/l2-ceiling/1',
    decisionIdentity: 'decision-items-l2-ceiling-1', packetHash: HASH_B,
  };
  fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
  fs.writeFileSync(absoluteArtifact, artifactBytes, { mode: 0o600 });
  fs.mkdirSync(path.dirname(absoluteInput), { recursive: true });
  fs.writeFileSync(absoluteInput, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'automation-items-l2-policy-ceiling-registration',
    domainId: 'items', artifactPath,
    artifactFileSha256: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`,
    artifactHash: approved.artifactHash,
    targetPolicyVersion: approved.targetPolicy.policyVersion,
    targetPolicyHash: approved.targetPolicy.policyHash,
    targetPolicySetHash: approved.targetPolicySetHash,
    proposalOnly: false,
  }, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  const db = connection();
  const originalQuery = db.query;
  db.query = async (sql, params = []) => {
    if (/SELECT domain_id AS domainId, policy_version AS policyVersion/.test(sql)) {
      fs.writeFileSync(absoluteMarker, '{"raced":true}\n', { mode: 0o600, flag: 'wx' });
      return [[{
        domainId: 'items', policyVersion: 2, level: 'L2',
        policyHash: approved.targetPolicy.policyHash,
        policyJson: approved.targetPolicy.policyJson,
        createdBy: 'owner', approvedBy: 'owner', reason: 'register approved L2 ceiling',
      }]];
    }
    return originalQuery(sql, params);
  };
  try {
    await assert.rejects(() => runRegistrationCli({
      argv: [
        `--input=${inputPath}`, `--output=${outputPath}`,
        '--operation-id=automation-items-l2-policy-ceiling-registration', '--recover=true',
      ],
      env: {
        WORKTREE_ROOT: repoRoot,
        TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root', TERRAPEDIA_DB_PASSWORD: 'root',
      },
      loadAuthorizationContext: () => ({
        ...auth(), decisionIdentity: 'decision-items-l2-ceiling-recovery-cli-race',
        packetHash: `sha256:${'c'.repeat(64)}`, reason: 'finalize registration after process crash',
      }),
      mysqlModule: { createConnection: async () => db },
    }), /already exists|overwrite/i);
    assert.equal(JSON.parse(fs.readFileSync(absoluteOutput, 'utf8')).status, 'pending');
    assert.deepEqual(JSON.parse(fs.readFileSync(absoluteMarker, 'utf8')), { raced: true });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
