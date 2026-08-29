import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_TARGETS,
  buildProjectionTextIdentityResidualPreview,
  parseProjectionTextIdentityResidualPreviewArgs,
} from './npc-projection-text-identity-residual-preview.mjs';

function projectionLoot(target) {
  return [
    {
      relationType: 'loot',
      itemInternalName: 'EaterOfLife',
      chanceText: '{{modes|0.5%|0.67%}}',
      quantityText: '1',
      sourceFactKey: 'unrelated-fact',
      relationRecordKey: 'unrelated-relation',
      sourceProvider: 'terrapedia.generated',
      sourcePage: 'https://terraria.wiki.gg/wiki/example',
    },
    {
      relationType: 'loot',
      itemInternalName: target.itemInternalName,
      itemName: 'Nazar',
      chanceText: target.beforeChanceText,
      quantityText: target.quantityText,
      sourceFactKey: target.beforeSourceFactKey,
      relationRecordKey: target.beforeRelationRecordKey,
      sourceProvider: 'wiki_gg',
      sourcePage: 'Nazar',
      sourceRevisionTimestamp: '2026-02-19T02:11:12.000Z',
    },
  ];
}

function relation(target) {
  return {
    id: target.relationId,
    record_key: target.relationRecordKey,
    source_fact_key: target.sourceFactKey,
    source_maint_record_key: target.sourceMaintRecordKey,
    source_maint_id: null,
    landing_source_id: 12474,
    npc_internal_name: target.npcInternalName,
    item_internal_name: target.itemInternalName,
    quantity_text: target.quantityText,
    chance_text: target.chanceText,
    source_provider: 'terraria.wiki.gg',
    source_maint_table: 'maint_item_sources',
    landing_source_key: 'generated.npc_item_relations_bundle',
    landing_content_hash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
    source_page: target.sourcePage,
    source_revision_timestamp: null,
    status: 1,
    deleted: 0,
  };
}

function retiringRelation(target) {
  return {
    id: target.beforeRelationRecordKey === EXPECTED_TARGETS[0].beforeRelationRecordKey ? 128 : 129,
    record_key: target.beforeRelationRecordKey,
    source_fact_key: target.beforeSourceFactKey,
    source_maint_record_key: target.beforeSourceMaintRecordKey,
    source_maint_id: target.beforeSourceMaintId,
    landing_source_id: target.beforeLandingSourceId,
    npc_internal_name: target.npcInternalName,
    item_internal_name: target.itemInternalName,
    quantity_text: target.quantityText,
    chance_text: target.beforeChanceText,
    source_provider: 'wiki_gg',
    source_maint_table: 'maint_item_sources',
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
    source_page: 'Nazar',
    source_revision_timestamp: '2026-02-19T02:11:12.000Z',
    status: 1,
    deleted: 0,
  };
}

function relations() {
  return EXPECTED_TARGETS.flatMap((target) => [relation(target), retiringRelation(target)]);
}

function localRows() {
  return EXPECTED_TARGETS.flatMap((target) => ([
    {
      id: target.localRetirementId,
      npc_id: target.projectionId,
      item_id: 891,
      source_item_id: 891,
      drop_source_kind: 'npc_drop',
      quantity_text: target.quantityText,
      chance_text: target.beforeChanceText,
      conditions: null,
      status: 1,
      deleted: 0,
    },
    {
      id: target.localSurvivorId,
      npc_id: target.projectionId,
      item_id: 891,
      source_item_id: 891,
      drop_source_kind: 'npc_drop',
      quantity_text: target.quantityText,
      chance_text: target.chanceText,
      conditions: null,
      status: 1,
      deleted: 0,
    },
  ]));
}

test('residual preview replaces only the two accepted projection identities', () => {
  const preview = buildProjectionTextIdentityResidualPreview({
    relations: relations(),
    projections: EXPECTED_TARGETS.map((target) => ({
      id: target.projectionId,
      internal_name: target.npcInternalName,
      status: 1,
      deleted: 0,
      loot_items_json: JSON.stringify(projectionLoot(target)),
    })),
    localRows: localRows(),
  });

  assert.deepEqual(preview.summary, {
    acceptedRelationLoot: 2,
    relationRowsToRetire: 2,
    projectionNpcsToReplace: 2,
    localRowsToRetire: 2,
    sourceFactsTargeted: 0,
    sourceDetailsTargeted: 0,
  });
  assert.equal(preview.applyAllowed, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.externalRequests, false);
  assert.equal(preview.rows.length, 2);

  for (const row of preview.rows) {
    assert.equal(row.targetIndex, 1);
    assert.deepEqual(row.beforeLootItems[0], row.afterLootItems[0]);
    assert.equal(row.beforeLootItem.chanceText, '1% 1.99%');
    assert.equal(row.afterLootItem.chanceText, '{{modes|1%|1.99%}}');
    assert.equal(row.afterLootItem.sourceProvider, 'terraria.wiki.gg');
    assert.equal(row.afterLootItem.relationRecordKey, row.relationRecordKey);
    assert.equal(row.relationRetirement.recordKey, row.beforeLootItem.relationRecordKey);
    assert.ok(Number.isSafeInteger(row.localRetirement.localId));
    assert.equal(row.localRetirement.chanceText, '1% 1.99%');
    assert.ok(Number.isSafeInteger(row.localSurvivor.localId));
    assert.notEqual(row.localRetirement.localId, row.localSurvivor.localId);
    assert.equal(row.localSurvivor.chanceText, '{{modes|1%|1.99%}}');
  }
});

test('residual preview fails closed when a target projection no longer has the frozen old identity', () => {
  const target = EXPECTED_TARGETS[0];
  assert.throws(() => buildProjectionTextIdentityResidualPreview({
    relations: relations(),
    projections: EXPECTED_TARGETS.map((candidate) => ({
      id: candidate.projectionId,
      internal_name: candidate.npcInternalName,
      status: 1,
      deleted: 0,
      loot_items_json: JSON.stringify(projectionLoot(candidate).map((entry) => (
        candidate === target && entry.itemInternalName === 'Nazar'
          ? { ...entry, chanceText: '{{modes|1%|1.99%}}' }
          : entry
      ))),
    })),
    localRows: localRows(),
  }), /frozen projection identity missing/);
});

test('residual preview fails closed when the exact old local tuple lacks its accepted survivor', () => {
  assert.throws(() => buildProjectionTextIdentityResidualPreview({
    relations: relations(),
    projections: EXPECTED_TARGETS.map((target) => ({
      id: target.projectionId,
      internal_name: target.npcInternalName,
      status: 1,
      deleted: 0,
      loot_items_json: JSON.stringify(projectionLoot(target)),
    })),
    localRows: localRows().filter((row) => row.id !== EXPECTED_TARGETS[0].localSurvivorId),
  }), /local target set drifted/);
});

test('residual preview CLI permits only a date-scoped report write', () => {
  assert.deepEqual(
    parseProjectionTextIdentityResidualPreviewArgs([
      '--write-report=true',
      '--output=reports/runtime/local-data-chain-closure/20260819/post-final/example.json',
    ]),
    {
      writeReport: true,
      output: 'reports/runtime/local-data-chain-closure/20260819/post-final/example.json',
    },
  );
  assert.throws(
    () => parseProjectionTextIdentityResidualPreviewArgs(['--output=reports/other.json']),
    /write-report=true/,
  );
  assert.throws(
    () => parseProjectionTextIdentityResidualPreviewArgs(['--unknown=true']),
    /unknown argument/,
  );
  assert.throws(
    () => parseProjectionTextIdentityResidualPreviewArgs([
      '--write-report=true',
      '--output=reports/other.json',
    ]),
    /date-scoped report root/,
  );
});
