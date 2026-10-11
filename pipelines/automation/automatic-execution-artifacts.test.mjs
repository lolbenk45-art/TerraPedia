import assert from 'node:assert/strict';
import test from 'node:test';

import {
  automaticArtifactRunId,
  automaticAttemptIdentityFromEnvironment,
  automaticReconciliationRoot,
} from './automatic-execution-artifacts.mjs';
import { buildAutomaticRunId } from './run-automatic-domain-operation.mjs';
import { buildBaseAutomaticArtifactPaths, buildAutomaticReconciliationInput as baseReconciliation } from './run-base-domain-automatic-operation.mjs';
import { buildAutomaticReconciliationInput as supplementaryReconciliation } from './run-supplementary-domain-automatic-operation.mjs';

const sourceDispatchIdentity = {
  sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  sourceRunIdentity: '2026-09-22T12:00:00.000Z',
  sourceContentIdentity: `sha256:${'b'.repeat(64)}`,
};
const attempt = { stateStoreEpoch: 'epoch-1', queueId: 'queue-1', attemptId: 'attempt-1' };
const runId = buildAutomaticRunId('projectiles', sourceDispatchIdentity.sourceFingerprint);
const binding = { domainId: 'projectiles', runId, sourceDispatchIdentity, importPlan: { automaticAttemptIdentity: attempt } };

test('execution artifact namespace binds each immutable component and ignores mutable progress fencing', () => {
  const original = automaticArtifactRunId(binding);
  for (const field of Object.keys(attempt)) {
    assert.notEqual(automaticArtifactRunId({
      ...binding, importPlan: { automaticAttemptIdentity: { ...attempt, [field]: `${attempt[field]}-2` } },
    }), original);
  }
  for (const [field, value] of Object.entries({
    sourceFingerprint: `sha256:${'c'.repeat(64)}`,
    sourceRunIdentity: '2026-09-22T12:01:00.000Z',
    sourceContentIdentity: `sha256:${'d'.repeat(64)}`,
  })) {
    assert.notEqual(automaticArtifactRunId({ ...binding, sourceDispatchIdentity: { ...sourceDispatchIdentity, [field]: value } }), original);
  }
  assert.equal(automaticArtifactRunId({
    ...binding, importPlan: { automaticAttemptIdentity: { ...attempt, fenceToken: 2, stateVersion: 99, progressSequence: 100 } },
  }), original);
  assert.equal(automaticArtifactRunId({ runId }), runId);
  assert.equal(automaticAttemptIdentityFromEnvironment({ TERRAPEDIA_CRAWLER_ATTEMPT_ID: '../invalid' }, null), null);
  assert.equal(buildAutomaticRunId('projectiles', sourceDispatchIdentity.sourceFingerprint), runId);
});

test('base, supplementary, and reconciliation consumers derive the identical execution directory', () => {
  const paths = buildBaseAutomaticArtifactPaths({ repoRoot: '/tmp/example', domain: 'projectiles', ...binding });
  assert.equal(paths.sourceRelativePath, `reports/authorization/canonical/automatic/projectiles/${automaticArtifactRunId(binding)}/source.json`);
  const base = baseReconciliation('projectiles', runId, binding);
  assert.deepEqual(base, supplementaryReconciliation('projectiles', runId, binding));
  assert.equal(base.outputPath, `${automaticReconciliationRoot(binding)}/reconciliation-evidence.json`);
});

for (const field of ['STATE_STORE_EPOCH', 'QUEUE_ID', 'ATTEMPT_ID']) {
  for (const value of [undefined, '', '../escape', ' padded', 'x'.repeat(257)]) {
    test(`scheduler attempt environment rejects ${field}=${String(value)}`, () => {
      const env = {
        TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: attempt.stateStoreEpoch,
        TERRAPEDIA_CRAWLER_QUEUE_ID: attempt.queueId,
        TERRAPEDIA_CRAWLER_ATTEMPT_ID: attempt.attemptId,
        [`TERRAPEDIA_CRAWLER_${field}`]: value,
      };
      assert.throws(() => automaticAttemptIdentityFromEnvironment(env, sourceDispatchIdentity), /automatic attempt identity/);
    });
  }
}
