import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildNpcT2CutoverResult,
  runNpcT2CutoverVerification,
  validateNpcT2CutoverResult,
} from './npc-canonical-t2-cutover.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const VERIFIED_AT = '2026-08-06T01:00:00.000Z';

function fixture() {
  const ownerCompletion = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_apply_completion',
    operationId: 'canonical-npc-apply',
    status: 'COMPLETED',
    inputHash: HASH_A,
    landingResultHash: HASH_B,
    completionHash: HASH_A,
  };
  const baseCompletion = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_base_maint_completion',
    operationId: 'canonical-npc-base-maint-completion',
    status: 'COMPLETED',
    inputHash: HASH_A,
    landingResultHash: HASH_B,
    completionHash: HASH_B,
  };
  return {
    authorizationContext: {
      operationId: 'canonical-npc-t2-cutover-verification',
      decisionIdentity: 'canonical-npc-t2-cutover-verification-20260806-admin-01',
      packetHash: HASH_A,
      executionManifestHash: HASH_B,
      dataBundleSha256: HASH_A,
      serverFingerprint: HASH_B,
      executionManifest: { noWrite: true },
    },
    ownerCompletionContext: {
      completion: ownerCompletion,
      completionHash: HASH_A,
      inputHash: HASH_A,
    },
    baseCompletionContext: {
      completion: baseCompletion,
      completionHash: HASH_B,
      inputHash: HASH_A,
      landingResultHash: HASH_B,
    },
    t1Evidence: {
      rollbackPassed: true,
      restorePassed: true,
      cleanupPassed: true,
      ownerPhaseCompletion: ownerCompletion,
    },
    snapshot: {
      landing: { base: { fresh: true, currentCount: 1, snapshotHash: HASH_A } },
      maint: { base: { count: 2, currentCount: 2, localCount: 2, snapshotHash: HASH_A } },
      relation: { snapshotHash: HASH_B },
      local: { snapshotHash: HASH_A },
      runtime: { sampleCount: 1, snapshotHash: HASH_B },
    },
    api: {
      admin: { sampleCount: 1, snapshotHash: HASH_A, error: null },
      public: { sampleCount: 1, snapshotHash: HASH_A, error: null },
    },
    bridgeRetirement: { status: 'pass', referenceCount: 0 },
    verifiedAt: VERIFIED_AT,
  };
}

test('builds a deterministic no-write T2 result bound to every evidence class', () => {
  const result = buildNpcT2CutoverResult(fixture());

  assert.equal(result.resultKind, 'canonical_npc_t2_cutover_result');
  assert.equal(result.operationId, 'canonical-npc-t2-cutover-verification');
  assert.equal(result.status, 'completed');
  assert.equal(result.noWrite, true);
  assert.equal(result.cutoverState, 'T2_CUTOVER_VERIFIED');
  assert.equal(result.inputHash, HASH_A);
  assert.match(result.databaseSnapshotHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.apiEvidenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.resultHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(buildNpcT2CutoverResult(fixture()), result);
  assert.equal(validateNpcT2CutoverResult(result), true);
});

test('fails closed on authorization, predecessor, T1, and no-write drift', () => {
  const mutations = [
    ['operation', (value) => { value.authorizationContext.operationId = 'canonical-npc-t1-acceptance'; }],
    ['no-write', (value) => { value.authorizationContext.executionManifest.noWrite = false; }],
    ['owner completion', (value) => { value.ownerCompletionContext.completion.status = 'FAILED'; }],
    ['base input', (value) => { value.baseCompletionContext.inputHash = HASH_B; }],
    ['base landing', (value) => { value.baseCompletionContext.completion.landingResultHash = HASH_A; }],
    ['T1 cleanup', (value) => { value.t1Evidence.cleanupPassed = false; }],
    ['T1 owner', (value) => { value.t1Evidence.ownerPhaseCompletion.inputHash = HASH_B; }],
  ];

  for (const [name, mutate] of mutations) {
    const value = fixture();
    mutate(value);
    assert.throws(() => buildNpcT2CutoverResult(value), /NPC T2/i, name);
  }
});

test('result validation rejects terminal hash drift', () => {
  const result = buildNpcT2CutoverResult(fixture());
  result.apiEvidenceHash = HASH_B;
  assert.throws(() => validateNpcT2CutoverResult(result), /result hash/i);
});

test('runner creates one private terminal result before publishing readiness', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-t2-runner-'));
  const value = fixture();
  const outputPath = 'reports/authorization/canonical/npc-t2-attempt/result.json';
  const events = [];
  try {
    const result = await runNpcT2CutoverVerification({
      repoRoot,
      outputPath,
      verifiedAt: VERIFIED_AT,
      authorizationContext: value.authorizationContext,
    }, {
      loadOwnerCompletion: async () => value.ownerCompletionContext,
      loadBaseCompletion: async () => value.baseCompletionContext,
      loadT1Evidence: async () => value.t1Evidence,
      loadSnapshot: async () => value.snapshot,
      probeApi: async () => value.api,
      loadBridgeRetirement: () => value.bridgeRetirement,
      writeReadiness: async ({ cutoverResult }) => {
        events.push(fs.existsSync(path.join(repoRoot, outputPath)) ? 'result-first' : 'readiness-first');
        assert.equal(validateNpcT2CutoverResult(cutoverResult), true);
        return { summary: { status: 'pass' }, readinessLevel: 'T2_CUTOVER_VERIFIED' };
      },
    });

    assert.equal(validateNpcT2CutoverResult(result), true);
    assert.deepEqual(events, ['result-first']);
    assert.equal(fs.statSync(path.join(repoRoot, outputPath)).mode & 0o077, 0);
    await assert.rejects(
      () => runNpcT2CutoverVerification({
        repoRoot,
        outputPath,
        verifiedAt: VERIFIED_AT,
        authorizationContext: value.authorizationContext,
      }, {
        loadOwnerCompletion: async () => value.ownerCompletionContext,
        loadBaseCompletion: async () => value.baseCompletionContext,
        loadT1Evidence: async () => value.t1Evidence,
        loadSnapshot: async () => value.snapshot,
        probeApi: async () => value.api,
        loadBridgeRetirement: () => value.bridgeRetirement,
        writeReadiness: async () => ({}),
      }),
      /already exists|overwrite/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
