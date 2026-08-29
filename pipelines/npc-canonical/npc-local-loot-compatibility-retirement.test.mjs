import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalLootCompatibilityMutationPlan,
  validateLocalLootCompatibilityInput,
} from './npc-local-loot-compatibility-retirement.mjs';

function preview() {
  return {
    schemaVersion: 1,
    operationId: 'canonical-npc-local-loot-compatibility-retirement',
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: 'sha256:' + 'a'.repeat(64),
    summary: { targetLocalRows: 2 },
    targets: [
      { localId: 20, survivorLocalId: 10, npcId: 1, itemId: 2, sourceItemId: 2, dropSourceKind: 'npc_drop', quantityText: '1', chanceText: '10%', disposition: 'retire_exact_duplicate_local_tuple' },
      { localId: 30, survivorLocalId: 11, npcId: 3, itemId: 4, sourceItemId: 4, dropSourceKind: 'npc_drop', quantityText: '1', chanceText: '20%', disposition: 'retire_orphaned_wiki_gg_variant_local_tuple' },
    ],
  };
}

function input() {
  return {
    schemaVersion: 1,
    operationId: 'canonical-npc-local-loot-compatibility-retirement',
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: preview().scopeSha256,
    previewSha256: 'sha256:' + 'b'.repeat(64),
    expectedCounts: { targetLocalRows: 2 },
    writeTargets: ['local.npc_loot_entries.non_boss'],
  };
}

test('accepts a read-only preview and exact local-only target', () => {
  assert.equal(validateLocalLootCompatibilityInput({ input: input(), preview: preview(), previewSha256: input().previewSha256 }), true);
  const plan = buildLocalLootCompatibilityMutationPlan(preview());
  assert.deepEqual(plan.localIds, [20, 30]);
  assert.deepEqual(plan.survivorLocalIds, [10, 11]);
});

test('rejects a target that is outside the preview or has a second write target', () => {
  const broken = preview();
  broken.targets[0].disposition = 'relation_write';
  assert.throws(() => buildLocalLootCompatibilityMutationPlan(broken), /target/i);
  assert.throws(() => validateLocalLootCompatibilityInput({ input: { ...input(), writeTargets: ['relation.item_npc_loot_relations'] }, preview: preview(), previewSha256: input().previewSha256 }), /write targets/i);
});
