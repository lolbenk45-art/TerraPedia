import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import { executeSupplementaryL1Operation } from './run-supplementary-domain-l1-operation.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;

function bundle(domainId = 'audio') {
  const tables = {
    audio: ['audio_assets', 'audio_asset_links'],
    bosses: ['boss_groups', 'npcs'],
    shimmer: ['shimmer_item_transforms', 'shimmer_decraft_rules', 'shimmer_entity_transforms', 'shimmer_npc_transforms'],
  }[domainId];
  return buildSupplementaryL1Bundle({
    operationId: `automation-${domainId}-first-l1`,
    runId: `${domainId}_l1_20260814_01`,
    domainId,
    generatedAt: '2026-08-14T06:00:00.000Z',
    policy: {
      domainId,
      level: 'L1',
      operationalState: 'ACTIVE',
      policyVersion: 1,
      policyHash: HASH('a'),
      policySetHash: HASH('b'),
    },
    baseline: {
      environmentId: 'local',
      generations: tables.map((table) => ({ databaseRole: 'local', table, generation: 2 })),
      projectionHash: HASH('c'),
    },
    source: {
      path: `reports/authorization/canonical/automation-${domainId}-first-l1.source.json`,
      sha256: HASH('d'),
    },
    ownedTables: tables.map((table) => ({ databaseRole: 'local', table })),
    importPlan: { records: [{ id: 1 }] },
  });
}

function authorization(operationId) {
  return {
    operationId,
    actor: 'admin',
    reason: 'approved L1 apply',
    authorizationReference: 'owner-approval-20260814',
    decisionIdentity: 'supplementary-l1-01',
    packetHash: HASH('e'),
    authorizedAt: '2026-08-14T06:01:00.000Z',
    expiresAt: '2026-08-14T07:01:00.000Z',
  };
}

test('commits an approved frozen L1 operation once', async () => {
  const frozen = bundle();
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin',
      ownerStatus: 'ACTIVE',
      domainId: 'audio',
      policyVersion: 1,
      policyHash: HASH('a'),
      policySetHash: HASH('b'),
      currentLevel: 'L1',
      operationalState: 'ACTIVE',
      baselineFingerprint: frozen.baselineFingerprint,
      approvalMode: 'APPROVED_OWNER_L1',
      approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => { calls.push('apply'); return { inserted: 1 }; },
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  const result = await executeSupplementaryL1Operation({
    adapter,
    bundle: frozen,
    authorizationContext: authorization(frozen.operationId),
    now: '2026-08-14T06:02:00.000Z',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['begin', 'persist', 'apply', 'generation', 'result', 'commit']);
});

test('rolls back before apply when policy or baseline identity drifts', async () => {
  const frozen = bundle('bosses');
  const calls = [];
  const adapter = {
    begin: async () => calls.push('begin'),
    lockCurrentContext: async () => ({
      ownerUsername: 'admin', ownerStatus: 'ACTIVE', domainId: 'bosses',
      policyVersion: 1, policyHash: HASH('a'), policySetHash: HASH('b'),
      currentLevel: 'L1', operationalState: 'ACTIVE',
      baselineFingerprint: HASH('f'), approvalMode: 'APPROVED_OWNER_L1', approvalConsumed: false,
    }),
    persistRunChain: async () => calls.push('persist'),
    applyFrozenImport: async () => calls.push('apply'),
    advanceMutationGenerations: async () => calls.push('generation'),
    persistCommittedApply: async () => calls.push('result'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /baseline fingerprint/,
  );
  assert.deepEqual(calls, ['begin', 'rollback']);
});

test('rejects expired or mismatched authorization before a transaction', async () => {
  const frozen = bundle('shimmer');
  let begun = false;
  const adapter = { begin: async () => { begun = true; } };

  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization('automation-audio-first-l1'),
      now: '2026-08-14T06:02:00.000Z',
    }),
    /operationId/,
  );
  await assert.rejects(
    executeSupplementaryL1Operation({
      adapter,
      bundle: frozen,
      authorizationContext: authorization(frozen.operationId),
      now: '2026-08-14T08:02:00.000Z',
    }),
    /currently valid/,
  );
  assert.equal(begun, false);
});
