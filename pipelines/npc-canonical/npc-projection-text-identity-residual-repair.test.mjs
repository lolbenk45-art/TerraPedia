import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
  PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
  EXPECTED_TARGETS,
} from '../audit/npc-projection-text-identity-residual-preview.mjs';
import {
  buildProjectionTextIdentityResidualMutationPlan,
  assertCurrentRows,
  assertReadbackRows,
  validateProjectionTextIdentityResidualRepairInput,
} from './npc-projection-text-identity-residual-repair.mjs';

const PREVIEW_HASH = `sha256:${'a'.repeat(64)}`;

function preview() {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
    summary: {
      acceptedRelationLoot: 2,
      relationRowsToRetire: 2,
      projectionNpcsToReplace: 2,
      localRowsToRetire: 2,
      sourceFactsTargeted: 0,
      sourceDetailsTargeted: 0,
      localRowsTargeted: 0,
    },
    rows: EXPECTED_TARGETS.map((target) => ({
      ...target,
      projectionInternalName: target.npcInternalName,
      targetIndex: 1,
      beforeLootItems: [{ itemInternalName: 'EaterOfLife' }, {
        itemInternalName: 'Nazar',
        quantityText: target.quantityText,
        chanceText: target.beforeChanceText,
        sourceFactKey: target.beforeSourceFactKey,
        relationRecordKey: target.beforeRelationRecordKey,
        sourceProvider: 'wiki_gg',
      }],
      afterLootItems: [{ itemInternalName: 'EaterOfLife' }, {
        itemInternalName: 'Nazar',
        quantityText: target.quantityText,
        chanceText: target.chanceText,
        sourceFactKey: target.sourceFactKey,
        relationRecordKey: target.relationRecordKey,
        sourceProvider: 'terraria.wiki.gg',
      }],
      relationRetirement: {
        relationId: target.beforeRelationRecordKey === EXPECTED_TARGETS[0].beforeRelationRecordKey ? 128 : 129,
        recordKey: target.beforeRelationRecordKey,
        sourceFactKey: target.beforeSourceFactKey,
        sourceMaintRecordKey: target.beforeSourceMaintRecordKey,
        sourceMaintId: target.beforeSourceMaintRecordKey === EXPECTED_TARGETS[0].beforeSourceMaintRecordKey ? 1920 : 1921,
        landingSourceId: 6180,
        sourceProvider: 'wiki_gg',
        landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
        landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
        quantityText: target.quantityText,
        chanceText: target.beforeChanceText,
        conditions: null,
      },
      localRetirement: {
        localId: target.localRetirementId,
        npcId: target.projectionId,
        itemId: 891,
        sourceItemId: 891,
        dropSourceKind: 'npc_drop',
        quantityText: target.quantityText,
        chanceText: target.beforeChanceText,
        conditions: null,
      },
      localSurvivor: {
        localId: target.localSurvivorId,
        npcId: target.projectionId,
        itemId: 891,
        sourceItemId: 891,
        dropSourceKind: 'npc_drop',
        quantityText: target.quantityText,
        chanceText: target.chanceText,
        conditions: null,
      },
    })),
  };
}

function input() {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
    previewSha256: PREVIEW_HASH,
    expectedCounts: {
      acceptedRelationLoot: 2,
      relationRowsToRetire: 2,
      projectionNpcsToReplace: 2,
      localRowsToRetire: 2,
    },
    writeTargets: [
      'relation.item_npc_loot_relations.status_deleted',
      'relation.projection_npcs.loot_items_json',
      'local.npc_loot_entries.status_deleted',
    ],
  };
}

function currentRows() {
  const previewRows = preview().rows;
  return {
    relations: previewRows.flatMap((row) => ([
      {
        id: row.relationId,
        record_key: row.relationRecordKey,
        source_maint_id: null,
        landing_source_id: 12474,
        source_fact_key: row.sourceFactKey,
        source_maint_record_key: row.sourceMaintRecordKey,
        npc_internal_name: row.npcInternalName,
        item_internal_name: row.itemInternalName,
        quantity_text: row.quantityText,
        chance_text: row.chanceText,
        source_provider: 'terraria.wiki.gg',
        source_maint_table: 'maint_item_sources',
        landing_source_key: 'generated.npc_item_relations_bundle',
        landing_content_hash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
        source_page: row.sourcePage,
        status: 1,
        deleted: 0,
      },
      {
        id: row.relationRetirement.relationId,
        record_key: row.relationRetirement.recordKey,
        source_maint_id: row.relationRetirement.sourceMaintId,
        landing_source_id: row.relationRetirement.landingSourceId,
        source_fact_key: row.relationRetirement.sourceFactKey,
        source_maint_record_key: row.relationRetirement.sourceMaintRecordKey,
        npc_internal_name: row.npcInternalName,
        item_internal_name: row.itemInternalName,
        quantity_text: row.relationRetirement.quantityText,
        chance_text: row.relationRetirement.chanceText,
        source_provider: row.relationRetirement.sourceProvider,
        source_maint_table: 'maint_item_sources',
        landing_source_key: row.relationRetirement.landingSourceKey,
        landing_content_hash: row.relationRetirement.landingContentHash,
        source_page: 'Nazar',
        source_revision_timestamp: '2026-02-19T02:11:12.000Z',
        status: 1,
        deleted: 0,
      },
    ])),
    projections: previewRows.map((row) => ({
      id: row.projectionId,
      internal_name: row.projectionInternalName,
      status: 1,
      deleted: 0,
      loot_items_json: JSON.stringify(row.beforeLootItems),
    })),
    localRows: previewRows.flatMap((row) => ([
      { id: row.localRetirement.localId, npc_id: row.localRetirement.npcId, item_id: 891, source_item_id: 891, drop_source_kind: 'npc_drop', quantity_text: '1', chance_text: '1% 1.99%', status: 1, deleted: 0 },
      { id: row.localSurvivor.localId, npc_id: row.localSurvivor.npcId, item_id: 891, source_item_id: 891, drop_source_kind: 'npc_drop', quantity_text: '1', chance_text: '{{modes|1%|1.99%}}', status: 1, deleted: 0 },
    ])),
  };
}

test('residual repair owns only the two frozen relation, projection, and local replacements', () => {
  assert.doesNotThrow(() => validateProjectionTextIdentityResidualRepairInput({
    input: input(), preview: preview(), previewSha256: PREVIEW_HASH,
  }));
  const plan = buildProjectionTextIdentityResidualMutationPlan(preview());
  assert.deepEqual(plan.counts, {
    acceptedRelationLoot: 2,
    relationRowsToRetire: 2,
    projectionNpcsToReplace: 2,
    localRowsToRetire: 2,
  });
  assert.deepEqual(plan.rows.map((row) => row.projectionId), [179, 83]);
  assert.deepEqual(Object.keys(plan.rows[0]).sort(), [
    'afterLootItems', 'beforeLandingSourceId', 'beforeLootItems', 'beforeSourceFactKey',
    'beforeSourceMaintId', 'beforeSourceMaintRecordKey', 'localRetirementId', 'localSurvivorId', 'projectionId',
    'projectionInternalName', 'relationId', 'relationRecordKey', 'retiringRelationId',
    'retiringRelationRecordKey', 'targetIndex',
  ]);
});

test('residual repair rejects an unfrozen old projection identity', () => {
  const unsafePreview = preview();
  unsafePreview.rows[0].beforeLootItems[1].relationRecordKey = 'f'.repeat(64);
  assert.throws(() => validateProjectionTextIdentityResidualRepairInput({
    input: input(), preview: unsafePreview, previewSha256: PREVIEW_HASH,
  }), /projection identity drifted/);
});

test('apply readback requires complete accepted and retiring relation lineage', () => {
  const rows = currentRows();
  const plan = buildProjectionTextIdentityResidualMutationPlan(preview());
  assert.doesNotThrow(() => assertCurrentRows(rows.relations, rows.projections, rows.localRows, plan));

  const drifted = rows.relations.map((row) => ({ ...row }));
  drifted.find((row) => row.record_key === EXPECTED_TARGETS[0].relationRecordKey).landing_source_key = 'wrong';
  assert.throws(
    () => assertCurrentRows(drifted, rows.projections, rows.localRows, plan),
    /accepted relation drifted/,
  );
});

test('apply readback requires the projection internal name to match the frozen target', () => {
  const rows = currentRows();
  const plan = buildProjectionTextIdentityResidualMutationPlan(preview());
  const drifted = rows.projections.map((row) => ({ ...row }));
  drifted.find((row) => row.id === EXPECTED_TARGETS[0].projectionId).internal_name = 'OtherNpc';
  assert.throws(
    () => assertCurrentRows(rows.relations, drifted, rows.localRows, plan),
    /projection identity drifted/,
  );
});

test('post-apply readback requires retired rows inactive and survivors lineage intact', () => {
  const before = currentRows();
  const plan = buildProjectionTextIdentityResidualMutationPlan(preview());
  const afterRelations = before.relations.map((row) => [EXPECTED_TARGETS[0].beforeRelationRecordKey, EXPECTED_TARGETS[1].beforeRelationRecordKey].includes(row.record_key)
    ? { ...row, status: 0, deleted: 1 }
    : row);
  const afterLocal = before.localRows.map((row) => [EXPECTED_TARGETS[0].localRetirementId, EXPECTED_TARGETS[1].localRetirementId].includes(row.id)
    ? { ...row, status: 0, deleted: 1 }
    : row);
  const afterProjections = before.projections.map((row) => ({
    ...row,
    loot_items_json: JSON.stringify(plan.rows.find((candidate) => candidate.projectionId === row.id).afterLootItems),
  }));
  assert.doesNotThrow(() => assertReadbackRows(afterRelations, afterProjections, afterLocal, plan));
  const drifted = afterRelations.map((row) => ({ ...row }));
  drifted.find((row) => row.record_key === EXPECTED_TARGETS[0].relationRecordKey).landing_source_id = 1;
  assert.throws(() => assertReadbackRows(drifted, afterProjections, afterLocal, plan), /accepted relation readback drifted/);
});
