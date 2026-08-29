import assert from 'node:assert/strict';
import test from 'node:test';

let buildNpcStaleLineageRepairPreview;
let relationSelect;
let loadError = null;

try {
  ({ buildNpcStaleLineageRepairPreview, relationSelect } = await import('./npc-stale-lineage-repair-preview.mjs'));
} catch (error) {
  loadError = error;
}

const acceptedLootRow = {
  recordKey: 'new-loot',
  sourceFactKey: 'new-fact',
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'new-hash',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
  npcInternalName: 'TestNpc',
  itemInternalName: 'TestItem',
  quantityMin: 1,
  quantityMax: 1,
  quantityText: '1',
  chanceValue: 0.5,
  chanceText: '50%',
  conditions: 'Normal mode row',
  conditionSourceText: 'all modes',
  conditionParseStatus: 'parsed',
  conditionBiomeCode: null,
  conditionGamePeriodCode: null,
  conditionTimeCode: null,
  conditionWeatherCode: null,
  conditionEventsJson: null,
  specialFlagsJson: null,
};

function incumbent(overrides = {}) {
  return {
    ...acceptedLootRow,
    recordKey: 'old-loot',
    sourceFactKey: 'old-fact',
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    landingSourceKey: 'generated.npc_item_relations_bundle',
    ...overrides,
  };
}

function sourceFact(recordKey) {
  return {
    recordKey,
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    landingSourceKey: 'generated.npc_item_relations_bundle',
    status: 1,
    deleted: 0,
  };
}

function sourceDetail(recordKey, sourceFactKey) {
  return {
    recordKey,
    sourceFactKey,
    sourceProvider: 'terrapedia.generated',
    landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
    status: 1,
    deleted: 0,
  };
}

test('stale-lineage preview proposes only a complete exact relation replacement', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const preview = buildNpcStaleLineageRepairPreview({
    acceptedLoot: [acceptedLootRow],
    incumbentLoot: [
      incumbent(),
      incumbent({
        recordKey: 'metadata-drift-loot',
        sourceFactKey: 'metadata-drift-fact',
        conditionSourceText: 'expert only',
      }),
    ],
    facts: [sourceFact('old-fact'), sourceFact('metadata-drift-fact')],
    details: [
      sourceDetail('old-detail', 'old-fact'),
      sourceDetail('metadata-drift-detail', 'metadata-drift-fact'),
    ],
    localLoot: [{
      id: 7,
      npcInternalName: 'TestNpc',
      itemInternalName: 'TestItem',
      quantityMin: 1,
      quantityMax: 1,
      quantityText: '1',
      chanceValue: 0.5,
      chanceText: '50%',
      conditions: 'Normal mode row',
      notes: 'all modes',
      sortOrder: 0,
      sourceItemMatchesItem: true,
      dropSourceKind: 'npc_drop',
    }],
    projectionLoot: [],
    generatedAt: '2026-08-19T00:00:00.000Z',
  });

  assert.equal(preview.applyAllowed, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.externalRequests, false);
  assert.deepEqual(preview.proposed.relationLoot.map((row) => row.recordKey), ['old-loot']);
  assert.deepEqual(preview.proposed.sourceFacts.map((row) => row.recordKey), ['old-fact']);
  assert.deepEqual(preview.proposed.sourceDetails.map((row) => row.recordKey), ['old-detail']);
  assert.deepEqual(preview.quarantine.metadataDrift.map((row) => row.recordKey), ['metadata-drift-loot']);
  assert.deepEqual(preview.quarantine.projectionRequired.map((row) => row.recordKey), ['new-loot']);
  assert.deepEqual(preview.local.loot.preserve.map((row) => row.localId), [7]);
  assert.deepEqual(preview.local.loot.noWriteTargets, []);
  assert.match(preview.scopeSha256, /^sha256:[a-f0-9]{64}$/);
});

test('stale-lineage preview quarantines a parent fact with an unrelated active relation', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const preview = buildNpcStaleLineageRepairPreview({
    acceptedLoot: [acceptedLootRow],
    incumbentLoot: [
      incumbent(),
      incumbent({
        recordKey: 'old-unrelated-loot',
        itemInternalName: 'OtherItem',
        chanceText: '1%',
      }),
    ],
    facts: [sourceFact('old-fact')],
    details: [sourceDetail('old-detail', 'old-fact')],
    localLoot: [],
    projectionLoot: [acceptedLootRow],
  });

  assert.deepEqual(preview.proposed.relationLoot, []);
  assert.deepEqual(preview.proposed.sourceFacts, []);
  assert.deepEqual(preview.quarantine.parentHasOtherActiveRelation.map((row) => row.recordKey), ['old-loot']);
});

test('stale-lineage preview rejects a non-legacy hash even when the runtime tuple matches', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const preview = buildNpcStaleLineageRepairPreview({
    acceptedLoot: [acceptedLootRow],
    incumbentLoot: [incumbent({ landingContentHash: 'unrecognized-hash' })],
    facts: [sourceFact('old-fact')],
    details: [sourceDetail('old-detail', 'old-fact')],
    projectionLoot: [acceptedLootRow],
  });

  assert.deepEqual(preview.proposed.relationLoot, []);
  assert.deepEqual(preview.quarantine.independentLineage.map((row) => row.recordKey), ['old-loot']);
  assert.equal(preview.inventory.activeLegacyRelationLoot.length, 0);
});

test('stale-lineage loader selects schema-specific columns for loot and shop relations', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const lootSql = relationSelect('terria_v1_relation', 'item_npc_loot_relations');
  const shopSql = relationSelect('terria_v1_relation', 'item_npc_shop_relations');

  assert.match(lootSql, /quantity_min AS quantityMin/);
  assert.match(lootSql, /chance_text AS chanceText/);
  assert.doesNotMatch(lootSql, /price_text AS priceText/);
  assert.match(shopSql, /price_text AS priceText/);
  assert.doesNotMatch(shopSql, /quantity_min AS quantityMin/);
  assert.doesNotMatch(shopSql, /chance_text AS chanceText/);
});
