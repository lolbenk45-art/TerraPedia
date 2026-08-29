import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_TARGETS,
  PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
  PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE,
  buildProjectionTextIdentityMutationPlan,
  hashProjectionTextIdentityScope,
  validateProjectionTextIdentityInput,
} from './npc-projection-text-identity-repair.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from '../automation/canonical-operation-catalog.mjs';

const PREVIEW_HASH = `sha256:${'a'.repeat(64)}`;

function fixturePreview() {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE,
    summary: {
      relationLoot: 4,
      projectionNpcs: 4,
      sourceFactsTargeted: 0,
      sourceDetailsTargeted: 0,
      localRowsTargeted: 0,
    },
    rows: EXPECTED_TARGETS.map((target) => {
      const before = {
        relationType: 'loot',
        itemId: 1,
        itemSourceId: 1,
        itemInternalName: target.itemInternalName,
        itemName: target.itemInternalName,
        itemNameZh: null,
        itemImageUrl: null,
        chanceText: 'legacy text',
        quantityText: target.quantityText,
        priceText: null,
        conditionText: null,
        sourceFactKey: `legacy-${target.sourceFactKey}`,
        relationRecordKey: `legacy-${target.relationRecordKey}`,
        sourceProvider: 'wiki_gg',
        sourcePage: 'legacy',
      };
      const after = {
        ...before,
        chanceText: target.chanceText,
        sourceFactKey: target.sourceFactKey,
        relationRecordKey: target.relationRecordKey,
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'https://terraria.wiki.gg/wiki/local',
      };
      return {
        ...target,
        sourceProvider: 'terraria.wiki.gg',
        sourceMaintTable: 'maint_item_sources',
        landingSourceKey: 'generated.npc_item_relations_bundle',
        landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
        projectionInternalName: target.npcInternalName,
        targetIndex: 0,
        beforeLootItems: [before],
        afterLootItems: [after],
      };
    }),
  };
}

function input() {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE,
    previewSha256: PREVIEW_HASH,
    expectedCounts: { relationLoot: 4, projectionNpcs: 4 },
    writeTargets: ['relation.projection_npcs.loot_items_json'],
  };
}

test('projection text identity repair freezes the four accepted relation keys', () => {
  const preview = fixturePreview();
  assert.doesNotThrow(() => validateProjectionTextIdentityInput({
    input: input(), preview, previewSha256: PREVIEW_HASH,
  }));
  const plan = buildProjectionTextIdentityMutationPlan(preview);
  assert.deepEqual(plan.counts, { relationLoot: 4, projectionNpcs: 4 });
  assert.deepEqual(plan.rows.map((row) => row.relationRecordKey), EXPECTED_TARGETS.map((row) => row.relationRecordKey));
});

test('projection text identity scope is content addressed and deterministic', () => {
  assert.equal(hashProjectionTextIdentityScope(), PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE);
  assert.equal(new Set(EXPECTED_TARGETS.map((row) => row.relationRecordKey)).size, 4);
});

test('projection text identity repair is registered as a governed operation', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID));
  assert.equal(
    CANONICAL_OPERATION_ENTRYPOINTS[PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID],
    'pipelines/npc-canonical/npc-projection-text-identity-repair.mjs',
  );
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID], [
    'reports/authorization/canonical/canonical-npc-projection-text-identity-repair.input.json',
    'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-text-identity-repair-preview.json',
  ]);
});

test('projection text identity repair rejects a relation key outside the accepted scope', () => {
  const preview = fixturePreview();
  preview.rows[0].relationRecordKey = 'f'.repeat(64);
  assert.throws(() => validateProjectionTextIdentityInput({
    input: input(), preview, previewSha256: PREVIEW_HASH,
  }), /outside accepted scope/);
});

test('projection text identity repair owns no facts, details, or local rows', () => {
  const preview = fixturePreview();
  preview.summary.sourceFactsTargeted = 1;
  assert.throws(() => validateProjectionTextIdentityInput({
    input: input(), preview, previewSha256: PREVIEW_HASH,
  }), /preview counts drifted/);
  const plan = buildProjectionTextIdentityMutationPlan(fixturePreview());
  assert.deepEqual(Object.keys(plan.rows[0]).sort(), [
    'afterLootItems', 'beforeLootItems', 'projectionId', 'projectionInternalName', 'relationRecordKey', 'targetIndex',
  ]);
});

test('projection text identity repair rejects unrelated projection content drift', () => {
  const preview = fixturePreview();
  preview.rows[1].afterLootItems[0].itemName = 'different item';
  assert.throws(() => validateProjectionTextIdentityInput({
    input: input(), preview, previewSha256: PREVIEW_HASH,
  }), /immutable field/);
});
