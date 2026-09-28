import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShimmerPartitionBundle,
  SHIMMER_PARTITION_SCOPES,
} from './shimmer-partition-contract.mjs';

const HASH = `sha256:${'c'.repeat(64)}`;

function scopes() {
  return SHIMMER_PARTITION_SCOPES.map((scope) => ({ ...scope }));
}

function fences() {
  return scopes().map((scope, index) => ({
    databaseRole: scope.databaseRole,
    table: scope.table,
    logicalPredicateHash: scope.logicalPredicateHash,
    generation: index,
    fenceToken: `fence-${index}`,
  }));
}

test('Shimmer partition bundle requires all four transforms plus two cross-owner scopes', () => {
  const result = buildShimmerPartitionBundle({
    scopes: scopes(),
    ownerApprovals: ['shimmer', 'items', 'town_npc_maintenance'],
    fences: fences(),
    generationId: HASH,
    previewSha256: HASH,
  });

  assert.equal(result.schemaVersion, 'shimmer-six-scope-partition/v1');
  assert.equal(result.executable, true);
  assert.equal(result.scopes.length, 6);
  assert.deepEqual([...result.ownerCapabilities].sort(), ['items', 'shimmer', 'town_npc_maintenance']);
});

test('Shimmer partition bundle rejects the historical four-table scope', () => {
  assert.throws(() => buildShimmerPartitionBundle({
    scopes: scopes().filter((scope) => scope.capability === 'shimmer'),
    ownerApprovals: ['shimmer', 'items', 'town_npc_maintenance'],
    fences: [],
    generationId: HASH,
    previewSha256: HASH,
  }), /six|scope/i);
});

test('Shimmer partition bundle rejects a missing cross-owner fence or approval', () => {
  const missingFence = fences().slice(0, -1);
  assert.throws(() => buildShimmerPartitionBundle({
    scopes: scopes(), ownerApprovals: ['shimmer', 'items', 'town_npc_maintenance'],
    fences: missingFence, generationId: HASH, previewSha256: HASH,
  }), /fence/i);
  assert.throws(() => buildShimmerPartitionBundle({
    scopes: scopes(), ownerApprovals: ['shimmer', 'items'], fences: fences(),
    generationId: HASH, previewSha256: HASH,
  }), /approval|owner/i);
});

test('Shimmer partition accepts the content-addressed generation id emitted by the generator', () => {
  const result = buildShimmerPartitionBundle({
    scopes: scopes(),
    ownerApprovals: ['shimmer', 'items', 'town_npc_maintenance'],
    fences: fences(),
    generationId: 'd'.repeat(64),
    previewSha256: HASH,
  });
  assert.equal(result.generationId, 'd'.repeat(64));
});
