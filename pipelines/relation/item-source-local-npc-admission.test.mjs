import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildLocalNpcAdmissionRowPlan,
  canonicalJson,
  selectLocalNpcAdmissions,
  sha256,
} from './item-source-local-npc-admission.mjs';

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fixture() {
  const normalized = {
    entityId: 'dryad',
    source: { pageTitle: 'Dryad' },
    sourceMetadata: {
      revisionTimestamp: '2026-02-12T05:43:39Z',
      sourceId: 20,
    },
    sourceInfoboxes: [{ autoId: '20' }],
    shop: {
      normalizedRows: [{
        itemName: 'Blinkroot Planter Box',
        priceText: '1 SC',
        conditionText: null,
      }],
    },
    loot: [{
      itemName: 'Mining Helmet',
      chanceText: '1%',
      quantityText: '1',
      conditionText: 'Underground',
      npcInternalName: 'dryad',
      npcName: 'Dryad',
    }],
  };
  const audit = {
    status: 'pass',
    entityId: 'dryad',
    sourcePage: 'Dryad',
    sourceRevisionTimestamp: '2026-02-12T05:43:39Z',
    normalizedContentHash: hashJson(normalized),
    auditedAt: '2026-08-24T00:00:00Z',
  };
  return {
    snapshots: [{ normalized, audit }],
    items: [
      { source_id: 3219, internal_name: 'BlinkrootPlanterBox', english_name: 'Blinkroot Planter Box' },
      { source_id: 88, internal_name: 'MiningHelmet', english_name: 'Mining Helmet' },
    ],
    npcs: [{ source_id: 20, internal_name: 'Dryad', english_name: 'Dryad' }],
  };
}

function candidate({
  itemId = 3219,
  itemInternalName = 'BlinkrootPlanterBox',
  sourceType = 'shop',
  sourceRefId = 20,
  sourceRefInternalName = 'Dryad',
  sourceRefName = 'Dryad',
  chanceText = null,
  quantityText = null,
  conditions = null,
  sourcePage = 'Planter Boxes',
} = {}) {
  return {
    itemInternalName,
    sourceIdentity: {
      itemId,
      sourceType,
      sourceRefType: 'npc',
      sourceRefId,
      sourceRefInternalName,
      sourceRefName,
      sourcePage,
      chanceText,
      quantityText,
      conditions,
    },
  };
}

test('canonical Item-source hashes normalize equivalent MySQL Date and ISO timestamp values', () => {
  const timestamp = '2026-08-11T14:50:04.000Z';

  assert.equal(
    canonicalJson({ sourceRevisionTimestamp: new Date(timestamp) }),
    canonicalJson({ sourceRevisionTimestamp: timestamp }),
  );
  assert.equal(
    sha256({ sourceRevisionTimestamp: new Date(timestamp) }),
    sha256({ sourceRevisionTimestamp: timestamp }),
  );
});

test('selectLocalNpcAdmissions admits audited NPC shop facts while taking price from the NPC snapshot', () => {
  const { snapshots, items, npcs } = fixture();

  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate()],
    snapshots,
    items,
    npcs,
  });

  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.quarantine, 0);
  assert.equal(result.acceptedRows[0].sourcePage, 'Dryad');
  assert.equal(result.acceptedRows[0].priceText, '1 SC');
  assert.equal(result.acceptedRows[0].candidateSourcePage, 'Planter Boxes');
  assert.equal(result.acceptedRows[0].sourceIdentity.itemId, 3219);
  assert.equal(result.acceptedRows[0].sourceIdentity.sourceRefId, 20);
});

test('selectLocalNpcAdmissions requires exact drop chance quantity and condition fields', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate({
      itemId: 88,
      itemInternalName: 'MiningHelmet',
      sourceType: 'drop',
      chanceText: '2%',
      quantityText: '1',
      conditions: 'Underground',
    })],
    snapshots,
    items,
    npcs,
  });

  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.quarantine, 1);
  assert.equal(result.quarantineRows[0].reason, 'drop_payload_mismatch');
});

test('selectLocalNpcAdmissions rejects a display-name-only item match', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate({ itemId: 3219, itemInternalName: 'WrongInternalName' })],
    snapshots,
    items,
    npcs,
  });

  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.quarantine, 1);
  assert.equal(result.quarantineRows[0].reason, 'item_identity_mismatch');
});

test('selectLocalNpcAdmissions rejects a duplicate selected identity', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate(), candidate()],
    snapshots,
    items,
    npcs,
  });

  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.blocked, 2);
  assert.equal(result.blockedRows.every((row) => row.reason === 'duplicate_selector_identity'), true);
});

test('selectLocalNpcAdmissions fails closed when the snapshot audit hash drifts', () => {
  const { snapshots, items, npcs } = fixture();
  snapshots[0].audit.normalizedContentHash = '0'.repeat(64);

  assert.throws(
    () => selectLocalNpcAdmissions({ candidateRows: [candidate()], snapshots, items, npcs }),
    /normalized content hash/i,
  );
});

test('selectLocalNpcAdmissions blocks a pre-existing nonidentical local source', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate()],
    snapshots,
    items,
    npcs,
    existingLocalSourceRows: [{
      item_id: 3219,
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_id: 20,
      source_ref_name: 'Dryad',
      conditions: 'Wrong condition',
      source_page: 'Dryad',
      source_revision_timestamp: '2026-02-12T05:43:39Z',
      status: 1,
      deleted: 0,
    }],
  });

  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.blocked, 1);
  assert.equal(result.blockedRows[0].reason, 'existing_local_source_conflict');
});

test('selectLocalNpcAdmissions recognizes an identical local source when MySQL returns its UTC timestamp without an offset', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate()],
    snapshots,
    items,
    npcs,
    existingLocalSourceRows: [{
      item_id: 3219,
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_id: 20,
      source_ref_name: 'Dryad',
      chance_text: null,
      quantity_text: null,
      conditions: null,
      source_page: 'Dryad',
      source_revision_timestamp: '2026-02-12 05:43:39',
      status: 1,
      deleted: 0,
    }],
  });

  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.duplicateRows[0].reason, 'existing_local_source_identical');
});

test('selectLocalNpcAdmissions admits an otherwise exact active local source for a frozen revision timestamp repair', () => {
  const { snapshots, items, npcs } = fixture();
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate()],
    snapshots,
    items,
    npcs,
    existingLocalSourceRows: [{
      id: 192377,
      item_id: 3219,
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_id: 20,
      source_ref_name: 'Dryad',
      chance_text: null,
      quantity_text: null,
      conditions: null,
      source_page: 'Dryad',
      source_revision_timestamp: null,
      status: 1,
      deleted: 0,
    }],
  });

  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.blocked, 0);
  assert.deepEqual(result.reconciliationRows.map((row) => ({
    kind: row.kind,
    rowId: row.rowId,
    afterRevisionTimestamp: row.after.source_revision_timestamp,
  })), [{
    kind: 'set_missing_source_revision_timestamp',
    rowId: 192377,
    afterRevisionTimestamp: '2026-02-12 05:43:39',
  }]);
});

test('selectLocalNpcAdmissions admits the exact archived Mining Helmet source through the frozen three-row reconciliation', () => {
  const { snapshots, items, npcs } = fixture();
  const normalized = snapshots[0].normalized;
  normalized.entityId = 'undead-miner';
  normalized.source.pageTitle = 'Undead Miner';
  normalized.sourceMetadata.sourceId = 132;
  normalized.sourceInfoboxes = [{ autoId: '132' }];
  normalized.shop = { normalizedRows: [] };
  normalized.loot = [{
    itemName: 'Mining Helmet',
    chanceText: '5%',
    quantityText: '1',
    conditionText: null,
    sourceRowIndex: 3,
  }];
  snapshots[0].audit.entityId = 'undead-miner';
  snapshots[0].audit.sourcePage = 'Undead Miner';
  snapshots[0].audit.normalizedContentHash = hashJson(normalized);
  items.splice(0, items.length, {
    source_id: 88,
    internal_name: 'MiningHelmet',
    english_name: 'Mining Helmet',
  });
  npcs.splice(0, npcs.length, {
    source_id: 132,
    internal_name: 'UndeadMiner',
    english_name: 'Undead Miner',
  });
  const result = selectLocalNpcAdmissions({
    candidateRows: [candidate({
      itemId: 88,
      itemInternalName: 'MiningHelmet',
      sourceType: 'drop',
      sourceRefId: 132,
      sourceRefInternalName: 'UndeadMiner',
      sourceRefName: 'Undead Miner',
      chanceText: '5%',
      quantityText: '1',
      conditions: null,
    })],
    snapshots,
    items,
    npcs,
    existingLocalSourceRows: [
      {
        id: 194208,
        item_id: 88,
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_id: 132,
        source_ref_name: 'Undead Miner',
        chance_text: '5%',
        quantity_text: '1',
        conditions: null,
        source_page: 'https://terraria.wiki.gg/wiki/Undead_Miner',
        source_revision_timestamp: null,
        status: 0,
        deleted: 1,
      },
      {
        id: 198053,
        item_id: 88,
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_id: 132,
        source_ref_name: 'Mining armor',
        chance_text: '12%',
        quantity_text: '1',
        conditions: null,
        source_page: 'Mining armor',
        source_revision_timestamp: null,
        status: 1,
        deleted: 0,
      },
      {
        id: 198054,
        item_id: 88,
        source_type: 'drop',
        source_ref_type: 'npc',
        source_ref_id: 132,
        source_ref_name: 'Mining armor',
        chance_text: '12%',
        quantity_text: '1',
        conditions: null,
        source_page: 'Mining armor',
        source_revision_timestamp: null,
        status: 1,
        deleted: 0,
      },
    ],
  });

  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.blocked, 0);
  assert.deepEqual(result.reconciliationRows.map((row) => ({ kind: row.kind, rowId: row.rowId })), [
    { kind: 'restore_archived_exact_source', rowId: 194208 },
    { kind: 'soft_delete_stale_active_duplicate', rowId: 198053 },
    { kind: 'soft_delete_stale_active_duplicate', rowId: 198054 },
  ]);
  assert.deepEqual(result.reconciliationRows[0].after, {
    id: 194208,
    item_id: 88,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: 132,
    source_ref_name: 'Undead Miner',
    chance_text: '5%',
    quantity_text: '1',
    conditions: null,
    source_page: 'Undead Miner',
    source_revision_timestamp: '2026-02-12 05:43:39',
    status: 1,
    deleted: 0,
  });
});

test('buildLocalNpcAdmissionRowPlan expands one selected shop source through every owned chain layer', () => {
  const { snapshots, items, npcs } = fixture();
  const selection = selectLocalNpcAdmissions({
    candidateRows: [candidate()],
    snapshots,
    items,
    npcs,
  });

  const plan = buildLocalNpcAdmissionRowPlan({
    acceptedRows: selection.acceptedRows,
    snapshots,
    items,
    npcs,
  });

  assert.equal(plan.landingRows.length, 1);
  assert.equal(plan.maintTemplates.length, 1);
  assert.equal(plan.relationRows.sourceFacts.length, 1);
  assert.equal(plan.relationRows.sourceDetails.length, 1);
  assert.equal(plan.relationRows.npcShopRelations.length, 1);
  assert.equal(plan.relationRows.npcLootRelations.length, 0);
  assert.equal(plan.localSourceRows.length, 1);
  assert.equal(plan.localSourceRows[0].source_page, 'Dryad');
  assert.equal(plan.localSourceRows[0].source_ref_id, 20);
  assert.equal(plan.allowedTables.includes('terria_v1_relation.item_source_facts'), true);
  assert.equal(plan.allowedTables.includes('terria_v1_local.projection_items'), false);
});
