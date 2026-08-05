import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runItemImageProjectionMissingRowInsertProposal,
} from './build-item-image-projection-missing-row-insert-proposal.mjs';

test('missing-row proposal uses a read-only snapshot and emits no DML', async () => {
  const events = [];
  const proposal = await runItemImageProjectionMissingRowInsertProposal({
    generatedAt: '2026-08-05T01:00:00.000Z',
    expiresAt: '2026-08-05T02:00:00.000Z',
    proposalAuthorization: {
      decisionIdentity: 'canonical-item-image-projection-missing-row-insert-proposal-read-20260805-admin-01',
      path: 'reports/authorization/canonical/item-image-projection-missing-row-insert/test/proposal-read.owner-input.json',
      sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      authorizationHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
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
  }, {
    openReadOnlyConnection: async () => ({
      async query(sql) {
        events.push(sql);
        if (/START TRANSACTION READ ONLY/i.test(sql)) return [[], []];
        if (/ROLLBACK/i.test(sql)) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      },
      async rollback() { events.push('rollback'); },
      async end() { events.push('end'); },
    }),
    readSnapshot: async () => ({
      relationItems: relationItems(),
      relationImageRows: imageRows(),
      existingProjectionRows: [],
    }),
  });

  assert.equal(proposal.insertedRowCount, 5);
  assert.equal(events.filter((event) => /INSERT|UPDATE|DELETE|REPLACE/i.test(event)).length, 0);
  assert.equal(events.at(-1), 'end');
});

function relationItems() {
  return keys().map((internalName, index) => ({
    id: index + 100,
    recordKey: `item-${internalName}`,
    internalName,
    englishName: internalName,
    rawJson: '{}',
    status: 1,
    deleted: 0,
  }));
}

function imageRows() {
  return keys().map((internalName) => ({
    recordKey: `image-${internalName}`,
    itemInternalName: internalName,
    cachedUrl: `/terrapedia-images/items/${internalName}.png`,
    role: 'icon',
    isPrimary: 1,
    status: 1,
    deleted: 0,
  }));
}

function keys() {
  return ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'];
}
