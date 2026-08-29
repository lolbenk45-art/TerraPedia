import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
  buildParentConflictMutationPlan,
  validateParentConflictInput,
} from './npc-stale-lineage-parent-conflict-retirement.mjs';

const SCOPE = 'sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001';
const PREVIEW_HASH = `sha256:${'a'.repeat(64)}`;

function preview() {
  const rows = Array.from({ length: 84 }, (_, index) => ({
    candidateRecordKey: `loot-${index}`,
    sourceFactKey: `fact-${index}`,
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    landingSourceKey: 'generated.npc_item_relations_bundle',
    sourceMaintTable: 'maint_item_sources',
    sourceMaintRecordKey: `maint-${index}`,
    disposition: 'quarantine_parent_conflict',
  }));
  return {
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: SCOPE,
    summary: {
      candidateLootRelations: 84,
      candidateSourceFacts: 84,
      candidateSourceDetails: 84,
      localRowsTargeted: 0,
      projectionRowsTargeted: 0,
    },
    rows,
  };
}

test('parent-conflict input accepts the exact relation-only proposal', () => {
  const value = preview();
  const input = {
    schemaVersion: 1,
    operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: SCOPE,
    previewPath: 'reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json',
    previewSha256: PREVIEW_HASH,
    expectedCounts: { relationLoot: 84 },
    writeTargets: ['relation.item_npc_loot_relations.parent_conflict_old_generated'],
  };
  assert.doesNotThrow(() => validateParentConflictInput({ input, preview: value, previewSha256: PREVIEW_HASH }));
  assert.deepEqual(buildParentConflictMutationPlan(value).counts, { relationLoot: 84 });
});

test('parent-conflict input rejects scope drift before database work', () => {
  const value = preview();
  assert.throws(() => validateParentConflictInput({
    input: {
      schemaVersion: 1,
      operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: 'sha256:bad',
      previewPath: 'reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json',
      previewSha256: PREVIEW_HASH,
      expectedCounts: { relationLoot: 84 },
      writeTargets: ['relation.item_npc_loot_relations.parent_conflict_old_generated'],
    },
    preview: value,
    previewSha256: PREVIEW_HASH,
  }), /scope hash drifted/);
});

test('parent-conflict mutation plan never owns facts, details, local, or projection rows', () => {
  const plan = buildParentConflictMutationPlan(preview());
  assert.deepEqual(Object.keys(plan.keys), ['relationLoot']);
  assert.equal(plan.counts.relationLoot, 84);
});

test('parent-conflict input accepts preview rows that omit the pinned maint table field', () => {
  const value = preview();
  for (const row of value.rows) delete row.sourceMaintTable;
  const input = {
    schemaVersion: 1,
    operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: SCOPE,
    previewSha256: PREVIEW_HASH,
    expectedCounts: { relationLoot: 84 },
    writeTargets: ['relation.item_npc_loot_relations.parent_conflict_old_generated'],
  };
  assert.doesNotThrow(() => validateParentConflictInput({ input, preview: value, previewSha256: PREVIEW_HASH }));
});
