import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ITEM_GROUP_CANONICAL_ACTION_IDS,
  buildItemGroupFormalApplyPlan,
  resolveItemGroupCanonicalProgressPath,
  runGovernedItemGroupApply,
  runItemGroupCanonicalCli,
  runItemGroupCanonicalAction,
} from './item-group-canonical-action.mjs';

function tempWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-group-action-'));
}

test('canonical item-group actions expose the exact preview/apply pair', () => {
  assert.deepEqual(ITEM_GROUP_CANONICAL_ACTION_IDS, {
    preview: 'item-group-canonical-preview',
    apply: 'item-group-canonical-apply',
  });
});

test('default progress path is isolated under WORKTREE_ROOT and uses backend child-status shape', () => {
  const worktreeRoot = tempWorktree();
  const progressPath = resolveItemGroupCanonicalProgressPath({
    actionId: ITEM_GROUP_CANONICAL_ACTION_IDS.preview,
    env: { WORKTREE_ROOT: worktreeRoot },
  });

  assert.equal(
    progressPath,
    path.join(
      worktreeRoot,
      'reports/backend-refresh/history/item-group-canonical.runtime',
      'item-group-canonical-preview.child-status.json',
    ),
  );
});

test('action publishes running before work, heartbeats, and completed terminal progress', async () => {
  const worktreeRoot = tempWorktree();
  const progressPath = path.join(worktreeRoot, 'attempt', 'child-status.json');
  let initialDuringWork = null;
  let heartbeatDuringWork = null;

  const result = await runItemGroupCanonicalAction({
    actionId: ITEM_GROUP_CANONICAL_ACTION_IDS.preview,
    progressPath,
    heartbeatIntervalMs: 5,
    execute: async () => {
      initialDuringWork = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, 25));
      heartbeatDuringWork = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      return { current: 3, total: 3, phase: 'verify', message: 'preview verified' };
    },
  });

  assert.equal(initialDuringWork.status, 'running');
  assert.equal(initialDuringWork.current, 0);
  assert.equal(initialDuringWork.total, 3);
  assert.notEqual(heartbeatDuringWork.lastHeartbeatAt, initialDuringWork.lastHeartbeatAt);
  assert.equal(heartbeatDuringWork.status, 'running');
  const final = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(final.status, 'completed');
  assert.equal(final.actionId, ITEM_GROUP_CANONICAL_ACTION_IDS.preview);
  assert.equal(final.childStatusPath, progressPath);
  assert.equal(final.phase, 'verify');
  assert.equal(final.current, 3);
  assert.equal(final.total, 3);
  assert.ok(Date.parse(final.lastHeartbeatAt) >= Date.parse(initialDuringWork.lastHeartbeatAt));
  assert.equal(result.status, 'completed');
});

test('action writes a failed terminal payload and rethrows the owning error', async () => {
  const worktreeRoot = tempWorktree();
  const progressPath = path.join(worktreeRoot, 'attempt', 'child-status.json');

  await assert.rejects(
    () => runItemGroupCanonicalAction({
      actionId: ITEM_GROUP_CANONICAL_ACTION_IDS.apply,
      progressPath,
      execute: async () => {
        throw new Error('projection failed');
      },
    }),
    /projection failed/,
  );

  const final = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(final.status, 'failed');
  assert.equal(final.actionId, ITEM_GROUP_CANONICAL_ACTION_IDS.apply);
  assert.equal(final.childStatusPath, progressPath);
  assert.match(final.message, /projection failed/);
  for (const field of [
    'actionId', 'status', 'generatedAt', 'lastHeartbeatAt', 'childStatusPath',
    'phase', 'message', 'current', 'total',
  ]) {
    assert.ok(Object.hasOwn(final, field), `missing progress field: ${field}`);
  }
});

test('governed group bootstrap applies the exact frozen projection in one transaction', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const draft = buildItemGroupFormalApplyPlan({
    repoRoot,
    input: {
      schemaVersion: 1,
      operationId: 'canonical-item-group-bootstrap',
      runKey: 'ig_0123456789abcdef',
      databases: {
        local: 'terria_v1_local',
        maint: 'terria_v1_maint',
        relation: 'terria_v1_relation',
      },
    },
  });
  const plan = buildItemGroupFormalApplyPlan({
    repoRoot,
    input: {
      schemaVersion: 1,
      operationId: 'canonical-item-group-bootstrap',
      runKey: 'ig_0123456789abcdef',
      databases: draft.databases,
      expectedCounts: draft.counts,
      expectedRuntimeSnapshotHash: draft.runtimeSnapshotHash,
      expectedCompatibilitySnapshotHash: draft.compatibilitySnapshotHash,
    },
  });
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async lockProjectionState() { calls.push('lock'); return null; },
    async assertSourceScopeEmpty() { calls.push('empty'); },
    async applyLandings() { calls.push('landings'); },
    async readLandingIds(value) {
      calls.push('landing-ids');
      return new Map(value.projection.landingRows.map((row, index) => [row.sourceKey, 9000 + index]));
    },
    async applyProjection(value) { calls.push('apply'); assert.equal(value.runtimeSnapshotHash, plan.runtimeSnapshotHash); },
    async verifyProjection(value) { calls.push('verify'); return { counts: value.counts, snapshotHash: value.runtimeSnapshotHash }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
  };
  const result = await runGovernedItemGroupApply({ plan, adapter });
  assert.deepEqual(calls, ['begin', 'lock', 'empty', 'landings', 'landing-ids', 'apply', 'verify', 'commit']);
  assert.equal(result.status, 'completed');
  assert.equal(result.runtimeSnapshotHash, plan.runtimeSnapshotHash);
  assert.equal(plan.counts.local.groupCount, 34);
});

test('governed group bootstrap rejects target and frozen projection drift', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const base = {
    schemaVersion: 1,
    operationId: 'canonical-item-group-bootstrap',
    runKey: 'ig_0123456789abcdef',
    databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' },
  };
  assert.throws(() => buildItemGroupFormalApplyPlan({
    repoRoot,
    input: { ...base, databases: { ...base.databases, local: 'scratch' } },
  }), /terria_v1_local/i);
  const draft = buildItemGroupFormalApplyPlan({ repoRoot, input: base });
  assert.throws(() => buildItemGroupFormalApplyPlan({
    repoRoot,
    input: { ...base, expectedCounts: { ...draft.counts, local: { groupCount: 0 } } },
  }), /expectedCounts/i);
});

test('formal group CLI requires the exact child authorization context before reading frozen input', async () => {
  await assert.rejects(
    () => runItemGroupCanonicalCli({
      argv: [
        '--action-id=item-group-canonical-apply',
        '--input=missing.input.json',
        '--output=unused.result.json',
      ],
      env: {},
      loadAuthorizationContextImpl: ({ operationId }) => {
        assert.equal(operationId, 'canonical-item-group-bootstrap');
        throw new Error('exact child authorization is missing');
      },
    }),
    /exact child authorization is missing/i,
  );
});
