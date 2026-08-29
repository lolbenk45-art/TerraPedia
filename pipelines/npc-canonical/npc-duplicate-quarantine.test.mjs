import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDuplicateQuarantinePlan,
  DUPLICATE_QUARANTINE_OPERATION_ID,
} from './npc-duplicate-quarantine.mjs';

const TARGETS = [
  {
    npcInternalName: 'Clothier',
    itemInternalName: 'RedHat',
    relationId: 1543,
    relationRecordKey: 'relation-clothier-redhat-new',
    sourceFactKey: 'fact-clothier-redhat-new',
    sourceDetailRecordKey: 'detail-clothier-redhat-new',
    localId: 83287,
    npcId: 54,
    itemId: 260,
    quantityText: '1',
    chanceText: '100%',
  },
  {
    npcInternalName: 'DyeTrader',
    itemInternalName: 'DyeTradersScimitar',
    relationId: 1544,
    relationRecordKey: 'relation-dye-trader-scimitar-new',
    sourceFactKey: 'fact-dye-trader-scimitar-new',
    sourceDetailRecordKey: 'detail-dye-trader-scimitar-new',
    localId: 83288,
    npcId: 207,
    itemId: 3349,
    quantityText: null,
    chanceText: '12.5%',
  },
];

function active(row) {
  return { status: 1, deleted: 0, ...row };
}

function fixtureRows() {
  return {
    relationLootRows: TARGETS.map((target) => active({
      id: target.relationId,
      record_key: target.relationRecordKey,
      source_fact_key: target.sourceFactKey,
      npc_internal_name: target.npcInternalName,
      item_internal_name: target.itemInternalName,
      source_maint_table: 'maint_npc_crawler_facts',
    })),
    sourceFactRows: TARGETS.map((target) => active({
      id: target.relationId + 4000,
      record_key: target.sourceFactKey,
      item_internal_name: target.itemInternalName,
      source_type: 'drop',
      source_ref_type: 'npc',
      source_ref_name: target.npcInternalName,
      source_maint_table: 'maint_npc_crawler_facts',
    })),
    sourceDetailRows: TARGETS.map((target) => active({
      id: target.relationId + 5000,
      record_key: target.sourceDetailRecordKey,
      source_fact_key: target.sourceFactKey,
      source_ref_name: target.npcInternalName,
    })),
    localLootRows: TARGETS.map((target) => active({
      id: target.localId,
      npc_id: target.npcId,
      item_id: target.itemId,
      source_item_id: target.itemId,
      drop_source_kind: 'npc_drop',
      quantity_text: target.quantityText,
      chance_text: target.chanceText,
    })),
  };
}

test('builds an exact new-crawler quarantine plan while preserving old-chain survivors', () => {
  const plan = buildDuplicateQuarantinePlan({ rows: fixtureRows(), targets: TARGETS });

  assert.equal(plan.operationId, DUPLICATE_QUARANTINE_OPERATION_ID);
  assert.equal(plan.applyAllowed, false);
  assert.deepEqual(plan.summary, {
    relationLoot: 2,
    sourceFacts: 2,
    sourceDetails: 2,
    localLoot: 2,
    total: 8,
  });
  assert.deepEqual(plan.targets.map((row) => [row.relationId, row.localId]), [
    [1543, 83287],
    [1544, 83288],
  ]);
});

test('rejects a row whose stable identity or active state drifted', () => {
  const rows = fixtureRows();
  rows.relationLootRows[0].item_internal_name = 'WrongItem';
  assert.throws(
    () => buildDuplicateQuarantinePlan({ rows, targets: TARGETS }),
    /stable identity drifted/i,
  );

  const inactive = fixtureRows();
  inactive.localLootRows[1].deleted = 1;
  assert.throws(
    () => buildDuplicateQuarantinePlan({ rows: inactive, targets: TARGETS }),
    /must be active/i,
  );
});

test('rejects a target that is not the crawler lineage', () => {
  const rows = fixtureRows();
  rows.relationLootRows[0].source_maint_table = 'maint_item_sources';
  assert.throws(
    () => buildDuplicateQuarantinePlan({ rows, targets: TARGETS }),
    /crawler lineage/i,
  );
});
