import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
  buildItemCanonicalBaseEntityRestorationProposal,
} from './item-canonical-base-entity-restoration-contract.mjs';

const ITEM_PREFIX = '/terrapedia-images/items/2026/08/05/';

test('canonical base-entity restoration freezes exactly the approved standardized records', () => {
  const proposal = buildItemCanonicalBaseEntityRestorationProposal(fixture());

  assert.equal(
    ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
    'canonical-item-base-entity-restoration',
  );
  assert.deepEqual(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS, [
    'AntlionEggs',
    'BoneWhip',
    'RoninShirt',
    'TVHeadPants',
    'TimelessTravelerHood',
  ]);
  assert.deepEqual(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS, [5067, 5074, 5049, 5063, 5051]);
  assert.deepEqual(proposal.keys, ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS);
  assert.equal(proposal.maintRows.length, 5);
  assert.equal(proposal.relationRows.length, 5);
  assert.equal(proposal.projectionRows.length, 5);
  assert.deepEqual(proposal.maintRows.map((row) => row.sourceId), [5067, 5074, 5049, 5063, 5051]);
  assert.deepEqual(
    proposal.projectionRows.map((row) => [row.id, row.internalName, row.image]),
    ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS.map((internalName) => [
      fixture().records.find((record) => record.internalName === internalName).id,
      internalName,
      `${ITEM_PREFIX}${internalName}.png`,
    ]),
  );
  assert.equal(proposal.targetCounts.maintItems, 5);
  assert.equal(proposal.targetCounts.relationItems, 5);
  assert.equal(proposal.targetCounts.projectionItems, 5);
  assert.equal(proposal.legacyMaintRows.length, 5);
  assert.equal(proposal.legacyRelationRows.length, 5);
  assert.equal(proposal.legacyProjectionRows.length, 5);
  assert.equal(proposal.legacyProjectileAudits.length, 5);
  assert.deepEqual(proposal.relationRows.map((row) => [row.status, row.deleted]), [
    [1, 0], [1, 0], [1, 0], [1, 0], [1, 0],
  ]);
  assert.deepEqual(
    proposal.legacyMaintRows.map((row) => row.internalName),
    ['FestiveTopHat', 'Wiesnbrau', 'HeartArrow', 'TurkeyFeather', 'ValentineRing'],
  );
});

test('canonical base-entity restoration rejects missing legacy occupants, protected references, and unmanaged inputs', () => {
  const source = fixture();
  assert.throws(
    () => buildItemCanonicalBaseEntityRestorationProposal({
      ...source,
      standardized: { ...source.standardized, records: source.records.slice(1) },
    }),
    /five.*standardized|approved.*records/i,
  );
  assert.throws(
    () => buildItemCanonicalBaseEntityRestorationProposal({
      ...source,
      standardized: { ...source.standardized, records: [...source.records, { ...source.records[0] }] },
    }),
    /exact.*five|approved.*records/i,
  );
  assert.throws(
    () => buildItemCanonicalBaseEntityRestorationProposal({
      ...source,
      legacyMaintRows: source.legacyMaintRows.slice(1),
    }),
    /five.*legacy/i,
  );
  assert.throws(
    () => buildItemCanonicalBaseEntityRestorationProposal({
      ...source,
      protectedReferences: [{ table: 'item_recipe_heads', count: 1 }],
    }),
    /protected consumer/i,
  );
  assert.throws(
    () => buildItemCanonicalBaseEntityRestorationProposal({
      ...source,
      managedImages: source.managedImages.map((row) => row.itemInternalName === 'BoneWhip'
        ? { ...row, cachedUrl: 'https://example.invalid/BoneWhip.png' }
        : row),
    }),
    /managed.*image/i,
  );
});

test('canonical base-entity restoration accepts projection identity evidence without non-existent legacy metadata columns', () => {
  const source = fixture();
  const proposal = buildItemCanonicalBaseEntityRestorationProposal({
    ...source,
    legacyProjectionRows: source.legacyProjectionRows.map((row) => ({
      id: row.id,
      internalName: row.internalName,
      status: row.status,
      deleted: row.deleted,
    })),
  });
  assert.equal(proposal.legacyProjectionRows.length, 5);
});

test('canonical base-entity restoration accepts audit evidence with only a legacy source page', () => {
  const source = fixture();
  const proposal = buildItemCanonicalBaseEntityRestorationProposal({
    ...source,
    legacyProjectileAudits: source.legacyProjectileAudits.map((row) => ({
      itemSourceId: row.itemSourceId,
      itemInternalName: row.itemInternalName,
      recordKey: row.recordKey,
      sourcePage: `https://terraria.wiki.gg/zh/wiki/%E6%97%A7%E7%89%88%3A${row.internalName}`,
      status: row.status,
      deleted: row.deleted,
    })),
  });
  assert.equal(proposal.legacyProjectileAudits.length, 5);
});

function fixture() {
  const records = [
    item(5067, 'AntlionEggs', 'Antlion Eggs', 250, 50, 0, 0, 0, 15, 9999),
    item(5074, 'BoneWhip', 'Spinal Tap', 75000, 15000, 29, 0, 2, 30, 1),
    item(5049, 'RoninShirt', 'Wandering Yukata', 500, 100, 0, 0, 0, 0, 1),
    item(5063, 'TVHeadPants', 'Pinstripe Pants', 500, 100, 0, 0, 0, 0, 1),
    item(5051, 'TimelessTravelerHood', "Timeless Traveler's Hood", 500, 100, 0, 0, 0, 0, 1),
  ];
  return {
    generatedAt: '2026-08-05T02:00:00.000Z',
    expiresAt: '2026-08-05T03:00:00.000Z',
    proposalAuthorization: {
      decisionIdentity: 'canonical-item-base-entity-restoration-proposal-read-20260805-admin-01',
      path: 'reports/authorization/canonical/item-canonical-base-entity-restoration/test/proposal-read.owner-input.json',
      sha256: `sha256:${'a'.repeat(64)}`,
      authorizationHash: `sha256:${'b'.repeat(64)}`,
    },
    standardized: {
      entity: 'items',
      generatedAt: '2026-03-28T11:24:36.383Z',
      schemaVersion: '1.0.0',
      upstreamMeta: {
        fetchedAt: '2026-03-27T11:05:29.937Z',
        moduleGeneratedAt: '2026-03-09 22:43:19 (+00:00)',
        source: 'terraria.wiki.gg:Module:Iteminfo/data',
        sourcePageTitle: 'Module:Iteminfo/data',
        sourceRevisionTimestamp: '2026-03-09T22:52:58Z',
        wikiVersion: '1.4.5.6',
      },
      records,
    },
    records,
    sourceBytesSha256: `sha256:${'c'.repeat(64)}`,
    target: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'test-server',
      databases: { maint: 'terria_v1_maint', relation: 'terria_v1_relation' },
    },
    legacyMaintRows: legacyRows('sourceId'),
    legacyRelationRows: legacyRows('sourceId'),
    legacyProjectionRows: legacyRows('id'),
    legacyProjectileAudits: legacyRows('itemSourceId'),
    protectedReferences: [],
    managedImages: records.map((record) => ({
      recordKey: `image-${record.internalName}`,
      itemInternalName: record.internalName,
      cachedUrl: `${ITEM_PREFIX}${record.internalName}.png`,
      role: 'icon',
      isPrimary: 1,
      status: 1,
      deleted: 0,
    })),
  };
}

function legacyRows(idField) {
  const names = ['FestiveTopHat', 'Wiesnbrau', 'HeartArrow', 'TurkeyFeather', 'ValentineRing'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return names.map((internalName, index) => ({
    [idField]: ids[index],
    internalName,
    itemInternalName: internalName,
    sourcePage: `旧版:${internalName}`,
    terrariaVersion: 'legacy',
    rawJson: '{"legacyNpcShopItem":true}',
    recordKey: `legacy-${internalName}`,
    status: 1,
    deleted: 0,
  }));
}

function item(id, internalName, name, buy, sell, damage, defense, knockback, useTime, stackSize) {
  return {
    id,
    internalName,
    name,
    categoryCode: 'TEST',
    description: null,
    tooltip: null,
    rarity: 'rare',
    rarityId: 2,
    economy: { buy, sell },
    stats: { damage, defense, knockback, useTime, width: 18, height: 14 },
    stack: { isStackable: stackSize > 1, stackSize },
    imageUrl: `${ITEM_PREFIX}${internalName}.png`,
    status: 1,
  };
}
