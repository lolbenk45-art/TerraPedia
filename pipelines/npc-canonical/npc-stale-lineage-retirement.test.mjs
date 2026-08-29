import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STALE_LINEAGE_RETIREMENT_OPERATION_ID,
  buildRetirementMutationPlan,
  validateRetirementInput,
} from './npc-stale-lineage-retirement.mjs';

function preview() {
  const row = (recordKey) => ({
    recordKey,
    sourceFactKey: `fact-${recordKey}`,
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    landingSourceKey: 'generated.npc_item_relations_bundle',
    sourceMaintTable: 'maint_item_sources',
    sourceMaintRecordKey: `maint-${recordKey}`,
    sourceMaintId: 1,
    disposition: { status: 0, deleted: 1 },
  });
  return {
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: 'sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d',
    summary: { proposedRelationLoot: 513, proposedRelationShop: 408, proposedSourceFacts: 921, proposedSourceDetails: 921 },
    proposed: {
      relationLoot: Array.from({ length: 513 }, (_, index) => row(`loot-${index}`)),
      relationShop: Array.from({ length: 408 }, (_, index) => row(`shop-${index}`)),
      sourceFacts: Array.from({ length: 921 }, (_, index) => row(`fact-${index}`)),
      sourceDetails: Array.from({ length: 921 }, (_, index) => row(`detail-${index}`)),
    },
  };
}

test('retirement input accepts only the exact authorized proposal', () => {
  const value = preview();
  const input = {
    schemaVersion: 1,
    operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: value.scopeSha256,
    previewSha256: `sha256:${'a'.repeat(64)}`,
    expectedCounts: { relationLoot: 513, relationShop: 408, sourceFacts: 921, sourceDetails: 921 },
  };
  assert.doesNotThrow(() => validateRetirementInput({ input, preview: value, previewSha256: input.previewSha256 }));
  assert.deepEqual(buildRetirementMutationPlan(value).counts, input.expectedCounts);
});

test('retirement input rejects a scope drift before any database work', () => {
  const value = preview();
  assert.throws(() => validateRetirementInput({
    input: {
      schemaVersion: 1,
      operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: 'sha256:bad',
      previewSha256: `sha256:${'a'.repeat(64)}`,
      expectedCounts: { relationLoot: 513, relationShop: 408, sourceFacts: 921, sourceDetails: 921 },
    },
    preview: value,
    previewSha256: `sha256:${'a'.repeat(64)}`,
  }), /scope hash drifted/);
});
