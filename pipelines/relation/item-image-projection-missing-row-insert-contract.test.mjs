import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS,
  ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
  buildItemImageProjectionMissingRowInsertProposal,
} from './item-image-projection-missing-row-insert-contract.mjs';

const ITEM_PREFIX = '/terrapedia-images/items/';

test('missing-row insert contract freezes exactly the approved five absent projection keys', () => {
  const proposal = buildItemImageProjectionMissingRowInsertProposal(fixture());

  assert.equal(
    ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
    'canonical-item-image-projection-missing-row-insert',
  );
  assert.deepEqual(ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS, [
    'AntlionEggs',
    'BoneWhip',
    'RoninShirt',
    'TVHeadPants',
    'TimelessTravelerHood',
  ]);
  assert.deepEqual(proposal.keys, ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS);
  assert.equal(proposal.targetRowCount, 5);
  assert.equal(proposal.insertedRowCount, 5);
  assert.equal(proposal.apply, false);
  assert.deepEqual(
    proposal.projectionRows.map((row) => [row.internalName, row.image]),
    ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.map((key) => [key, `${ITEM_PREFIX}${key}.png`]),
  );
});

test('missing-row insert contract rejects an unapproved key, a present projection row, and unmanaged source evidence', () => {
  assert.throws(
    () => buildItemImageProjectionMissingRowInsertProposal(fixture({ keys: ['BoneWhip'] })),
    /exact.*five|key set/i,
  );
  assert.throws(
    () => buildItemImageProjectionMissingRowInsertProposal(fixture({
      existingProjectionRows: [{ internalName: 'BoneWhip' }],
    })),
    /already exists|projection/i,
  );
  assert.throws(
    () => buildItemImageProjectionMissingRowInsertProposal(fixture({
      imageFor: { AntlionEggs: 'http://example.invalid/AntlionEggs.png' },
    })),
    /managed/i,
  );
});

function fixture({ keys, existingProjectionRows = [], imageFor = {} } = {}) {
  const targetKeys = keys ?? [
    'AntlionEggs',
    'BoneWhip',
    'RoninShirt',
    'TVHeadPants',
    'TimelessTravelerHood',
  ];
  return {
    generatedAt: '2026-08-05T01:00:00.000Z',
    expiresAt: '2026-08-05T02:00:00.000Z',
    proposalAuthorization: {
      decisionIdentity: 'canonical-item-image-projection-missing-row-insert-proposal-read-20260805-admin-01',
      path: 'reports/authorization/canonical/item-image-projection-missing-row-insert/test/proposal-read.owner-input.json',
      sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      authorizationHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    keys: targetKeys,
    target: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'test-server',
      databases: {
        local: 'terria_v1_local',
        maint: 'terria_v1_maint',
        relation: 'terria_v1_relation',
      },
      ownedDatabase: 'terria_v1_relation',
      ownedTable: 'projection_items',
    },
    relationItems: targetKeys.map((internalName, index) => ({
      id: index + 100,
      recordKey: `item-${internalName}`,
      internalName,
      englishName: internalName,
      nameZh: null,
      combatValue: 0,
      defenseValue: 0,
      useTime: 0,
      stackSize: 1,
      width: 20,
      height: 20,
      rareRaw: 0,
      majorValue: 0,
      sellRaw: 0,
      rawJson: '{}',
      sourceProvider: 'wiki_gg',
      sourcePage: internalName,
      sourceRevisionTimestamp: null,
      status: 1,
      deleted: 0,
    })),
    relationImageRows: targetKeys.map((internalName) => ({
      recordKey: `image-${internalName}`,
      itemInternalName: internalName,
      cachedUrl: imageFor[internalName] ?? `${ITEM_PREFIX}${internalName}.png`,
      role: 'icon',
      isPrimary: 1,
      status: 1,
      deleted: 0,
    })),
    existingProjectionRows,
  };
}
