import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runArmorAutomaticOperation } from './run-armor-automatic-operation.mjs';

const sourceDispatchIdentity = Object.freeze({
  sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  sourceRunIdentity: '2026-10-08T11:58:00.000Z',
  sourceContentIdentity: `sha256:${'b'.repeat(64)}`,
});

function bindingFixture() {
  return {
    schemaVersion: 'armor-automatic-dispatch-binding/v1',
    actionId: 'domain-source-armor-sets',
    operationId: 'canonical-armor-ingestion',
    attemptId: 'attempt-123',
    sourceDispatchIdentity,
    intent: {
      path: 'reports/authorization/canonical/canonical-armor-ingestion.automatic-29.intent.json',
      sha256: `sha256:${'c'.repeat(64)}`,
      fullChainSha256: `sha256:${'d'.repeat(64)}`,
    },
    authorization: {
      packetPath: 'reports/authorization/canonical/attempt-123/packet.json',
      packetSha256: `sha256:${'e'.repeat(64)}`,
      permitPath: 'reports/authorization/canonical/attempt-123/permit.json',
      permitHash: `sha256:${'f'.repeat(64)}`,
      nonce: 'nonce-123',
      serverFingerprintPath: 'reports/authorization/canonical/attempt-123/server-fingerprint.json',
      serverFingerprintSha256: `sha256:${'1'.repeat(64)}`,
      policySetHash: `sha256:${'2'.repeat(64)}`,
      decisionIdentity: 'decision-123',
    },
    activation: {
      decisionIdentity: 'activation-123',
      packetHash: `sha256:${'3'.repeat(64)}`,
      policySetHash: `sha256:${'2'.repeat(64)}`,
      authorizedAt: '2026-10-08T11:59:00.000Z',
      expiresAt: '2026-10-08T12:30:00.000Z',
    },
    resultLabel: 'automatic-29',
    createdAt: '2026-10-08T11:59:00.000Z',
    expiresAt: '2026-10-08T12:30:00.000Z',
    consumedAt: null,
  };
}

function fixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-automatic-operation-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const progressPath = path.join(repoRoot, 'data/generated/armor-progress.json');
  const binding = bindingFixture();
  const env = {
    ...process.env,
    WORKTREE_ROOT: repoRoot,
    TERRAPEDIA_CRAWLER_ACTION_ID: 'domain-source-armor-sets',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: binding.attemptId,
    TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
    TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: sourceDispatchIdentity.sourceFingerprint,
    TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: sourceDispatchIdentity.sourceRunIdentity,
    TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: sourceDispatchIdentity.sourceContentIdentity,
  };
  return { repoRoot, progressPath, binding, env };
}

function dependencies(f, overrides = {}) {
  const calls = { spawn: [], progress: [], acknowledge: [] };
  const sourceProgress = { status: 'completed', generatedAt: '2026-10-08T12:05:00.000Z', ...sourceDispatchIdentity };
  const canonicalResult = {
    __syntheticForTest: true,
    status: 'COMPLETED',
    operationId: 'canonical-armor-ingestion',
    transaction: { committed: true, readback: { verified: true } },
  };
  return {
    calls,
    readBindingImpl: () => f.binding,
    assertBindingMatchesAttemptImpl: (binding, env) => {
      assert.equal(binding.attemptId, env.TERRAPEDIA_CRAWLER_ATTEMPT_ID);
    },
    spawnNodeImpl: (command) => calls.spawn.push(command),
    readSourceProgressImpl: () => sourceProgress,
    readCanonicalResultImpl: () => canonicalResult,
    readServerFingerprintImpl: () => '{"host":"127.0.0.1","port":13306,"serverUuid":"test","databases":["terria_v1_local","terria_v1_maint","terria_v1_relation"]}',
    acknowledgeSourceImpl: async (input) => { calls.acknowledge.push(input); },
    publishProgressImpl: (payload) => calls.progress.push(payload),
    ...overrides,
  };
}

test('runs exact Armor source and canonical commands with bound child environment', async (t) => {
  const f = fixture(t);
  const commandRoot = path.join(f.repoRoot, 'scheduler-command-root');
  f.env.TERRAPEDIA_CRAWLER_COMMAND_ROOT = commandRoot;
  const deps = dependencies(f);
  const result = await runArmorAutomaticOperation({
    argv: ['--domain=armor_sets', `--progress-path=${f.progressPath}`],
    env: f.env,
    now: '2026-10-08T12:00:00.000Z',
    ...deps,
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(deps.calls.spawn.length, 2);
  assert.deepEqual(deps.calls.spawn[0].argv, [
    process.execPath,
    path.join(commandRoot, 'pipelines/fetch/fetch-wiki-armorsetbonuses.mjs'),
    `--progress-path=${f.progressPath}`,
  ]);
  assert.deepEqual(deps.calls.spawn[1].argv, [
    process.execPath,
    path.join(commandRoot, 'pipelines/relation/run-armor-canonical-ingestion.mjs'),
    '--operation-id=canonical-armor-ingestion',
    '--result-label=automatic-29',
    '--intent=reports/authorization/canonical/canonical-armor-ingestion.automatic-29.intent.json',
    '--apply=true',
  ]);
  assert.equal(deps.calls.spawn[0].env.TERRAPEDIA_CRAWLER_COMMAND_ROOT, commandRoot);
  assert.equal(deps.calls.spawn[0].cwd, f.repoRoot);
  assert.equal(deps.calls.spawn[1].cwd, f.repoRoot);
  assert.equal(deps.calls.spawn[1].env.TERRAPEDIA_AUTHORIZED_PACKET_PATH,
    f.binding.authorization.packetPath);
  assert.equal(deps.calls.spawn[1].env.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH,
    f.binding.authorization.permitPath);
  assert.equal(deps.calls.spawn[1].env.TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE,
    f.binding.authorization.nonce);
  assert.match(deps.calls.spawn[1].env.TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT, /127\.0\.0\.1/);
  assert.equal(deps.calls.acknowledge.length, 1);
  assert.equal(deps.calls.progress.at(-1).status, 'completed');
});

test('fails before spawning when binding validation fails', async (t) => {
  const f = fixture(t);
  const deps = dependencies(f, {
    readBindingImpl: () => { throw new Error('binding expired'); },
  });
  await assert.rejects(() => runArmorAutomaticOperation({
    argv: ['--domain=armor_sets'], env: f.env, now: '2026-10-08T12:00:00.000Z', ...deps,
  }), /expired/);
  assert.equal(deps.calls.spawn.length, 0);
  assert.equal(deps.calls.acknowledge.length, 0);
});

test('does not invoke canonical child or acknowledgement on source identity drift', async (t) => {
  const f = fixture(t);
  const deps = dependencies(f, {
    readSourceProgressImpl: () => ({ status: 'completed', ...sourceDispatchIdentity,
      sourceFingerprint: `sha256:${'f'.repeat(64)}` }),
  });
  await assert.rejects(() => runArmorAutomaticOperation({
    argv: ['--domain=armor_sets'], env: f.env, now: '2026-10-08T12:00:00.000Z', ...deps,
  }), /source.*(identity|fingerprint)|drift/i);
  assert.equal(deps.calls.spawn.length, 1);
  assert.equal(deps.calls.acknowledge.length, 0);
});

test('does not acknowledge when canonical result is missing or incomplete', async (t) => {
  const f = fixture(t);
  const deps = dependencies(f, {
    readCanonicalResultImpl: () => null,
  });
  await assert.rejects(() => runArmorAutomaticOperation({
    argv: ['--domain=armor_sets'], env: f.env, now: '2026-10-08T12:00:00.000Z', ...deps,
  }), /result|readback|completed/i);
  assert.equal(deps.calls.spawn.length, 2);
  assert.equal(deps.calls.acknowledge.length, 0);
});

test('publishes failed progress and keeps acknowledgement untouched on child failure', async (t) => {
  const f = fixture(t);
  const deps = dependencies(f, {
    spawnNodeImpl: (command) => {
      deps.calls.spawn.push(command);
      if (deps.calls.spawn.length === 2) throw new Error('canonical child failed');
    },
  });
  await assert.rejects(() => runArmorAutomaticOperation({
    argv: ['--domain=armor_sets'], env: f.env, now: '2026-10-08T12:00:00.000Z', ...deps,
  }), /canonical child failed/);
  assert.equal(deps.calls.acknowledge.length, 0);
  assert.equal(deps.calls.progress.at(-1).status, 'failed');
});
