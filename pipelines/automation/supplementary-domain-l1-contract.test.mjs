import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPLEMENTARY_L1_DOMAINS,
  assertSupplementaryOwnedTables,
  buildSupplementaryL1Bundle,
  validateSupplementaryL1Bundle,
} from './supplementary-domain-l1-contract.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;

function input(overrides = {}) {
  return {
    operationId: 'automation-audio-first-l1',
    runId: 'audio_l1_20260814_01',
    domainId: 'audio',
    generatedAt: '2026-08-14T06:00:00.000Z',
    policy: {
      domainId: 'audio',
      level: 'L1',
      operationalState: 'ACTIVE',
      policyVersion: 1,
      policyHash: HASH_A,
      policySetHash: HASH_B,
    },
    baseline: {
      environmentId: 'local',
      generations: [
        { databaseRole: 'local', table: 'audio_assets', generation: 4 },
        { databaseRole: 'local', table: 'audio_asset_links', generation: 4 },
      ],
      projectionHash: HASH_C,
    },
    source: {
      path: 'reports/authorization/canonical/automation-audio-first-l1.source.json',
      sha256: HASH_D,
    },
    ownedTables: [
      { databaseRole: 'local', table: 'audio_assets' },
      { databaseRole: 'local', table: 'audio_asset_links' },
    ],
    importPlan: { assets: [{ assetId: 'item-1' }], links: [] },
    ...overrides,
  };
}

test('builds a stable immutable L1 bundle for a supported domain', () => {
  assert.deepEqual(SUPPLEMENTARY_L1_DOMAINS, ['audio', 'bosses', 'shimmer']);
  const bundle = buildSupplementaryL1Bundle(input());

  assert.equal(validateSupplementaryL1Bundle(bundle), true);
  assert.match(bundle.bundleHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(bundle.baselineFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(bundle.logicalDiffHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(bundle.approvalMode, 'APPROVED_OWNER_L1');
  assert.equal(Object.isFrozen(bundle), true);
});

test('rejects non-L1 and inactive policies', () => {
  for (const policy of [
    { ...input().policy, level: 'L2' },
    { ...input().policy, operationalState: 'SHADOW' },
  ]) {
    assert.throws(
      () => buildSupplementaryL1Bundle(input({ policy })),
      /L1\/ACTIVE/,
    );
  }
});

test('rejects mutable or escaping source paths', () => {
  for (const sourcePath of [
    'data/generated/wiki-audio-assets.latest.json',
    '../outside/source.json',
    '/tmp/source.json',
  ]) {
    assert.throws(
      () => buildSupplementaryL1Bundle(input({ source: { path: sourcePath, sha256: HASH_D } })),
      /frozen authorization artifact/,
    );
  }
});

test('enforces exact domain table ownership and excludes boss loot', () => {
  assert.equal(assertSupplementaryOwnedTables('audio', input().ownedTables), true);
  assert.equal(assertSupplementaryOwnedTables('bosses', [
    { databaseRole: 'local', table: 'boss_groups' },
    { databaseRole: 'local', table: 'npcs' },
  ]), true);
  assert.equal(assertSupplementaryOwnedTables('shimmer', [
    { databaseRole: 'local', table: 'shimmer_item_transforms' },
    { databaseRole: 'local', table: 'shimmer_decraft_rules' },
    { databaseRole: 'local', table: 'shimmer_entity_transforms' },
    { databaseRole: 'local', table: 'shimmer_npc_transforms' },
  ]), true);

  assert.throws(
    () => assertSupplementaryOwnedTables('bosses', [
      { databaseRole: 'local', table: 'boss_groups' },
      { databaseRole: 'local', table: 'boss_loot' },
    ]),
    /owned table set/,
  );
});

test('detects bundle content drift', () => {
  const bundle = buildSupplementaryL1Bundle(input());
  assert.throws(
    () => validateSupplementaryL1Bundle({ ...bundle, runId: 'audio_l1_tampered' }),
    /hash or content mismatch/,
  );
});

test('builds an activation-gated automatic execution identity', () => {
  const bundle = buildSupplementaryL1Bundle(input({ executionMode: 'ACTIVATION_GATED_AUTO' }));
  assert.equal(bundle.executionMode, 'ACTIVATION_GATED_AUTO');
  assert.equal(bundle.approvalMode, 'AUTO_APPLY_ACTIVATED');
  assert.equal(validateSupplementaryL1Bundle(bundle), true);
});

test('rejects unknown supplementary execution modes', () => {
  assert.throws(
    () => buildSupplementaryL1Bundle(input({ executionMode: 'BYPASS' })),
    /execution mode/,
  );
});
