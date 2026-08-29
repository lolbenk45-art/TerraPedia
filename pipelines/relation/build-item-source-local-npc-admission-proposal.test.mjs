import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildLocalNpcAdmissionProposal,
  runLocalNpcAdmissionProposal,
} from './build-item-source-local-npc-admission-proposal.mjs';
import { selectLocalNpcAdmissions, sha256 } from './item-source-local-npc-admission.mjs';

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fixture() {
  const normalized = {
    entityId: 'dryad',
    source: { pageTitle: 'Dryad' },
    sourceMetadata: { revisionTimestamp: '2026-02-12T05:43:39Z', sourceId: 20 },
    sourceInfoboxes: [{ autoId: '20' }],
    shop: { normalizedRows: [{ itemName: 'Blinkroot Planter Box', priceText: '1 SC', conditionText: null }] },
    loot: [],
  };
  const snapshots = [{
    normalized,
    audit: {
      status: 'pass',
      entityId: 'dryad',
      sourcePage: 'Dryad',
      sourceRevisionTimestamp: '2026-02-12T05:43:39Z',
      normalizedContentHash: hashJson(normalized),
      auditedAt: '2026-08-24T00:00:00Z',
    },
  }];
  const items = [{ source_id: 3219, internal_name: 'BlinkrootPlanterBox', english_name: 'Blinkroot Planter Box' }];
  const npcs = [{ id: 77, source_id: 20, internal_name: 'Dryad', english_name: 'Dryad' }];
  const candidateRows = [{
    itemInternalName: 'BlinkrootPlanterBox',
    sourceIdentity: {
      itemId: 3219,
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefId: 20,
      sourceRefInternalName: 'Dryad',
      sourceRefName: 'Dryad',
      sourcePage: 'Planter Boxes',
      chanceText: null,
      quantityText: null,
      conditions: null,
    },
  }];
  return { snapshots, items, npcs, candidateRows };
}

test('buildLocalNpcAdmissionProposal freezes insert-only rows across all owned tables', () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const selection = selectLocalNpcAdmissions({ candidateRows, snapshots, items, npcs });
  const proposal = buildLocalNpcAdmissionProposal({
    partition: { scopeHash: 'sha256:partition', quarantineRows: candidateRows },
    selection,
    snapshots,
    items,
    npcs,
    databaseFingerprint: { serverUuid: 'server-1', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    currentRows: {},
  });

  assert.equal(proposal.operationId, 'canonical-item-source-local-npc-admission');
  assert.equal(proposal.readOnly, true);
  assert.equal(proposal.changedRowCount, 6);
  assert.equal(proposal.summary.accepted, 1);
  assert.equal(proposal.summary.quarantine, 0);
  assert.equal(proposal.writeSets['terria_v1_local.source_dataset_landings'].length, 1);
  assert.equal(proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'].length, 1);
  assert.equal(proposal.writeSets['terria_v1_relation.item_source_facts'].length, 1);
  assert.equal(proposal.writeSets['terria_v1_relation.item_source_details'].length, 1);
  assert.equal(proposal.writeSets['terria_v1_relation.item_npc_shop_relations'].length, 1);
  assert.equal(proposal.writeSets['terria_v1_relation.item_npc_loot_relations'].length, 0);
  assert.equal(proposal.writeSets['terria_v1_local.item_acquisition_sources'].length, 1);
  assert.equal('scope' in proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'][0], false);
  assert.equal('table_name' in proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'][0], false);
  assert.equal('landing_source_id' in proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'][0], false);
  assert.deepEqual(
    proposal.lineageBindings['terria_v1_maint.maint_npc_crawler_facts'],
    [{
      recordKey: proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'][0].record_key,
      landingSourceKey: proposal.writeSets['terria_v1_maint.maint_npc_crawler_facts'][0].landing_source_key,
    }],
  );
  assert.match(proposal.scopeHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(proposal.beforeFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(proposal.afterFingerprint, /^sha256:[a-f0-9]{64}$/);
});

test('buildLocalNpcAdmissionProposal refuses an existing target row outside the exact after set', () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const selection = selectLocalNpcAdmissions({ candidateRows, snapshots, items, npcs });

  assert.throws(
    () => buildLocalNpcAdmissionProposal({
      partition: { scopeHash: 'sha256:partition', quarantineRows: candidateRows },
      selection,
      snapshots,
      items,
      npcs,
      databaseFingerprint: { serverUuid: 'server-1' },
      currentRows: {
        'terria_v1_local.item_acquisition_sources': [{
          item_id: 3219,
          source_type: 'shop',
          source_ref_type: 'npc',
          source_ref_id: 20,
          source_ref_name: 'Dryad',
          source_page: 'Dryad',
          source_revision_timestamp: '2026-02-12 05:43:39',
          conditions: 'drift',
          status: 1,
          deleted: 0,
        }],
      },
    }),
    /target table drift/i,
  );
});

test('buildLocalNpcAdmissionProposal freezes a missing-revision reconciliation instead of inserting a duplicate local source', () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const existing = {
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
  };
  const selection = selectLocalNpcAdmissions({
    candidateRows,
    snapshots,
    items,
    npcs,
    existingLocalSourceRows: [existing],
  });
  const proposal = buildLocalNpcAdmissionProposal({
    partition: { scopeHash: 'sha256:partition', quarantineRows: candidateRows },
    selection,
    snapshots,
    items,
    npcs,
    databaseFingerprint: { serverUuid: 'server-1', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] },
    currentRows: {
      'terria_v1_local.source_dataset_landings': [],
      'terria_v1_maint.maint_npc_crawler_facts': [],
      'terria_v1_relation.item_source_facts': [],
      'terria_v1_relation.item_source_details': [],
      'terria_v1_relation.item_npc_shop_relations': [],
      'terria_v1_relation.item_npc_loot_relations': [],
      'terria_v1_local.item_acquisition_sources': [existing],
    },
  });

  assert.equal(proposal.writeSets['terria_v1_local.item_acquisition_sources'].length, 0);
  assert.equal(proposal.localSourceReconciliation.length, 1);
  assert.deepEqual(proposal.localSourceReconciliation[0], {
    kind: 'set_missing_source_revision_timestamp',
    rowId: 192377,
    sourceIdentityHash: selection.acceptedRows[0].sourceIdentityHash,
    before: existing,
    beforeHash: sha256(existing),
    after: { ...existing, source_revision_timestamp: '2026-02-12 05:43:39' },
    afterHash: sha256({ ...existing, source_revision_timestamp: '2026-02-12 05:43:39' }),
  });
  assert.equal(proposal.changedRowCount, 6);
});

test('runLocalNpcAdmissionProposal binds a verified frozen partition, snapshot pairs, and complete table fingerprints', async () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const partition = partitionFixture(candidateRows);
  const writes = [];
  const proposal = await runLocalNpcAdmissionProposal({
    partitionPath: 'reports/frozen-partition.json',
    outputPath: 'reports/proposal.json',
  }, {
    loadRuntimeConfig: () => runtimeConfigFixture(),
    readPartition: () => ({ partition, sha256: 'sha256:partition-bytes' }),
    readSnapshotPairs: () => snapshots.map((snapshot) => ({
      ...snapshot,
      normalizedPath: 'data/wiki-crawler/normalized-light/npc/dryad.latest.json',
      auditPath: 'data/wiki-crawler/audit/npc/dryad.latest.json',
      normalizedSha256: 'sha256:normalized-bytes',
      auditSha256: 'sha256:audit-bytes',
    })),
    readDatabaseSnapshot: () => databaseSnapshotFixture({ items, npcs }),
    writeOutput: ({ value }) => {
      writes.push(value);
      return value;
    },
  });

  assert.equal(proposal.schemaVersion, 'item-source-local-npc-admission-proposal-v1');
  assert.equal(proposal.summary.accepted, 1);
  assert.equal(proposal.authorizationAllowed, true);
  assert.equal(Object.keys(proposal.tableBeforeFingerprints).length, 7);
  assert.equal(proposal.sourceFreeze.partition.sha256, 'sha256:partition-bytes');
  assert.deepEqual(proposal.sourceFreeze.snapshotPairs, [{
    entityId: 'dryad',
    normalizedPath: 'data/wiki-crawler/normalized-light/npc/dryad.latest.json',
    normalizedSha256: 'sha256:normalized-bytes',
    auditPath: 'data/wiki-crawler/audit/npc/dryad.latest.json',
    auditSha256: 'sha256:audit-bytes',
  }]);
  assert.equal(writes.length, 1);
});

test('runLocalNpcAdmissionProposal emits a machine-readable blocker instead of an authorization input when no source is admitted', async () => {
  const { items, npcs, candidateRows } = fixture();
  const partition = partitionFixture(candidateRows);
  const writes = [];
  const blocker = await runLocalNpcAdmissionProposal({
    partitionPath: 'reports/frozen-partition.json',
    outputPath: 'reports/item-source-blocker.json',
  }, {
    loadRuntimeConfig: () => runtimeConfigFixture(),
    readPartition: () => ({ partition, sha256: 'sha256:partition-bytes' }),
    readSnapshotPairs: () => [],
    readDatabaseSnapshot: () => databaseSnapshotFixture({ items, npcs }),
    writeOutput: ({ value }) => {
      writes.push(value);
      return value;
    },
  });

  assert.equal(blocker.schemaVersion, 'item-source-local-npc-admission-blocker-v1');
  assert.equal(blocker.authorizationAllowed, false);
  assert.equal(blocker.selection.summary.accepted, 0);
  assert.equal('writeSets' in blocker, false);
  assert.equal(writes.length, 1);
});

test('runLocalNpcAdmissionProposal ignores an unrelated warning snapshot while requiring the candidate NPC snapshot', async () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const partition = partitionFixture(candidateRows);
  const unrelatedNormalized = {
    entityId: 'unrelated',
    source: { pageTitle: 'Unrelated NPC' },
    sourceMetadata: { revisionTimestamp: '2026-02-12T05:43:39Z', sourceId: 9999 },
    sourceInfoboxes: [{ autoId: '9999' }],
  };
  const proposal = await runLocalNpcAdmissionProposal({
    partitionPath: 'reports/frozen-partition.json',
    outputPath: 'reports/proposal.json',
  }, {
    loadRuntimeConfig: () => runtimeConfigFixture(),
    readPartition: () => ({ partition, sha256: 'sha256:partition-bytes' }),
    readSnapshotPairs: () => [
      ...snapshots.map((snapshot) => ({
        ...snapshot,
        normalizedPath: 'data/wiki-crawler/normalized-light/npc/dryad.latest.json',
        auditPath: 'data/wiki-crawler/audit/npc/dryad.latest.json',
        normalizedSha256: 'sha256:normalized-bytes',
        auditSha256: 'sha256:audit-bytes',
      })),
      {
        normalized: unrelatedNormalized,
        audit: {
          status: 'warn',
          entityId: 'unrelated',
          sourcePage: 'Unrelated NPC',
          sourceRevisionTimestamp: '2026-02-12T05:43:39Z',
          normalizedContentHash: hashJson(unrelatedNormalized),
          auditedAt: '2026-08-24T00:00:00Z',
        },
        normalizedPath: 'data/wiki-crawler/normalized-light/npc/unrelated.latest.json',
        auditPath: 'data/wiki-crawler/audit/npc/unrelated.latest.json',
        normalizedSha256: 'sha256:unrelated-normalized',
        auditSha256: 'sha256:unrelated-audit',
      },
    ],
    readDatabaseSnapshot: () => databaseSnapshotFixture({ items, npcs }),
    writeOutput: ({ value }) => value,
  });

  assert.equal(proposal.summary.accepted, 1);
  assert.deepEqual(proposal.sourceFreeze.snapshotPairs.map((pair) => pair.entityId), ['dryad']);
});

test('runLocalNpcAdmissionProposal refuses partition scope drift before reading the database', async () => {
  const { snapshots, items, npcs, candidateRows } = fixture();
  const partition = { ...partitionFixture(candidateRows), scopeHash: 'sha256:' + 'f'.repeat(64) };
  let databaseReads = 0;

  await assert.rejects(
    runLocalNpcAdmissionProposal({
      partitionPath: 'reports/frozen-partition.json',
      outputPath: 'reports/proposal.json',
    }, {
      loadRuntimeConfig: () => runtimeConfigFixture(),
      readPartition: () => ({ partition, sha256: 'sha256:partition-bytes' }),
      readSnapshotPairs: () => snapshots,
      readDatabaseSnapshot: () => {
        databaseReads += 1;
        return databaseSnapshotFixture({ items, npcs });
      },
      writeOutput: () => { throw new Error('must not write'); },
    }),
    /partition scope hash drift/i,
  );
  assert.equal(databaseReads, 0);
});

function partitionFixture(quarantineRows) {
  const frozenQuarantineRows = quarantineRows.map((row) => ({
    ...row,
    sourceIdentityHash: sha256(row.sourceIdentity),
  }));
  const partition = {
    schemaVersion: 'item-source-governed-partition-v1',
    readOnly: true,
    acceptedRows: [],
    duplicateRows: [],
    quarantineRows: frozenQuarantineRows,
    blockedRows: [],
    summary: {
      candidateItemCount: frozenQuarantineRows.length,
      selectedSourceRowCount: frozenQuarantineRows.length,
      accepted: 0,
      duplicates: 0,
      quarantine: frozenQuarantineRows.length,
      blocked: 0,
      unclassified: 0,
    },
  };
  partition.scopeHash = sha256({
    schemaVersion: partition.schemaVersion,
    acceptedRows: partition.acceptedRows,
    duplicateRows: partition.duplicateRows,
    quarantineRows: partition.quarantineRows,
    blockedRows: partition.blockedRows,
  });
  return partition;
}

function runtimeConfigFixture() {
  return {
    database: {
      host: '127.0.0.1',
      port: 13306,
      username: 'root',
      password: 'root',
      name: 'terria_v1_local',
    },
  };
}

function databaseSnapshotFixture({ items, npcs }) {
  return {
    databaseFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-1',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    items,
    npcs,
    existingLocalSourceRows: [],
    currentRows: {
      'terria_v1_local.source_dataset_landings': [],
      'terria_v1_maint.maint_npc_crawler_facts': [],
      'terria_v1_relation.item_source_facts': [],
      'terria_v1_relation.item_source_details': [],
      'terria_v1_relation.item_npc_shop_relations': [],
      'terria_v1_relation.item_npc_loot_relations': [],
      'terria_v1_local.item_acquisition_sources': [],
    },
  };
}
