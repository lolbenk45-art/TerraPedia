import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_CANONICAL_OPERATION_ID,
  buildArmorCanonicalIntentArtifactBinding,
  assertArmorCanonicalPacketBinding,
} from './armor-canonical-operation-binding.mjs';
import { ARMOR_CANONICAL_POLICY_OWNER_SCOPES, buildArmorCanonicalFenceCommit } from './armor-canonical-write-fence.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function intent() {
  return {
    schemaVersion: 'armor-canonical-full-chain-intent/v2',
    operationId: ARMOR_CANONICAL_OPERATION_ID,
    executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    writeTimestamp: '2026-09-26T04:00:00Z',
    fullChainSha256: HASH('a'),
  };
}

function context(binding) {
  return {
    operationId: ARMOR_CANONICAL_OPERATION_ID,
    decisionIdentity: 'armor-ingestion-retry-01',
    packetHash: HASH('b'),
    runId: binding.runId,
    fenceToken: binding.fenceToken,
    fenceCommit: binding.fenceCommit,
    expiresAt: binding.fenceCommit.expiresAt ?? null,
    actor: 'admin',
    serverFingerprint: binding.serverFingerprint,
    policySetHash: binding.policySetHash,
    dataBundleSha256: HASH('e'),
    executionManifestHash: HASH('f'),
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    requiredTechnicalFields: ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash', 'executionManifestHash'],
    dataBundleEntries: [{ path: binding.intentPath, contentHash: binding.intentFileSha256 }],
    executionManifest: {
      operationId: ARMOR_CANONICAL_OPERATION_ID,
      resultLabel: binding.resultLabel,
      armorCanonicalIntent: binding,
    },
  };
}

test('Armor operation binding uses a content-addressed intent entry and full-chain hash', () => {
  const binding = buildArmorCanonicalIntentArtifactBinding({ resultLabel: 'retry-01', intent: intent(), intentFileSha256: HASH('e'), serverFingerprint: HASH('c'), policySetHash: HASH('d'), runId: 'armor-run-01', fenceToken: 'armor-fence-01', fenceCommit: { generation: 1, marker: 'armor-commit-01' } });
  assert.deepEqual(binding, {
    schemaVersion: 'armor-canonical-operation-binding/v1',
    operationId: ARMOR_CANONICAL_OPERATION_ID,
    resultLabel: 'retry-01',
    intentPath: 'reports/authorization/canonical/canonical-armor-ingestion.retry-01.intent.json',
    intentFileSha256: HASH('e'),
    fullChainSha256: HASH('a'),
    serverFingerprint: HASH('c'),
    policySetHash: HASH('d'),
    runId: 'armor-run-01',
    fenceToken: 'armor-fence-01',
    fenceCommit: { generation: 1, marker: 'armor-commit-01' },
  });
});

test('Armor operation binding rejects packet drift before a connection can be opened', () => {
  const binding = buildArmorCanonicalIntentArtifactBinding({ resultLabel: 'retry-01', intent: intent(), intentFileSha256: HASH('e'), serverFingerprint: HASH('c'), policySetHash: HASH('d'), runId: 'armor-run-01', fenceToken: 'armor-fence-01', fenceCommit: { generation: 1, marker: 'armor-commit-01' } });
  assert.equal(assertArmorCanonicalPacketBinding({ authorizedContext: context(binding), binding, intent: intent() }), true);
  for (const mutate of [
    (value) => { value.operationId = 'canonical-armor-set-projection-incremental'; },
    (value) => { value.executionManifest.armorCanonicalIntent.fullChainSha256 = HASH('f'); },
    (value) => { value.dataBundleEntries[0].contentHash = HASH('f'); },
    (value) => { value.targetDatabases = ['terria_v1_local']; },
    (value) => { value.policySetHash = HASH('f'); },
  ]) {
    const drifted = structuredClone(context(binding));
    mutate(drifted);
    assert.throws(() => assertArmorCanonicalPacketBinding({ authorizedContext: drifted, binding, intent: intent() }), /Armor operation packet binding/);
  }
});

test('Armor local canonical binding requires the exact nine owner-scope fence commit', () => {
  const fullIntent = { ...intent(), localProjection: { candidateSha256: HASH('9') } };
  const fenceCommit = buildArmorCanonicalFenceCommit({
    runId: 'armor-run-09',
    expiresAt: '2030-10-27T10:00:00Z',
    generations: ARMOR_CANONICAL_POLICY_OWNER_SCOPES.map(scope => ({ ...scope, generation: 4 })),
    tokenFactory: (() => { let index = 0; return () => `fence:${String(++index).padStart(64, '0')}`; })(),
    markerFactory: (() => { let index = 0; return () => String(++index).padStart(64, '0'); })(),
  });
  const binding = buildArmorCanonicalIntentArtifactBinding({
    resultLabel: 'retry-09', intent: fullIntent, intentFileSha256: HASH('e'), serverFingerprint: HASH('c'),
    policySetHash: HASH('d'), runId: 'armor-run-09', fenceToken: fenceCommit.bindings[0].fenceToken, fenceCommit,
  });
  assert.doesNotThrow(() => assertArmorCanonicalPacketBinding({ authorizedContext: context(binding), binding, intent: fullIntent }));
  assert.throws(() => buildArmorCanonicalIntentArtifactBinding({
    resultLabel: 'retry-09', intent: fullIntent, intentFileSha256: HASH('e'), serverFingerprint: HASH('c'),
    policySetHash: HASH('d'), runId: 'armor-run-09', fenceToken: 'fence:legacy',
    fenceCommit: { generation: 1, marker: 'legacy-marker' },
  }), /all-scope fence bindings/i);
});
